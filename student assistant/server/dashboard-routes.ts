// The API the teacher dashboard talks to. See docs/DASHBOARD_API.md.

import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { newPromptId, writeComprehensionQuestion } from './brain.ts';
import { config } from './config.ts';
import { dashboardChannel, studentChannel } from './events.ts';
import { HttpError } from './http-error.ts';
import { ensureLab, teamProgress } from './labs.ts';
import { deliverPrompt } from './prompts.ts';
import { findLabByCode, getLab, listLabs, newJoinCode, saveLab, saveStudent, studentsInLab } from './store.ts';
import type { Lab, LabStep, Prompt, StudentProgress } from '../shared/types.ts';

export const dashboardRoutes = Router();

// The dashboard is a separate site, and its requests carry a token rather than cookies.
dashboardRoutes.use((req: Request, res: Response, next: NextFunction) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

dashboardRoutes.use((req: Request, _res: Response, next: NextFunction) => {
  // EventSource can't set headers, so the stream may pass the token in the URL.
  const header = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supplied = Buffer.from(header ?? String(req.query.token ?? ''));
  const expected = Buffer.from(config.dashboardToken);

  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new HttpError(401, 'Missing or invalid dashboard token');
  }
  next();
});

/** Labs are addressed by the join code the dashboard generated. */
function labFor(req: Request): Lab {
  const param = String(req.params.id);
  const lab = findLabByCode(param) ?? getLab(param);
  if (!lab) throw new HttpError(404, 'Lab not found');
  return lab;
}

/**
 * Gives this server the procedure for a join code. Sending a new procedure for a
 * code replaces it. The breakdown finishes in the background, and the dashboard
 * hears about it on the stream or by polling.
 */
dashboardRoutes.post('/labs', (req, res) => {
  const { procedure, code, teams, steps } = req.body;
  if (typeof procedure !== 'string' || !procedure.trim()) throw new HttpError(400, 'procedure is required');

  const joinCode = typeof code === 'string' && code.trim() ? code.trim() : newJoinCode();
  res.status(202).json(
    ensureLab(joinCode, procedure, {
      reopen: true,
      teams: Array.isArray(teams) ? teams.map(({ id, name }) => ({ id: String(id), name: String(name) })) : undefined,
      steps: Array.isArray(steps) ? steps.map(String) : null,
    }),
  );
});

dashboardRoutes.get('/labs', (_req, res) => {
  res.json(listLabs());
});

dashboardRoutes.get('/labs/:id', (req, res) => {
  const lab = labFor(req);
  res.json({ lab, students: studentsInLab(lab.id), teams: teamProgress(lab) });
});

dashboardRoutes.get('/labs/:id/stream', (req, res) => {
  const lab = labFor(req);
  dashboardChannel.subscribe(lab.id, res);
  dashboardChannel.send(lab.id, { type: 'lab', lab });
  for (const student of studentsInLab(lab.id)) {
    dashboardChannel.send(lab.id, { type: 'student', student });
  }
});

/**
 * Sends a question to students. Give `question` to ask it word for word, or
 * `topic` (or neither) to have Gemma write one for wherever each student is.
 */
dashboardRoutes.post('/labs/:id/prompts', async (req, res) => {
  const lab = labFor(req);
  if (!lab.plan) throw new HttpError(409, 'The lab is not ready');
  const plan = lab.plan;

  const everyone = studentsInLab(lab.id);
  const wanted = req.body.studentIds as string[] | undefined;
  const wantedTeams = req.body.teamIds as string[] | undefined;
  const targets = everyone.filter(
    (student) =>
      (!wanted || wanted.includes(student.id)) &&
      (!wantedTeams || (student.teamId !== null && wantedTeams.includes(student.teamId))),
  );

  const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
  const topic = typeof req.body.topic === 'string' ? req.body.topic.trim() : null;

  // Students on the same step share one question rather than each taking a turn on the GPU.
  const written = new Map<string, Promise<{ question: string; expected: string | null }>>();
  const stepOf = (student: StudentProgress): LabStep | null =>
    student.phase === 'steps' ? (plan.steps[student.currentStep] ?? null) : null;

  const sent = await Promise.all(
    targets.map(async (student) => {
      const step = stepOf(student);
      const stepKey = step?.id ?? 'none';

      if (!written.has(stepKey)) {
        written.set(
          stepKey,
          question
            ? Promise.resolve({ question, expected: null })
            : writeComprehensionQuestion(plan, step, topic || null),
        );
      }
      const content = await written.get(stepKey)!;

      const prompt: Prompt = {
        id: newPromptId(),
        question: content.question,
        expected: content.expected,
        kind: question ? 'custom' : 'comprehension',
        askedBy: 'teacher',
        stepId: step?.id ?? null,
        confirmsStep: false,
        continuesStep: false,
      };
      deliverPrompt(student.id, prompt);
      return { studentId: student.id, teamId: student.teamId, promptId: prompt.id, question: prompt.question };
    }),
  );

  res.json({ sent });
});

/** Clears a student's help request or alert once the teacher has dealt with it. */
dashboardRoutes.post('/labs/:id/students/:studentId/resolve', (req, res) => {
  const lab = labFor(req);
  const student = studentsInLab(lab.id).find((candidate) => candidate.id === req.params.studentId);
  if (!student) throw new HttpError(404, 'Student not found');

  saveStudent({ ...student, helpRequested: false, alert: null });
  res.json({ ok: true });
});

/** Stops new students joining with this code. Students already in keep working. */
dashboardRoutes.post('/labs/:id/close', (req, res) => {
  const lab = labFor(req);
  if (!lab.closed) saveLab({ ...lab, closed: true });
  res.json({ ok: true });
});

dashboardRoutes.post('/labs/:id/end', (req, res) => {
  const lab = labFor(req);
  saveLab({ ...lab, status: 'ended' });
  for (const student of studentsInLab(lab.id)) {
    studentChannel.send(student.id, { type: 'lab-ended' });
  }
  res.json({ ok: true });
});

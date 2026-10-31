import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Request } from 'express';
import {
  answerStudent,
  checkStep,
  detectBox,
  detectRuler,
  gradeAnswer,
  identifyComponents,
  isInView,
  newPromptId,
} from './brain.ts';
import type { StepCheck } from './brain.ts';
import { studentChannel } from './events.ts';
import { SupersededError } from './gemma.ts';
import { HttpError } from './http-error.ts';
import { openLab } from './labs.ts';
import { deliverPrompt, pendingFor, removePrompt, toPublic } from './prompts.ts';
import { decodeGray, fitLine } from './refine.ts';
import type { GrayImage } from './refine.ts';
import { speak, speechReady } from './speech.ts';
import { getLab, getStudent, saveStudent } from './store.ts';
import {
  angleFromHorizontal,
  lengthCm,
  pixelsPerCm,
  withinTolerance,
} from '../shared/measure.ts';
import type {
  AnswerResult,
  CheckResult,
  Frame,
  GridBox,
  GridPoint,
  Lab,
  LabPlan,
  LabStep,
  MeasureResult,
  NextResult,
  SensorResult,
  StepProgress,
  StudentLab,
  StudentProgress,
  StudentSession,
} from '../shared/types.ts';

const MAX_SPOKEN_SENTENCE = 600;
const BACKGROUND_CORRECT_NEEDED = 2;
const SIGHTINGS_NEEDED = 2;

const correctStreaks = new Map<string, number>();
const sightings = new Map<string, number>();

export const studentRoutes = Router();

interface Context {
  student: StudentProgress;
  lab: Lab;
  plan: LabPlan;
}

function contextFor(req: Request): Context {
  const student = getStudent(String(req.params.id));
  if (!student) throw new HttpError(404, 'Student not found');

  const lab = getLab(student.labId);
  if (!lab?.plan) throw new HttpError(404, 'Lab not found');

  return { student, lab, plan: lab.plan };
}

function stepFor(req: Request, context: Context): { step: LabStep; progress: StepProgress } {
  const stepId = String(req.params.stepId);
  const step = context.plan.steps.find((candidate) => candidate.id === stepId);
  const progress = context.student.steps.find((candidate) => candidate.stepId === stepId);
  if (!step || !progress) throw new HttpError(404, 'Step not found');
  return { step, progress };
}

function readFrame(value: unknown): Frame {
  const frame = value as Partial<Frame> | undefined;
  if (typeof frame?.image !== 'string' || !frame.width || !frame.height) {
    throw new HttpError(400, 'A camera frame is required');
  }
  return { image: frame.image, width: frame.width, height: frame.height };
}

function readText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${name} is required`);
  return value.trim();
}

function studentLab(lab: Lab, plan: LabPlan): StudentLab {
  return {
    id: lab.id,
    plan: {
      ...plan,
      steps: plan.steps.map(({ questions, ...step }) => ({ ...step, questionCount: questions.length })),
    },
  };
}

function sessionFor(student: StudentProgress, lab: Lab, plan: LabPlan): StudentSession {
  return { student, lab: studentLab(lab, plan), pending: pendingFor(student.id) };
}

// ---- Joining --------------------------------------------------------------

studentRoutes.post('/join', async (req, res) => {
  const name = readText(req.body.name, 'Your name');
  const lab = await openLab(readText(req.body.code, 'A lab code'));

  if (!lab) throw new HttpError(404, "That code doesn't match a lab. Check it with your teacher.");
  if (lab.status === 'ended') throw new HttpError(409, 'This lab has ended.');
  if (lab.closed) throw new HttpError(409, 'That code was replaced. Ask your teacher for the new one.');
  if (lab.status === 'failed') throw new HttpError(503, "I couldn't read this lab's procedure. Ask your teacher to send it again.");

  // The site asks again shortly, once the procedure has been broken down.
  if (lab.status !== 'ready' || !lab.plan) {
    res.status(202).json({ preparing: true });
    return;
  }

  // With groups set up on the dashboard, students say which one they're in.
  const teams = lab.teams ?? [];
  const team = teams.find((candidate) => candidate.id === req.body.teamId) ?? null;
  if (teams.length > 0 && !team) {
    res.json({ chooseTeam: teams });
    return;
  }

  const hasEquipment = lab.plan.components.length > 0;

  const student: StudentProgress = {
    id: randomUUID(),
    name,
    labId: lab.id,
    teamId: team?.id ?? null,
    teamName: team?.name ?? null,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    online: false,
    phase: hasEquipment ? 'components' : 'steps',
    currentStep: 0,
    components: Object.fromEntries(lab.plan.components.map((component) => [component.id, 'unknown'])),
    steps: lab.plan.steps.map((step, index) => ({
      stepId: step.id,
      status: !hasEquipment && index === 0 ? 'active' : 'pending',
      attempts: 0,
      lastFeedback: null,
    })),
    measurements: [],
    answers: [],
    helpRequested: false,
    alert: null,
  };

  saveStudent(student);
  res.status(201).json(sessionFor(student, lab, lab.plan));
});

studentRoutes.get('/students/:id', (req, res) => {
  const { student, lab, plan } = contextFor(req);
  res.json(sessionFor(student, lab, plan));
});

studentRoutes.get('/students/:id/stream', (req, res) => {
  const { student } = contextFor(req);
  const id = student.id;

  studentChannel.subscribe(id, res, () => {
    if (studentChannel.has(id)) return;
    const current = getStudent(id);
    if (current) saveStudent({ ...current, online: false });
  });

  saveStudent({ ...student, online: true });
});

// ---- Equipment ------------------------------------------------------------

studentRoutes.post('/students/:id/identify', async (req, res) => {
  const { student, plan } = contextFor(req);

  // Once something has been found it stays ticked, even if it's later out of frame,
  // so each pass only spends GPU time on what's still missing.
  const remaining = plan.components.filter((component) => student.components[component.id] === 'unknown');
  const looked = await identifyComponents(remaining, readFrame(req.body.frame), `identify:${student.id}`);

  // A tick is permanent, so one look isn't enough to earn it.
  const items = looked.filter((item) => {
    const key = `${student.id}:${item.id}`;
    const seen = item.visible ? (sightings.get(key) ?? 0) + 1 : 0;
    sightings.set(key, seen);
    if (seen < SIGHTINGS_NEEDED) return false;

    student.components[item.id] = 'seen';
    return true;
  });

  saveStudent(student);
  res.json({ items, components: student.components });
});

studentRoutes.post('/students/:id/components/:componentId', (req, res) => {
  const { student } = contextFor(req);
  const componentId = String(req.params.componentId);
  const status = req.body.status;

  if (!(componentId in student.components)) throw new HttpError(404, 'Component not found');
  if (status !== 'confirmed' && status !== 'missing') throw new HttpError(400, 'Status must be confirmed or missing');

  student.components[componentId] = status;
  if (status === 'missing') student.helpRequested = true;
  saveStudent(student);
  res.json(student);
});

studentRoutes.post('/students/:id/start-steps', (req, res) => {
  const { student } = contextFor(req);

  if (student.phase === 'components') {
    student.phase = student.steps.length > 0 ? 'steps' : 'done';
    if (student.steps[0]) student.steps[0].status = 'active';
    saveStudent(student);
  }

  res.json(student);
});

// ---- Steps ----------------------------------------------------------------

studentRoutes.post('/students/:id/steps/:stepId/check', async (req, res) => {
  const context = contextFor(req);
  const { student } = context;
  const { step, progress } = stepFor(req, context);
  const background = req.body.background === true;
  const streakKey = `${student.id}:${step.id}`;

  let check: StepCheck;
  try {
    check = await checkStep(step, context.plan.components, readFrame(req.body.frame), `check:${student.id}`, background);
  } catch (error) {
    if (error instanceof SupersededError) throw error;
    // A failed look at the camera must never hold up the lab.
    console.warn('Step check failed, asking the student instead:', (error as Error).message);
    check = { verdict: 'unclear', feedback: "I couldn't check that with the camera.", alert: null };
  }

  // A background look can only pass a step: the student may still be mid-way
  // through it. And it has to see the step done twice running, because nobody
  // asked it to look, so a wrong "correct" here would skip someone's work.
  if (background) {
    const streak = check.verdict === 'correct' ? (correctStreaks.get(streakKey) ?? 0) + 1 : 0;
    correctStreaks.set(streakKey, streak);
    if (streak < BACKGROUND_CORRECT_NEEDED) {
      res.json({ verdict: 'unclear', feedback: check.feedback, followUp: null } satisfies CheckResult);
      return;
    }
  }

  if (!background) progress.attempts++;
  progress.lastFeedback = check.feedback;
  if (check.alert) student.alert = check.alert;

  let followUp: CheckResult['followUp'] = null;
  if (check.verdict === 'correct') {
    progress.status = 'passed';
  } else if (check.verdict === 'incorrect') {
    progress.status = 'needs_attention';
  } else {
    const prompt = confirmPrompt(step);
    deliverPrompt(student.id, prompt);
    followUp = toPublic(prompt);
  }

  saveStudent(student);
  res.json({ verdict: check.verdict, feedback: check.feedback, followUp } satisfies CheckResult);
});

function confirmPrompt(step: LabStep) {
  return {
    id: newPromptId(),
    question: step.confirmQuestion,
    expected: `The student confirms this is done: ${step.lookFor}`,
    kind: 'observation' as const,
    askedBy: 'procedure' as const,
    stepId: step.id,
    confirmsStep: true,
    continuesStep: false,
  };
}

/** Asks the student directly, for steps only they can confirm. */
studentRoutes.post('/students/:id/steps/:stepId/confirm', (req, res) => {
  const context = contextFor(req);
  const { step } = stepFor(req, context);
  const prompt = confirmPrompt(step);
  deliverPrompt(context.student.id, prompt);
  res.json(toPublic(prompt));
});

studentRoutes.post('/students/:id/steps/:stepId/measure', async (req, res) => {
  const context = contextFor(req);
  const { student } = context;
  const { step, progress } = stepFor(req, context);
  const goal = step.measurement;
  if (!goal) throw new HttpError(400, "This step doesn't have a measurement");

  const frame = readFrame(req.body.frame);
  const gray = decodeGray(frame.image);
  const tracked = context.plan.components.find((component) => step.tracks.includes(component.id));

  // Checked first, because a box drawn around nothing would give a confident wrong number.
  const box = await (async () => {
    const subject = { name: goal.subject, lookFor: tracked?.lookFor ?? 'the thing being measured' };
    return (await isInView(subject, frame)) ? detectBox(longStraight(goal.subject), frame) : null;
  })().catch((error: Error) => {
    console.warn('Measuring failed, so the student gets the target instead:', error.message);
    return null;
  });
  const line = box && straightLine(gray, box);
  const unit = goal.unit === 'deg' ? 'degrees' : 'centimetres';
  const should = goal.target === null ? '' : ` It should be ${goal.target} ${unit}.`;

  const unmeasured = (reason: string): MeasureResult => ({
    measured: false,
    kind: goal.kind,
    value: null,
    unit: goal.unit,
    target: goal.target,
    withinTolerance: null,
    feedback: `${reason}${should}`,
    line: null,
  });

  let result: MeasureResult;
  if (!line) {
    result = unmeasured(`I can't see ${goal.subject} clearly enough to measure it.`);
  } else {
    let value: number | null = null;
    if (goal.kind === 'angle') {
      value = angleFromHorizontal(line.start, line.end, frame);
    } else {
      const scale = await rulerScale(frame, gray);
      if (scale) value = lengthCm(line.start, line.end, frame, scale);
    }

    if (value === null) {
      result = unmeasured(`I need a metre stick in view to measure ${goal.subject}.`);
    } else {
      const rounded = Math.round(value * 10) / 10;
      const within = withinTolerance(rounded, goal.target, goal.tolerance);
      const reading = `I measured ${goal.subject} at about ${rounded} ${unit}.`;
      const verdict = within === null ? '' : within ? ' That looks right.' : ` It should be ${goal.target}, so please adjust it.`;

      result = {
        measured: true,
        kind: goal.kind,
        value: rounded,
        unit: goal.unit,
        target: goal.target,
        withinTolerance: within,
        feedback: reading + verdict,
        line,
      };

      student.measurements.push({
        stepId: step.id,
        label: goal.subject,
        value: rounded,
        unit: goal.unit,
        target: goal.target,
        withinTolerance: within,
        source: 'camera',
        at: Date.now(),
      });

      if (within !== null) progress.status = within ? 'passed' : 'needs_attention';
    }
  }

  progress.attempts++;
  progress.lastFeedback = result.feedback;
  saveStudent(student);
  res.json(result);
});

/** A value the student measured themselves, when the camera couldn't. */
studentRoutes.post('/students/:id/steps/:stepId/record', (req, res) => {
  const context = contextFor(req);
  const { student } = context;
  const { step, progress } = stepFor(req, context);
  const value = Number(req.body.value);
  if (!Number.isFinite(value)) throw new HttpError(400, 'A number is required');

  const goal = step.measurement;
  const within = goal ? withinTolerance(value, goal.target, goal.tolerance) : null;

  student.measurements.push({
    stepId: step.id,
    label: goal?.subject ?? step.title,
    value,
    unit: goal?.unit ?? String(req.body.unit ?? ''),
    target: goal?.target ?? null,
    withinTolerance: within,
    source: 'student',
    at: Date.now(),
  });

  if (within !== null) progress.status = within ? 'passed' : 'needs_attention';
  progress.lastFeedback =
    within === null ? 'Recorded.' : within ? 'That matches the procedure.' : `That doesn't match. It should be ${goal?.target}.`;

  saveStudent(student);
  res.json({ withinTolerance: within, feedback: progress.lastFeedback });
});

/** Without this, a bulkier object beside the thing being measured can get detected instead. */
function longStraight(subject: string): string {
  return `the long straight ${subject.replace(/^the\s+/i, '')}`;
}

/** The object's real edge inside Gemma's box, or the box's diagonal if no edge stands out. */
function straightLine(gray: GrayImage, box: GridBox): { start: GridPoint; end: GridPoint } {
  const fit = fitLine(gray, box);
  if (fit) return { start: fit.start, end: fit.end };
  return { start: { x: box.left, y: box.top }, end: { x: box.right, y: box.bottom } };
}

/** Pixels per centimetre from a ruler in view, or null without one. */
async function rulerScale(frame: Frame, gray: GrayImage): Promise<number | null> {
  const ruler = await detectRuler(frame).catch(() => null);
  if (!ruler) return null;
  const { start, end } = straightLine(gray, ruler.box);
  return pixelsPerCm({ a: start, b: end, cm: ruler.visibleCm }, frame);
}

studentRoutes.post('/students/:id/steps/:stepId/sensor', (req, res) => {
  const context = contextFor(req);
  const { student } = context;
  const { step, progress } = stepFor(req, context);

  const readings = (req.body.readings as unknown[] | undefined)?.map(Number).filter(Number.isFinite) ?? [];
  if (readings.length === 0) throw new HttpError(400, 'At least one reading is required');

  const unit = String(req.body.unit ?? '');
  const mean = readings.reduce((sum, value) => sum + value, 0) / readings.length;
  const rounded = Math.round(mean * 1000) / 1000;

  const result: SensorResult = {
    count: readings.length,
    mean: rounded,
    min: Math.min(...readings),
    max: Math.max(...readings),
    unit,
    feedback: `I got ${readings.length} ${readings.length === 1 ? 'reading' : 'readings'} from your sensor, averaging ${rounded} ${unit}.`.replace(' .', '.'),
  };

  student.measurements.push({
    stepId: step.id,
    label: step.title,
    value: rounded,
    unit,
    target: null,
    withinTolerance: null,
    source: 'sensor',
    at: Date.now(),
  });

  progress.status = 'passed';
  progress.lastFeedback = result.feedback;
  saveStudent(student);
  res.json(result);
});

// ---- Conversation ---------------------------------------------------------

studentRoutes.post('/students/:id/answer', async (req, res) => {
  const { student, plan } = contextFor(req);
  const answer = readText(req.body.answer, 'An answer');
  const prompt = pendingFor(student.id, true).find((candidate) => candidate.id === req.body.promptId);
  if (!prompt) throw new HttpError(404, 'That question is no longer open');

  const graded = await gradeAnswer(plan, prompt, answer);
  removePrompt(student.id, prompt.id);

  student.answers.push({
    promptId: prompt.id,
    stepId: prompt.stepId,
    question: prompt.question,
    answer,
    correct: graded.correct,
    feedback: graded.feedback,
    askedBy: prompt.askedBy,
    at: Date.now(),
  });

  if (graded.alert) student.alert = graded.alert;

  if (prompt.confirmsStep) {
    const progress = student.steps.find((candidate) => candidate.stepId === prompt.stepId);
    if (progress) {
      progress.status = graded.correct ? 'passed' : 'needs_attention';
      progress.lastFeedback = graded.feedback;
    }
  }

  saveStudent(student);
  res.json({ correct: graded.correct, feedback: graded.feedback } satisfies AnswerResult);
});

studentRoutes.post('/students/:id/ask', async (req, res) => {
  const { student, plan } = contextFor(req);
  const question = readText(req.body.question, 'A question');
  const frame = req.body.frame ? readFrame(req.body.frame) : null;
  const step = student.phase === 'steps' ? plan.steps[student.currentStep] : null;

  const { reply, alert } = await answerStudent(plan, step ?? null, question, frame);

  if (alert) {
    student.alert = alert;
    saveStudent(student);
  }
  res.json({ reply });
});

studentRoutes.post('/students/:id/next', (req, res) => {
  const { student, plan } = contextFor(req);
  const step = plan.steps[student.currentStep];
  const progress = student.steps[student.currentStep];
  if (student.phase !== 'steps' || !step || !progress) throw new HttpError(409, 'There is no step to finish');

  // The step's own questions come before moving on.
  const answered = new Set(student.answers.map((answer) => answer.promptId));
  const question = step.questions.find((candidate) => !answered.has(candidate.id));
  if (question) {
    const open = pendingFor(student.id, true).find((candidate) => candidate.id === question.id);
    const prompt = open ?? {
      id: question.id,
      question: question.question,
      expected: question.expected,
      kind: question.kind,
      askedBy: 'procedure' as const,
      stepId: step.id,
      // On an "ask" step, the question is the check.
      confirmsStep: step.mode === 'ask',
      continuesStep: true,
    };
    if (!open) deliverPrompt(student.id, prompt);
    res.json({ student, prompt: toPublic(prompt) } satisfies NextResult);
    return;
  }

  if (progress.status === 'active') progress.status = 'skipped';

  student.currentStep++;
  const upcoming = student.steps[student.currentStep];
  if (upcoming) {
    upcoming.status = 'active';
  } else {
    student.phase = 'done';
  }

  saveStudent(student);
  res.json({ student, prompt: null } satisfies NextResult);
});

studentRoutes.post('/students/:id/speak', async (req, res) => {
  contextFor(req);
  const text = readText(req.body.text, 'Text');
  if (text.length > MAX_SPOKEN_SENTENCE) throw new HttpError(400, 'That sentence is too long to speak');

  // The site uses its browser voice until the model has finished loading.
  if (!speechReady()) throw new HttpError(503, 'The voice is still loading');

  res.type('audio/wav').send(await speak(text));
});

studentRoutes.post('/students/:id/help', (req, res) => {
  const { student } = contextFor(req);
  student.helpRequested = req.body.requested !== false;
  saveStudent(student);
  res.json(student);
});

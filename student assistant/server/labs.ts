// Turns a join code into a lab that's ready to run. The dashboard owns the code
// and the procedure; this makes sure the procedure gets broken down whenever
// there's a new one, whichever way it arrived.

import { randomUUID } from 'node:crypto';
import { buildPlan } from './brain.ts';
import { fetchProcedure } from './dashboard-link.ts';
import { prepareSpeech } from './speech.ts';
import { findLabByCode, saveLab, studentsInLab } from './store.ts';
import type { Lab, LabPlan, LabTeam, TeamProgress } from '../shared/types.ts';

/** Everything every student will hear, as the site words it. */
function spokenLines(plan: LabPlan): string[] {
  return [
    `Welcome to ${plan.title}.`,
    ...plan.steps.flatMap((step) => [
      step.instruction,
      step.safety ? `Safety: ${step.safety}` : '',
      step.confirmQuestion,
      ...step.questions.map((question) => question.question),
    ]),
  ].filter(Boolean);
}

function breakDown(lab: Lab): void {
  buildPlan(lab.procedure, lab.knownSteps)
    .then((plan) => {
      saveLab({ ...lab, plan, status: 'ready' });
      void prepareSpeech(spokenLines(plan));
    })
    .catch((error: Error) => {
      console.error('Plan failed:', error);
      saveLab({ ...lab, status: 'failed', error: error.message });
    });
}

export interface LabDetails {
  reopen?: boolean;
  teams?: LabTeam[];
  steps?: string[] | null;
}

/**
 * Returns the lab for this code and procedure, breaking the procedure down if it
 * hasn't been seen before. The same text gives the same plan, so a class joining
 * together shares one breakdown. A changed procedure gets a new lab, leaving
 * students already part way through the old one undisturbed.
 */
export function ensureLab(code: string, procedure: string, details: LabDetails = {}): Lab {
  const existing = findLabByCode(code);
  const sameProcedure = existing?.procedure === procedure;
  const ended = existing?.status === 'ended';

  if (existing && sameProcedure && existing.status !== 'failed' && !(details.reopen && ended)) {
    if (!details.teams) return existing;
    const updated = { ...existing, teams: details.teams };
    saveLab(updated);
    return updated;
  }

  const lab: Lab = {
    id: randomUUID(),
    code,
    procedure,
    teams: details.teams ?? existing?.teams ?? [],
    knownSteps: details.steps ?? null,
    status: 'preparing',
    plan: null,
    error: null,
    createdAt: Date.now(),
  };

  if (sameProcedure && existing.plan) {
    const reopened: Lab = { ...lab, plan: existing.plan, status: 'ready' };
    saveLab(reopened);
    return reopened;
  }

  saveLab(lab);
  breakDown(lab);
  return lab;
}

/**
 * Finds the lab for a code a student typed. The dashboard is asked first, so its
 * latest procedure always wins. If it can't be reached, a lab it already gave
 * this server keeps working.
 */
export async function openLab(code: string): Promise<Lab | null> {
  const existing = findLabByCode(code);

  const procedure = await fetchProcedure(code).catch((error: Error) => {
    console.warn('Could not reach the dashboard:', error.message);
    return null;
  });

  if (procedure) return ensureLab(existing?.code ?? code, procedure);
  return existing ?? null;
}

/** Where each team has got to. Students without a team count as a team of one. */
export function teamProgress(lab: Lab): TeamProgress[] {
  const students = studentsInLab(lab.id);
  const totalSteps = lab.plan?.steps.length ?? 0;

  const teams = new Map<string, TeamProgress>(
    (lab.teams ?? []).map((team) => [
      team.id,
      { ...team, members: [], online: 0, stepsDone: 0, totalSteps, finished: false, helpRequested: false, alert: null },
    ]),
  );

  for (const student of students) {
    const id = student.teamId ?? student.id;
    const team = teams.get(id) ?? {
      id,
      name: student.teamName ?? student.name,
      members: [],
      online: 0,
      stepsDone: 0,
      totalSteps,
      finished: false,
      helpRequested: false,
      alert: null,
    };

    const done = student.phase === 'done' ? totalSteps : student.phase === 'steps' ? student.currentStep : 0;
    team.members.push(student.name);
    team.online += student.online ? 1 : 0;
    team.stepsDone = Math.max(team.stepsDone, done);
    team.finished = totalSteps > 0 && team.stepsDone >= totalSteps;
    team.helpRequested ||= student.helpRequested;
    team.alert ??= student.alert;
    teams.set(id, team);
  }

  return [...teams.values()];
}

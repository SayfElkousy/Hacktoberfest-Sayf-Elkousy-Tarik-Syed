// Labs and student progress. Kept in memory and saved to disk so a server restart
// mid-class doesn't lose anyone's progress. Webcam frames are never stored.

import { randomInt } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './config.ts';
import { relayProgress } from './dashboard-link.ts';
import { dashboardChannel } from './events.ts';
import type { Lab, StudentProgress } from '../shared/types.ts';

const stateFile = join(dataDir, 'state.json');

// No 0/O or 1/I, so a code read aloud or off a board can't be mistyped.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const labs = new Map<string, Lab>();
const students = new Map<string, StudentProgress>();

if (existsSync(stateFile)) {
  const saved = JSON.parse(readFileSync(stateFile, 'utf8')) as { labs: Lab[]; students: StudentProgress[] };
  for (const lab of saved.labs) labs.set(lab.id, lab);
  for (const student of saved.students) students.set(student.id, { ...student, online: false });
}

let saveTimer: NodeJS.Timeout | null = null;

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const temp = `${stateFile}.tmp`;
    writeFileSync(temp, JSON.stringify({ labs: [...labs.values()], students: [...students.values()] }));
    renameSync(temp, stateFile);
  }, 1000);
}

export function newJoinCode(): string {
  for (;;) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    if (!findLabByCode(code)) return code;
  }
}

export function saveLab(lab: Lab): void {
  labs.set(lab.id, lab);
  scheduleSave();
  dashboardChannel.send(lab.id, { type: 'lab', lab });
}

export function getLab(id: string): Lab | undefined {
  return labs.get(id);
}

export function listLabs(): Lab[] {
  return [...labs.values()];
}

/** Codes are typed by hand, so case, spaces and dashes don't matter: k7q m4x finds K7Q-M4X. */
export const normalizeCode = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The newest lab for a code. */
export function findLabByCode(code: string): Lab | undefined {
  const wanted = normalizeCode(code);
  if (!wanted) return undefined;
  return [...labs.values()]
    .filter((lab) => normalizeCode(lab.code) === wanted)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

export function getStudent(id: string): StudentProgress | undefined {
  return students.get(id);
}

export function studentsInLab(labId: string): StudentProgress[] {
  return [...students.values()].filter((student) => student.labId === labId);
}

/** Records a change to a student and relays it to the dashboard. */
export function saveStudent(student: StudentProgress): void {
  student.lastSeen = Date.now();
  students.set(student.id, student);
  scheduleSave();
  dashboardChannel.send(student.labId, { type: 'student', student });

  const lab = labs.get(student.labId);
  if (lab) relayProgress(lab.code, student);
}

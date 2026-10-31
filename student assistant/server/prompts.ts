// Questions waiting on a student. They stay here until answered so one sent
// while a student's connection dropped is still there when they reconnect.

import { studentChannel } from './events.ts';
import type { Prompt, PublicPrompt } from '../shared/types.ts';

const pending = new Map<string, Prompt[]>();

export function toPublic({ expected: _expected, ...prompt }: Prompt): PublicPrompt {
  return prompt;
}

export function deliverPrompt(studentId: string, prompt: Prompt): void {
  pending.set(studentId, [...(pending.get(studentId) ?? []), prompt]);
  studentChannel.send(studentId, { type: 'prompt', prompt: toPublic(prompt) });
}

export function pendingFor(studentId: string): PublicPrompt[];
export function pendingFor(studentId: string, withAnswers: true): Prompt[];
export function pendingFor(studentId: string, withAnswers?: true): Prompt[] | PublicPrompt[] {
  const prompts = pending.get(studentId) ?? [];
  return withAnswers ? prompts : prompts.map(toPublic);
}

export function removePrompt(studentId: string, promptId: string): void {
  pending.set(studentId, (pending.get(studentId) ?? []).filter((prompt) => prompt.id !== promptId));
}

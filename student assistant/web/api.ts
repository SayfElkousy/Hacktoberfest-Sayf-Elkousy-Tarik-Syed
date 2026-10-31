import type {
  AnswerResult,
  CheckResult,
  ComponentStatus,
  Frame,
  IdentifyResult,
  LabTeam,
  MeasureResult,
  NextResult,
  PublicPrompt,
  SensorResult,
  StudentEvent,
  StudentProgress,
  StudentSession,
} from '../shared/types.ts';

/** A newer camera frame replaced this one in Gemma's queue. Safe to ignore. */
export class Superseded extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.superseded) throw new Superseded();
    throw new Error(data.error ?? 'Something went wrong. Please try again.');
  }
  return data as T;
}

const post = <T,>(path: string, body: unknown = {}) => request<T>('POST', path, body);

export const api = {
  join: (name: string, code: string, teamId: string | null) =>
    post<StudentSession | { preparing: true } | { chooseTeam: LabTeam[] }>('/join', { name, code, teamId }),
  session: (id: string) => request<StudentSession>('GET', `/students/${id}`),
  identify: (id: string, frame: Frame) => post<IdentifyResult>(`/students/${id}/identify`, { frame }),
  setComponent: (id: string, componentId: string, status: ComponentStatus) =>
    post<StudentProgress>(`/students/${id}/components/${componentId}`, { status }),
  startSteps: (id: string) => post<StudentProgress>(`/students/${id}/start-steps`),
  check: (id: string, stepId: string, frame: Frame, background = false) =>
    post<CheckResult>(`/students/${id}/steps/${stepId}/check`, { frame, background }),
  setupCheck: (id: string, frame: Frame) => post<{ problem: string | null }>(`/students/${id}/setup-check`, { frame }),
  confirm: (id: string, stepId: string) => post<PublicPrompt>(`/students/${id}/steps/${stepId}/confirm`),
  measure: (id: string, stepId: string, frame: Frame) =>
    post<MeasureResult>(`/students/${id}/steps/${stepId}/measure`, { frame }),
  record: (id: string, stepId: string, value: number) =>
    post<{ withinTolerance: boolean | null; feedback: string }>(`/students/${id}/steps/${stepId}/record`, { value }),
  heard: (id: string, stepId: string, text: string) =>
    post<{ value: number; unit: string } | null>(`/students/${id}/steps/${stepId}/heard`, { text }),
  sensor: (id: string, stepId: string, readings: number[], unit: string) =>
    post<SensorResult>(`/students/${id}/steps/${stepId}/sensor`, { readings, unit }),
  answer: (id: string, promptId: string, answer: string) =>
    post<AnswerResult>(`/students/${id}/answer`, { promptId, answer }),
  ask: (id: string, question: string, frame: Frame | null) =>
    post<{ reply: string }>(`/students/${id}/ask`, { question, frame }),
  next: (id: string) => post<NextResult>(`/students/${id}/next`),
  help: (id: string, requested: boolean) => post<StudentProgress>(`/students/${id}/help`, { requested }),
};

export function listenForEvents(
  id: string,
  onEvent: (event: StudentEvent) => void,
  onConnection: (connected: boolean) => void,
): () => void {
  const source = new EventSource(`/api/students/${id}/stream`);
  source.onopen = () => onConnection(true);
  source.onerror = () => onConnection(false);
  source.onmessage = (message) => onEvent(JSON.parse(message.data) as StudentEvent);
  return () => source.close();
}

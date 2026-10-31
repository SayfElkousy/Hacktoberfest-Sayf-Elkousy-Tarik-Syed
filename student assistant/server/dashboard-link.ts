// Calls out to the teacher dashboard, for dashboards that hold each join code's
// procedure themselves. Set DASHBOARD_URL to turn this on. Dashboards can also send
// procedures in directly; see docs/DASHBOARD_API.md for both.

import { config } from './config.ts';
import type { StudentProgress } from '../shared/types.ts';

const LOOKUP_TIMEOUT_MS = 5_000;
/** Everyone joining at the start of class shares one lookup. */
const LOOKUP_CACHE_MS = 5_000;
const PROGRESS_DELAY_MS = 1_000;

function urlFor(path: string, code: string): string {
  return `${config.dashboardUrl}${path.replace('{code}', encodeURIComponent(code))}`;
}

function authHeaders(): Record<string, string> {
  return config.dashboardKey ? { Authorization: `Bearer ${config.dashboardKey}` } : {};
}

/** Pulls the procedure out of whatever shape the dashboard replies with. */
export function readProcedure(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() || null;
  if (Array.isArray(body)) {
    const lines = body.filter((line) => typeof line === 'string');
    return lines.length > 0 ? lines.join('\n') : null;
  }
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const value of [record.procedure, record.lab, record.data]) {
      const found = readProcedure(value);
      if (found) return found;
    }
  }
  return null;
}

async function lookUp(code: string): Promise<string | null> {
  const response = await fetch(urlFor(config.dashboardLabPath, code), {
    headers: { Accept: 'application/json, text/plain', ...authHeaders() },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The dashboard returned ${response.status}`);

  const text = await response.text();
  try {
    return readProcedure(JSON.parse(text));
  } catch {
    return readProcedure(text);
  }
}

const lookups = new Map<string, { at: number; result: Promise<string | null> }>();

/**
 * Asks the dashboard for a code's current procedure. Returns null if it doesn't
 * know the code, and throws if it can't be reached.
 */
export function fetchProcedure(code: string): Promise<string | null> {
  if (!config.dashboardUrl) return Promise.resolve(null);

  const cached = lookups.get(code);
  if (cached && Date.now() - cached.at < LOOKUP_CACHE_MS) return cached.result;

  const result = lookUp(code);
  lookups.set(code, { at: Date.now(), result });
  return result;
}

const pendingProgress = new Map<string, NodeJS.Timeout>();

/** Sends a student's progress to the dashboard, at most once a second per student. */
export function relayProgress(code: string, student: StudentProgress): void {
  if (!config.dashboardUrl || !config.dashboardProgressPath) return;

  clearTimeout(pendingProgress.get(student.id));
  pendingProgress.set(
    student.id,
    setTimeout(() => {
      pendingProgress.delete(student.id);
      fetch(urlFor(config.dashboardProgressPath, code), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ code, team: { id: student.teamId, name: student.teamName }, student }),
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      }).catch((error: Error) => console.warn('Could not send progress to the dashboard:', error.message));
    }, PROGRESS_DELAY_MS),
  );
}

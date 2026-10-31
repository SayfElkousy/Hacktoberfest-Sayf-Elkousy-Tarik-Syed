// The only file that talks to Ollama. A whole class shares one GPU, so requests
// wait in a queue: anything a student is actively waiting on goes first, and
// background camera checks are dropped if a newer one from that student arrives.

import { config } from './config.ts';

export interface GemmaRequest {
  system: string;
  prompt: string;
  /** Base64 JPEGs. */
  images?: string[];
  /** JSON schema the reply must match, or 'json' for any JSON object. */
  schema: object | 'json';
  background?: boolean;
  /** Background requests sharing a key replace each other while queued. */
  key?: string;
  maxTokens?: number;
}

interface Job {
  request: GemmaRequest;
  queuedAt: number;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

const REQUEST_TIMEOUT_MS = 180_000;
const CONCURRENCY = 1;
/** A background camera frame older than this no longer shows what the student is doing. */
const MAX_BACKGROUND_AGE_MS = 20_000;

const urgent: Job[] = [];
const background: Job[] = [];
let running = 0;

export class SupersededError extends Error {}

export function askGemma<T>(request: GemmaRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job: Job = { request, queuedAt: Date.now(), resolve: resolve as Job['resolve'], reject };

    if (request.background) {
      if (request.key) {
        const stale = background.findIndex((queued) => queued.request.key === request.key);
        if (stale !== -1) {
          background[stale].reject(new SupersededError('A newer frame replaced this one'));
          background.splice(stale, 1);
        }
      }
      background.push(job);
    } else {
      urgent.push(job);
    }

    pump();
  });
}

export function queueDepth(): number {
  return urgent.length + background.length + running;
}

function pump(): void {
  while (running < CONCURRENCY) {
    const job = urgent.shift() ?? background.shift();
    if (!job) return;

    if (job.request.background && Date.now() - job.queuedAt > MAX_BACKGROUND_AGE_MS) {
      job.reject(new SupersededError('This frame is too old to be useful'));
      continue;
    }

    running++;
    run(job.request)
      .then(job.resolve, job.reject)
      .finally(() => {
        running--;
        pump();
      });
  }
}

async function run(request: GemmaRequest): Promise<unknown> {
  // A malformed reply is rare and usually fine on a second try.
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return JSON.parse(await callOllama(request));
    } catch (error) {
      lastError = error as Error;
      if (!(error instanceof SyntaxError)) break;
    }
  }
  throw lastError ?? new Error('Gemma returned nothing');
}

async function callOllama(request: GemmaRequest): Promise<string> {
  const response = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: config.model,
      stream: false,
      think: false,
      keep_alive: '2h',
      format: request.schema,
      options: { temperature: 0.1, num_ctx: 8192, num_predict: request.maxTokens ?? 1024 },
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt, images: request.images },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as { message?: { content?: string } };
  return body.message?.content ?? '';
}

/** Reports whether Ollama is up and has the configured model. */
export async function checkGemma(): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    const body = (await response.json()) as { models: { name: string }[] };
    const names = body.models.map((model) => model.name);
    return names.includes(config.model)
      ? { ok: true, detail: config.model }
      : { ok: false, detail: `${config.model} isn't in Ollama. Installed: ${names.join(', ') || 'none'}` };
  } catch {
    return { ok: false, detail: `Can't reach Ollama at ${config.ollamaUrl}. Is it running?` };
  }
}

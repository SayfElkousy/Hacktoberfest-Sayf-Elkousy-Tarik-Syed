// Gemma only produces text, so spoken audio comes from Kokoro, an open-source
// voice model running on this laptop's CPU. Doing it here rather than in each
// browser means students download nothing and slow computers keep up. Every
// sentence is saved, so an instruction is only generated once for the whole class.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
import { cacheDir } from './config.ts';
import { splitSentences } from '../shared/speech.ts';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'af_heart';

const spokenDir = join(cacheDir, 'spoken');
mkdirSync(spokenDir, { recursive: true });

env.cacheDir = join(cacheDir, 'models');

let model: KokoroTTS | null = null;

// The full-size model: on a CPU it runs about four times faster than the
// smaller "q8" one, and quicker than real time.
const loading = KokoroTTS.from_pretrained(MODEL, { dtype: 'fp32', device: 'cpu' }).then(
  (loaded) => {
    model = loaded;
    return loaded;
  },
  (error: Error) => {
    console.error('Voice model failed to load, so students will hear their browser voice:', error.message);
    return null;
  },
);

export function speechReady(): boolean {
  return model !== null;
}

/** Waits for the model, reporting whether it loaded. */
export async function waitForSpeech(): Promise<boolean> {
  return (await loading) !== null;
}

// One at a time: each sentence already uses every CPU core.
let last: Promise<unknown> = Promise.resolve();
const inProgress = new Map<string, Promise<Buffer>>();

function fileFor(sentence: string): string {
  return join(spokenDir, `${createHash('sha1').update(`${VOICE}:${sentence}`).digest('hex')}.wav`);
}

/** Returns one sentence as a WAV file. */
export function speak(sentence: string): Promise<Buffer> {
  const file = fileFor(sentence);
  if (existsSync(file)) return Promise.resolve(readFileSync(file));

  const running = inProgress.get(file);
  if (running) return running;

  const job = last.then(async () => {
    const tts = model ?? (await loading);
    if (!tts) throw new Error('The voice model is not available');

    const audio = await tts.generate(sentence, { voice: VOICE });
    const wav = Buffer.from(audio.toWav());

    const temp = `${file}.tmp`;
    writeFileSync(temp, wav);
    renameSync(temp, file);
    return wav;
  });

  const tracked = job.finally(() => inProgress.delete(file));
  inProgress.set(file, tracked);
  last = tracked.catch(() => undefined);
  return tracked;
}

/** Prepares everything a lab is going to say, so it plays instantly in class. */
export async function prepareSpeech(texts: string[]): Promise<void> {
  const sentences = new Set(texts.flatMap(splitSentences));
  for (const sentence of sentences) {
    await speak(sentence).catch((error: Error) => console.error('Speech failed:', error.message));
  }
}

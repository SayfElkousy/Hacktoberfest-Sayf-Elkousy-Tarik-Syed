import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
export const dataDir = join(root, 'data');
export const distDir = join(root, 'dist');
export const labbyPage = resolve(root, '..', 'dist', 'labby.html');
/** Large generated files. Kept out of the project so cloud-synced folders don't upload them. */
export const cacheDir = join(homedir(), '.cache', 'student-assistant');

mkdirSync(dataDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function dashboardToken(): string {
  if (process.env.DASHBOARD_TOKEN) return process.env.DASHBOARD_TOKEN;

  const file = join(dataDir, 'dashboard-token.txt');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();

  const token = randomBytes(24).toString('hex');
  writeFileSync(file, token);
  return token;
}

export const config = {
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  model: process.env.GEMMA_MODEL || 'gemma4:e4b',
  /** Sees fine detail like a thin string or a hand on it far better, but is slower. */
  detailModel: process.env.GEMMA_DETAIL_MODEL || 'gemma4:12b',
  httpsPort: Number(process.env.PORT) || 8443,
  /** Plain HTTP for this laptop only: browsers treat localhost as secure. */
  localPort: Number(process.env.LOCAL_PORT) || 8080,
  dashboardToken: dashboardToken(),
  /** Where the teacher dashboard lives, when this server should call it. */
  dashboardUrl: (process.env.DASHBOARD_URL ?? '').replace(/\/+$/, ''),
  dashboardKey: process.env.DASHBOARD_KEY ?? '',
  dashboardLabPath: process.env.DASHBOARD_LAB_PATH || '/api/labs/{code}',
  dashboardProgressPath: process.env.DASHBOARD_PROGRESS_PATH ?? '/api/labs/{code}/progress',
};

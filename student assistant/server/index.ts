import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { join } from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { config, distDir } from './config.ts';
import { dashboardRoutes } from './dashboard-routes.ts';
import { checkGemma, queueDepth, SupersededError } from './gemma.ts';
import { HttpError } from './http-error.ts';
import { prepareSpeech, speechReady, waitForSpeech } from './speech.ts';
import { studentRoutes } from './student-routes.ts';
import { lanAddresses, loadCertificate } from './tls.ts';

const COMMON_LINES = [
  'Put each piece of equipment where your camera can see it.',
  'Your teacher has been told you need help.',
];

const app = express();

app.use(express.json({ limit: '30mb' }));

app.get('/api/health', async (_req, res) => {
  res.json({ gemma: await checkGemma(), voice: speechReady(), queued: queueDepth() });
});

app.use('/api/dashboard', dashboardRoutes);
app.use('/api', studentRoutes);
app.use(express.static(distDir));
app.get('/{*page}', (_req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof SupersededError) {
    res.status(409).json({ error: error.message, superseded: true });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const gemma = await checkGemma();
const certificate = await loadCertificate();

createHttpServer(app).listen(config.localPort, '127.0.0.1');
createHttpsServer(certificate, app).listen(config.httpsPort, '0.0.0.0', () => {
  console.log(`\nStudent Assistant is running`);
  console.log(`  Gemma:      ${gemma.ok ? gemma.detail : `NOT READY. ${gemma.detail}`}`);
  console.log(`  This laptop: http://localhost:${config.localPort}`);
  for (const address of lanAddresses()) {
    console.log(`  Students:    https://${address}:${config.httpsPort}`);
  }
  console.log(`  Test page:   http://localhost:${config.localPort}/teacher-test.html`);
  console.log(`  Dashboard token: ${config.dashboardToken}\n`);
});

// Lines every lab uses, ready before anyone needs them.
void waitForSpeech().then((ready) => {
  console.log(ready ? 'Voice is ready.' : 'Voice failed to load. Students will hear their browser voice.');
  if (ready) void prepareSpeech(COMMON_LINES);
});

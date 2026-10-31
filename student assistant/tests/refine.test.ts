import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitLine } from '../server/refine.ts';
import type { GrayImage } from '../server/refine.ts';
import { angleFromHorizontal } from '../shared/measure.ts';

const WIDTH = 960;
const HEIGHT = 640;

/** A plain background with a dark bar across it, optionally with light noise. */
function drawBar(x0: number, y0: number, x1: number, y1: number, noise = 0): GrayImage {
  const data = new Float32Array(WIDTH * HEIGHT).fill(190);
  const slope = (y1 - y0) / (x1 - x0);

  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    const centre = y0 + (x - x0) * slope;
    for (let y = Math.round(centre - 6); y <= Math.round(centre + 6); y++) {
      if (y >= 0 && y < HEIGHT) data[y * WIDTH + x] = 70;
    }
  }

  if (noise) {
    // A fixed pattern rather than Math.random, so a failure can be reproduced.
    for (let i = 0; i < data.length; i++) data[i] += ((i * 2654435761) % 1000) / 1000 * noise - noise / 2;
  }
  return { width: WIDTH, height: HEIGHT, data };
}

const toBox = (x0: number, y0: number, x1: number, y1: number) => ({
  left: (Math.min(x0, x1) / WIDTH) * 1000,
  right: (Math.max(x0, x1) / WIDTH) * 1000,
  top: (Math.min(y0, y1) / HEIGHT) * 1000,
  bottom: (Math.max(y0, y1) / HEIGHT) * 1000,
});

const pixels = { width: WIDTH, height: HEIGHT };

test('recovers the angle of a line through a loose box', () => {
  for (const degrees of [2, 5, 12, 25]) {
    const rise = Math.tan((degrees * Math.PI) / 180) * 700;
    const [x0, y0, x1, y1] = [130, 450, 830, Math.round(450 - rise)];
    const image = drawBar(x0, y0, x1, y1);

    // Gemma's box is never exact, so loosen it by several pixels.
    const box = toBox(x0 - 8, y0 + 9, x1 + 6, y1 - 7);
    const fit = fitLine(image, box);

    assert.ok(fit, `no line at ${degrees} degrees`);
    const measured = angleFromHorizontal(fit.start, fit.end, pixels);
    assert.ok(Math.abs(measured - degrees) < 0.4, `${degrees} measured as ${measured}`);
  }
});

test('works whichever way the line slopes', () => {
  const image = drawBar(130, 250, 830, 430);
  const fit = fitLine(image, toBox(130, 250, 830, 430));
  assert.ok(fit);
  assert.ok(fit.end.y > fit.start.y);
});

test('finds the real ends when the box overshoots', () => {
  const image = drawBar(200, 300, 700, 340);
  const fit = fitLine(image, toBox(170, 296, 730, 344));
  assert.ok(fit);
  const startX = (fit.start.x / 1000) * WIDTH;
  const endX = (fit.end.x / 1000) * WIDTH;
  assert.ok(Math.abs(startX - 200) < 6, `start ${startX}`);
  assert.ok(Math.abs(endX - 700) < 6, `end ${endX}`);
});

test('handles a steep line along the taller side of the box', () => {
  const image = drawBar(400, 100, 460, 560);
  const fit = fitLine(image, toBox(400, 100, 460, 560));
  assert.ok(fit);
  const measured = angleFromHorizontal(fit.start, fit.end, pixels);
  assert.ok(Math.abs(measured - 82.6) < 1, `measured ${measured}`);
});

test('tolerates camera noise', () => {
  const rise = Math.tan((8 * Math.PI) / 180) * 700;
  const image = drawBar(130, 450, 830, Math.round(450 - rise), 12);
  const fit = fitLine(image, toBox(130, 450, 830, Math.round(450 - rise)));
  assert.ok(fit);
  assert.ok(Math.abs(angleFromHorizontal(fit.start, fit.end, pixels) - 8) < 0.5);
});

test('a table edge under a shallow track does not steal the fit', () => {
  const rise = Math.tan((3 * Math.PI) / 180) * 700;
  const [x0, y0, x1, y1] = [130, 450, 830, Math.round(450 - rise)];
  const image = drawBar(x0, y0, x1, y1);

  // Everything below this row is a darker table top, a long, strong, level edge.
  for (let y = 470; y < HEIGHT; y++) image.data.fill(110, y * WIDTH, (y + 1) * WIDTH);

  const fit = fitLine(image, toBox(x0 - 6, y0 + 6, x1 + 6, y1 - 6));
  assert.ok(fit);
  const measured = angleFromHorizontal(fit.start, fit.end, pixels);
  assert.ok(Math.abs(measured - 3) < 0.5, `measured ${measured}`);
});

test('fits a level object inside a box much taller than it', () => {
  // A metre stick lying flat, with a box that also takes in the table around it.
  const image = drawBar(160, 500, 800, 500);
  const fit = fitLine(image, toBox(130, 470, 840, 545));
  assert.ok(fit);

  const length = ((fit.end.x - fit.start.x) / 1000) * WIDTH;
  assert.ok(Math.abs(length - 640) < 8, `length ${length}`);
  assert.ok(angleFromHorizontal(fit.start, fit.end, pixels) < 0.5);
});

test('a long table edge next to a flat ruler is not mistaken for the ruler', () => {
  const image = drawBar(160, 500, 800, 500);

  // A table top starting just above the ruler and running the full width of the frame.
  for (let y = 478; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (image.data[y * WIDTH + x] === 190) image.data[y * WIDTH + x] = 120;
    }
  }

  const fit = fitLine(image, toBox(130, 470, 840, 515));
  assert.ok(fit);
  const length = ((fit.end.x - fit.start.x) / 1000) * WIDTH;
  assert.ok(Math.abs(length - 640) < 8, `length ${length}`);
});

test('gives up on a blank region rather than inventing a line', () => {
  const blank: GrayImage = { width: WIDTH, height: HEIGHT, data: new Float32Array(WIDTH * HEIGHT).fill(120) };
  assert.equal(fitLine(blank, toBox(100, 100, 800, 300)), null);
});

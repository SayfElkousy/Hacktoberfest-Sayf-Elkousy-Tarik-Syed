import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  angleFromHorizontal,
  lengthCm,
  pixelsPerCm,
  withinTolerance,
} from '../shared/measure.ts';

const square = { width: 1000, height: 1000 };
const wide = { width: 1280, height: 720 };

test('angle accounts for non-square frames', () => {
  assert.equal(Math.round(angleFromHorizontal({ x: 0, y: 0 }, { x: 1000, y: 1000 }, square)), 45);
  // Corner to corner of a 16:9 frame is about 29.4 degrees, not 45.
  const angle = angleFromHorizontal({ x: 0, y: 0 }, { x: 1000, y: 1000 }, wide);
  assert.ok(Math.abs(angle - 29.36) < 0.01);
});

test('angle ignores which end of the line comes first', () => {
  const a = { x: 100, y: 800 };
  const b = { x: 900, y: 400 };
  assert.equal(angleFromHorizontal(a, b, wide), angleFromHorizontal(b, a, wide));
});

test('length uses the ruler for scale', () => {
  const scale = pixelsPerCm({ a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, cm: 50 }, square);
  assert.equal(scale, 10);
  assert.equal(lengthCm({ x: 100, y: 500 }, { x: 900, y: 500 }, square, scale!), 80);
});

test('a zero-length ruler gives no scale', () => {
  assert.equal(pixelsPerCm({ a: { x: 5, y: 5 }, b: { x: 5, y: 5 }, cm: 50 }, square), null);
  assert.equal(pixelsPerCm({ a: { x: 0, y: 0 }, b: { x: 5, y: 5 }, cm: 0 }, square), null);
});

test('tolerance falls back to ten percent, at least one unit', () => {
  assert.equal(withinTolerance(32, 30, null), true);
  assert.equal(withinTolerance(34, 30, null), false);
  assert.equal(withinTolerance(5.9, 5, null), true);
  assert.equal(withinTolerance(10, 5, 6), true);
  assert.equal(withinTolerance(10, null, null), null);
});

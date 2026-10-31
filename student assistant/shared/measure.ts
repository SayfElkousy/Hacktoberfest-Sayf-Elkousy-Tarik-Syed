// Turns the points Gemma finds into real numbers. Gemma says where things are;
// the arithmetic stays here so the results are exact and repeatable.

import type { FrameSize, GridPoint } from './types.ts';

const GRID = 1000;

function toPixels(point: GridPoint, frame: FrameSize): { x: number; y: number } {
  return { x: (point.x / GRID) * frame.width, y: (point.y / GRID) * frame.height };
}

export function pixelDistance(a: GridPoint, b: GridPoint, frame: FrameSize): number {
  const p = toPixels(a, frame);
  const q = toPixels(b, frame);
  return Math.hypot(q.x - p.x, q.y - p.y);
}

/** Tilt of the line from horizontal, 0–90 degrees. */
export function angleFromHorizontal(a: GridPoint, b: GridPoint, frame: FrameSize): number {
  const p = toPixels(a, frame);
  const q = toPixels(b, frame);
  const radians = Math.atan2(Math.abs(q.y - p.y), Math.abs(q.x - p.x));
  return (radians * 180) / Math.PI;
}

export interface RulerReading {
  a: GridPoint;
  b: GridPoint;
  /** Real distance between the two points. */
  cm: number;
}

export function pixelsPerCm(ruler: RulerReading, frame: FrameSize): number | null {
  if (ruler.cm <= 0) return null;
  const pixels = pixelDistance(ruler.a, ruler.b, frame);
  return pixels > 0 ? pixels / ruler.cm : null;
}

export function lengthCm(a: GridPoint, b: GridPoint, frame: FrameSize, scale: number): number {
  return pixelDistance(a, b, frame) / scale;
}

export function withinTolerance(value: number, target: number | null, tolerance: number | null): boolean | null {
  if (target === null) return null;
  return Math.abs(value - target) <= (tolerance ?? defaultTolerance(target));
}

/** Used when the procedure gives a target but no tolerance. */
function defaultTolerance(target: number): number {
  return Math.max(Math.abs(target) * 0.1, 1);
}

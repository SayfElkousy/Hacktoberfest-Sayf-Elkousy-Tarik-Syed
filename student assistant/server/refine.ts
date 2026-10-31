// Gemma finds roughly where a straight object is, to within a degree or two.
// That's too coarse to judge a 5 degree ramp, so this snaps a line onto the
// object's real edge inside Gemma's box, which brings it close to pixel accuracy.

import jpeg from 'jpeg-js';
import type { GridBox, GridPoint } from '../shared/types.ts';

const GRID = 1000;
/** How far outside the box the true ends may sit, as a share of the box. */
const SEARCH_MARGIN = 0.18;
const MIN_SEARCH_PX = 18;
const MAX_SEARCH_PX = 40;
/**
 * A nearly flat track has a thin box, so a table edge just beneath it can also
 * reach both corners. Lines are marked down the further they stray from the
 * box's diagonal, which keeps the search on the object Gemma pointed at.
 */
const DRIFT_PENALTY = 0.35;
/** Below this share of the box length, the "line" isn't a real straight edge. */
const MIN_COVERAGE = 0.5;
const MAX_GAP = 0.03;
const OVERSCAN = 0.1;
/** How many long background edges to rule out before giving up. */
const MAX_ATTEMPTS = 4;
/** Lines this close to a ruled-out one count as the same edge. */
const REJECT_RADIUS = 8;

export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

export function decodeGray(base64: string): GrayImage {
  const { width, height, data } = jpeg.decode(Buffer.from(base64, 'base64'), { useTArray: true });
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
  }
  return { width, height, data: gray };
}

export interface FittedLine {
  start: GridPoint;
  end: GridPoint;
  /** Share of the box length with a real edge under the line. */
  coverage: number;
}

export function fitLine(image: GrayImage, box: GridBox): FittedLine | null {
  const { width, height, data } = image;

  // Work along the longer side of the box: u runs along the line, v across it.
  const alongX = (box.right - box.left) * width >= (box.bottom - box.top) * height;
  const uSize = alongX ? width : height;
  const vSize = alongX ? height : width;
  const pixel = alongX ? (u: number, v: number) => data[v * width + u] : (u: number, v: number) => data[u * width + v];

  const [uBoxStart, uBoxEnd] = alongX ? [box.left, box.right] : [box.top, box.bottom];
  const [vBoxStart, vBoxEnd] = alongX ? [box.top, box.bottom] : [box.left, box.right];

  const uStart = Math.round((uBoxStart / GRID) * uSize);
  const uEnd = Math.round((uBoxEnd / GRID) * uSize);
  const vLow = (vBoxStart / GRID) * vSize;
  const vHigh = (vBoxEnd / GRID) * vSize;
  const length = uEnd - uStart;
  if (length < 20) return null;

  const margin = Math.round(Math.min(MAX_SEARCH_PX, Math.max(MIN_SEARCH_PX, (vHigh - vLow) * SEARCH_MARGIN)));
  const inBounds = (v: number) => v >= 1 && v < vSize - 1;

  /** How sharply the image changes across the line at this point. */
  const edge = (u: number, v: number): number => {
    const row = Math.round(v);
    return inBounds(row) ? Math.abs(pixel(u, row + 1) - pixel(u, row - 1)) : 0;
  };

  // The object could slope either way or lie level inside its box, so try every
  // line from one end of the box to the other. Tall boxes get a coarser pass.
  const spread = vHigh - vLow + 2 * margin;
  const stride = spread > 160 ? 2 : 1;
  const scanStart = Math.max(0, Math.round(uStart - length * OVERSCAN));
  const scanEnd = Math.min(uSize - 1, Math.round(uEnd + length * OVERSCAN));
  const maxGap = Math.max(4, Math.round(length * MAX_GAP));
  const rejected: { v0: number; v1: number }[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let best = { score: -1, v0: 0, v1: 0 };
    for (let v0 = vLow - margin; v0 <= vHigh + margin; v0 += stride) {
      for (let v1 = vLow - margin; v1 <= vHigh + margin; v1 += stride) {
        if (rejected.some((line) => Math.abs(line.v0 - v0) + Math.abs(line.v1 - v1) <= REJECT_RADIUS)) continue;

        let score = 0;
        for (let u = uStart; u < uEnd; u += 2) {
          score += Math.min(60, edge(u, v0 + ((v1 - v0) * (u - uStart)) / length));
        }
        const drift = Math.min(
          Math.abs(v0 - vLow) + Math.abs(v1 - vHigh),
          Math.abs(v0 - vHigh) + Math.abs(v1 - vLow),
        );
        score *= 1 - DRIFT_PENALTY * Math.min(1, drift / spread);
        if (score > best.score) best = { score, v0, v1 };
      }
    }

    const lineV = (u: number) => best.v0 + ((best.v1 - best.v0) * (u - uStart)) / length;

    // Follow the line a little past the box to find where the edge actually stops.
    const strengths: number[] = [];
    for (let u = scanStart; u <= scanEnd; u++) {
      strengths.push(Math.max(edge(u, lineV(u) - 1), edge(u, lineV(u)), edge(u, lineV(u) + 1)));
    }

    const sorted = [...strengths].sort((p, q) => p - q);
    const threshold = Math.max(8, sorted[Math.floor(sorted.length * 0.9)] * 0.3);

    let run = { start: 0, end: -1 };
    let runStart = -1;
    let lastHit = -1;
    for (let i = 0; i < strengths.length; i++) {
      if (strengths[i] < threshold) continue;
      if (runStart === -1 || i - lastHit > maxGap) runStart = i;
      lastHit = i;
      if (i - runStart > run.end - run.start) run = { start: runStart, end: i };
    }

    // Objects have ends. An edge that carries on past the box both ways belongs
    // to something bigger, like the table the object is sitting on.
    const pastBothEnds =
      run.start === 0 && run.end === strengths.length - 1 && scanStart < uStart && scanEnd > uEnd;
    if (pastBothEnds) {
      rejected.push(best);
      continue;
    }

    const coverage = (run.end - run.start) / length;
    if (coverage < MIN_COVERAGE) return null;

    const toPoint = (u: number): GridPoint => {
      const along = (u / uSize) * GRID;
      const across = (lineV(u) / vSize) * GRID;
      return alongX ? { x: along, y: across } : { x: across, y: along };
    };

    return { start: toPoint(scanStart + run.start), end: toPoint(scanStart + run.end), coverage };
  }

  return null;
}

// A closer look for pendulum labs. A general "is anything wrong?" misses the mistakes
// that matter here, so the model describes each part in turn, and plain rules decide
// what counts as a fault. Those rules work from one still picture, so a push on
// release, which only shows up as movement, can't be seen.

import { config } from './config.ts';
import { askGemma } from './gemma.ts';
import type { Frame, LabPlan, LabStep } from '../shared/types.ts';

const STRINGS = ['thread', 'fishing line', 'yarn', 'wire', 'chain', 'unclear'] as const;
const MASSES = ['ball', 'slotted mass', 'washers', 'other', 'hidden'] as const;
const SHAPES = ['straight', 'curved', 'wrapped'] as const;
const TOUCHED = ['nothing', 'the mass', 'the string', 'the stand'] as const;
const STANDS = ['upright', 'leaning', 'no stand'] as const;

export interface PendulumView {
  observed: string;
  present: boolean;
  /** [ymin, xmin, ymax, xmax] from 0 to 1000. */
  stringBox: number[];
  string: (typeof STRINGS)[number];
  mass: (typeof MASSES)[number];
  shape: (typeof SHAPES)[number];
  onTable: boolean;
  touching: (typeof TOUCHED)[number];
  stand: (typeof STANDS)[number];
  unsafe: boolean;
  /** Degrees from straight down, worked out from `stringBox`. */
  angle: number | null;
}

/** Past this the period starts to depend on the swing, and a box this wide isn't noise. */
const MAX_SWING_DEGREES = 25;

/** Steps where it swings. A hand on the string is normal while tying or measuring it. */
const SWINGING = /swing|releas|oscillat|period|time|pull/i;

const choice = (options: readonly string[]) => ({ type: 'string', enum: [...options] });

/** Whether this lab is about a pendulum, however the procedure words it. */
export function isPendulumLab(plan: LabPlan): boolean {
  const words = [plan.title, plan.objective, ...plan.components.map((part) => part.name), ...plan.steps.map((step) => step.instruction)];
  return words.some((text) => /pendul|\bbob\b/i.test(text));
}

export async function viewPendulum(frame: Frame, key: string): Promise<PendulumView> {
  const view = await askGemma<PendulumView>({
    system: `You inspect a school pendulum setup through a webcam: a mass hanging on a line from a support. Report only what you can see.

Go through these fields in order, looking at the picture again for each.
"observed": describe the support, the line and the mass, and any hand, in one sentence.
"present": true only if a line with a mass on it hangs from something. A stand with nothing hanging from it is false.
"stringBox": [ymin, xmin, ymax, xmax] from 0 to 1000, drawn tightly around the line from its top end to the mass.
"string": what the line is made of.
"mass": what is on the end of the line. "hidden" if a hand covers it.
"shape": "straight" if the line runs in one straight line from top to bottom, "curved" if it bends or droops at all, "wrapped" if it is wound around the stand or arm.
"onTable": true only if the mass is touching the table. A mass with air under it is false.
"touching": what a hand is on. Most pictures have no hand.
"stand": whether the upright rod is vertical.
"unsafe": true only if something dangerous is visible, such as broken glass, fire or an injury.`,
    prompt: 'Inspect this pendulum.',
    images: [frame.image],
    schema: {
      type: 'object',
      properties: {
        observed: { type: 'string' },
        present: { type: 'boolean' },
        stringBox: { type: 'array', items: { type: 'number' } },
        string: choice(STRINGS),
        mass: choice(MASSES),
        shape: choice(SHAPES),
        onTable: { type: 'boolean' },
        touching: choice(TOUCHED),
        stand: choice(STANDS),
        unsafe: { type: 'boolean' },
      },
      required: ['observed', 'present', 'stringBox', 'string', 'mass', 'shape', 'onTable', 'touching', 'stand', 'unsafe'],
    },
    background: true,
    key,
    model: config.detailModel,
    maxTokens: 300,
  });
  return { ...view, angle: angleOf(view.stringBox, frame) };
}

/** A straight line fills its box corner to corner, so the box's shape gives the angle. */
function angleOf(box: number[], frame: Frame): number | null {
  if (box.length !== 4) return null;
  const [top, left, bottom, right] = box;
  const across = ((right - left) * frame.width) / 1000;
  const down = ((bottom - top) * frame.height) / 1000;
  if (down <= 0) return null;
  return (Math.atan2(Math.max(0, across), down) * 180) / Math.PI;
}

/** What's wrong with the setup, as a sentence for the student, or null if nothing is. */
export function pendulumFault(view: PendulumView, step: LabStep | null = null): string | null {
  if (!view.present) return null;
  if (view.stand === 'leaning') return 'Your stand is leaning. Straighten it so the pendulum swings from a fixed point.';
  if (view.shape === 'wrapped') return 'Your string is wrapped around the stand. Free it so it hangs from a single point.';
  if (view.onTable) return 'Your mass is resting on the table. Raise it so it hangs clear.';
  // A hand covering the mass is holding the mass, even if the model calls it the string.
  const holdingMass = view.touching === 'the mass' || (view.touching === 'the string' && view.mass === 'hidden');
  const swinging = !step || SWINGING.test(step.instruction);
  if (view.touching === 'the string' && !holdingMass && swinging) return 'Let go of the string. Only hold the mass when you pull it back.';
  if (view.shape === 'curved') return 'Your string has gone slack. Keep it tight as you pull the mass back.';
  if (view.angle !== null && view.angle > MAX_SWING_DEGREES) return 'That swing is too wide. Keep it small, under about fifteen degrees, or the timing will be off.';
  return null;
}

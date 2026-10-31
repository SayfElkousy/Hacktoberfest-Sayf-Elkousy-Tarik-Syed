import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitProcedure } from '../server/brain.ts';
import { readProcedure } from '../server/dashboard-link.ts';

test('numbered procedures split into their steps', () => {
  const steps = splitProcedure('Materials: a cup.\n1. Fill the cup.\n2) Stir it.\nStep 3: Taste it.');
  assert.deepEqual(steps, ['Fill the cup.', 'Stir it.', 'Taste it.']);
});

test('bulleted procedures split into their steps', () => {
  assert.deepEqual(splitProcedure('- Fill the cup\n* Stir it\n• Taste it'), ['Fill the cup', 'Stir it', 'Taste it']);
});

test('a paragraph splits into sentences', () => {
  assert.deepEqual(splitProcedure('Fill the cup. Stir it! Is it sweet?'), ['Fill the cup.', 'Stir it!', 'Is it sweet?']);
});

test('text with no punctuation stays as one step', () => {
  assert.deepEqual(splitProcedure('observe the plant'), ['observe the plant']);
});

test('the dashboard can reply in several shapes', () => {
  assert.equal(readProcedure('Heat the water.'), 'Heat the water.');
  assert.equal(readProcedure({ procedure: 'Heat the water.' }), 'Heat the water.');
  assert.equal(readProcedure({ lab: { procedure: 'Heat the water.' } }), 'Heat the water.');
  assert.equal(readProcedure({ data: { lab: { procedure: 'Heat the water.' } } }), 'Heat the water.');
  assert.equal(readProcedure({ procedure: ['Heat the water.', 'Cool it.'] }), 'Heat the water.\nCool it.');
});

test('a reply with no procedure in it counts as unknown', () => {
  assert.equal(readProcedure({ title: 'Lab' }), null);
  assert.equal(readProcedure('   '), null);
  assert.equal(readProcedure(null), null);
});

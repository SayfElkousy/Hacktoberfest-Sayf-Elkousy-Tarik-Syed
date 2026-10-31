/* =====================================================================
   Demo seed data — realistic fictional classes, groups, procedures,
   sessions and help requests. Times are relative to "now" so the live
   session always looks mid-lab when the demo starts or is reset.
   ===================================================================== */

const M = (name, qty, unit, kind, extra = {}) => ({ id: uid(), name, qtyPerGroup: qty, unit, kind, per: 'group', sharedBy: 1, inventory: null, ...extra });
const ST = (title, minutes, instructions, opts = {}) => ({
  id: uid(), title, minutes, instructions, materials: opts.materials || [],
  inputs: (opts.inputs || []).map(([label, unit]) => ({ label, unit })), checkpoint: !!opts.checkpoint,
});

function specificHeatContent() {
  return {
    title: 'Specific Heat of Metals', subject: 'Chemistry', level: 'AP / IB', setupMinutes: 0, cleanupMinutes: 0,
    objectives: [
      'Determine the specific heat of an unknown metal with a coffee-cup calorimeter',
      'Apply conservation of energy: heat lost by the metal equals heat gained by the water',
      'Identify the metal by comparing the result with reference values',
    ],
    materials: [
      M('Unknown metal sample (25–35 g)', 1, 'samples', 'reusable'),
      M('Coffee-cup calorimeter (2 nested foam cups + lid)', 1, 'sets', 'reusable'),
      M('Digital thermometer', 1, 'thermometers', 'reusable'),
      M('400 mL beaker', 1, 'beakers', 'reusable'),
      M('Hot plate', 1, 'hot plates', 'reusable', { sharedBy: 2 }),
      M('Crucible tongs', 1, 'pairs', 'reusable'),
      M('Electronic balance (0.01 g)', 1, 'balances', 'reusable', { sharedBy: 3 }),
      M('100 mL graduated cylinder', 1, 'cylinders', 'reusable'),
      M('Distilled water', 0.4, 'L', 'consumable'),
      M('Safety goggles', 1, 'pairs', 'reusable', { per: 'student' }),
    ],
    setup: [
      'Preheat hot plates to boiling before students arrive.',
      'Label unknown metal samples A–F and note which metal each one is.',
      'Check each digital thermometer in ice water (should read 0 ± 0.5 °C).',
    ],
    steps: [
      ST('Mass the metal sample', 4, 'Zero the balance, then measure the mass of your dry metal sample to 0.01 g.', { inputs: [['Mass of metal', 'g']], materials: ['Electronic balance (0.01 g)'] }),
      ST('Set up the boiling water bath', 6, 'Fill the 400 mL beaker about two-thirds with water and place it on the hot plate. Bring it to a steady boil.', { materials: ['400 mL beaker', 'Hot plate'] }),
      ST('Heat the metal', 8, 'Use tongs to lower the metal into the boiling water. Leave it for at least 5 minutes so it reaches the water’s temperature. Record the bath temperature.', { inputs: [['Water bath temperature', '°C']], materials: ['Crucible tongs', 'Digital thermometer'] }),
      ST('Prepare the calorimeter', 5, 'Measure 100.0 mL of room-temperature water into the nested cups. Put the thermometer through the lid and record the starting temperature. Ask your teacher to check the setup before you move hot metal.', { inputs: [['Mass of water', 'g'], ['Initial water temperature', '°C']], checkpoint: true, materials: ['Coffee-cup calorimeter (2 nested foam cups + lid)', '100 mL graduated cylinder'] }),
      ST('Transfer the metal', 3, 'With tongs, move the metal from the bath into the calorimeter quickly and without splashing. Close the lid right away.', { materials: ['Crucible tongs'] }),
      ST('Record the final temperature', 6, 'Swirl gently and watch the thermometer. Record the highest temperature reached.', { inputs: [['Final water temperature', '°C']] }),
      ST('Calculate specific heat', 8, 'Use q = m·c·ΔT for the water to find the heat it gained, then solve for the metal’s specific heat. Compare with the reference table.', { inputs: [['Specific heat of metal', 'J/g·°C'], ['Identified metal', '']] }),
      ST('Clean up', 5, 'Dry the metal and return it to the sample tray. Pour the water down the sink. Switch off the hot plate and leave it on the heat-safe pad to cool.'),
    ],
    cleanup: ['Return metal samples to the labeled tray.', 'Unplug hot plates and leave them to cool on heat-safe pads.', 'Wipe benches dry.'],
    precautions: [
      'Boiling water and hot metal cause burns: handle the metal only with tongs.',
      'Keep hot plate cords away from water and bench edges.',
      'Goggles stay on until all hot equipment has cooled.',
    ],
    assumptions: [], questions: [],
  };
}

function catalaseContent() {
  return {
    title: 'Catalase Activity and Temperature', subject: 'Biology', level: 'High school (grades 9–10)', setupMinutes: 5, cleanupMinutes: 5,
    objectives: ['Observe how the enzyme catalase breaks down hydrogen peroxide', 'Measure how temperature affects enzyme activity', 'Explain the results in terms of enzyme shape and denaturation'],
    materials: [
      M('Potato cubes (1 cm)', 8, 'cubes', 'consumable'), M('3% hydrogen peroxide', 80, 'mL', 'consumable'),
      M('Test tubes', 4, 'tubes', 'reusable'), M('Test tube rack', 1, 'racks', 'reusable'), M('10 mL graduated cylinder', 1, 'cylinders', 'reusable'),
      M('Ruler (mm)', 1, 'rulers', 'reusable'), M('Water bath station', 1, 'stations', 'reusable', { sharedBy: 4 }), M('Safety goggles', 1, 'pairs', 'reusable', { per: 'student' }),
    ],
    setup: ['Cut potato cubes. Keep one batch in ice water, one at room temperature, one in a 37 °C bath, and boil one batch for 5 minutes.', 'Fill labeled dropper bottles with 3% hydrogen peroxide for each bench.'],
    steps: [
      ST('Label four test tubes', 2, 'Label the tubes Cold, Room, Warm and Boiled, and stand them in the rack.'),
      ST('Add hydrogen peroxide', 4, 'Measure 10 mL of 3% hydrogen peroxide into each tube.'),
      ST('Add the potato cubes', 4, 'Add one potato cube from the matching temperature batch to each tube at the same time.'),
      ST('Measure the foam height', 6, 'After 60 seconds, measure the foam height in each tube with the ruler.', { inputs: [['Foam height: Cold', 'mm'], ['Foam height: Room', 'mm'], ['Foam height: Warm', 'mm'], ['Foam height: Boiled', 'mm']] }),
      ST('Repeat the trial', 10, 'Rinse the tubes and repeat with fresh cubes. Record the average of both trials.', { inputs: [['Trial 2 average', 'mm']] }),
      ST('Explain the trend', 6, 'Graph foam height against temperature. Explain why the boiled potato made little or no foam.', { inputs: [['Explanation', '']] }),
    ],
    cleanup: ['Pour tube contents down the sink with plenty of water.', 'Put potato pieces in the compost bin.', 'Rinse the test tubes and rack them upside down.'],
    precautions: ['3% hydrogen peroxide can irritate eyes and skin: wear goggles and rinse spills with water.', 'Only the teacher prepares the boiled potato batch.'],
    assumptions: [], questions: [],
  };
}

function titrationContent() {
  return {
    title: 'Acid–Base Titration of Vinegar', subject: 'Chemistry', level: 'AP / IB', setupMinutes: 5, cleanupMinutes: 5,
    objectives: ['Find the concentration of acetic acid in vinegar by titration with standardized NaOH', 'Recognize the phenolphthalein end point', 'Calculate percent acetic acid'],
    materials: [
      M('50 mL burette', 1, 'burettes', 'reusable'), M('Ring stand with burette clamp', 1, 'sets', 'reusable'), M('10 mL volumetric pipette', 1, 'pipettes', 'reusable'),
      M('250 mL Erlenmeyer flask', 3, 'flasks', 'reusable'), M('0.100 M NaOH', 75, 'mL', 'consumable'), M('White vinegar', 30, 'mL', 'consumable'),
      M('Phenolphthalein indicator', 9, 'drops', 'consumable'), M('Safety goggles', 1, 'pairs', 'reusable', { per: 'student' }),
    ],
    setup: ['Standardize the NaOH the day before and label the carboy with its exact molarity.', 'Set out a waste beaker at each bench.'],
    steps: [
      ST('Rinse and fill the burette', 6, 'Rinse the burette with two small portions of NaOH, then fill it below eye level using a funnel. Remove the funnel and record the initial reading.', { inputs: [['Initial burette reading', 'mL']], checkpoint: true }),
      ST('Pipette the vinegar', 5, 'Pipette 10.00 mL of vinegar into a clean flask. Add about 25 mL of distilled water and 3 drops of phenolphthalein.'),
      ST('Rough titration', 7, 'Add NaOH quickly while swirling until a pale pink color lasts 30 seconds. Record the final reading.', { inputs: [['Rough titre', 'mL']] }),
      ST('Accurate titrations', 14, 'Repeat twice more, adding NaOH drop by drop near the end point.', { inputs: [['Titre 2', 'mL'], ['Titre 3', 'mL']] }),
      ST('Calculate concentration', 8, 'Average your concordant titres and calculate the molarity and percent acetic acid.', { inputs: [['Acetic acid', '% m/v']] }),
    ],
    cleanup: ['Drain the burette into the waste beaker and rinse it with distilled water.', 'Neutralized solutions can go down the sink with running water.'],
    precautions: ['NaOH is corrosive: wear goggles, and rinse any skin contact with water for 15 minutes.', 'Fill burettes below eye level and remove the funnel before titrating.'],
    assumptions: [], questions: [],
  };
}

function flameContent() {
  return {
    title: 'Flame Tests for Metal Ions', subject: 'Chemistry', level: 'High school (grades 11–12)', setupMinutes: 5, cleanupMinutes: 5,
    objectives: ['Observe the flame colors of metal ions', 'Relate emission colors to electron energy levels'],
    materials: [M('Wooden splints soaked in salt solutions', 6, 'splints', 'consumable'), M('Bunsen burner', 1, 'burners', 'reusable'), M('Safety goggles', 1, 'pairs', 'reusable', { per: 'student' })],
    setup: ['Soak splints in lithium, sodium, potassium, calcium, strontium and copper chloride solutions overnight.'],
    steps: [
      ST('Light the burner', 4, 'Light the Bunsen burner with the air hole half open.', { checkpoint: true }),
      ST('Test each splint', 15, 'Hold each splint at the edge of the flame and record the color you see.', { inputs: [['Observed colors', '']] }),
      ST('Identify the unknown', 6, 'Test the unknown splint and identify the metal ion.', { inputs: [['Unknown ion', '']] }),
    ],
    cleanup: ['Drop used splints into the beaker of water.', 'Turn off the gas at the bench tap.'],
    precautions: ['Tie back long hair and keep sleeves clear of the flame.'],
    assumptions: [], questions: [],
  };
}

const DENSITY_ORIGINAL = `Density of Irregular Solids
Physical Science Lab, Unit 2

Purpose
Determine the density of irregularly shaped objects using water displacement.
Compare measured densities with known values to identify each material.

Materials
- Electronic balance (2 per class)
- 100 mL graduated cylinder (1)
- Irregular objects: rubber stopper, aluminum bolt, glass marble
- Water
- Paper towels

Procedure
1. Measure the mass of each object on the electronic balance and record it in grams. (3 min)
2. Fill the graduated cylinder with an appropriate amount of water and record the starting volume.
3. Tilt the cylinder and gently slide the first object in so the water does not splash. Record the new volume.
4. Calculate the volume of the object by subtracting the starting volume from the final volume. (4 min)
5. Repeat steps 2-4 for the other objects.
6. Calculate density using D = m / V and compare with the reference table. Have your teacher initial your data table. (8 min)

Data
Mass (g)
Initial volume (mL)
Final volume (mL)

Analysis Questions
1. Which object was the most dense?
2. What sources of error could affect your volume measurement?`;

const SAMPLE_IMPORT_TEXT = `Paper Chromatography of Marker Inks
Grade 9 Physical Science

Objectives
- Separate the dyes in water-soluble markers using paper chromatography
- Calculate Rf values for each dye
- Use Rf values to identify the marker used on a "ransom note"

Materials
- 4 strips of chromatography paper
- 1 250 mL beaker
- 1 pencil
- 1 ruler (cm)
- 3 water-soluble markers (black, brown, green)
- 50 mL water
- 1 binder clip

Safety
- Wipe up spills right away so the floor stays dry.

Procedure
1. Draw a pencil line 2 cm from the bottom of each strip. (3 min)
2. Put a small dot of each marker on its own strip, on the pencil line. Add the mystery sample to the fourth strip. (4 min)
3. Pour some water into the beaker so the level is below the pencil line.
4. Clip the strips to the pencil and lower them into the beaker. Do not let the dots touch the water. Wait until the solvent front is 1 cm from the top. (15 min)
5. Remove the strips and mark the solvent front with pencil. Let them dry. (3 min)
6. Measure the distance traveled by each dye and by the solvent front. Record both distances in cm.
7. Calculate the Rf value for each dye and record it. Ask your teacher to check your Rf values before you identify the mystery marker. (6 min)

Cleanup
- Pour the water down the sink and rinse the beaker.
- Tape your dried strips into your lab notebook.`;

/* ---------- Deterministic pseudo-random for stable demo data ---------- */
function seededRandom(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function fakeReading(label, unit, rnd = Math.random) {
  const l = (label + ' ' + unit).toLowerCase();
  const r = (a, b, d = 1) => (a + rnd() * (b - a)).toFixed(d);
  if (/mass of metal/.test(l)) return r(25, 35, 2);
  if (/mass of water/.test(l)) return r(99.6, 100.4, 1);
  if (/bath/.test(l)) return r(97.8, 99.6, 1);
  if (/initial water/.test(l)) return r(20.5, 22.8, 1);
  if (/final water/.test(l)) return r(24.2, 28.9, 1);
  if (/specific heat/.test(l)) return ['0.385', '0.449', '0.897', '0.129', '0.235'][Math.floor(rnd() * 5)];
  if (/identified metal/.test(l)) return ['Copper', 'Iron', 'Aluminum', 'Lead', 'Tin'][Math.floor(rnd() * 5)];
  if (/foam/.test(l)) return r(4, 38, 0);
  if (/titre|reading/.test(l)) return r(8.2, 9.4, 2);
  if (/acetic/.test(l)) return r(4.7, 5.3, 2);
  if (/°c/.test(l)) return r(4, 60, 1);
  if (/time/.test(l) && /\bs\b/.test(l)) return r(18, 95, 0);
  if (!unit) return ['Recorded in notebook', 'Matches prediction', 'See sketch'][Math.floor(rnd() * 3)];
  return r(1, 50, 1);
}

/* ---------- Seed builder ---------- */
function makeSeed(now = Date.now()) {
  const rnd = seededRandom(42);
  const FIRST = ['Ava', 'Mateo', 'Zoe', 'Ethan', 'Amara', 'Lucas', 'Priya', 'Noah', 'Sofia', 'Kenji', 'Isabella', 'Omar', 'Chloe', 'Diego', 'Hana', 'Elijah', 'Maya', 'Samuel', 'Leila', 'Owen', 'Grace', 'Malik', 'Nora', 'Caleb', 'Aaliyah', 'Felix', 'Ruby', 'Andre', 'Tessa', 'Jonah', 'Imani', 'Leo', 'Camila', 'Isaac', 'Yara', 'Miles', 'Esme', 'Rafael', 'Jada', 'Theo'];
  const LAST = ['Nguyen', 'Garcia', 'Patel', 'Johnson', 'Kim', 'Okafor', 'Rossi', 'Chen', 'Hernandez', 'Walker', 'Haddad', 'Silva', 'Brooks', 'Tanaka', 'Murphy', 'Ali', 'Fischer', 'Reyes', 'Owens', 'Singh', 'Lopez', 'Adeyemi', 'Novak', 'Bennett', 'Cruz', 'Park', 'Dubois', 'Ward', 'Mensah', 'Ortiz', 'Hughes', 'Rahman', 'Kowalski', 'Price', 'Mendoza', 'Ibrahim', 'Foster', 'Sato', 'Romero', 'Lindqvist', 'Abara'];
  let sCount = 0;
  const students = [];
  const newStudent = () => { const i = sCount++; const st = { id: uid(), name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}` }; students.push(st); return st; };

  const teacher = { id: uid(), name: 'Alicia Moreno', email: 'alicia.moreno@northgate.edu', role: 'teacher', school: 'Northgate High School', createdAt: now - 90 * 86400000, demo: true };
  const studentUser = { id: uid(), name: 'Jordan Lee', email: 'jordan.lee@students.northgate.edu', role: 'student', school: 'Northgate High School', createdAt: now - 60 * 86400000, demo: true };
  const indieUser = { id: uid(), name: 'Priya Raman', email: 'priya.raman@example.com', role: 'independent', school: '', createdAt: now - 20 * 86400000, demo: true };

  const ap = { id: uid(), teacherId: teacher.id, name: 'AP Chemistry', subject: 'Chemistry', level: 'AP / IB', description: 'Second-year chemistry with a double lab block on Fridays.', joinCode: 'K7Q-M4X', codeUpdatedAt: now - 60 * 86400000, createdAt: now - 60 * 86400000, periods: [{ id: uid(), name: 'Period 2', expected: 24 }, { id: uid(), name: 'Period 4', expected: 26 }, { id: uid(), name: 'Period 6', expected: 22 }] };
  const bio = { id: uid(), teacherId: teacher.id, name: 'Biology Honors', subject: 'Biology', level: 'High school (grades 9–10)', description: 'Ninth-grade honors biology.', joinCode: 'TWE-9HC', codeUpdatedAt: now - 58 * 86400000, createdAt: now - 58 * 86400000, periods: [{ id: uid(), name: 'Period 1', expected: 28 }, { id: uid(), name: 'Period 3', expected: 28 }] };
  const [P2, P4, P6] = ap.periods; const [B1, B3] = bio.periods;

  const enrollments = []; const groups = [];
  const enroll = (cls, per, n) => Array.from({ length: n }, () => { const st = newStudent(); enrollments.push({ id: uid(), classId: cls.id, periodId: per.id, studentId: st.id, joinedAt: cls.createdAt + Math.floor(rnd() * 5) * 86400000 }); return st; });
  const makeGroups = (cls, per, list, sizes) => { let i = 0; return sizes.map((sz, gi) => { const g = { id: uid(), classId: cls.id, periodId: per.id, name: `Bench ${gi + 1}`, memberIds: list.slice(i, i + sz).map((s) => s.id) }; i += sz; groups.push(g); return g; }); };
  const gP2 = makeGroups(ap, P2, enroll(ap, P2, 24), [4, 4, 4, 4, 4, 4]);
  const gP4 = makeGroups(ap, P4, enroll(ap, P4, 23), [4, 4, 4, 4, 4, 3]);
  const gP6 = makeGroups(ap, P6, enroll(ap, P6, 20), [4, 4, 4, 4, 4]);
  enroll(bio, B1, 27); enroll(bio, B3, 26);

  const V = (n, content, state, at, locked = false) => ({ id: uid(), number: n, state, content: normalizeContent(content), createdAt: at, approvedAt: state === 'ready' ? at : undefined, locked });
  const shV1 = V(1, specificHeatContent(), 'ready', now - 9 * 86400000, true);
  const shV2c = specificHeatContent(); shV2c.steps[5].instructions = 'Swirl gently and watch the thermometer. Record the highest temperature reached, then keep watching for 30 seconds to confirm it has peaked.';
  const labSH = { id: uid(), teacherId: teacher.id, source: 'manual', archived: false, createdAt: now - 9 * 86400000, updatedAt: now - 2 * 3600000, versions: [shV1, V(2, shV2c, 'draft', now - 2 * 3600000)] };
  const titV2 = V(2, titrationContent(), 'ready', now - 12 * 86400000, true);
  const labTit = { id: uid(), teacherId: teacher.id, source: 'upload', archived: false, createdAt: now - 30 * 86400000, updatedAt: now - 12 * 86400000, original: { name: 'titration_procedure_2025.pdf', size: 184320, type: 'application/pdf', text: '', note: 'Seed record: the original file isn’t included in the demo data.' }, versions: [V(1, titrationContent(), 'ready', now - 30 * 86400000, false), titV2] };
  const labCat = { id: uid(), teacherId: teacher.id, source: 'ai', archived: false, createdAt: now - 3 * 86400000, updatedAt: now - 3 * 86400000, versions: [V(1, catalaseContent(), 'ready', now - 3 * 86400000)] };
  const denContent = parseProcedureText(DENSITY_ORIGINAL).content; denContent.subject = 'Physical Science'; denContent.level = 'High school (grades 9–10)';
  const labDen = { id: uid(), teacherId: teacher.id, source: 'upload', archived: false, createdAt: now - 26 * 3600000, updatedAt: now - 26 * 3600000, original: { name: 'density_lab_v3.pdf', size: 96256, type: 'application/pdf', text: DENSITY_ORIGINAL, note: 'Seed record: extracted text shown; the PDF itself isn’t included in the demo data.' }, versions: [V(1, denContent, 'draft', now - 26 * 3600000)] };
  const labFlame = { id: uid(), teacherId: teacher.id, source: 'manual', archived: true, createdAt: now - 200 * 86400000, updatedAt: now - 150 * 86400000, versions: [V(1, flameContent(), 'ready', now - 200 * 86400000)] };

  const dayISO = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const asSH = { id: uid(), labId: labSH.id, versionId: shV1.id, classId: ap.id, periodIds: [P2.id, P4.id, P6.id], scheduledFor: dayISO(now), createdAt: now - 3 * 86400000 };
  const asTit = { id: uid(), labId: labTit.id, versionId: titV2.id, classId: ap.id, periodIds: [P2.id, P4.id, P6.id], scheduledFor: dayISO(now - 7 * 86400000), createdAt: now - 10 * 86400000 };

  const sess = (as, lab, per, status, startedAt, endedAt) => ({ id: uid(), assignmentId: as.id, labId: lab.id, versionId: as.versionId, classId: as.classId, periodId: per.id, status, scheduledFor: as.scheduledFor, startedAt, pausedAt: undefined, pausedTotal: 0, endedAt });
  const sSH2 = sess(asSH, labSH, P2, 'completed', now - 4 * 3600000, now - 4 * 3600000 + 49 * MIN);
  const sSH4 = sess(asSH, labSH, P4, 'active', now - 25 * MIN);
  const sSH6 = sess(asSH, labSH, P6, 'scheduled');
  const titStart = now - 7 * 86400000 - 5 * 3600000;
  const sT2 = sess(asTit, labTit, P2, 'completed', titStart, titStart + 47 * MIN);
  const sT4 = sess(asTit, labTit, P4, 'completed', titStart + 2 * 3600000, titStart + 2 * 3600000 + 51 * MIN);
  const sT6 = sess(asTit, labTit, P6, 'completed', titStart + 4 * 3600000, titStart + 4 * 3600000 + 46 * MIN);

  const progress = [];
  const shSteps = shV1.content.steps;
  /** Build a progress record with k completed steps spread between session start and `lastDoneAt`. */
  const buildProgress = (session, g, content, k, lastDoneAt, extraIn = {}) => {
    const { atGate, ...extra } = extraIn;
    const p = { id: uid(), sessionId: session.id, groupId: g.id, stepIndex: Math.min(k, content.steps.length - 1), completed: [], stepStartedAt: lastDoneAt, lastActivityAt: lastDoneAt, connection: 'online', checkpoint: null, observations: [], activity: [], finishedAt: undefined };
    const span = lastDoneAt - session.startedAt;
    const ends = plannedEnds(content); const endK = ends[k - 1] || 1;
    ensureProgressShape(p);
    for (let i = 0; i < k; i++) {
      const at = Math.round(session.startedAt + span * (ends[i] / endK));
      p.completed.push({ index: i, stepId: content.steps[i].id, at });
      const cp = checkpointAfter(content, content.steps[i].id);
      if (cp) p.gates[cp.id] = atGate && i === k - 1 ? { releasedAt: at, approval: 'pending', requestedAt: at } : { releasedAt: at, approval: cp.approvalRequired ? 'approved' : 'none', approvedAt: at + 60000 };
      if (cp && atGate && i === k - 1) { p.atCheckpoint = cp.id; p.stepIndex = i; }
      p.activity.push({ at, text: `Completed step ${i + 1}: ${content.steps[i].title}` });
      for (const inp of content.steps[i].inputs) p.observations.push({ stepIndex: i, label: inp.label, unit: inp.unit, value: fakeReading(inp.label, inp.unit, rnd), at });
    }
    if (k >= content.steps.length) { p.finishedAt = lastDoneAt; p.stepIndex = content.steps.length - 1; p.activity.push({ at: lastDoneAt, text: 'Finished the lab' }); }
    p.activity.unshift({ at: session.startedAt + 20000, text: 'Group joined the session' });
    Object.assign(p, extra);
    return p;
  };
  // Period 4 — live, mid-lab
  const live = sSH4;
  const p4 = [
    buildProgress(live, gP4[0], shV1.content, 5, now - 5 * MIN, { lastActivityAt: now - 1 * MIN }),
    buildProgress(live, gP4[1], shV1.content, 4, now - 3 * MIN, { atGate: true, lastActivityAt: now - 3 * MIN }),
    buildProgress(live, gP4[2], shV1.content, 2, now - 15 * MIN, { lastActivityAt: now - 4 * MIN }),
    buildProgress(live, gP4[3], shV1.content, 4, now - 7 * MIN, { lastActivityAt: now - 6 * MIN }),
    buildProgress(live, gP4[4], shV1.content, 3, now - 8 * MIN, { lastActivityAt: now - 6 * MIN, connection: 'lost' }),
    buildProgress(live, gP4[5], shV1.content, 6, now - 3 * MIN, { lastActivityAt: now - 1 * MIN }),
  ];
  p4[1].activity.push({ at: now - 3 * MIN, text: 'Asked for teacher check: Prepare the calorimeter' });
  p4[3].activity.push({ at: now - 8 * MIN, text: 'Teacher approved checkpoint: Prepare the calorimeter' });
  p4[4].activity.push({ at: now - 6 * MIN, text: 'Device stopped responding' });
  p4[0].observations.push({ stepIndex: 5, label: 'Final water temperature', unit: '°C', value: '25.8', at: now - 1 * MIN });
  p4[0].activity.push({ at: now - 1 * MIN, text: 'Recorded Final water temperature: 25.8 °C' });
  progress.push(...p4);
  // Period 2 — completed this morning
  gP2.forEach((g, i) => progress.push(buildProgress(sSH2, g, shV1.content, shSteps.length, sSH2.startedAt + (41 + i * 1.5) * MIN)));
  // Titration — completed last week
  [[sT2, gP2], [sT4, gP4], [sT6, gP6]].forEach(([s, gs]) => gs.forEach((g, i) => progress.push(buildProgress(s, g, titV2.content, titV2.content.steps.length, s.startedAt + (38 + i * 1.7) * MIN))));

  const H = (session, g, stepIndex, category, message, createdAt, status, extra = {}) => ({ id: uid(), sessionId: session.id, classId: session.classId, periodId: session.periodId, groupId: g.id, labId: session.labId, stepIndex, category, message, createdAt, updatedAt: createdAt, updates: 0, status, log: [{ at: createdAt, text: 'Request submitted' }], ...extra });
  const help = [
    H(live, gP4[2 - 2], 1, 'Procedure', 'Do we dry the metal before we mass it? Ours came out of the tray a little wet.', now - 22 * MIN, 'resolved', { helpingAt: now - 21 * MIN, resolvedAt: now - 20 * MIN, log: [{ at: now - 22 * MIN, text: 'Request submitted' }, { at: now - 21 * MIN, text: 'Teacher started helping' }, { at: now - 20 * MIN, text: 'Marked resolved' }] }),
    H(live, gP4[5], 0, 'Equipment', 'Our balance won’t zero. It keeps drifting between 0.02 and 0.05 g.', now - 19 * MIN, 'resolved', { helpingAt: now - 18 * MIN, resolvedAt: now - 15 * MIN, log: [{ at: now - 19 * MIN, text: 'Request submitted' }, { at: now - 18 * MIN, text: 'Teacher started helping' }, { at: now - 15 * MIN, text: 'Marked resolved' }] }),
    H(live, gP4[3], 4, 'Equipment', 'Our thermometer reads about 3 °C higher than the one at Bench 1. Should we swap it before we transfer the metal?', now - 6 * MIN, 'waiting'),
    H(live, gP4[0], 5, 'Measurement', 'Do we record the temperature right when it peaks, or wait a minute first?', now - 2 * MIN, 'waiting'),
    H(sSH2, gP2[3], 2, 'Procedure', 'The water is boiling over. Can we turn the hot plate down?', sSH2.startedAt + 14 * MIN, 'resolved', { helpingAt: sSH2.startedAt + 15 * MIN, resolvedAt: sSH2.startedAt + 17 * MIN }),
    H(sSH2, gP2[1], 6, 'Measurement', 'Our specific heat came out negative. What did we do wrong?', sSH2.startedAt + 36 * MIN, 'resolved', { helpingAt: sSH2.startedAt + 37 * MIN, resolvedAt: sSH2.startedAt + 41 * MIN }),
  ];
  help[0].groupId = gP4[1].id; // Bench 2

  const designer = {
    form: {
      subject: 'Chemistry', topic: 'Reaction rates and temperature', level: 'AP / IB',
      objectives: 'Measure how water temperature affects how fast an effervescent tablet reacts\nExplain the trend using collision theory\nGraph reaction time against temperature',
      experiment: 'Effect of temperature on how fast an effervescent antacid tablet dissolves in water',
      existing: '',
    },
    inventory: [
      { id: uid(), name: 'Thermometer', qty: 6, unit: 'thermometers', kind: 'reusable', notes: 'Alcohol thermometers, −10 to 110 °C' },
      { id: uid(), name: '250 mL beaker', qty: 30, unit: 'beakers', kind: 'reusable', notes: '' },
      { id: uid(), name: 'Stopwatch', qty: 12, unit: 'stopwatches', kind: 'reusable', notes: '' },
      { id: uid(), name: '100 mL graduated cylinder', qty: 10, unit: 'cylinders', kind: 'reusable', notes: '' },
      { id: uid(), name: 'Hot plate', qty: 4, unit: 'hot plates', kind: 'reusable', notes: 'Two outlets per bench row' },
      { id: uid(), name: 'Effervescent antacid tablet', qty: 60, unit: 'tablets', kind: 'consumable', notes: 'One unopened box of 60' },
      { id: uid(), name: 'Crushed ice', qty: 8, unit: 'L', kind: 'consumable', notes: 'From the cafeteria; order a day ahead' },
      { id: uid(), name: 'Distilled water', qty: 20, unit: 'L', kind: 'consumable', notes: '' },
      { id: uid(), name: 'Safety goggles', qty: 30, unit: 'pairs', kind: 'reusable', notes: '' },
    ],
    logistics: {
      sel: { [`${ap.id}:${P4.id}`]: { on: true, override: '' }, [`${ap.id}:${P6.id}`]: { on: true, override: '' } },
      groupSize: 3, labMinutes: 50, setupMinutes: 5, cleanupMinutes: 5, reuseAcrossPeriods: true, allowSharing: true,
    },
    plan: null, planMeta: null, chat: [], labId: null, editing: false, revised: [],
    mode: 'live', draftMsg: '', tab: 'inputs', errors: [],
  };

  return {
    version: 2,
    cpRecords: [], events: [], processed: [],
    users: [teacher, studentUser, indieUser],
    currentUserId: teacher.id,
    classes: [ap, bio], students, enrollments, groups,
    labs: [labSH, labTit, labCat, labDen, labFlame],
    assignments: [asSH, asTit],
    sessions: [sSH2, sSH4, sSH6, sT2, sT4, sT6],
    progress, help, designer,
    settings: { behindMinutes: 5, longWaitMinutes: 5 },
    ui: { ctx: { classId: ap.id, periodId: P4.id, sessionId: sSH4.id }, liveFilter: 'all', liveSort: 'name', helpTab: 'open', libQuery: '', libStatus: 'all', libSubject: 'all', classTab: 'roster', classPeriod: {}, importDraft: null, editorDraft: null, demoGroupId: null, createClass: null },
    demo: { autoplay: false, lastSeen: now, seededAt: now },
  };
}

/* =====================================================================
   Demo seed: Research Workspace. Covers a student working alone, a
   professor assigning work to researchers, a collaborative project with
   several runs, and public protocols (one with a demonstration recording).
   ===================================================================== */
function seedResearch(st, r) {
  const { now, studentUser: jordan, indieUser: priya, teacher } = r;
  const D = 86400000;
  const park = { id: uid(), name: 'Elena Park', email: 'elena.park@riverbend.edu', role: 'independent', title: 'Professor', school: 'Riverbend University', createdAt: now - 400 * D, demo: true, profile: { displayName: 'Dr. Elena Park', school: 'Riverbend University' } };
  const marcus = { id: uid(), name: 'Marcus Bell', email: 'marcus.bell@riverbend.edu', role: 'independent', title: 'Researcher', school: 'Riverbend University', createdAt: now - 300 * D, demo: false, profile: { displayName: 'Marcus Bell', school: 'Riverbend University' } };
  priya.title = 'Researcher'; priya.school = 'Riverbend University'; priya.profile = { displayName: 'Priya Raman', school: 'Riverbend University' };
  st.users.push(park, marcus);
  void teacher;

  const PC = (o) => normalizeProtocolContent({ subject: '', level: '', objectives: [], materials: [], setup: [], cleanup: [], precautions: [], setupMinutes: 0, cleanupMinutes: 0, assumptions: [], questions: [], ...o });
  const F = (name, unit) => ({ id: uid(), name, unit });
  const ver = (n, content, at, locked = true, state = 'ready') => ({ id: uid(), number: n, state, content, createdAt: at, locked });
  const proto = (o) => ({ id: uid(), archived: false, shares: [], createdAt: o.versions[0].createdAt, updatedAt: o.versions[o.versions.length - 1].createdAt, ...o });
  const act = (at, by, text) => ({ at, by, text });
  const meas = (sample, trial, f, value, at, by, extra = {}) => ({ id: uid(), sample, trial, fieldId: f.id, name: f.name, value: String(value), unit: f.unit, uncertainty: '', notes: '', at, by, history: [], ...extra });
  const note = (kind, text, at, by) => ({ id: uid(), kind, text, at, by, history: [] });
  const run = (o) => ({ id: uid(), shares: [], conditions: [], samples: [], deviations: [], files: [], notebook: [], measurements: [], review: { state: 'none' }, activity: [], progress: newRunProgress(), mode: 'notebook', createdAt: now, updatedAt: now, ...o });
  const finished = (c, at, by) => { const p = newRunProgress(); c.steps.forEach((s, i) => p.completed.push({ index: i, stepId: s.id, at: at - (c.steps.length - i) * 600000, by })); p.stepIndex = c.steps.length - 1; p.finishedAt = at; return p; };
  const partial = (c, k, at, by) => { const p = newRunProgress(); for (let i = 0; i < k; i++) p.completed.push({ index: i, stepId: c.steps[i].id, at: at - (k - i) * 300000, by }); p.stepIndex = k; p.stepStartedAt = at; p.lastActivityAt = at; return p; };

  /* --- 1. Jordan: independent project at home --- */
  const latherF = F('Lather height', 'cm');
  const latherC = PC({ title: 'Shake-test lather height', subject: 'Chemistry', level: 'High school', description: 'Compare how much lather soap makes in waters of different hardness.', objective: 'Measure lather height for soft, tap and hard water.',
    variables: { independent: 'Water hardness', dependent: 'Lather height (cm)', controlled: 'Soap amount, water volume, shake time, jar size' }, conditions: ['Distilled', 'Tap', 'Hard (Epsom salt)'], trials: 3, measurementFields: [latherF],
    materials: [M('Glass jar with lid', 3, 'jars', 'reusable'), M('Liquid soap', 5, 'drops', 'consumable'), M('Water sample', 100, 'mL', 'consumable'), M('Ruler', 1, 'rulers', 'reusable'), M('Timer', 1, 'timers', 'reusable')],
    steps: [ST('Label the jars', 2, 'Label three jars: Distilled, Tap, Hard.'), ST('Add the water', 3, 'Pour 100 mL of each water sample into its jar.'), ST('Add soap', 2, 'Add exactly 5 drops of liquid soap to each jar.'),
      ST('Shake', 2, 'Close the lid and shake each jar for 15 seconds.'), ST('Measure the lather', 3, 'Wait 30 seconds, then measure the lather height above the water line.', { inputs: [['Lather height', 'cm']] }), ST('Repeat', 10, 'Empty, rinse and repeat for trials 2 and 3.')],
    precautions: ['Wipe up spills so the floor stays dry.'], cleanup: ['Rinse jars and leave them to dry.'] });
  latherC.steps[4].expected = 'Expectation: distilled water makes the most lather.';
  const ptLather = proto({ ownerId: jordan.id, projectId: null, origin: { type: 'manual' }, versions: [ver(1, latherC, now - 20 * D)] });
  const invHome = { id: uid(), ownerId: jordan.id, name: 'Home kitchen', projectIds: [], log: [], items: [
    { id: uid(), name: 'Glass jar with lid', qty: 3, unit: 'jars', kind: 'reusable', location: 'Pantry', notes: '' }, { id: uid(), name: 'Liquid soap', qty: 150, unit: 'drops', kind: 'consumable', location: 'Sink', notes: 'About 10 mL left' },
    { id: uid(), name: 'Distilled water', qty: 4, unit: 'L', kind: 'consumable', location: 'Garage', notes: '' }, { id: uid(), name: 'Epsom salt', qty: 500, unit: 'g', kind: 'consumable', location: 'Bathroom', notes: '' },
    { id: uid(), name: 'Ruler', qty: 1, unit: 'rulers', kind: 'reusable', location: 'Desk', notes: '' }] };
  const prJ = { id: uid(), ownerId: jordan.id, title: 'Water hardness and soap lather', question: 'Does harder water make less soap lather?', hypothesis: 'Hard water makes less lather, because calcium and magnesium ions react with soap.', description: 'A home experiment for my science fair entry.', tags: ['Chemistry', 'Home lab'], startDate: dayISOs(now - 21 * D), targetDate: dayISOs(now + 30 * D), status: 'active', visibility: 'private', inventoryId: invHome.id, members: [], tasks: [{ id: uid(), text: 'Find out how hard our tap water is', assigneeId: jordan.id, dueAt: dayISOs(now + 4 * D), done: false }], notes: [], activity: [act(now - 21 * D, jordan.id, 'Created the project'), act(now - 2 * D, jordan.id, 'Started run “Round 2 with measured hardness”')], createdAt: now - 21 * D, updatedAt: now - 2 * D };
  ptLather.projectId = prJ.id; invHome.projectIds = [prJ.id];
  const vL = ptLather.versions[0];
  const r1 = run({ ownerId: jordan.id, projectId: prJ.id, protocolId: ptLather.id, versionId: vL.id, title: 'Round 1: three waters', participants: [jordan.id], samples: ['Distilled', 'Tap', 'Hard (Epsom salt)'], conditions: ['Room temperature water'], mode: 'notebook', status: 'completed', startedAt: now - 9 * D, completedAt: now - 9 * D + 3600000, createdAt: now - 9 * D, progress: finished(latherC, now - 9 * D + 3600000, jordan.id) });
  [[6.2, 5.9, 6.4], [4.1, 4.4, 3.9], [1.8, 2.2, 1.5]].forEach((vals, si) => vals.forEach((v, ti) => r1.measurements.push(meas(r1.samples[si], ti + 1, latherF, v, r1.startedAt + (si * 3 + ti) * 240000, jordan.id))));
  r1.notebook.push(note('observation', 'The hard-water jar looked cloudy before I even shook it.', r1.startedAt + 1200000, jordan.id), note('interpretation', 'Lather drops as hardness goes up, but I don’t know how hard our tap water actually is.', r1.completedAt, jordan.id), note('question', 'How hard is our tap water? The city water report might say.', r1.completedAt + 60000, jordan.id));
  r1.activity.push(act(r1.startedAt, jordan.id, 'Started the run in Results & Notebook mode'), act(r1.completedAt, jordan.id, 'Marked the run complete'));
  const r2 = run({ ownerId: jordan.id, projectId: prJ.id, protocolId: ptLather.id, versionId: vL.id, title: 'Round 2 with measured hardness', participants: [jordan.id], samples: ['Distilled', 'Tap', 'Hard (Epsom salt)'], conditions: ['Tap water tested at 120 ppm'], mode: 'guided', status: 'in_progress', startedAt: now - 2 * D, createdAt: now - 2 * D, progress: partial(latherC, 4, now - 2 * D + 1800000, jordan.id) });
  r2.measurements.push(meas('Distilled', 1, latherF, 6.0, now - 2 * D + 1700000, jordan.id));
  r2.deviations.push({ id: uid(), at: now - 2 * D + 900000, by: jordan.id, stepId: latherC.steps[2].id, text: 'Used 4 drops of soap instead of 5 in trial 1 because the bottle ran out.' });
  r2.activity.push(act(r2.startedAt, jordan.id, 'Started a guided session'));

  /* --- 2. Dr. Park: professor assigning protocol runs to researchers --- */
  const odF = F('OD590', 'AU');
  const bioC = (n) => {
    const c = PC({ title: 'Crystal violet biofilm assay (24-well)', subject: 'Microbiology', level: 'College / research', description: 'Quantify biofilm on 3D-printed PLA coupons by crystal violet staining.', objective: 'Compare biofilm biomass across PLA print layer heights.',
      variables: { independent: 'Print layer height', dependent: 'OD590 of solubilized stain', controlled: 'Strain, inoculum density, incubation time and temperature, stain time' }, conditions: ['0.1 mm layers', '0.2 mm layers', '0.3 mm layers', 'No coupon (control)'], trials: 4, participantsCount: 1, measurementFields: [odF],
      materials: [M('24-well plate', 1, 'plates', 'consumable'), M('PLA coupons', 12, 'coupons', 'consumable'), M('0.1% crystal violet', 12, 'mL', 'consumable'), M('30% acetic acid', 12, 'mL', 'consumable'), M('PBS', 30, 'mL', 'consumable'), M('Multichannel pipette', 1, 'pipettes', 'reusable'), M('Plate reader', 1, 'readers', 'reusable')],
      steps: [ST('Inoculate wells', 15, 'Place one coupon per well and add 1 mL of diluted overnight culture (OD600 0.05).'), ST('Incubate', 5, 'Incubate the plate for 24 h at 37 °C without shaking. Log the start time.'),
        ST('Rinse wells', 10, 'Remove the medium and gently rinse each well three times with 1 mL PBS.'), ST('Stain', 20, 'Add 1 mL 0.1% crystal violet per well and leave for 15 minutes.'),
        ST('Rinse and dry', 15, 'Rinse three times with water and air-dry for 10 minutes.'), ST('Solubilize', 10, 'Add 1 mL 30% acetic acid per well and wait 10 minutes.'), ST('Read absorbance', 15, 'Transfer 125 µL per well to a flat-bottom plate and read OD590.', { inputs: [['OD590', 'AU']] })],
      precautions: ['Work with the bacterial strain at BSL-1 practices: gloves, lab coat, disinfect surfaces after use.', 'Crystal violet stains skin and clothing.'], cleanup: ['Autoclave plates and tips.', 'Wipe the bench with 70% ethanol.'],
      references: [{ title: 'O’Toole, G. A. (2011). Microtiter dish biofilm formation assay. JoVE (47).', url: '' }] });
    c.steps[3].expected = 'Expectation: control wells stay pale; coupon wells stain purple.';
    const cp = { ...blankCheckpoint(c.steps[2].id), title: 'Rinse check', info: 'Over-rinsing lifts the biofilm. A lead will look at the rinse before you stain.', kind: 'response', responseRequired: true, approvalRequired: true, scope: 'group', feedbackRelease: 'never', questions: [{ id: uid(), type: 'short', prompt: 'Did the film lift off in any wells? Which ones?', options: [], correct: null, feedback: '', unit: '', required: true }] };
    if (n >= 2) c.checkpoints = [cp];
    return c;
  };
  const invPark = { id: uid(), ownerId: park.id, name: 'Park Lab, Room 214', projectIds: [], log: [], items: [
    { id: uid(), name: '24-well plate', qty: 10, unit: 'plates', kind: 'consumable', location: 'Shelf B', notes: '' }, { id: uid(), name: 'PLA coupons', qty: 60, unit: 'coupons', kind: 'consumable', location: 'Drawer 3', notes: 'Printed Oct 12' },
    { id: uid(), name: '0.1% crystal violet', qty: 500, unit: 'mL', kind: 'consumable', location: 'Chemical cabinet', notes: '' }, { id: uid(), name: '30% acetic acid', qty: 1000, unit: 'mL', kind: 'consumable', location: 'Acid cabinet', notes: '' },
    { id: uid(), name: 'PBS', qty: 2000, unit: 'mL', kind: 'consumable', location: 'Fridge', notes: '' }, { id: uid(), name: 'Multichannel pipette', qty: 2, unit: 'pipettes', kind: 'reusable', location: 'Bench 2', notes: '' },
    { id: uid(), name: 'Plate reader', qty: 1, unit: 'readers', kind: 'reusable', location: 'Room 216', notes: 'Book on the sign-up sheet' }] };
  const ptBio = proto({ ownerId: park.id, projectId: null, origin: { type: 'manual' }, versions: [ver(1, bioC(1), now - 40 * D), ver(2, bioC(2), now - 10 * D)] });
  const prPark = { id: uid(), ownerId: park.id, title: 'Biofilm formation on 3D-printed PLA', question: 'Does print layer height change how much biofilm forms on PLA?', hypothesis: 'Thicker layers leave deeper grooves, so they hold more biofilm.', description: 'Lab project for the fall term. Each researcher runs the assay independently so we can compare between hands.', tags: ['Microbiology', 'Materials'], startDate: dayISOs(now - 45 * D), targetDate: dayISOs(now + 45 * D), status: 'active', visibility: 'private', inventoryId: invPark.id,
    members: [{ userId: priya.id, role: 'contributor', addedAt: now - 40 * D }, { userId: marcus.id, role: 'editor', addedAt: now - 40 * D }],
    tasks: [{ id: uid(), text: 'Print a new batch of 0.3 mm coupons', assigneeId: marcus.id, dueAt: dayISOs(now + 3 * D), done: false }, { id: uid(), text: 'Book the plate reader for Thursday', assigneeId: priya.id, dueAt: dayISOs(now + 1 * D), done: true }],
    notes: [{ id: uid(), text: 'Strain stock is in the -80, rack 2, box 4.', by: park.id, at: now - 39 * D }], activity: [], createdAt: now - 45 * D, updatedAt: now - D };
  ptBio.projectId = prPark.id; invPark.projectIds = [prPark.id];
  const v2 = ptBio.versions[1]; const c2 = v2.content;
  const asg = { id: uid(), projectId: prPark.id, protocolId: ptBio.id, versionId: v2.id, assignedBy: park.id, assignees: [priya.id, marcus.id], mode: 'independent', instructions: 'Run the full assay on your own printed coupons. Record OD590 for all four conditions, four wells each, and upload a photo of the stained plate.', availableFrom: dayISOs(now - 3 * D), dueAt: dayISOs(now + 5 * D), requiredFields: [c2.measurementFields[0].id], requireFiles: true, review: 'completion', runIds: [], createdAt: now - 3 * D };
  const rPriya = run({ ownerId: priya.id, projectId: prPark.id, protocolId: ptBio.id, versionId: v2.id, title: 'Biofilm assay · Priya', participants: [priya.id], samples: c2.conditions.slice(), mode: 'guided', status: 'in_progress', assignmentId: asg.id, startedAt: now - D, createdAt: now - 3 * D, progress: partial(c2, 3, now - 20 * 60000, priya.id) });
  rPriya.progress.stepIndex = 2; rPriya.progress.atCheckpoint = c2.checkpoints[0].id;
  rPriya.progress.gates[c2.checkpoints[0].id] = { releasedAt: now - 20 * 60000, approval: 'pending', requestedAt: now - 18 * 60000 };
  st.cpRecords.push({ id: cpRecordId(`run:${rPriya.id}`, rPriya.id, c2.checkpoints[0].id, null), trackKey: `run:${rPriya.id}`, groupId: rPriya.id, studentId: null, checkpointId: c2.checkpoints[0].id, status: 'submitted', responses: { [c2.checkpoints[0].questions[0].id]: 'Wells B2 and B3 lost some film at the edges on the third rinse.' }, savedAt: now - 18 * 60000, submittedAt: now - 18 * 60000, submittedBy: priya.id, submissions: 1, history: [{ at: now - 18 * 60000, text: 'Submitted' }] });
  rPriya.activity.push(act(now - D, priya.id, 'Started a guided session'), act(now - 18 * 60000, priya.id, 'Waiting for approval: Rinse check'));
  const rMarcus = run({ ownerId: marcus.id, projectId: prPark.id, protocolId: ptBio.id, versionId: v2.id, title: 'Biofilm assay · Marcus', participants: [marcus.id], samples: c2.conditions.slice(), mode: 'notebook', status: 'awaiting_review', assignmentId: asg.id, startedAt: now - 2 * D, completedAt: now - 5 * 3600000, createdAt: now - 3 * D, progress: finished(c2, now - 5 * 3600000, marcus.id), review: { state: 'requested', at: now - 5 * 3600000, by: marcus.id } });
  [[0.42, 0.47, 0.39, 0.45], [0.61, 0.58, 0.66, 0.63], [0.88, 0.79, 0.84, 0.91], [0.08, 0.07, 0.09, 0.08]].forEach((vals, si) => vals.forEach((v, ti) => rMarcus.measurements.push(meas(rMarcus.samples[si], ti + 1, odF, v, rMarcus.completedAt - 600000 + si * 4 * 10000 + ti * 10000, marcus.id))));
  rMarcus.files.push({ id: uid(), name: 'stained_plate_marcus.jpg', type: 'image/jpeg', size: 284000, at: rMarcus.completedAt, by: marcus.id, key: null, note: 'Demo record: the image file isn’t included in the sample data.' });
  rMarcus.notebook.push(note('observation', 'Purple staining is visibly darker on the 0.3 mm coupons.', rMarcus.completedAt - 3600000, marcus.id), note('interpretation', 'Consistent with more surface area from deeper grooves, but this is one plate from one culture.', rMarcus.completedAt, marcus.id));
  rMarcus.activity.push(act(rMarcus.startedAt, marcus.id, 'Started the run'), act(rMarcus.completedAt, marcus.id, 'Submitted for review'));
  asg.runIds = [rPriya.id, rMarcus.id];
  prPark.activity.push(act(now - 45 * D, park.id, 'Created the project'), act(now - 40 * D, park.id, 'Added Priya Raman as Contributor and Marcus Bell as Editor'), act(now - 10 * D, park.id, 'Released protocol version 2 with a rinse checkpoint'), act(now - 3 * D, park.id, 'Assigned “Crystal violet biofilm assay” to Priya Raman and Marcus Bell'), act(now - 5 * 3600000, marcus.id, 'Submitted “Biofilm assay · Marcus” for review'), act(now - 18 * 60000, priya.id, 'Asked for approval at “Rinse check”'));

  /* --- 3. Priya: collaborative field project with several runs --- */
  const turbF = F('Turbidity', 'NTU'); const tempF = F('Water temperature', '°C');
  const turbC = PC({ title: 'Field turbidity sampling', subject: 'Environmental science', level: 'College / research', description: 'Grab-sample turbidity and temperature at a stream site.', objective: 'Track how turbidity returns to baseline in the days after rain.',
    variables: { independent: 'Days since rainfall', dependent: 'Turbidity (NTU)', controlled: 'Sampling depth, time of day, meter calibration' }, conditions: ['Day 0', 'Day 1', 'Day 2', 'Day 3'], trials: 2, measurementFields: [turbF, tempF],
    materials: [M('Turbidity meter', 1, 'meters', 'reusable'), M('Sample bottle', 2, 'bottles', 'consumable'), M('Thermometer', 1, 'thermometers', 'reusable')],
    steps: [ST('Rinse the bottle', 3, 'Rinse the sample bottle three times with stream water, downstream of where you will sample.'), ST('Collect the sample', 5, 'Face upstream and fill the bottle from mid-stream, about 10 cm below the surface.'),
      ST('Measure turbidity', 5, 'Swirl gently and measure with the turbidity meter. Take two readings.', { inputs: [['Turbidity', 'NTU']] }), ST('Measure temperature', 3, 'Measure the stream temperature at the sampling point.', { inputs: [['Water temperature', '°C']] }), ST('Photo and notes', 3, 'Photograph the site from the same spot each day and note anything unusual.')],
    precautions: ['Don’t sample during high flow or lightning.', 'Wear waders or boots; never wade above the knee.'], cleanup: ['Rinse the meter cell with distilled water.'] });
  const ptTurb = proto({ ownerId: priya.id, projectId: null, origin: { type: 'manual' }, versions: [ver(1, turbC, now - 30 * D)] });
  const prPriya = { id: uid(), ownerId: priya.id, title: 'Urban stream turbidity after rainfall', question: 'How quickly does turbidity return to baseline after rain at three city sites?', hypothesis: '', description: 'Shared field project with Marcus. We sample each site for four days after a storm.', tags: ['Environmental science', 'Field work'], startDate: dayISOs(now - 30 * D), targetDate: dayISOs(now + 20 * D), status: 'active', visibility: 'private', inventoryId: null,
    members: [{ userId: marcus.id, role: 'editor', addedAt: now - 29 * D }], tasks: [{ id: uid(), text: 'Calibrate the turbidity meter with the 20 NTU standard', assigneeId: marcus.id, dueAt: dayISOs(now + 2 * D), done: false }, { id: uid(), text: 'Draft the results summary', assigneeId: priya.id, dueAt: dayISOs(now + 7 * D), done: false }],
    notes: [], activity: [act(now - 30 * D, priya.id, 'Created the project'), act(now - 29 * D, priya.id, 'Added Marcus Bell as Editor')], createdAt: now - 30 * D, updatedAt: now - 3600000 };
  ptTurb.projectId = prPriya.id;
  const vT = ptTurb.versions[0];
  const siteRun = (title, owner, base, status, unitOverride) => {
    const x = run({ ownerId: owner, projectId: prPriya.id, protocolId: ptTurb.id, versionId: vT.id, title, participants: [owner], samples: ['Day 0', 'Day 1', 'Day 2', 'Day 3'], conditions: ['After 28 mm rain on Oct 20'], mode: 'notebook', status, startedAt: now - 10 * D, createdAt: now - 10 * D, completedAt: status === 'completed' ? now - 6 * D : undefined, progress: status === 'completed' ? finished(turbC, now - 6 * D, owner) : partial(turbC, 2, now - 3600000, owner) });
    base.forEach((v, d) => { if (v == null) return; [0, 1].forEach((t) => { const m = meas(`Day ${d}`, t + 1, turbF, round(v * (1 + (t ? 0.04 : -0.03)), 1), now - (10 - d) * D + t * 60000, owner); if (unitOverride && d === 2) m.unit = unitOverride; x.measurements.push(m); }); x.measurements.push(meas(`Day ${d}`, 1, tempF, round(11 + d * 0.6, 1), now - (10 - d) * D, owner)); });
    return x;
  };
  const rt1 = siteRun('Site A · Mill Creek bridge', priya.id, [148, 72, 31, 14], 'completed');
  const rt2 = siteRun('Site B · Library culvert', marcus.id, [212, 118, 64, 29], 'completed', 'FNU');
  const rt3 = siteRun('Site C · Park outfall', priya.id, [95, 51, null, null], 'in_progress');
  rt2.notebook.push(note('observation', 'Day 2 reading was taken with the backup meter, which reports FNU.', now - 8 * D, marcus.id));
  rt1.notebook.push(note('interpretation', 'Turbidity roughly halves each day at Site A.', now - 6 * D, priya.id));
  [rt1, rt2, rt3].forEach((x) => x.activity.push(act(x.startedAt, x.ownerId, 'Started the run')));
  prPriya.activity.push(act(now - 6 * D, priya.id, 'Completed “Site A · Mill Creek bridge”'), act(now - 6 * D, marcus.id, 'Completed “Site B · Library culvert”'), act(now - 3600000, priya.id, 'Added Day 1 readings to “Site C · Park outfall”'));
  const cabbage = (n) => { const c = PC({ title: 'Red cabbage pH indicator', subject: 'Chemistry', level: 'Middle and high school', description: 'Make a natural pH indicator and test household liquids.', objective: 'Rank household liquids from acidic to basic by indicator color.',
      materials: [M('Red cabbage leaves', 2, 'leaves', 'consumable'), M('Hot water', 250, 'mL', 'consumable'), M('Clear cups', 6, 'cups', 'reusable'), M('Strainer', 1, 'strainers', 'reusable')], conditions: ['Vinegar', 'Lemon juice', 'Tap water', 'Baking soda solution', 'Soapy water'], trials: 1, measurementFields: [F('Indicator color', '')],
      steps: [ST('Make the indicator', 10, 'Tear the leaves into hot water and let them steep for 10 minutes, then strain.'), ST('Pour the cups', 5, n >= 2 ? 'Pour 30 mL of indicator into each cup. Dilute 1:1 with water if the purple is very dark.' : 'Pour some indicator into each cup.'),
        ST('Add the liquids', 10, 'Add a teaspoon of each household liquid to its own cup and stir.', { inputs: [['Indicator color', '']] }), ST('Rank the results', 5, 'Line the cups up from red (acidic) to green-yellow (basic).')],
      precautions: ['Use hot tap water, not boiling water.', 'Never mix cleaning products.'], cleanup: ['Pour everything down the sink with running water.'] });
    if (n >= 2) c.conditions = ['Vinegar (acid control)', 'Lemon juice', 'Tap water', 'Baking soda (base control)', 'Soapy water'];
    return c; };
  const ptCab = proto({ ownerId: priya.id, projectId: null, origin: { type: 'manual' }, versions: [ver(1, cabbage(1), now - 70 * D), ver(2, cabbage(2), now - 6 * D)] });
  const invPriya = { id: uid(), ownerId: priya.id, name: 'Field kit', projectIds: [prPriya.id], log: [], items: [{ id: uid(), name: 'Turbidity meter', qty: 1, unit: 'meters', kind: 'reusable', location: 'Van', notes: 'Calibrated Oct 18' }, { id: uid(), name: 'Sample bottle', qty: 12, unit: 'bottles', kind: 'consumable', location: 'Van', notes: '' }, { id: uid(), name: 'Thermometer', qty: 2, unit: 'thermometers', kind: 'reusable', location: 'Van', notes: '' }] };
  prPriya.inventoryId = invPriya.id;

  /* --- Public publications --- */
  const pendulum = (n) => PC({ title: 'Measuring g with a simple pendulum', subject: 'Physics', level: 'High school', description: 'Time a pendulum’s swings and use the period to estimate gravitational acceleration.', objective: 'Estimate g from the period of a simple pendulum.',
    materials: [M('String (1 m)', 1, 'pieces', 'consumable'), M('Washer or bob', 1, 'bobs', 'reusable'), M('Ring stand and clamp', 1, 'stands', 'reusable'), M('Stopwatch', 1, 'stopwatches', 'reusable'), M('Meter stick', 1, 'sticks', 'reusable'), M('Protractor', 1, 'protractors', 'reusable')], conditions: ['0.25 m', '0.50 m', '0.75 m', '1.00 m'], trials: 3, measurementFields: [F('Time for 10 swings', 's'), F('Length', 'm')],
    steps: [ST('Set the length', 5, 'Hang the bob and measure the length from the pivot to the center of the bob.', { inputs: [['Length', 'm']] }), ST('Release', 3, 'Pull the bob back no more than 10° and release it without pushing.'),
      ST('Time 10 swings', 6, n >= 2 ? 'Start timing as the bob passes the lowest point, and time 10 full swings. Timing at the lowest point reduces reaction-time error.' : 'Time 10 full swings.', { inputs: [['Time for 10 swings', 's']] }), ST('Repeat for each length', 15, 'Repeat three times for each of the four lengths.'), ST('Calculate g', 10, 'Plot T² against L. The slope equals 4π²/g.')],
    precautions: ['Keep the swing area clear of faces and hands.'], cleanup: ['Untie the string and return the stands.'] });
  const seeds = PC({ title: 'Seed germination under salt stress', subject: 'Biology', level: 'Middle and high school', description: 'Germinate radish seeds in different salt concentrations and count sprouts over a week.', objective: 'Describe how salt concentration affects germination.',
    materials: [M('Radish seeds', 40, 'seeds', 'consumable'), M('Petri dish or zip bag', 4, 'dishes', 'reusable'), M('Paper towel', 4, 'sheets', 'consumable'), M('Table salt', 5, 'g', 'consumable')], conditions: ['0 g/L', '2 g/L', '5 g/L', '10 g/L'], trials: 1, measurementFields: [F('Seeds germinated', 'seeds')],
    steps: [ST('Make salt solutions', 10, 'Dissolve 0, 2, 5 and 10 g of salt per liter of water.'), ST('Set up dishes', 10, 'Moisten a paper towel with each solution and place 10 seeds on it.'), ST('Count daily', 5, 'Count germinated seeds every day for 7 days.', { inputs: [['Seeds germinated', 'seeds']] })],
    precautions: ['Wash hands after handling seeds; some are treated with fungicide.'], cleanup: ['Compost the seedlings.'] });
  const pub = (o) => ({ id: uid(), reports: [], reuse: true, createdAt: o.versions[0].publishedAt, ...o });
  st.publications = [
    pub({ authorId: null, org: 'Physics Outreach Collective', title: 'Measuring g with a simple pendulum', description: 'A classic, low-cost lab: time a pendulum and estimate gravitational acceleration. Works with string and a washer.', subject: 'Physics', level: 'High school', durationMin: 40, suitability: 'group', materials: ['String', 'Washer or bob', 'Ring stand', 'Stopwatch', 'Meter stick', 'Protractor'], license: 'CC BY 4.0', attribution: 'Physics Outreach Collective',
      versions: [{ number: 1, publishedAt: now - 120 * D, content: sanitizeForPublic(pendulum(1)), includes: { recording: null }, changelog: 'First release' }, { number: 2, publishedAt: now - 20 * D, content: sanitizeForPublic(pendulum(2)), includes: { recording: { title: 'Demonstration: timing 10 swings', durationSec: 312, chapters: [[0, 'Setting the length'], [74, 'Releasing at a small angle'], [131, 'Timing at the lowest point'], [240, 'Recording three trials']], note: 'Demo data: the video file isn’t included in this prototype.' } }, changelog: 'Added a timing tip to step 3 and a demonstration recording.' }] }),
    pub({ authorId: priya.id, org: '', protocolId: ptCab.id, title: 'Red cabbage pH indicator', description: 'Make a natural indicator from red cabbage and rank household liquids from acidic to basic.', subject: 'Chemistry', level: 'Middle and high school', durationMin: 30, suitability: 'either', materials: ['Red cabbage', 'Hot water', 'Clear cups', 'Strainer', 'Household liquids'], license: 'CC BY-SA 4.0', attribution: 'Priya Raman',
      versions: [{ number: 1, publishedAt: now - 60 * D, content: sanitizeForPublic(cabbage(1)), includes: { recording: null }, changelog: 'First release' }, { number: 2, publishedAt: now - 5 * D, content: sanitizeForPublic(cabbage(2)), includes: { recording: null }, changelog: 'Clarified the dilution and added acid and base control cups.' }] }),
    pub({ authorId: park.id, org: 'Park Lab, Riverbend University', protocolId: ptBio.id, title: 'Crystal violet biofilm assay (24-well)', description: 'A standard microtiter biofilm assay adapted for 3D-printed coupons. Needs a plate reader and BSL-1 practices.', subject: 'Microbiology', level: 'College / research', durationMin: 120, suitability: 'group', materials: ['24-well plate', 'Crystal violet', 'Acetic acid', 'PBS', 'Plate reader'], license: 'CC BY 4.0', attribution: 'Elena Park, Riverbend University',
      versions: [{ number: 1, publishedAt: now - 9 * D, content: sanitizeForPublic(bioC(2)), includes: { recording: null }, changelog: 'First release' }] }),
    pub({ authorId: null, org: 'Green Bench Lab', title: 'Seed germination under salt stress', description: 'A week-long germination experiment with radish seeds and table salt. Setup takes one class period.', subject: 'Biology', level: 'Middle and high school', durationMin: 45, suitability: 'individual', materials: ['Radish seeds', 'Petri dishes or zip bags', 'Paper towels', 'Table salt'], license: 'CC BY-NC 4.0', attribution: 'Green Bench Lab',
      versions: [{ number: 1, publishedAt: now - 200 * D, content: sanitizeForPublic(seeds), includes: { recording: { title: 'Day-by-day time-lapse', durationSec: 95, chapters: [[0, 'Setup'], [30, 'Day 3'], [70, 'Day 7']], note: 'Demo data: the video file isn’t included in this prototype.' } }, changelog: 'First release' }] }),
  ];
  // Jordan saved version 1 of the cabbage protocol, so he can see that version 2 exists
  const cabPub = st.publications[1];
  const ptSaved = proto({ ownerId: jordan.id, projectId: null, origin: { type: 'public', publicationId: cabPub.id, version: 1 }, versions: [ver(1, normalizeProtocolContent(clone(cabPub.versions[0].content)), now - 50 * D, false)] });
  st.comments = [
    { id: uid(), targetType: 'protocol', targetId: ptTurb.id, sub: turbC.steps[1].id, by: marcus.id, text: 'Should we fix the sampling depth? I’ve been sampling about 10 cm below the surface.', at: now - 25 * D },
    { id: uid(), targetType: 'protocol', targetId: ptTurb.id, sub: turbC.steps[1].id, by: priya.id, text: 'Yes, 10 cm. I added it to the step.', at: now - 25 * D + 3600000 },
    { id: uid(), targetType: 'run', targetId: rMarcus.id, sub: '', by: park.id, text: 'Nice consistency across wells. I’ll review once Priya’s run is in too.', at: now - 4 * 3600000 },
  ];
  st.projects = [prJ, prPark, prPriya];
  st.protocols = [ptLather, ptBio, ptTurb, ptCab, ptSaved];
  st.runs = [r1, r2, rPriya, rMarcus, rt1, rt2, rt3];
  st.researchAssignments = [asg];
  st.inventories = [invHome, invPark, invPriya];
  st.ui.r = { runFilter: 'all', compare: [], exploreQ: '', exploreSubject: 'all', exploreLevel: 'all', exploreDur: 'all', exploreSuit: 'all', exploreMat: '', projectTab: {}, runTab: {} };
}
function dayISOs(ms) { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

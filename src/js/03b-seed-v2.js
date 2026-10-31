/* =====================================================================
   Demo seed, phase 2: student-facing lab content, Jordan's student
   account, published assignments, checkpoint responses.
   ===================================================================== */
function addSpecificHeatExtras(c) {
  c.description = 'Identify a mystery metal by measuring how much heat it gives to a cup of water.';
  c.background = 'Different materials need different amounts of energy to warm up. Specific heat (c) is the energy needed to raise 1 g of a substance by 1 °C. Water’s specific heat is 4.18 J/g·°C, much higher than most metals, so a hot metal sample warms the water only a few degrees. Because energy is conserved, the heat the metal loses equals the heat the water gains.';
  c.prep = ['Read the background and the precautions.', 'Copy the data table into your notebook: mass of metal, bath temperature, mass of water, initial and final water temperature.', 'Practice rearranging q = m·c·ΔT to solve for c.'];
  c.studentNotes = 'Bring a calculator. Hot plates will already be on when you arrive, so walk, don’t run, near the benches.';
  c.teacherNotes = 'Sample key: A = copper (0.385), B = iron (0.449), C = aluminum (0.897), D = lead (0.129), E and F = tin (0.228). Expect a ΔT of 3–6 °C.';
  c.acknowledgment = 'I read the precautions and will handle hot metal only with tongs.';
  const s4 = c.steps[3]; delete s4.checkpoint;
  s4.instructions = 'Measure 100.0 mL of room-temperature water into the nested cups. Put the thermometer through the lid and record the starting temperature.';
  const q1 = { id: uid(), type: 'mc', prompt: 'Why does the calorimeter use two nested foam cups with a lid?', options: [{ id: uid(), text: 'To keep heat from escaping to the room' }, { id: uid(), text: 'To make the water heat up faster' }, { id: uid(), text: 'So the thermometer fits better' }], correct: null, feedback: 'Foam insulates, so almost all the heat from the metal stays in the water. That is what lets you use q = m·c·ΔT for the water.', unit: '', required: true };
  q1.correct = q1.options[0].id;
  c.checkpoints = [
    { id: uid(), afterStepId: s4.id, title: 'Calorimeter check', info: 'Before the hot metal goes in, your calorimeter has to keep heat from escaping. Your teacher will check your setup before you continue.', observe: 'Watch the thermometer for 30 seconds. Has the starting temperature stopped changing?', image: null, kind: 'response', responseRequired: true, approvalRequired: true, scope: 'group', requireCorrect: false, feedbackRelease: 'onSubmit',
      questions: [q1, { id: uid(), type: 'long', prompt: 'Predict what will happen to the water temperature after you add the hot metal, and explain why.', options: [], correct: null, feedback: '', unit: '', required: true }] },
    { id: uid(), afterStepId: c.steps[5].id, title: 'Check your temperature change', info: 'Heat lost by the metal equals heat gained by the water. In this lab the water usually warms by only a few degrees.', observe: '', image: null, kind: 'response', responseRequired: false, approvalRequired: false, scope: 'individual', requireCorrect: false, feedbackRelease: 'never',
      questions: [{ id: uid(), type: 'numeric', prompt: 'Your water’s temperature change (ΔT)', options: [], correct: null, feedback: '', unit: '°C', required: true }] },
  ];
  return c;
}
function addCatalaseExtras(c) {
  c.description = 'Use potato and hydrogen peroxide to see how temperature changes how well an enzyme works.';
  c.background = 'Enzymes are proteins that speed up reactions. Catalase, found in potato cells, breaks hydrogen peroxide into water and oxygen gas, which makes foam. An enzyme’s shape decides how well it works, and high heat can change that shape permanently (denaturation).';
  c.prep = ['Read the background.', 'Write a prediction: which temperature will make the most foam, and why?', 'Draw a results table with columns for Cold, Room, Warm and Boiled.'];
  c.studentNotes = 'We’ll graph results as a class at the end, so keep your numbers neat.';
  c.teacherNotes = 'Prep 7:40 am: boil one batch for 5 min, keep one batch in the 37 °C bath. Two spare dropper bottles in the back cabinet.';
  c.acknowledgment = 'I’ll wear goggles and rinse any peroxide spills with water.';
  c.checkpoints = [{ id: uid(), afterStepId: c.steps[3].id, title: 'What did the foam tell you?', info: 'Compare the four tubes before you repeat the trial.', observe: 'Look at the boiled-potato tube closely. Is there any foam at all?', image: null, kind: 'response', responseRequired: true, approvalRequired: false, scope: 'individual', requireCorrect: false, feedbackRelease: 'never',
    questions: [{ id: uid(), type: 'mc', prompt: 'Which tube made the most foam?', options: [{ id: uid(), text: 'Cold' }, { id: uid(), text: 'Room' }, { id: uid(), text: 'Warm' }, { id: uid(), text: 'Boiled' }], correct: null, feedback: '', unit: '', required: true },
      { id: uid(), type: 'short', prompt: 'One sentence: why might the boiled potato make less foam?', options: [], correct: null, feedback: '', unit: '', required: true }] }];
  return c;
}

function seedStudent(st, r) {
  const { now, studentUser: jordan, ap, bio, P4, B1, B3, gP4, labSH, labCat, live, asSH, asTit } = r;
  const dayISO = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  Object.assign(jordan, { onboarded: true, profile: { displayName: 'Jordan', school: 'Northgate High School', level: 'hs', gradYear: new Date(now).getFullYear() + 2, interests: ['Chemistry', 'Robotics', 'Environmental science'], bio: 'Junior. I like figuring out how things work.', avatar: null } });
  st.students.push({ id: jordan.id, name: jordan.name, userId: jordan.id });
  st.enrollments.push({ id: uid(), classId: ap.id, periodId: P4.id, studentId: jordan.id, joinedAt: now - 55 * 86400000 });
  st.enrollments.push({ id: uid(), classId: bio.id, periodId: B1.id, studentId: jordan.id, joinedAt: now - 54 * 86400000 });
  gP4[5].memberIds.push(jordan.id); // Bench 6, AP Chemistry Period 4

  // Biology Honors lab groups (Period 1 and 3), Jordan in Bench 3 of Period 1
  for (const per of [B1, B3]) {
    const ids = st.enrollments.filter((e) => e.classId === bio.id && e.periodId === per.id && e.studentId !== jordan.id).map((e) => e.studentId);
    if (per === B1) ids.splice(8, 0, jordan.id);
    for (let i = 0, g = 1; i < ids.length; i += 4, g++) st.groups.push({ id: uid(), classId: bio.id, periodId: per.id, name: `Bench ${g}`, memberIds: ids.slice(i, i + 4) });
  }
  asSH.published = true; asTit.published = true; asSH.scheduledTime = ''; asTit.scheduledTime = '';
  labSH.release = { ...RELEASE_DEFAULTS };
  labCat.release = { ...RELEASE_DEFAULTS };
  const catV = labCat.versions[0]; catV.locked = true;
  const asCat = { id: uid(), labId: labCat.id, versionId: catV.id, classId: bio.id, periodIds: [B1.id, B3.id], scheduledFor: dayISO(now + 3 * 86400000), scheduledTime: '10:15', published: true, autoOpen: false, createdAt: now - 86400000 };
  st.assignments.push(asCat);
  for (const pid of asCat.periodIds) st.sessions.push({ id: uid(), assignmentId: asCat.id, labId: labCat.id, versionId: catV.id, classId: bio.id, periodId: pid, status: 'scheduled', scheduledFor: asCat.scheduledFor, pausedTotal: 0 });

  // Checkpoint responses for every group that already reached a response checkpoint
  const contentOf = (sess) => { const lab = st.labs.find((l) => l.id === sess.labId); const v = lab && lab.versions.find((x) => x.id === sess.versionId); return v ? v.content : null; };
  const predictions = ['The water will warm up a few degrees because the metal gives off heat until both are the same temperature.', 'It goes up, since heat moves from the hot metal into the cooler water.', 'Water temperature rises slightly. Water has a high specific heat so it will not change much.'];
  let k = 0;
  for (const p of st.progress) {
    const sess = st.sessions.find((s) => s.id === p.sessionId); const c = sess && contentOf(sess); if (!c) continue;
    for (const cpId of Object.keys(p.gates || {})) {
      const cp = c.checkpoints.find((x) => x.id === cpId);
      if (!cp || cp.kind !== 'response' || !cp.responseRequired) continue;
      const pending = p.gates[cpId].approval === 'pending';
      const responses = {};
      cp.questions.forEach((q) => { responses[q.id] = q.type === 'mc' ? (pending ? q.options[1].id : q.correct || q.options[0].id) : q.type === 'numeric' ? '4.2' : predictions[k++ % predictions.length]; });
      const at = p.gates[cpId].releasedAt + 90000;
      st.cpRecords.push({ id: cpRecordId(sess.id, p.groupId, cpId, null), trackKey: sess.id, groupId: p.groupId, studentId: null, checkpointId: cpId, status: 'submitted', responses, savedAt: at, submittedAt: at, submittedBy: null, submissions: 1, history: [{ at, text: 'Submitted' }] });
      if (pending) { p.gates[cpId].requestedAt = at; p.gates[cpId].releasedAt = at - 90000; }
    }
  }
  st.liveState = {}; st.prepChecks = {}; st.pendingInvite = null;
  Object.assign(st.ui, { sClass: '', sLabFilter: 'all', onboard: null, joinDraft: null, profileDraft: null });
  void live; void ap;
}

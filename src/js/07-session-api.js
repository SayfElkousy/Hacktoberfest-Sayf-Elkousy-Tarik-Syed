/* =====================================================================
   Lab session engine + API (the "backend" seam for live sessions).

   Everything that changes authoritative progress goes through here:
   step completion, checkpoint release, responses, approvals,
   measurements, help requests and camera ownership. Every write takes
   an eventId; a repeated eventId is ignored, so retries and duplicate
   events from the live recording interface are safe.

   A "track" is one group's path through a procedure in a class session,
   or one research run's path through a protocol version.
   In production these functions are server endpoints (see INTEGRATION.md).
   ===================================================================== */
const CONTRACT_VERSION = '1.0';
const EventBus = {
  fns: new Set(),
  on(fn) { this.fns.add(fn); return () => this.fns.delete(fn); },
  emit(evt) { this.fns.forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } }); },
};
function emitEvent(type, data) {
  const e = { id: `ev_${uid(10)}`, type, at: Date.now(), ...data };
  S.events.push(e); if (S.events.length > 400) S.events.splice(0, 100);
  EventBus.emit(e);
  return e;
}
const seenEvent = (id) => !!id && S.processed.includes(id);
function markEvent(id) { if (!id) return; S.processed.push(id); if (S.processed.length > 1000) S.processed.splice(0, 300); }

/* ---------- Tracks ---------- */
function classTrack(sess, groupId) {
  const p = S.progress.find((x) => x.sessionId === sess.id && x.groupId === groupId);
  if (!p) return null;
  const g = groupById(groupId);
  return { kind: 'class', key: sess.id, sess, p, c: sessionContent(sess), groupId, versionId: sess.versionId, members: g ? g.memberIds : [], open: sess.status === 'active' };
}
function ensureProgressShape(p) {
  p.gates = p.gates || {}; p.joined = p.joined || []; p.aiFlags = p.aiFlags || []; p.guidance = p.guidance || [];
  p.observations = p.observations || []; p.activity = p.activity || []; p.completed = p.completed || [];
  if (p.atCheckpoint === undefined) p.atCheckpoint = null;
  if (p.camera === undefined) p.camera = null;
  return p;
}

/* ---------- Checkpoint records ---------- */
const cpRecordId = (trackKey, groupId, cpId, studentId) => `cpr_${trackKey}_${studentId || groupId}_${cpId}`;
function cpRecordFor(trackKey, groupId, cp, studentId) {
  const id = cpRecordId(trackKey, groupId, cp.id, cp.scope === 'individual' ? studentId : null);
  return S.cpRecords.find((r) => r.id === id) || null;
}
const cpRecordsOf = (trackKey, groupId, cpId) => S.cpRecords.filter((r) => r.trackKey === trackKey && r.groupId === groupId && r.checkpointId === cpId);
function ensureRecord(t, cp, studentId) {
  const sid = cp.scope === 'individual' ? studentId : null;
  const id = cpRecordId(t.key, t.groupId, cp.id, sid);
  let r = S.cpRecords.find((x) => x.id === id);
  if (!r) { r = { id, trackKey: t.key, groupId: t.groupId, studentId: sid, checkpointId: cp.id, status: 'draft', responses: {}, savedAt: Date.now(), submissions: 0, history: [] }; S.cpRecords.push(r); }
  return r;
}

const Engine = {
  gate(t, cp) {
    const p = t.p;
    if (!p.gates[cp.id]) p.gates[cp.id] = { releasedAt: Date.now(), approval: 'none' };
    return p.gates[cp.id];
  },
  gateState(t, cp) {
    const g = t.p.gates[cp.id] || { approval: 'none' };
    const recs = cpRecordsOf(t.key, t.groupId, cp.id).filter((r) => r.submittedAt && r.status === 'submitted');
    const needResponse = cp.kind === 'response' && (cp.responseRequired || cp.requireCorrect);
    let responded = true;
    if (needResponse) {
      if (cp.scope === 'group') responded = recs.some((r) => !r.studentId);
      else { const who = (t.p.joined || []).filter((id) => t.members.includes(id)); responded = who.length ? who.every((sid) => recs.some((r) => r.studentId === sid)) : recs.length > 0; }
    }
    const correctOk = !cp.requireCorrect || (recs.length > 0 && recs.every((r) => allCorrect(cp, r.responses)));
    const approvalOk = !cp.approvalRequired || g.approval === 'approved';
    const waitingOn = !responded ? 'response' : !correctOk ? 'correct' : !approvalOk ? (g.approval === 'returned' ? 'revision' : 'approval') : null;
    return { needResponse, responded, correctOk, approvalOk, approval: g.approval || 'none', satisfied: responded && correctOk && approvalOk, waitingOn, submittedCount: recs.length };
  },
  release(t, cp, at = Date.now()) {
    const fresh = !t.p.gates[cp.id];
    const g = this.gate(t, cp);
    if (fresh) { g.releasedAt = at; emitEvent('checkpoint.released', { trackKey: t.key, groupId: t.groupId, checkpointId: cp.id, stepId: cp.afterStepId }); logActivity(t.p, `Checkpoint released: ${cp.title}`, at); }
    return g;
  },
  /** Re-check the gate the track is waiting at; request approval or move on when allowed. */
  evaluate(t) {
    const p = t.p; if (!p.atCheckpoint) return 'none';
    const cp = checkpointById(t.c, p.atCheckpoint); if (!cp) { p.atCheckpoint = null; return 'missing'; }
    const st = this.gateState(t, cp); const g = this.gate(t, cp);
    if (st.responded && st.correctOk && cp.approvalRequired && g.approval !== 'approved' && g.approval !== 'pending' && g.approval !== 'returned') {
      g.approval = 'pending'; g.requestedAt = Date.now();
      emitEvent('approval.requested', { trackKey: t.key, groupId: t.groupId, checkpointId: cp.id });
      logActivity(p, `Waiting for teacher approval: ${cp.title}`);
    }
    if (st.satisfied) { this.advance(t); return 'advanced'; }
    return st.waitingOn;
  },
  advance(t, at = Date.now()) {
    const p = t.p; const c = t.c;
    const cp = checkpointById(c, p.atCheckpoint);
    p.atCheckpoint = null;
    const idx = cp ? stepIndexById(c, cp.afterStepId) : p.stepIndex;
    if (idx >= c.steps.length - 1) { this.finish(t, at); return; }
    p.stepIndex = idx + 1; p.stepStartedAt = at;
    logActivity(p, `Started step ${p.stepIndex + 1}: ${c.steps[p.stepIndex].title}`, at);
    emitEvent('progress.updated', { trackKey: t.key, groupId: t.groupId, stepId: c.steps[p.stepIndex].id });
  },
  finish(t, at = Date.now()) {
    const p = t.p; p.finishedAt = at; p.stepIndex = t.c.steps.length - 1; p.atCheckpoint = null;
    logActivity(p, 'Finished all steps', at);
    emitEvent('progress.updated', { trackKey: t.key, groupId: t.groupId, finished: true });
  },
  /** Confirmed completion of the current step. Returns ok | duplicate | stale | blocked | invalid. */
  completeStep(t, stepId, { by = null, source = 'student', at = Date.now() } = {}) {
    const p = ensureProgressShape(t.p); const c = t.c;
    const idx = stepIndexById(c, stepId);
    if (idx === -1) return { status: 'invalid', message: 'This step is not in the assigned procedure version.' };
    if (p.completed.some((x) => x.stepId === stepId)) return { status: 'duplicate' };
    if (p.finishedAt) return { status: 'duplicate' };
    if (p.atCheckpoint) return { status: 'blocked', message: 'Finish the checkpoint first.' };
    if (idx !== p.stepIndex) return { status: 'stale', message: `Step ${idx + 1} isn’t the current step.` };
    p.completed.push({ index: idx, stepId, at, by, source });
    logActivity(p, `Completed step ${idx + 1}: ${c.steps[idx].title}${source === 'teacher-demo' ? ' (demo control)' : ''}`, at);
    emitEvent('step.completed', { trackKey: t.key, groupId: t.groupId, stepId, by, source });
    const cp = checkpointAfter(c, stepId);
    if (cp) {
      this.release(t, cp, at);
      if (cpBlocks(cp)) { p.atCheckpoint = cp.id; p.stepStartedAt = at; this.evaluate(t); return { status: 'ok', checkpoint: cp.id, blocked: !!p.atCheckpoint }; }
    }
    if (idx >= c.steps.length - 1) this.finish(t, at);
    else { p.stepIndex = idx + 1; p.stepStartedAt = at; logActivity(p, `Started step ${idx + 2}: ${c.steps[idx + 1].title}`, at); }
    emitEvent('progress.updated', { trackKey: t.key, groupId: t.groupId, stepId: p.finishedAt ? null : c.steps[p.stepIndex].id });
    return { status: 'ok', checkpoint: cp ? cp.id : null, blocked: false };
  },
  saveResponse(t, cpId, studentId, responses, submit) {
    const cp = checkpointById(t.c, cpId);
    if (!cp) return { status: 'invalid', message: 'Checkpoint not found in this procedure version.' };
    if (!t.p.gates[cp.id]) return { status: 'invalid', message: 'This checkpoint hasn’t been released yet.' };
    const rec = ensureRecord(t, cp, studentId);
    const g = t.p.gates[cp.id];
    if (rec.status === 'submitted' && g.approval === 'approved') return { status: 'locked', message: 'Already approved by your teacher.', record: rec };
    const clean = {};
    for (const q of cp.questions) if (responses[q.id] !== undefined) clean[q.id] = String(responses[q.id]).slice(0, 4000);
    const same = JSON.stringify(clean) === JSON.stringify(rec.responses);
    if (submit && rec.status === 'submitted' && same) return { status: 'duplicate', record: rec };
    rec.responses = clean; rec.savedAt = Date.now();
    if (!submit) { if (rec.status !== 'submitted') rec.status = rec.status === 'returned' ? 'returned' : 'draft'; emitEvent('response.saved', { trackKey: t.key, groupId: t.groupId, checkpointId: cp.id, studentId }); return { status: 'ok', record: rec }; }
    const missing = missingAnswers(cp, clean);
    if (missing.length) return { status: 'incomplete', missing, record: rec };
    rec.status = 'submitted'; rec.submittedAt = Date.now(); rec.submittedBy = studentId; rec.submissions += 1;
    rec.history.push({ at: rec.submittedAt, text: rec.submissions > 1 ? 'Resubmitted' : 'Submitted' });
    if (g.approval === 'returned') { g.approval = 'none'; }
    logActivity(t.p, `${rec.submissions > 1 ? 'Resubmitted' : 'Submitted'} checkpoint response: ${cp.title}`);
    emitEvent('response.submitted', { trackKey: t.key, groupId: t.groupId, checkpointId: cp.id, studentId });
    if (t.p.atCheckpoint === cp.id) this.evaluate(t);
    return { status: 'ok', record: rec, correct: cp.requireCorrect ? allCorrect(cp, clean) : null };
  },
  approve(t, cpId, by) {
    const cp = checkpointById(t.c, cpId); const g = t.p.gates[cpId];
    if (!cp || !g) return { status: 'invalid' };
    if (g.approval === 'approved') return { status: 'duplicate' };
    g.approval = 'approved'; g.approvedAt = Date.now(); g.note = '';
    logActivity(t.p, `Teacher approved checkpoint: ${cp.title}`);
    emitEvent('checkpoint.approved', { trackKey: t.key, groupId: t.groupId, checkpointId: cpId, by });
    if (t.p.atCheckpoint === cpId) this.evaluate(t);
    return { status: 'ok' };
  },
  returnForRevision(t, cpId, note, by) {
    const cp = checkpointById(t.c, cpId); const g = t.p.gates[cpId];
    if (!cp || !g) return { status: 'invalid' };
    g.approval = 'returned'; g.returnedAt = Date.now(); g.note = String(note || '').slice(0, 1000);
    cpRecordsOf(t.key, t.groupId, cpId).forEach((r) => { if (r.status === 'submitted') { r.status = 'returned'; r.history.push({ at: g.returnedAt, text: `Returned for revision${g.note ? ': ' + g.note : ''}` }); } });
    logActivity(t.p, `Teacher returned checkpoint for revision: ${cp.title}`);
    emitEvent('checkpoint.returned', { trackKey: t.key, groupId: t.groupId, checkpointId: cpId, note: g.note, by });
    return { status: 'ok' };
  },
  /** Demo helper: fill a checkpoint with clearly labeled sample answers so simulated groups can move on. */
  simulateResponses(t, cp) {
    const who = cp.scope === 'individual' ? (t.members.length ? [t.members[0]] : [null]) : [null];
    for (const sid of who) {
      const resp = {};
      cp.questions.forEach((q) => { resp[q.id] = q.type === 'mc' ? (q.correct || (q.options[0] || {}).id || '') : q.type === 'numeric' ? '3.4' : '(Simulated response from demo controls)'; });
      const r = ensureRecord(t, cp, sid); r.simulated = true;
      this.saveResponse(t, cp.id, sid, resp, true);
    }
  },
};

/* ---------- Public API for class sessions ---------- */
const LabSessionAPI = {
  /** Can this student use this session right now? Mirrors the server-side checks. */
  authorize(userId, sessionId) {
    const user = S.users.find((u) => u.id === userId);
    if (!user) return { ok: false, code: 'not_signed_in', message: 'Sign in to enter the lab.' };
    const sess = sessionById(sessionId);
    if (!sess) return { ok: false, code: 'not_found', message: 'This lab session doesn’t exist.' };
    const a = S.assignments.find((x) => x.id === sess.assignmentId);
    const enr = S.enrollments.find((e) => e.studentId === userId && e.classId === sess.classId && e.periodId === sess.periodId);
    if (!enr) return { ok: false, code: 'not_enrolled', message: 'You aren’t enrolled in the class period this session belongs to.' };
    if (!a || a.published === false) return { ok: false, code: 'not_published', message: 'Your teacher hasn’t published this lab yet.' };
    const group = studentGroup(sess.classId, sess.periodId, userId);
    if (!group) return { ok: false, code: 'no_group', message: 'Your teacher hasn’t put you in a lab group yet. Ask them to add you to a group.' };
    if (sess.status === 'completed') return { ok: true, code: 'completed', readOnly: true, sess, a, group, message: 'This session is complete.' };
    if (sess.status === 'paused') return { ok: true, code: 'paused', readOnly: true, sess, a, group, message: 'Your teacher paused the session.' };
    if (!sessionOpen(sess, a)) return { ok: false, code: 'not_open', sess, a, group, message: a.autoOpen ? `This session opens at ${fmtSchedule(a)}.` : 'Your teacher hasn’t opened this session yet.' };
    return { ok: true, code: 'open', sess, a, group };
  },
  /** Called when a student enters. Auto-opens a session the teacher scheduled to open on its own. */
  enter({ eventId, sessionId, participantId }) {
    const auth = this.authorize(participantId, sessionId);
    if (!auth.ok) return auth;
    if (auth.sess.status === 'scheduled' && auth.a.autoOpen) startSession(auth.sess);
    const t = classTrack(auth.sess, auth.group.id); if (!t) return { ok: false, code: 'not_found', message: 'No progress record for your group.' };
    ensureProgressShape(t.p);
    if (seenEvent(eventId)) return { ...auth, track: t, duplicate: true };
    markEvent(eventId);
    if (!t.p.joined.includes(participantId)) t.p.joined.push(participantId);
    if (t.p.connection === 'lost') t.p.connection = 'online';
    if (!t.p.stepStartedAt && !t.p.completed.length && !auth.readOnly) { t.p.stepStartedAt = Date.now(); }
    logActivity(t.p, `${displayName(S.users.find((u) => u.id === participantId))} entered the live session`);
    emitEvent('session.entered', { trackKey: t.key, groupId: t.groupId, participantId });
    return { ...auth, track: t };
  },
  track(sessionId, groupId) { const s = sessionById(sessionId); return s ? classTrack(s, groupId) : null; },
  write(eventId, t, fn) {
    if (seenEvent(eventId)) return { status: 'duplicate' };
    if (!t) return { status: 'invalid', message: 'Session or group not found.' };
    const res = fn();
    if (res && res.status !== 'invalid' && res.status !== 'stale' && res.status !== 'blocked' && res.status !== 'incomplete') markEvent(eventId);
    t.p.lastActivityAt = Date.now();
    return res;
  },
  completeStep({ eventId, sessionId, groupId, stepId, participantId, source = 'student' }) {
    const t = this.track(sessionId, groupId);
    if (t && t.sess.status !== 'active') return { status: 'blocked', message: t.sess.status === 'paused' ? 'The session is paused.' : 'The session isn’t running.' };
    return this.write(eventId, t, () => Engine.completeStep(t, stepId, { by: participantId, source }));
  },
  saveResponse({ eventId, sessionId, groupId, checkpointId, participantId, responses, submit }) {
    const t = this.track(sessionId, groupId);
    if (t && t.sess.status === 'completed') return { status: 'blocked', message: 'The session is complete.' };
    return this.write(eventId, t, () => Engine.saveResponse(t, checkpointId, participantId, responses, submit));
  },
  recordMeasurement({ eventId, sessionId, groupId, stepId, participantId, label, unit, value }) {
    const t = this.track(sessionId, groupId);
    return this.write(eventId, t, () => {
      const idx = stepIndexById(t.c, stepId); if (idx === -1) return { status: 'invalid' };
      const v = String(value).trim().slice(0, 200);
      const ex = t.p.observations.find((o) => o.stepId === stepId && o.label === label);
      if (ex) { if (ex.value === v) return { status: 'duplicate' }; ex.history = ex.history || []; ex.history.push({ at: ex.at, value: ex.value, by: ex.by }); ex.value = v; ex.at = Date.now(); ex.by = participantId; }
      else t.p.observations.push({ id: uid(), stepIndex: idx, stepId, label, unit, value: v, at: Date.now(), by: participantId });
      logActivity(t.p, `Recorded ${label}: ${v}${unit ? ' ' + unit : ''}`);
      emitEvent('measurement.recorded', { trackKey: t.key, groupId, stepId, label });
      return { status: 'ok' };
    });
  },
  requestHelp({ eventId, sessionId, groupId, participantId, category, message, aiDrafted = false }) {
    const t = this.track(sessionId, groupId);
    return this.write(eventId, t, () => {
      const res = Sim.help(t.p, t.sess, category, message);
      res.request.by = participantId; if (aiDrafted) res.request.aiDrafted = true;
      emitEvent('help.requested', { trackKey: t.key, groupId, requestId: res.request.id, updated: res.updated });
      return { status: 'ok', ...res };
    });
  },
  /** Only actionable AI flags reach the teacher, labeled as model-generated. */
  flag({ sessionId, groupId, kind, text, stepId }) {
    const t = this.track(sessionId, groupId); if (!t) return;
    const last = t.p.aiFlags[t.p.aiFlags.length - 1];
    if (last && last.kind === kind && last.stepId === stepId && Date.now() - last.at < 120000) return; // don't spam the teacher
    t.p.aiFlags.push({ id: uid(), at: Date.now(), kind, text: String(text).slice(0, 300), stepId });
    if (t.p.aiFlags.length > 12) t.p.aiFlags.shift();
  },
  /** One camera device per group. Returns camera_in_use when a teammate's device is already the camera. */
  setCamera({ sessionId, groupId, participantId, on, deviceLabel = '', force = false }) {
    const t = this.track(sessionId, groupId); if (!t) return { status: 'invalid' };
    const cam = t.p.camera; const now = Date.now();
    if (on) {
      if (cam && cam.holderId !== participantId && now - cam.beat < 90000 && !force) return { status: 'camera_in_use', holder: cam };
      t.p.camera = { holderId: participantId, holderName: displayName(S.users.find((u) => u.id === participantId)) || (studentById(participantId) || {}).name || 'A teammate', deviceLabel, since: now, beat: now };
      logActivity(t.p, `${t.p.camera.holderName}’s device started the group camera`);
    } else if (cam && cam.holderId === participantId) { t.p.camera = null; logActivity(t.p, 'Group camera stopped'); }
    return { status: 'ok' };
  },
  heartbeat({ sessionId, groupId, participantId }) { const t = this.track(sessionId, groupId); if (t && t.p.camera && t.p.camera.holderId === participantId) t.p.camera.beat = Date.now(); },
};

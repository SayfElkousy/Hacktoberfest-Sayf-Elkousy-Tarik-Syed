/* =====================================================================
   Live Session (students in class sessions, researchers in guided runs).
   Entry checks → setup (camera, AI connection, what is shared) → live
   workspace (camera, current step or checkpoint, AI guidance, progress
   and help). All authoritative writes go through LabSessionAPI / RunAPI.
   ===================================================================== */
U.live = null;
const LIVE_PREFS = { ack: false, adapterKind: '', intervalSec: 30, lowBandwidth: false, speak: false, mic: false, deviceId: '' };
function livePrefs() { const L = U.live; const k = `${L.kind}:${L.id}|${S.currentUserId}`; if (!S.liveState[k]) S.liveState[k] = { ...LIVE_PREFS }; return S.liveState[k]; }
function defaultAdapterKind() { return RemoteRecordingAdapter.configured() ? 'remote' : AI.available ? 'claude' : 'simulated'; }

/* ---------- Model: everything the screen may show, already authorized and filtered ---------- */
function liveModel() {
  const L = U.live; const me_ = S.currentUserId;
  if (L.kind === 'class') {
    const auth = LabSessionAPI.authorize(me_, L.id);
    if (!auth.sess || (!auth.ok && auth.code !== 'not_open')) return { error: auth };
    const a = auth.a; const v = studentLabView(a, me_);
    if (!v) return { error: { code: 'not_found', message: 'This lab isn’t available to you.' } };
    const t = classTrack(auth.sess, auth.group.id); ensureProgressShape(t.p);
    const sc = sessionContent(auth.sess);
    return { kind: 'class', auth, v, t, sess: auth.sess, title: v.title, sub: `${v.className} · ${v.periodName}`, groupName: auth.group.name, members: v.group.members,
      steps: v.procedure ? v.procedure.steps : [], released: v.procedure ? v.procedure.checkpoints : [], placement: sc.checkpoints.map((cp) => ({ id: cp.id, afterStepId: cp.afterStepId, blocks: cpBlocks(cp) })),
      readOnly: !!auth.readOnly, open: auth.ok, status: auth.code, ack: v.acknowledgment, precautions: v.sections.precautions || [], level: classById(auth.sess.classId).level,
      versionId: auth.sess.versionId, canHelp: true, backHref: `#s/lab/${a.id}`, trackKey: auth.sess.id, groupId: auth.group.id };
  }
  const run = runById(L.id); const role = run ? runRole(run, me_) : null;
  if (!run || !atLeast(role, 'contributor')) return { error: { code: 'not_allowed', message: 'You don’t have access to run this experiment.' } };
  const t = runTrack(run); if (!t) return { error: { code: 'not_found', message: 'The protocol version for this run is missing.' } };
  const pt = protocolById(run.protocolId); const ver = protocolVersion(pt, run.versionId);
  return { kind: 'run', run, t, title: run.title, sub: `${protocolTitle(pt)} · version ${ver.number}`, groupName: '', members: run.participants.map(userName),
    steps: t.c.steps.map((s) => ({ id: s.id, title: s.title, instructions: s.instructions, minutes: s.minutes, materials: [...s.materials], inputs: s.inputs.map((x) => ({ ...x })), expected: s.expected })),
    released: t.c.checkpoints.filter((cp) => t.p.gates[cp.id]).map((cp) => projectCheckpoint(cp, { trackKey: t.key, groupId: run.id, userId: me_ })),
    placement: t.c.checkpoints.map((cp) => ({ id: cp.id, afterStepId: cp.afterStepId, blocks: cpBlocks(cp) })),
    readOnly: ['completed', 'awaiting_review'].includes(run.status), open: true, status: run.status === 'paused' ? 'paused' : ['completed', 'awaiting_review'].includes(run.status) ? 'completed' : 'open',
    ack: '', precautions: t.c.precautions, level: t.c.level || 'college', versionId: run.versionId, canHelp: false, backHref: `#r/run/${run.id}`, trackKey: t.key, groupId: run.id };
}
function liveAPI(m) {
  const pid = S.currentUserId;
  if (m.kind === 'class') {
    const base = { sessionId: m.sess.id, groupId: m.groupId, participantId: pid };
    return {
      completeStep: (stepId, eventId) => LabSessionAPI.completeStep({ ...base, eventId, stepId }),
      saveResponse: (checkpointId, responses, submit, eventId) => LabSessionAPI.saveResponse({ ...base, eventId, checkpointId, responses, submit }),
      recordMeasurement: (stepId, label, unit, value, eventId) => LabSessionAPI.recordMeasurement({ ...base, eventId, stepId, label, unit, value }),
      flag: (kind, text, stepId) => LabSessionAPI.flag({ ...base, kind, text, stepId }),
      setCamera: (on, force = false) => LabSessionAPI.setCamera({ ...base, on, force, deviceLabel: Media.deviceLabel }),
      heartbeat: () => LabSessionAPI.heartbeat(base),
    };
  }
  return RunAPI.liveFor(m.run);
}
/** What the adapter is told: identifiers plus student-visible content only (see INTEGRATION.md, SessionContext). */
function liveCtx(m) {
  const p = m.t.p; const s = m.steps[p.stepIndex] || null;
  return {
    sessionId: m.trackKey, groupId: m.groupId, participantId: S.currentUserId, versionId: m.versionId, labTitle: m.title, level: m.level,
    step: s ? { id: s.id, number: p.stepIndex + 1, count: m.steps.length, title: s.title, instructions: s.instructions, materials: s.materials, inputs: s.inputs } : null,
    recorded: s ? p.observations.filter((o) => o.stepId === s.id).map((o) => ({ label: o.label, value: o.value, unit: o.unit })) : [],
    recentGuidance: (p.guidance || []).slice(-3).map((g) => g.guidance),
    meta: () => ({ sessionId: m.trackKey, versionId: m.versionId, stepId: s ? s.id : null }),
    nextSeq: () => ++Live.seq,
    payload: () => liveContract(m),
  };
}
function liveContract(m) {
  const p = m.t.p;
  return { contractVersion: CONTRACT_VERSION, sessionId: m.trackKey, assignmentId: m.v ? m.v.assignmentId : (m.run && m.run.assignmentId) || null, classId: m.v ? m.v.classId : null, periodId: m.v ? m.v.periodId : null,
    projectId: m.run ? m.run.projectId : null, groupId: m.groupId, participantId: S.currentUserId, procedureVersionId: m.versionId,
    steps: m.steps.map((s, i) => ({ id: s.id, index: i, title: s.title, instructions: s.instructions, minutes: s.minutes, materials: s.materials, inputs: s.inputs })),
    checkpointPlacement: m.placement.map((x) => ({ ...x, released: !!p.gates[x.id] })),
    checkpoints: m.released.map((cp) => ({ id: cp.id, afterStepId: cp.afterStepId, title: cp.title, info: cp.info, observe: cp.observe, questions: cp.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options, unit: q.unit })) })),
    guidanceRules: ['Ground guidance in the current teacher-approved step', 'Never invent measurements or observations', 'Never change the procedure, chemicals, quantities or equipment', 'Recommend teacher help for hazards or out-of-procedure requests', 'Never approve checkpoints or reveal answers'],
    progress: { currentStepId: m.steps[p.stepIndex] ? m.steps[p.stepIndex].id : null, completedStepIds: p.completed.map((x) => x.stepId), atCheckpointId: p.atCheckpoint, finished: !!p.finishedAt } };
}

/* ---------- Controller ---------- */
const Live = {
  key: null, adapter: null, sampler: null, unsub: null, hb: null, seq: 0, visit: null,
  open(kind, id) {
    const key = `${kind}:${id}`;
    if (this.key === key && U.live) return;
    this.teardown();
    this.key = key; this.visit = uid(6);
    U.live = { kind, id, phase: 'lobby', cam: 'off', camError: null, sim: false, ai: { state: 'off', detail: '' }, question: '', help: null, suggest: null, helpSuggest: null, stale: 0, unclear: 0, aiError: '', lastSeq: 0, asking: false, cpDraft: {}, offline: false, viewOnly: false, camConflict: null, savedAt: null, lastFrameAt: null };
  },
  teardown() {
    if (this.sampler) this.sampler.stop(); this.sampler = null;
    if (this.unsub) this.unsub(); this.unsub = null;
    if (this.adapter) this.adapter.disconnect(); this.adapter = null;
    clearInterval(this.hb); this.hb = null;
    if (this.releaseCamera) { try { this.releaseCamera(); } catch (e) { /* page leaving */ } this.releaseCamera = null; }
    Media.stop();
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* not supported */ }
    U.live = null; this.key = null;
  },
  attachVideo() {
    const v = document.getElementById('live-video');
    if (v && Media.stream && v.srcObject !== Media.stream) { v.srcObject = Media.stream; v.play().catch(() => {}); }
  },
  saved() { if (U.live) U.live.savedAt = Date.now(); },
  enter() {
    const L = U.live; const m = liveModel(); const prefs = livePrefs();
    if (m.error) return;
    if (m.kind === 'class') {
      if (m.ack && !prefs.ack) { L.msg = 'Check the box to confirm you read the precautions.'; U.focusAfter = '#live-ack'; commit(); return; }
      if (m.status === 'not_open') return;
      const res = LabSessionAPI.enter({ eventId: `enter:${m.trackKey}:${S.currentUserId}:${this.visit}`, sessionId: m.sess.id, participantId: S.currentUserId });
      if (!res.ok) { L.msg = res.message; commit(); return; }
    } else RunAPI.enter(m.run);
    L.msg = ''; L.phase = m.readOnly ? 'live' : 'setup';
    if (!prefs.adapterKind || !ADAPTERS[prefs.adapterKind].available()) prefs.adapterKind = defaultAdapterKind();
    const cam = m.t.p.camera;
    L.camConflict = cam && cam.holderId !== S.currentUserId && Date.now() - cam.beat < 90000 ? cam : null;
    this.saved(); commit();
  },
  async previewCamera(simulated = false) {
    const L = U.live; const prefs = livePrefs();
    L.cam = 'starting'; L.camError = null; commit();
    const r = simulated ? Media.startSimulated() : await Media.start({ deviceId: prefs.deviceId, audio: prefs.mic });
    if (!U.live) { Media.stop(); return false; }
    if (r.ok) { L.cam = 'preview'; L.sim = simulated; if (simulated) prefs.mic = false; }
    else { L.cam = 'error'; L.camError = r.code; }
    commit(); return r.ok;
  },
  async start({ camera = true, force = false } = {}) {
    const L = U.live; const m = liveModel(); const prefs = livePrefs();
    if (m.error) return;
    if (camera) {
      if (L.camConflict && !force) { L.viewOnly = true; camera = false; }
      else {
        if (!Media.stream && !(await this.previewCamera(L.sim))) return;
        const res = liveAPI(m).setCamera(true, force);
        if (res.status === 'camera_in_use') { L.camConflict = res.holder; Media.stop(); L.cam = 'off'; commit(); return; }
        L.cam = 'on'; L.viewOnly = false; L.camConflict = null;
        const api = liveAPI(m); this.releaseCamera = () => api.setCamera(false);
        clearInterval(this.hb); this.hb = setInterval(() => { const mm = U.live && liveModel(); if (mm && !mm.error) liveAPI(mm).heartbeat(); }, 20000);
      }
    }
    if (!camera) { Media.stop(); L.cam = 'off'; }
    L.phase = 'live'; commit();
    await this.connectAI(prefs.adapterKind || defaultAdapterKind());
    if (L.cam === 'on') this.startSampler();
  },
  async connectAI(kind) {
    const L = U.live; if (!L) return;
    if (this.adapter) { this.adapter.disconnect(); if (this.unsub) this.unsub(); }
    const def = ADAPTERS[kind] || ADAPTERS.simulated;
    if (!def.available()) { L.ai = { state: 'unavailable', detail: kind === 'remote' ? 'The recording service isn’t configured for this Labby deployment.' : 'Live AI isn’t available in this view.' }; commit(); return; }
    livePrefs().adapterKind = kind;
    this.adapter = def.make(); L.adapterKind = kind; L.aiError = '';
    this.unsub = this.adapter.on((evt) => this.onEvent(evt));
    L.lastSeq = this.seq;
    const m = liveModel(); if (m.error) return;
    try { await this.adapter.connect(liveCtx(m)); } catch (e) { /* state already reported */ }
    commit();
  },
  startSampler() {
    const prefs = livePrefs();
    if (!this.adapter || !this.adapter.caps.frames) return;
    if (!this.sampler) this.sampler = new FrameSampler({ getVideo: () => document.getElementById('live-video'), onFrame: (f) => this.onFrame(f) });
    this.sampler.configure({ intervalSec: Number(prefs.intervalSec) || 0, maxWidth: prefs.lowBandwidth ? LABBY_CONFIG.lowBandwidthFrameWidth : LABBY_CONFIG.maxFrameWidth, quality: prefs.lowBandwidth ? LABBY_CONFIG.lowBandwidthQuality : LABBY_CONFIG.jpegQuality, paused: false });
    this.sampler.start();
  },
  onFrame(f) {
    const m = U.live && liveModel();
    if (!m || m.error || !this.adapter || m.t.p.atCheckpoint || m.t.p.finishedAt || m.readOnly || U.live.cam !== 'on') return Promise.resolve();
    U.live.lastFrameAt = f.capturedAt; U.live.lastFrameKb = Math.round(f.bytes / 1024);
    return this.adapter.analyzeFrame(f, { ...liveCtx(m).meta(), seq: ++this.seq, requestId: `req_${uid(8)}` });
  },
  async checkNow() { if (this.sampler) { await this.sampler.tick(true); } },
  onEvent(evt) {
    const L = U.live; if (!L) return;
    if (evt.type === 'status') { L.ai = { state: evt.state, detail: evt.detail || '' }; commit(); return; }
    if (evt.type === 'error') { L.aiError = evt.message; commit(); return; }
    if (evt.type === 'rate_limited') { const p = livePrefs(); p.intervalSec = Math.min(120, (Number(p.intervalSec) || 30) * 2); if (this.sampler) this.sampler.configure({ intervalSec: p.intervalSec }); L.aiError = `${evt.message} Now every ${p.intervalSec} s.`; commit(); return; }
    if (evt.type !== 'guidance') return;
    const ev = evt.event; const m = liveModel(); if (m.error) return;
    const cur = liveCtx(m).meta();
    // Stale-response rejection: wrong step, wrong procedure version, superseded request, or the group is at a checkpoint.
    if (ev.stepId !== cur.stepId || ev.procedureVersionId !== cur.versionId || (ev.seq != null && ev.seq < L.lastSeq) || m.t.p.atCheckpoint || m.t.p.finishedAt) { L.stale += 1; commit(); return; }
    L.lastSeq = Math.max(L.lastSeq, ev.seq || 0);
    const log = m.t.p.guidance;
    if (log.some((g) => g.eventId === ev.eventId)) return;
    log.push({ eventId: ev.eventId, at: ev.receivedAt, type: ev.type, source: ev.source, observation: ev.observation, inference: ev.inference, guidance: ev.guidance, question: ev.question, stepId: ev.stepId, helpReason: ev.helpReason, helpCategory: ev.helpCategory, by: S.currentUserId, withImage: ev.withImage });
    if (log.length > 30) log.splice(0, log.length - 30);
    if (ev.type === 'suggested_completion') L.suggest = ev.stepId;
    if (ev.type === 'help_recommended') { L.helpSuggest = ev; liveAPI(m).flag('help', ev.helpReason || ev.guidance, ev.stepId); }
    if (ev.type === 'unclear_view') { L.unclear += 1; if (L.unclear >= 3) { liveAPI(m).flag('unclear', 'Camera view has been unclear for several checks in a row.', ev.stepId); L.unclear = 0; } } else if (ev.withImage) L.unclear = 0;
    if (livePrefs().speak && window.speechSynthesis && ev.guidance) { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(ev.guidance.replace(/^\[Simulated[^\]]*\]\s*/, ''))); } catch (e) { /* speech unavailable */ } }
    this.saved(); commit();
  },
  stepChanged() {
    const L = U.live; const m = liveModel(); if (m.error) return;
    L.suggest = null; L.helpSuggest = null; L.lastSeq = this.seq; // anything requested before now is stale
    if (this.adapter) this.adapter.setStep(liveCtx(m));
  },
  completeStep() {
    const m = liveModel(); if (m.error) return;
    const p = m.t.p; const s = m.steps[p.stepIndex]; if (!s) return;
    const res = liveAPI(m).completeStep(s.id, `step:${m.trackKey}:${s.id}:${S.currentUserId}`);
    if (res.status === 'ok') { this.saved(); this.stepChanged(); toast(p.atCheckpoint ? 'Step complete. Your teacher’s checkpoint is next.' : p.finishedAt ? 'All steps complete. Nice work.' : `Step ${p.stepIndex + 1} is next.`, 'checkCircle'); }
    else if (res.status === 'duplicate') toast('That step was already marked complete, so nothing changed.', 'info');
    else toast(res.message || 'That step can’t be completed right now.', 'alert');
    commit();
  },
  saveCheckpoint(cpId, submit) {
    const L = U.live; const m = liveModel(); if (m.error) return;
    const draft = L.cpDraft[cpId] || {};
    const sig = Object.keys(draft).sort().map((k) => `${k}=${draft[k]}`).join('&');
    const pcp = m.released.find((x) => x.id === cpId); const prev = pcp ? cpRecordFor(m.trackKey, m.groupId, pcp, S.currentUserId) : null;
    const attempt = prev ? `${prev.submissions}-${prev.status}` : '0'; // a resubmission after a return is a new event; a double click is not
    const res = liveAPI(m).saveResponse(cpId, draft, submit, submit ? `cpsub:${m.trackKey}:${cpId}:${S.currentUserId}:${attempt}:${sig}` : `cpsave:${uid(8)}`);
    if (res.status === 'incomplete') { L.cpError = 'Answer every required question before submitting.'; commit(); return; }
    L.cpError = '';
    if (res.status === 'ok' || res.status === 'duplicate') { this.saved(); if (submit) { delete L.cpDraft[cpId]; toast(res.status === 'duplicate' ? 'Already submitted. Nothing was duplicated.' : 'Response submitted.', 'check'); } else toast('Draft saved.', 'check'); }
    else toast(res.message || 'Couldn’t save that response.', 'alert');
    if (!m.t.p.atCheckpoint) this.stepChanged();
    commit();
  },
  async ask() {
    const L = U.live; const q = (L.question || '').trim(); const m = liveModel();
    if (!q || m.error || !this.adapter) return;
    L.asking = true; L.question = ''; commit();
    const frame = L.cam === 'on' && this.sampler ? await this.sampler.capture().catch(() => null) : null;
    await this.adapter.ask(q, { ...liveCtx(m).meta(), seq: ++this.seq, requestId: `ask_${uid(8)}` }, frame);
    if (U.live) { U.live.asking = false; commit(); }
  },
  pauseCam() { const L = U.live; if (!Media.stream) return; Media.stream.getVideoTracks().forEach((t) => { t.enabled = false; }); if (this.sampler) this.sampler.paused = true; if (this.adapter) this.adapter.pause(); L.cam = 'paused'; commit(); },
  resumeCam() { const L = U.live; if (!Media.stream) return; Media.stream.getVideoTracks().forEach((t) => { t.enabled = true; }); if (this.sampler) this.sampler.paused = false; if (this.adapter) this.adapter.resume(); L.cam = 'on'; commit(); },
  stopCam() { const L = U.live; if (this.sampler) this.sampler.stop(); Media.stop(); if (this.releaseCamera) { this.releaseCamera(); this.releaseCamera = null; } clearInterval(this.hb); L.cam = 'off'; L.sim = false; commit(); },
  async restartCam(simulated = false) { const L = U.live; L.sim = simulated; if (await this.previewCamera(simulated)) await this.start({ camera: true }); },
  onTrackEnded() { const L = U.live; if (!L || L.cam === 'off') return; L.cam = 'error'; L.camError = 'missing'; if (this.sampler) this.sampler.stop(); commit(); toast('The camera disconnected. Your progress is saved.', 'alert'); },
  leave() {
    const m = U.live && liveModel(); const back = m && !m.error ? m.backHref : '#s/overview';
    this.teardown(); location.hash = back;
    toast('You left the live session. Your group’s progress is saved and the class session keeps running.', 'logout');
  },
};
window.addEventListener('pagehide', () => Live.teardown());

/* ---------- Views ---------- */
const AI_STATE = {
  off: { label: 'AI guidance off', tone: 'idle', icon: 'x' }, connecting: { label: 'Connecting', tone: 'blue', icon: 'refresh' }, connected: { label: 'Connected', tone: 'ok', icon: 'wifi' },
  paused: { label: 'Paused', tone: 'warn', icon: 'pause' }, reconnecting: { label: 'Reconnecting', tone: 'warn', icon: 'refresh' }, unavailable: { label: 'Unavailable', tone: 'bad', icon: 'wifiOff' },
  error: { label: 'Connection problem', tone: 'bad', icon: 'wifiOff' }, disconnected: { label: 'Disconnected', tone: 'idle', icon: 'wifiOff' }, idle: { label: 'Not connected', tone: 'idle', icon: 'wifiOff' },
};
function liveCodeForm() {
  const d = S.ui.liveCodeDraft || (S.ui.liveCodeDraft = { code: '', error: '' });
  return html`<form class="card card-pad stack" data-submit="live-code" novalidate style="margin-bottom:22px;max-width:720px">
    <h2>Enter a live session code</h2>
    <p class="muted small">When your teacher starts the lab, they post a code like <span class="mono">K7Q-M4X</span>. Enter it to go straight to your group’s session.</p>
    <div class="row wrap" style="align-items:flex-end">
      ${field({ label: 'Live session code', id: 'lc-code', bind: 'ui.liveCodeDraft.code', value: d.code, cls: 'grow', attrs: 'autocomplete="off" autocapitalize="characters" spellcheck="false" style="font-family:var(--font-mono);letter-spacing:0.12em;text-transform:uppercase;max-width:220px"', error: d.error })}
      <button class="btn btn-primary" type="submit">${icon('arrowRight')}Join session</button>
    </div>
  </form>`;
}
function liveStudentPicker() {
  const labs = studentLabsFor(S.currentUserId, S.ui.sClass);
  const live = labs.filter((x) => ['ready', 'inprogress'].includes(x.view.status));
  const rest = labs.filter((x) => !['ready', 'inprogress'].includes(x.view.status));
  return html`${liveCodeForm()}<div class="page-intro"><p>Open live sessions for your classes. A session appears here when your teacher opens it.</p></div>
    ${live.length ? html`<div class="grid grid-2">${live.map(labCard)}</div>` : html`<div class="card">${emptyState({ ico: 'activity', title: 'No live session is open', text: 'When your teacher opens a lab session, an Enter Live Session button appears here and on your overview.', compact: true })}</div>`}
    ${rest.length ? html`<h2 style="margin:22px 0 10px">Other labs</h2><div class="grid grid-2">${rest.map(labCard)}</div>` : ''}`;
}
function liveSessionView() {
  const L = U.live; const m = liveModel();
  if (m.error) {
    const e = m.error; const ico = { not_enrolled: 'lock', not_published: 'eye', no_group: 'users', not_allowed: 'lock' }[e.code] || 'alert';
    return html`<div class="card">${emptyState({ ico, title: { not_enrolled: 'You’re not part of this session', not_published: 'This lab isn’t published yet', no_group: 'You’re not in a lab group yet', not_allowed: 'No access' }[e.code] || 'Session not available', text: e.message, actions: html`<a class="btn" href="${L.kind === 'run' ? '#r/runs' : '#s/live'}">Back</a>` })}</div>`;
  }
  if (L.phase === 'lobby') return liveLobby(m);
  if (L.phase === 'setup') return liveSetup(m);
  return liveWorkspace(m);
}
function liveLobby(m) {
  const L = U.live; const p = m.t.p; const prefs = livePrefs();
  const offline = !navigator.onLine || p.connection === 'lost';
  const started = p.completed.length > 0 || p.joined.length > 0;
  const state = m.status === 'not_open' ? { ico: 'calendar', tone: 'idle', title: 'Session not yet open', text: m.v.autoOpen ? `It opens automatically at ${fmtSchedule({ scheduledFor: m.v.scheduledFor, scheduledTime: m.v.scheduledTime })}.` : 'Your teacher hasn’t opened this session yet. This page updates when they do.' }
    : m.status === 'paused' ? { ico: 'pause', tone: 'warn', title: 'Session paused by your teacher', text: 'You can read the instructions, but steps can’t be completed until your teacher resumes the session.' }
      : m.status === 'completed' ? { ico: 'checkCircle', tone: 'idle', title: 'Session completed', text: 'You can review the procedure and your saved responses.' }
        : started ? { ico: 'playCircle', tone: 'blue', title: 'Session in progress', text: p.finishedAt ? 'Your group finished every step.' : `Your group is on step ${p.stepIndex + 1}${p.atCheckpoint ? ' (at a checkpoint)' : ''}. You’ll pick up right there.` }
          : { ico: 'play', tone: 'ok', title: 'Ready to start', text: 'Your teacher opened the session. Enter when your group is at its bench.' };
  return html`<div class="stack loose" style="max-width:860px">
    <section class="card card-pad stack">
      <div class="row between wrap top"><div class="stack tight"><span class="eyebrow">${m.kind === 'run' ? 'Guided session' : 'Live session'}</span><h2 style="font-size:1.45rem">${m.title}</h2><span class="small muted">${m.sub}</span></div>
        ${m.kind === 'class' ? studentPill(m.v.status) : pill(RUN_STATUS[m.run.status])}</div>
      ${m.kind === 'class' ? html`<p class="small">${icon('users', 'sm')} Your group: <strong>${m.groupName}</strong> (${m.members.join(', ')})</p>` : html`<p class="small">${icon('users', 'sm')} Participants: ${m.members.join(', ')}</p>`}
      <div class="notice ${state.tone === 'warn' ? 'warn' : state.tone === 'ok' ? 'ok' : ''}">${icon(state.ico)}<div><strong>${state.title}.</strong> ${state.text}</div></div>
      ${offline ? html`<div class="notice warn" role="status">${icon('wifiOff')}<div><strong>Connection interrupted.</strong> Your saved progress is safe. <button class="link-btn" data-action="live-reconnect">Reconnect</button></div></div>` : ''}
      ${m.precautions.length && m.status !== 'completed' ? html`<div class="panel stack tight"><strong class="row">${icon('alert', 'sm')}Before you start</strong><ul class="ul-plain small">${m.precautions.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
      ${m.ack && m.status !== 'completed' ? html`<label class="check" for="live-ack"><input type="checkbox" id="live-ack" data-bind="liveState.${`${L.kind}:${L.id}|${S.currentUserId}`.replace(/\./g, '_')}.ack" data-type="bool"${attr(prefs.ack, 'checked')} data-change="live-ack"><span><strong>Required by your teacher:</strong> ${m.ack}</span></label>` : ''}
      ${L.msg ? html`<div class="err" role="alert">${icon('alert', 'sm')}${L.msg}</div>` : ''}
      <div class="row wrap">
        <button class="btn btn-primary btn-lg" data-action="live-enter"${attr(m.status === 'not_open' || offline, 'disabled')}>${icon(m.status === 'completed' ? 'eye' : 'arrowRight')}${m.status === 'completed' ? 'Review session' : m.status === 'paused' ? 'Enter (read only)' : started ? 'Resume session' : 'Enter session'}</button>
        <a class="btn btn-ghost" href="${m.backHref}">Back to lab</a></div>
    </section>
  </div>`;
}
function privacyText(kind, prefs) {
  if (kind === 'claude') return html`<ul class="ul-plain small"><li><strong>What’s sent:</strong> while the camera is on, one still photo every ${prefs.intervalSec || 'few'} seconds (and one when you ask a question), up to ${prefs.lowBandwidth ? LABBY_CONFIG.lowBandwidthFrameWidth : LABBY_CONFIG.maxFrameWidth} pixels wide, plus this step’s instructions and your recorded values. It goes to the AI assistant through the account of the person viewing this page. Video is never streamed.</li>
    <li><strong>What’s stored:</strong> Labby doesn’t save photos or video. The guidance text is saved with your group’s progress.</li>
    <li><strong>Who can see it:</strong> your group sees the guidance. Your teacher sees step progress, measurements, checkpoint answers and AI flags that ask for teacher help, but not photos.</li></ul>`;
  if (kind === 'remote') return html`<ul class="ul-plain small"><li><strong>What’s sent:</strong> sampled camera frames and this step’s instructions go to your school’s recording service (${(LABBY_CONFIG.recordingService.wsUrl || '').replace(/^wss?:\/\//, '').split('/')[0] || 'not configured'}).</li><li><strong>What’s stored:</strong> set by that service’s retention policy. Labby doesn’t save video.</li><li><strong>Who can see it:</strong> your teacher sees progress and AI flags, not video.</li></ul>`;
  return html`<ul class="ul-plain small"><li><strong>Nothing leaves this browser.</strong> The camera preview stays on this device and isn’t analyzed.</li><li>Guidance comes from scripted demo text, labeled “Simulated”.</li><li>Your teacher sees step progress and checkpoint answers as usual.</li></ul>`;
}
function cameraBox(L, { compact = false } = {}) {
  const on = Media.stream && ['preview', 'on', 'paused'].includes(L.cam);
  const err = L.cam === 'error' && L.camError ? MEDIA_ERRORS[L.camError] : null;
  return html`<div class="cam-box ${compact ? 'compact' : ''}">
    ${on ? html`<video id="live-video" data-key="live-video" data-morph-skip autoplay muted playsinline aria-label="${L.sim ? 'Simulated camera feed' : 'Camera preview'}"></video>` : ''}
    ${!on ? html`<div class="cam-empty">${err ? html`${icon('alert', 'lg')}<strong>${err.title}</strong><span class="small">${err.text}</span>`
      : L.cam === 'starting' ? html`<span class="spinner"></span><span class="small">Waiting for camera permission…</span>`
        : L.viewOnly ? html`${icon('eye', 'lg')}<strong>Following along</strong><span class="small">${L.camConflict ? `${L.camConflict.holderName}’s device is your group’s camera.` : 'Your group’s camera runs on another device.'}</span>`
          : html`${icon('eye', 'lg')}<strong>Camera off</strong><span class="small">Turn it on when you’re ready. Nothing is sent until you start AI guidance.</span>`}</div>` : ''}
    ${L.cam === 'paused' ? html`<div class="cam-paused">${icon('pause', 'lg')}Paused</div>` : ''}
  </div>`;
}
function liveSetup(m) {
  const L = U.live; const prefs = livePrefs(); const kind = prefs.adapterKind || defaultAdapterKind();
  const p = m.t.p;
  return html`<div class="stack loose">
    <div class="row between wrap"><div class="stack tight"><span class="eyebrow">Set up · ${m.title}</span><h2>Camera and AI guidance</h2>
      <span class="small muted">${m.sub}${m.groupName ? ` · ${m.groupName}` : ''} · ${p.finishedAt ? 'all steps done' : `you’ll start at step ${p.stepIndex + 1}${p.atCheckpoint ? ' (checkpoint)' : ''}`}</span></div>
      <button class="btn btn-ghost" data-action="live-leave">${icon('logout', 'sm')}Leave</button></div>
    <div class="setup-grid">
      <section class="card card-pad stack" aria-labelledby="cam-h">
        <h3 id="cam-h">Camera</h3>
        ${cameraBox(L)}
        <div class="row wrap">
          ${!Media.stream ? html`<button class="btn" data-action="live-preview"${attr(L.cam === 'starting', 'disabled')}>${icon('eye', 'sm')}Turn on camera preview</button>
            <button class="btn btn-demo btn-sm" data-action="live-sim-feed">${icon('zap', 'sm')}Use simulated camera feed (demo)</button>`
          : html`<button class="btn btn-sm btn-ghost" data-action="live-cam-stop">${icon('x', 'sm')}Turn off preview</button>`}
        </div>
        ${Media.devices.length > 1 && !L.sim ? html`<div class="field"><label for="cam-dev">Camera</label><select class="select sm" id="cam-dev" data-change="live-device">${options(Media.devices.map((d) => [d.id, d.label]), Media.deviceId)}</select></div>` : ''}
        <label class="check" for="live-mic"><input type="checkbox" id="live-mic" data-change="live-mic-pref"${attr(prefs.mic, 'checked')}${attr(L.sim || kind === 'claude', 'disabled')}><span>Use the microphone <span class="opt">(optional)</span>
          <span class="hint" style="display:block">${kind === 'claude' ? 'Live AI guidance uses still photos only, so audio isn’t sent.' : kind === 'simulated' ? 'In the demo, audio stays on this device.' : 'Sent to the recording service if it supports audio.'}</span></span></label>
      </section>
      <section class="card card-pad stack" aria-labelledby="ai-h">
        <h3 id="ai-h">AI connection</h3>
        <div class="stack tight" role="radiogroup" aria-label="AI connection">${Object.entries(ADAPTERS).map(([k, d]) => html`<label class="jp-period" for="ad-${k}" style="padding:10px 12px;cursor:pointer"><input type="radio" name="adapter" id="ad-${k}" value="${k}" data-change="live-adapter"${attr(kind === k, 'checked')}${attr(!d.available(), 'disabled')}>
          <span><strong>${d.label}</strong><span class="hint" style="display:block">${k === 'claude' ? (d.available() ? 'Real AI on sampled still photos.' : 'Not available in this view.') : k === 'remote' ? (d.available() ? 'Your school’s recording system.' : 'Not configured yet. See INTEGRATION.md.') : 'Scripted demo. Never analyzes your camera.'}</span></span></label>`)}</div>
        <div class="form-grid">
          ${selectField({ label: 'Check the camera view', id: 'live-int', bind: `liveState.${`${L.kind}:${L.id}|${S.currentUserId}`.replace(/\./g, '_')}.intervalSec`, value: prefs.intervalSec, opts: [[0, 'Only when I ask'], [15, 'Every 15 seconds'], [30, 'Every 30 seconds'], [60, 'Every minute']] })}
          <div class="field"><span class="label">Bandwidth</span>${checkField({ label: 'Low-bandwidth mode', id: 'live-low', bind: `liveState.${`${L.kind}:${L.id}|${S.currentUserId}`.replace(/\./g, '_')}.lowBandwidth`, checked: prefs.lowBandwidth, hint: 'Smaller, more compressed photos.' })}</div>
        </div>
        <div class="panel stack tight"><strong class="small">What’s sent, what’s stored, who can see it</strong>${privacyText(kind, prefs)}</div>
      </section>
    </div>
    ${L.camConflict ? html`<div class="notice">${icon('users')}<div><strong>${L.camConflict.holderName}’s device is already your group’s camera${L.camConflict.deviceLabel ? ` (${L.camConflict.deviceLabel})` : ''}.</strong> Each group uses one camera. You can follow your group’s progress here without starting another stream.
      <div class="row wrap" style="margin-top:8px"><button class="btn btn-sm btn-primary" data-action="live-follow">${icon('eye', 'sm')}Follow along without a camera</button><button class="btn btn-sm" data-action="live-take-camera">Use this device as the camera instead</button></div></div></div>` : ''}
    <div class="sticky-actions">
      <button class="btn btn-ghost" data-action="live-no-camera">Continue without camera</button><span class="spacer"></span>
      <button class="btn btn-primary btn-lg" data-action="live-start"${attr(L.cam === 'starting', 'disabled')}>${icon('playCircle')}Start Camera & AI Guidance</button>
    </div>
  </div>`;
}
function liveHeader(m) {
  const L = U.live; const p = m.t.p;
  const saved = L.offline ? html`<span class="pill tone-warn">${icon('wifiOff')}Offline: saved on this device</span>` : L.savedAt ? html`<span class="pill tone-ok">${icon('check')}Saved ${tickSince(L.savedAt, 'ago')}</span>` : html`<span class="pill tone-idle">${icon('check')}Progress saved</span>`;
  return html`<div class="live-head">
    <div class="stack tight" style="min-width:0"><span class="eyebrow">${m.sub}${m.groupName ? ` · ${m.groupName}` : ''}</span><h2 style="font-size:1.25rem">${m.title}</h2></div>
    <div class="row wrap">${m.status === 'paused' ? html`<span class="pill tone-warn">${icon('pause')}Paused by teacher</span>` : m.status === 'completed' ? html`<span class="pill tone-idle">${icon('checkCircle')}Completed</span>` : html`<span class="pill tone-ok">${icon('dot')}Live</span>`}
      <span class="mono small">${icon('clock', 'sm')} ${m.kind === 'class' ? tickSession(m.sess, 'elapsed') : tickSince(m.run.startedAt || Date.now())}</span>${saved}
      <button class="btn btn-sm btn-ghost" data-action="live-leave">${icon('logout', 'sm')}Leave session</button></div>
    ${L.offline || p.connection === 'lost' ? html`<div class="notice warn" role="status" style="flex-basis:100%">${icon('wifiOff')}<div><strong>Connection interrupted.</strong> Your instructions and saved progress stay available. Live AI guidance is unavailable until you reconnect. <button class="link-btn" data-action="live-reconnect">Reconnect now</button></div></div>` : ''}
  </div>`;
}
function liveWorkspace(m) {
  const L = U.live; const p = m.t.p;
  return html`<div class="stack">
    ${liveHeader(m)}
    <div class="live-grid">
      <div class="stack" style="min-width:0">
        ${m.readOnly && m.status === 'completed' ? '' : cameraPanel(m)}
        ${currentPanel(m)}
        ${completedList(m)}
      </div>
      <div class="stack" style="min-width:0">
        ${guidancePanel(m)}
        ${progressPanel(m)}
        ${liveDemoPanel(m)}
      </div>
    </div>
  </div>`;
}
function indicator(label, value, tone, ico) { return html`<span class="ind tone-${tone}">${icon(ico, 'sm')}<span><span class="xs">${label}</span> <strong>${value}</strong></span></span>`; }
function cameraPanel(m) {
  const L = U.live; const prefs = livePrefs(); const ai = AI_STATE[L.ai.state] || AI_STATE.idle;
  const camLabel = L.viewOnly ? 'Teammate’s device' : L.cam === 'on' ? (L.sim ? 'Simulated feed' : 'On') : L.cam === 'paused' ? 'Paused' : L.cam === 'error' ? 'Error' : 'Off';
  const adapterName = Live.adapter ? Live.adapter.label : 'none';
  return html`<section class="card" aria-labelledby="cam-panel-h"><div class="card-head"><h3 id="cam-panel-h" class="row">${icon('eye', 'sm')}Camera</h3>
      <div class="row wrap" role="status">${indicator('Camera', camLabel, L.cam === 'on' ? 'ok' : L.cam === 'error' ? 'bad' : 'idle', 'eye')}${indicator('AI', `${ai.label}${Live.adapter ? ` · ${adapterName}` : ''}`, ai.tone, ai.icon)}${indicator('Video recording', 'Not saved', 'idle', 'stopCircle')}</div></div>
    <div class="card-body stack">${cameraBox(L, { compact: true })}
      <div class="row wrap">
        ${L.cam === 'on' ? html`<button class="btn btn-sm" data-action="live-cam-pause">${icon('pause', 'sm')}Pause</button>` : ''}
        ${L.cam === 'paused' ? html`<button class="btn btn-sm btn-primary" data-action="live-cam-resume">${icon('play', 'sm')}Resume</button>` : ''}
        ${['on', 'paused'].includes(L.cam) ? html`<button class="btn btn-sm" data-action="live-cam-stop">${icon('stopCircle', 'sm')}Stop camera</button>` : ''}
        ${['off', 'error'].includes(L.cam) && !m.readOnly ? html`<button class="btn btn-sm" data-action="live-cam-start">${icon('play', 'sm')}${L.viewOnly ? 'Use this device as the camera' : 'Start camera'}</button><button class="btn btn-sm btn-demo" data-action="live-cam-sim">${icon('zap', 'sm')}Simulated feed</button>` : ''}
        ${L.cam === 'on' && Live.adapter && Live.adapter.caps.frames ? html`<button class="btn btn-sm" data-action="live-check-now"${attr(!!m.t.p.atCheckpoint, 'disabled')}>${icon('search', 'sm')}Check my setup now</button>` : ''}
        ${Media.stream && Media.stream.getAudioTracks().length && !L.sim && Live.adapter && Live.adapter.caps.audio ? html`<button class="btn btn-sm" data-action="live-mic" aria-pressed="${Media.micOn()}">${icon('message', 'sm')}Microphone ${Media.micOn() ? 'on' : 'off'}</button>` : ''}
      </div>
      ${L.cam === 'on' ? html`<p class="xs muted">${livePrefs().intervalSec > 0 ? `Checks the view every ${prefs.intervalSec} s` : 'Checks only when you ask'}${prefs.lowBandwidth ? ' · low bandwidth' : ''}${L.lastFrameAt ? ` · last photo ${fmtClock(L.lastFrameAt)} (${L.lastFrameKb} KB)` : ''}${Live.sampler && Live.sampler.stats.lastLatencyMs != null ? ` · last check took ${(Live.sampler.stats.lastLatencyMs / 1000).toFixed(1)} s` : ''}. Photos aren’t stored.</p>` : ''}
    </div></section>`;
}
function currentPanel(m) {
  const L = U.live; const p = m.t.p; const api = !m.readOnly && m.status === 'open';
  if (p.finishedAt) return html`<section class="card card-pad stack">${emptyState({ ico: 'checkCircle', title: 'All steps complete', text: m.kind === 'class' ? 'Follow your teacher’s cleanup instructions. Your measurements and responses are saved for your teacher.' : 'Head back to the run to finish your notes, or submit it for review.', compact: true, actions: html`<a class="btn" href="${m.backHref}">${m.kind === 'class' ? 'Back to lab' : 'Open the run'}</a>` })}</section>`;
  if (p.atCheckpoint) { const cp = m.released.find((x) => x.id === p.atCheckpoint); if (cp) return checkpointPanel(m, cp, api); }
  const s = m.steps[p.stepIndex]; if (!s) return '';
  const nextCp = m.placement.find((x) => x.afterStepId === s.id);
  const done = (lbl) => (p.observations.find((o) => o.stepId === s.id && o.label === lbl) || {}).value || '';
  const sug = L.suggest === s.id;
  return html`<section class="card current-step" aria-labelledby="cur-h">
    <div class="card-head"><div class="stack tight"><span class="eyebrow">Step ${p.stepIndex + 1} of ${m.steps.length}</span><h2 id="cur-h" style="font-size:1.35rem">${s.title}</h2></div>
      <span class="small mono">${icon('clock', 'sm')} ${p.stepStartedAt ? tickSince(p.stepStartedAt) : '0:00'}${s.minutes ? ` / ~${s.minutes} min` : ''}</span></div>
    <div class="card-body stack">
      <div class="teacher-says"><span class="eyebrow">${m.kind === 'class' ? 'From your teacher' : 'Protocol'}</span><p class="instr">${s.instructions}</p></div>
      ${s.materials.length ? html`<p class="small">${icon('layers', 'sm')} Materials: ${s.materials.join(', ')}</p>` : ''}
      ${s.expected ? html`<p class="small muted">${icon('eye', 'sm')} ${s.expected}</p>` : ''}
      ${s.inputs.length ? html`<div class="stack tight"><span class="label">Record your results</span><div class="form-grid">${s.inputs.map((inp, i) => html`<div class="field"><label for="meas-${i}">${inp.label}${inp.unit ? ` (${inp.unit})` : ''}</label>
        <input class="input" id="meas-${i}" value="${done(inp.label)}" data-change="live-meas" data-step="${s.id}" data-label="${inp.label}" data-unit="${inp.unit}" inputmode="${inp.unit ? 'decimal' : 'text'}"${attr(!api, 'disabled')}></div>`)}</div>
        <span class="hint">Saved when you leave each box. Only you and your group enter these; the AI never fills them in.</span></div>` : ''}
      ${sug ? html`<div class="notice ai" role="status">${icon('sparkles')}<div><strong>AI suggestion:</strong> this step may be done. It’s only a suggestion; mark it complete when you’re sure. <button class="link-btn" data-action="live-suggest-dismiss">Dismiss</button></div></div>` : ''}
      ${nextCp && nextCp.blocks ? html`<p class="small">${icon('clipboard', 'sm')} After this step, your teacher has a checkpoint for your group.</p>` : ''}
      <div class="row wrap">${api ? html`<button class="btn btn-primary btn-lg" data-action="live-complete">${icon('check')}Mark step ${p.stepIndex + 1} complete</button>` : html`<span class="small muted">${m.status === 'paused' ? 'Paused by your teacher. You can keep reading.' : 'Read-only.'}</span>`}</div>
    </div></section>`;
}
function checkpointPanel(m, cp, canEdit) {
  const L = U.live; const t = m.t;
  const full = (m.kind === 'class' ? sessionContent(m.sess) : t.c).checkpoints.find((x) => x.id === cp.id);
  const st = Engine.gateState(t, full); const rec = cpRecordFor(t.key, t.groupId, cp, S.currentUserId);
  if (!L.cpDraft[cp.id]) L.cpDraft[cp.id] = { ...((rec && rec.responses) || {}) };
  const draft = L.cpDraft[cp.id]; const gate = t.p.gates[cp.id] || {};
  const submitted = rec && rec.status === 'submitted'; const returned = gate.approval === 'returned' || (rec && rec.status === 'returned');
  const locked = !canEdit || gate.approval === 'approved' || (submitted && gate.approval === 'pending');
  const statusLine = returned ? { tone: 'bad', ico: 'reopen', text: `Returned for revision${gate.note ? `: “${gate.note}”` : ''}. Update your answers and submit again.` }
    : st.waitingOn === 'approval' ? { tone: 'wait', ico: 'hourglass', text: `Submitted. Waiting for ${m.kind === 'class' ? 'your teacher' : 'a project lead'} to approve before the next step.` }
      : st.waitingOn === 'correct' ? { tone: 'warn', ico: 'alert', text: 'Some multiple-choice answers need another look before you can continue.' }
        : submitted ? { tone: 'ok', ico: 'check', text: `Submitted ${fmtClock(rec.submittedAt)}${rec.submittedBy && rec.submittedBy !== S.currentUserId ? ` by ${userName(rec.submittedBy) || 'a teammate'}` : ''}.` }
          : { tone: 'idle', ico: 'pencil', text: cp.kind === 'info' ? (cp.approvalRequired ? 'Your teacher will check your group before you continue.' : 'Read this, then continue.') : 'Not submitted yet.' };
  const scopeNote = cp.scope === 'group' ? `One shared response for ${m.groupName || 'your group'}. Anyone can submit it, and everyone sees the same answers.` : 'Each person submits their own response.';
  return html`<section class="card current-step cp-panel" aria-labelledby="cp-h">
    <div class="card-head"><div class="stack tight"><span class="eyebrow">Checkpoint after step ${stepIndexOf(m, cp.afterStepId) + 1}</span><h2 id="cp-h" style="font-size:1.35rem">${cp.title}</h2></div>${pill({ label: cp.kind === 'info' ? 'Information' : 'Response', icon: 'clipboard', tone: 'wait' })}</div>
    <div class="card-body stack">
      ${cp.info ? html`<div class="teacher-says"><span class="eyebrow">From your teacher</span><p class="instr">${cp.info}</p></div>` : ''}
      ${cp.image ? html`<img src="${cp.image.dataUrl}" alt="${cp.image.name}" class="cp-img">` : ''}
      ${cp.observe ? html`<p class="small">${icon('eye', 'sm')} <strong>Look for:</strong> ${cp.observe}</p>` : ''}
      ${cp.questions.length ? html`<p class="hint">${scopeNote} ${cp.rule}.</p>` : ''}
      <div class="stack">${cp.questions.map((q, i) => questionInput(cp, q, i, draft, locked))}</div>
      ${L.cpError ? html`<div class="err" role="alert">${icon('alert', 'sm')}${L.cpError}</div>` : ''}
      <div class="notice ${statusLine.tone === 'bad' ? 'warn' : statusLine.tone === 'ok' ? 'ok' : ''}" role="status">${icon(statusLine.ico)}<div>${statusLine.text}</div></div>
      ${cp.results ? html`<div class="stack tight">${cp.results.map((r) => { const q = cp.questions.find((x) => x.id === r.qid); return html`<div class="panel small"><strong>${r.correct ? 'Correct' : 'Not quite'}</strong> · ${q ? q.prompt : ''}${r.feedback ? html`<br>${r.feedback}` : ''}</div>`; })}</div>` : ''}
      ${canEdit && cp.questions.length && !locked ? html`<div class="row wrap"><button class="btn" data-action="cp-save" data-cp="${cp.id}">Save draft</button><button class="btn btn-primary" data-action="cp-submit" data-cp="${cp.id}">${icon('send', 'sm')}${submitted || returned ? 'Submit again' : 'Submit response'}</button></div>` : ''}
      ${m.kind === 'class' ? html`<p class="xs muted">AI guidance pauses during checkpoints so your answers are your own.</p>` : ''}
    </div></section>`;
}
const stepIndexOf = (m, stepId) => m.steps.findIndex((s) => s.id === stepId);
function questionInput(cp, q, i, draft, locked) {
  const id = `cpq-${cp.id}-${q.id}`; const bind = `U.live.cpDraft.${cp.id}.${q.id}`; const val = draft[q.id] ?? '';
  const bad = (cp.incorrect || []).includes(q.id);
  const label = html`${i + 1}. ${q.prompt}${q.required ? '' : html` <span class="opt">(optional)</span>`}${bad ? html` <span class="tag" style="background:var(--bad-soft);color:var(--bad)">Revise</span>` : ''}`;
  if (q.type === 'mc') return html`<fieldset class="stack tight" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">${label}</legend>
    ${q.options.map((o) => html`<label class="jp-period" for="${id}-${o.id}" style="cursor:pointer;padding:9px 12px"><input type="radio" name="${id}" id="${id}-${o.id}" value="${o.id}" data-bind="${bind}" data-type="str"${attr(val === o.id, 'checked')}${attr(locked, 'disabled')}><span>${o.text}</span></label>`)}</fieldset>`;
  if (q.type === 'long') return html`<div class="field"><label for="${id}">${label}</label><textarea class="textarea" id="${id}" rows="3" data-bind="${bind}" data-type="str"${attr(locked, 'disabled')}>${val}</textarea></div>`;
  if (q.type === 'numeric') return html`<div class="field"><label for="${id}">${label}${q.unit ? ` (${q.unit})` : ''}</label><input class="input" style="max-width:200px" id="${id}" type="number" step="any" inputmode="decimal" value="${val}" data-bind="${bind}" data-type="str"${attr(locked, 'disabled')}></div>`;
  return html`<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" value="${val}" data-bind="${bind}" data-type="str"${attr(locked, 'disabled')}></div>`;
}
function completedList(m) {
  const p = m.t.p; if (!p.completed.length) return '';
  const open = U.live.doneOpen ?? !!(p.finishedAt || m.readOnly);
  return html`<details class="card"${attr(open, 'open')}><summary class="card-head" style="cursor:pointer" data-action="live-fold" data-f="doneOpen"><h3>Completed steps (${p.completed.length})</h3></summary><div class="card-body"><ol class="step-list">
    ${p.completed.map((x) => { const s = m.steps.find((y) => y.id === x.stepId) || { title: 'Step', instructions: '' }; const cp = m.released.find((c) => c.afterStepId === x.stepId);
      const obs = p.observations.filter((o) => o.stepId === x.stepId);
      return html`<li class="step-item"><span class="step-n">${icon('check', 'sm')}</span><div class="stack tight" style="min-width:0"><strong>${s.title}</strong><span class="small muted">${s.instructions}</span>
        ${obs.length ? html`<span class="xs">${obs.map((o) => `${o.label}: ${o.value}${o.unit ? ' ' + o.unit : ''}`).join(' · ')}</span>` : ''}</div><span class="xs muted mono">${fmtClock(x.at)}</span></li>
        ${cp && cp.id !== p.atCheckpoint ? checkpointReview(cp, cpRecordFor(m.trackKey, m.groupId, cp, S.currentUserId)) : ''}`; })}</ol></div></details>`;
}
function guidancePanel(m) {
  const L = U.live; const p = m.t.p; const prefs = livePrefs();
  const log = (p.guidance || []).slice().reverse(); const latest = log[0];
  const kindLabel = { guidance: 'AI guidance', answer: 'AI answer', unclear_view: 'AI: camera view unclear', suggested_completion: 'AI suggestion', help_recommended: 'AI recommends asking your teacher', observation: 'AI observation' };
  const card = (g, big) => html`<div class="guide ${big ? 'big' : ''} g-${g.type}"><div class="msg-meta"><span class="tag ${g.source === 'simulated' ? 'sim' : 'live'}">${icon(g.source === 'simulated' ? 'zap' : 'sparkles', 'sm')}${g.source === 'simulated' ? 'Simulated' : g.source === 'claude' ? 'Live AI' : 'Recording service'}</span><span>${kindLabel[g.type] || 'AI'}</span><span>${fmtClock(g.at)}</span>${g.withImage ? html`<span>${icon('eye', 'sm')}from a photo</span>` : ''}</div>
    ${g.question ? html`<p class="small muted">You asked: “${g.question}”</p>` : ''}
    ${g.observation ? html`<p class="small"><strong>Sees:</strong> ${g.observation}</p>` : ''}${g.inference ? html`<p class="small"><strong>Thinks:</strong> ${g.inference}</p>` : ''}
    <p class="${big ? '' : 'small'}">${g.guidance}</p></div>`;
  const blockedReason = p.atCheckpoint ? 'AI guidance pauses during checkpoints.' : p.finishedAt ? 'All steps are done.' : m.readOnly ? 'This session is read-only.' : '';
  return html`<section class="card" aria-labelledby="ai-panel-h"><div class="card-head"><h3 id="ai-panel-h" class="row">${icon('sparkles', 'sm')}AI guidance</h3>
      ${Live.adapter ? html`<span class="xs muted">${Live.adapter.label}</span>` : ''}</div>
    <div class="card-body stack">
      <p class="xs muted">AI suggestions support you; they don’t replace your teacher’s instructions or safety supervision.</p>
      ${!Live.adapter || ['unavailable', 'error', 'disconnected', 'off'].includes(L.ai.state) ? html`<div class="panel stack tight"><span class="small">${L.ai.detail || 'AI guidance is off. Your instructions and progress work without it.'}</span>
        ${!m.readOnly ? html`<div class="row wrap">${Object.entries(ADAPTERS).filter(([, d]) => d.available()).map(([k, d]) => html`<button class="btn btn-sm ${k === 'simulated' ? 'btn-demo' : ''}" data-action="live-connect" data-kind="${k}">${icon(k === 'simulated' ? 'zap' : 'sparkles', 'sm')}Connect ${d.label}</button>`)}</div>` : ''}</div>` : ''}
      ${L.ai.state === 'reconnecting' ? html`<div class="notice warn">${icon('refresh')}<div>${L.ai.detail || 'Reconnecting'}. Your instructions and progress still work; live guidance is paused.</div></div>` : ''}
      ${L.aiError ? html`<div class="notice warn">${icon('alert')}<div>${L.aiError}</div></div>` : ''}
      ${L.helpSuggest ? html`<div class="notice warn" role="alert">${icon('hand')}<div><strong>AI recommends asking your teacher.</strong> ${L.helpSuggest.helpReason || ''}<div class="row wrap" style="margin-top:6px">${m.canHelp ? html`<button class="btn btn-sm btn-primary" data-action="live-help-ai">${icon('lifebuoy', 'sm')}Review and send help request</button>` : ''}<button class="btn btn-sm btn-ghost" data-action="live-help-ai-dismiss">Dismiss</button></div></div></div>` : ''}
      ${latest ? card(latest, true) : html`<p class="small muted">${Live.adapter && L.ai.state === 'connected' ? 'Guidance for this step will appear here.' : 'No guidance yet.'}</p>`}
      <form class="stack tight" data-submit="live-ask">
        <label class="label" for="live-q">Ask about this step</label>
        <textarea class="textarea" id="live-q" rows="2" style="min-height:52px" data-bind="U.live.question" data-type="str" placeholder="${blockedReason || 'For example: Is my thermometer in the right place?'}"${attr(!!blockedReason || !Live.adapter, 'disabled')}>${L.question}</textarea>
        <div class="row between wrap"><label class="check small" for="live-speak"><input type="checkbox" id="live-speak" data-change="live-speak"${attr(prefs.speak, 'checked')}${attr(!window.speechSynthesis, 'disabled')}><span>Read guidance aloud <span class="hint">(browser voice)</span></span></label>
          <button class="btn btn-sm btn-ai" type="submit"${attr(!!blockedReason || !Live.adapter || L.asking, 'disabled')}>${L.asking ? html`<span class="spinner"></span>Asking…` : html`${icon('send', 'sm')}Ask`}</button></div>
      </form>
      ${L.stale ? html`<p class="xs muted">${icon('info', 'sm')} ${plural(L.stale, 'outdated AI response')} ignored (from an earlier step or replaced by a newer check).</p>` : ''}
      ${log.length > 1 ? html`<details${attr(L.histOpen, 'open')}><summary class="small strong" style="cursor:pointer" data-action="live-fold" data-f="histOpen">Earlier guidance (${log.length - 1})</summary><div class="stack tight" style="margin-top:8px">${log.slice(1, 9).map((g) => card(g, false))}</div></details>` : ''}
    </div></section>`;
}
function progressPanel(m) {
  const L = U.live; const p = m.t.p; const done = new Set(p.completed.map((x) => x.stepId));
  const help = m.kind === 'class' ? S.help.filter((h) => h.sessionId === m.sess.id && h.groupId === m.groupId) : [];
  const open = help.filter((h) => h.status !== 'resolved').sort((a, b) => a.createdAt - b.createdAt);
  const queue = m.kind === 'class' ? S.help.filter((h) => h.sessionId === m.sess.id && h.status !== 'resolved').sort((a, b) => a.createdAt - b.createdAt) : [];
  const s = m.steps[p.stepIndex];
  return html`<section class="card" aria-labelledby="pp-h"><div class="card-head"><h3 id="pp-h">Progress</h3><span class="small num">${done.size}/${m.steps.length} steps</span></div>
    <div class="card-body stack">
      <ol class="mini-steps">${m.steps.map((x, i) => { const cp = m.placement.find((c) => c.afterStepId === x.id);
        return html`<li class="${done.has(x.id) ? 'done' : i === p.stepIndex && !p.atCheckpoint && !p.finishedAt ? 'now' : ''}">${done.has(x.id) ? icon('check', 'sm') : html`<span class="num">${i + 1}</span>`}<span>${x.title}</span></li>
          ${cp && cp.blocks ? html`<li class="cp ${p.atCheckpoint === cp.id ? 'now' : p.gates[cp.id] && !p.atCheckpoint ? 'done' : ''}">${icon('clipboard', 'sm')}<span>Checkpoint</span></li>` : ''}`; })}</ol>
      ${m.canHelp ? html`<div class="stack tight">
        ${open.map((h) => html`<div class="panel stack tight" data-key="hs-${h.id}"><div class="row wrap">${helpPill(h.status)}${catTag(h.category)}<span class="xs muted">Waiting ${tickSince(h.createdAt)} · #${queue.indexOf(h) + 1} in line</span></div><span class="small" style="white-space:pre-wrap">${h.message}</span></div>`)}
        ${L.help ? helpForm(m, s) : html`<button class="btn btn-lg help-btn" data-action="live-help-open">${icon('lifebuoy')}Request Teacher Help</button>`}
        ${help.some((h) => h.status === 'resolved') ? html`<p class="xs muted">${plural(help.filter((h) => h.status === 'resolved').length, 'earlier request')} resolved.</p>` : ''}
      </div>` : html`<p class="small muted">Questions for your project lead? Leave a comment on the run page.</p>`}
    </div></section>`;
}
function helpForm(m, s) {
  const L = U.live; const h = L.help;
  return html`<form class="panel stack" data-submit="live-help" aria-labelledby="hf-h"><strong id="hf-h">Request teacher help</strong>
    <span class="xs muted">${m.groupName} · ${m.title} · ${m.t.p.atCheckpoint ? 'at a checkpoint' : s ? `step ${m.t.p.stepIndex + 1}: ${s.title}` : ''}</span>
    ${selectField({ label: 'What kind of help?', id: 'hf-cat', bind: 'U.live.help.cat', value: h.cat, opts: Object.keys(HELP_CATEGORIES) })}
    ${textareaField({ label: 'Describe the problem', id: 'hf-msg', bind: 'U.live.help.msg', value: h.msg, rows: 3, hint: h.ai ? 'Drafted by AI from what it saw. Edit it so it says what you mean.' : 'Your teacher sees this in their help queue.' })}
    ${h.error ? html`<div class="err">${icon('alert', 'sm')}${h.error}</div>` : ''}
    <div class="row wrap"><button class="btn btn-primary" type="submit">${icon('send', 'sm')}Send to teacher</button><button class="btn btn-ghost" type="button" data-action="live-help-cancel">Cancel</button></div></form>`;
}
function liveDemoPanel(m) {
  const sim = Live.adapter && Live.adapter.kind === 'simulated';
  return html`<details class="demo-panel"${attr(U.liveDemoOpen, 'open')}><summary data-action="live-demo-toggle">${icon('zap')}Simulated events (demo)${icon('chevDown', 'sm')}</summary>
    ${U.liveDemoOpen ? html`<div class="demo-body"><p class="small">Trigger the events the recording interface would send. ${sim ? '' : 'AI events need the Simulated connection.'}</p>
      <div class="row wrap">
        <button class="btn btn-sm btn-demo" data-action="live-sim" data-kind="guidance"${attr(!sim, 'disabled')}>Step guidance</button>
        <button class="btn btn-sm btn-demo" data-action="live-sim" data-kind="unclear"${attr(!sim, 'disabled')}>Unclear camera view</button>
        <button class="btn btn-sm btn-demo" data-action="live-sim" data-kind="suggest"${attr(!sim, 'disabled')}>Suggested completion</button>
        <button class="btn btn-sm btn-demo" data-action="live-sim" data-kind="help"${attr(!sim, 'disabled')}>Teacher-help recommendation</button>
        <button class="btn btn-sm btn-demo" data-action="live-sim" data-kind="stale"${attr(!sim, 'disabled')}>Late reply from an old step</button>
        <button class="btn btn-sm btn-demo" data-action="live-sim" data-kind="drop"${attr(!sim, 'disabled')}>AI connection loss</button>
        <button class="btn btn-sm btn-demo" data-action="live-sim" data-kind="recover"${attr(!sim, 'disabled')}>AI recovery</button>
      </div>
      <div class="row wrap">
        <button class="btn btn-sm btn-demo" data-action="live-sim-dup">Repeat the last step-completed event</button>
        <button class="btn btn-sm btn-demo" data-action="live-sim-offline">Drop Labby connection</button>
        ${m.kind === 'class' ? html`<button class="btn btn-sm btn-demo" data-action="live-sim-teammate">A teammate’s device takes the camera</button>` : ''}
      </div></div>` : ''}</details>`;
}

/* ---------- Actions ---------- */
const LIVE_ACTIONS = {
  'live-enter': () => Live.enter(),
  'live-preview': () => Live.previewCamera(false),
  'live-sim-feed': () => Live.previewCamera(true),
  'live-start': () => Live.start({ camera: true }),
  'live-no-camera': () => Live.start({ camera: false }),
  'live-follow': () => { U.live.viewOnly = true; Live.start({ camera: false }).then(() => { if (U.live) { U.live.viewOnly = true; commit(); } }); },
  'live-take-camera': () => Live.start({ camera: true, force: true }),
  'live-leave': () => Live.leave(),
  'live-connect': (el) => Live.connectAI(el.dataset.kind).then(() => { if (U.live && U.live.cam === 'on') Live.startSampler(); }),
  'live-cam-pause': () => Live.pauseCam(),
  'live-cam-resume': () => Live.resumeCam(),
  'live-cam-stop': () => { if (U.live.phase === 'setup') { Media.stop(); U.live.cam = 'off'; U.live.sim = false; commit(); } else Live.stopCam(); },
  'live-cam-start': () => Live.restartCam(false),
  'live-cam-sim': () => Live.restartCam(true),
  'live-check-now': () => Live.checkNow(),
  'live-mic': () => { Media.setMic(!Media.micOn()); commit(); },
  'live-complete': () => Live.completeStep(),
  'live-suggest-dismiss': () => { U.live.suggest = null; commit(); },
  'cp-save': (el) => Live.saveCheckpoint(el.dataset.cp, false),
  'cp-submit': (el) => Live.saveCheckpoint(el.dataset.cp, true),
  'live-help-open': () => { U.live.help = { cat: 'Procedure', msg: '', ai: false }; commit(); U.focusAfter = '#hf-msg'; },
  'live-help-cancel': () => { U.live.help = null; commit(); },
  'live-help-ai': () => { const g = U.live.helpSuggest; U.live.help = { cat: g.helpCategory || 'Procedure', msg: g.helpReason || g.guidance, ai: true }; commit(); U.focusAfter = '#hf-msg'; },
  'live-help-ai-dismiss': () => { U.live.helpSuggest = null; commit(); },
  'live-reconnect': () => { const m = liveModel(); if (!m.error && m.t.p.connection === 'lost') { m.t.p.connection = 'online'; logActivity(m.t.p, 'Device reconnected'); } U.live.offline = false; if (Live.adapter && Live.adapter.kind === 'simulated' && Live.adapter.dropped) Live.adapter.demo('recover'); Live.saved(); commit(); toast('Reconnected. Your progress was restored from the saved session, with nothing duplicated.', 'wifi'); },
  'live-fold': (el) => { const f = el.dataset.f; const cur = el.closest('details').open; U.live[f] = !cur; commit(); },
  'live-demo-toggle': () => { U.liveDemoOpen = !U.liveDemoOpen; commit(); },
  'live-sim': (el) => { const a = Live.adapter; if (!a || a.kind !== 'simulated') return; if (el.dataset.kind === 'guidance') a.stepGuidance(); else a.demo(el.dataset.kind); },
  'live-sim-dup': () => { const m = liveModel(); const last = m.t.p.completed[m.t.p.completed.length - 1]; if (!last) { toast('No step has been completed yet.', 'info'); return; } const r = liveAPI(m).completeStep(last.stepId, `step:${m.trackKey}:${last.stepId}:${S.currentUserId}`); commit(); toast(`Repeated event result: ${r.status}. Progress wasn’t changed.`, 'zap'); },
  'live-sim-offline': () => { const m = liveModel(); m.t.p.connection = 'lost'; m.t.p.activity.push({ at: Date.now(), text: 'Device stopped responding' }); U.live.offline = true; if (Live.adapter && Live.adapter.kind === 'simulated') Live.adapter.demo('drop'); commit(); },
  'live-sim-teammate': () => { const m = liveModel(); const other = m.t.members.find((x) => x !== S.currentUserId); if (!other) return; m.t.p.camera = { holderId: other, holderName: (studentById(other) || {}).name || 'A teammate', deviceLabel: 'Chromebook', since: Date.now(), beat: Date.now() }; if (U.live.cam !== 'off') { Live.stopCam(); m.t.p.camera = { holderId: other, holderName: (studentById(other) || {}).name || 'A teammate', deviceLabel: 'Chromebook', since: Date.now(), beat: Date.now() }; } U.live.camConflict = m.t.p.camera; U.live.viewOnly = true; commit(); toast(`${m.t.p.camera.holderName}’s device is now the group camera. This device follows along.`, 'users'); },
};
const LIVE_CHANGES = {
  'live-ack': () => { if (U.live) { U.live.msg = ''; commit(); } },
  'live-adapter': (el) => { livePrefs().adapterKind = el.value; commit(); },
  'live-mic-pref': (el) => { livePrefs().mic = el.checked; if (Media.stream && !U.live.sim) Live.previewCamera(false); commit(); },
  'live-device': (el) => { livePrefs().deviceId = el.value; Live.previewCamera(false).then(() => { if (U.live && U.live.phase === 'live') { U.live.cam = 'on'; Live.startSampler(); commit(); } }); },
  'live-speak': (el) => { livePrefs().speak = el.checked; if (!el.checked && window.speechSynthesis) speechSynthesis.cancel(); commit(); },
  'live-meas': (el) => { const m = liveModel(); if (m.error) return; const r = liveAPI(m).recordMeasurement(el.dataset.step, el.dataset.label, el.dataset.unit, el.value, `meas:${uid(8)}`); if (r.status === 'ok') Live.saved(); commit(); },
};
const LIVE_SUBMITS = {
  'live-ask': () => Live.ask(),
  'live-help': () => {
    const L = U.live; const m = liveModel(); const h = L.help;
    if (!h.msg.trim()) { h.error = 'Describe the problem so your teacher knows what to bring.'; commit(); return; }
    const res = LabSessionAPI.requestHelp({ eventId: `help:${uid(8)}`, sessionId: m.sess.id, groupId: m.groupId, participantId: S.currentUserId, category: h.cat, message: h.msg.trim(), aiDrafted: h.ai });
    L.help = null; L.helpSuggest = null; Live.saved(); commit();
    toast(res.updated ? `Your group already had an open ${h.cat.toLowerCase()} request, so it was updated instead of duplicated.` : 'Help request sent. You keep your place in line.', 'lifebuoy');
  },
};

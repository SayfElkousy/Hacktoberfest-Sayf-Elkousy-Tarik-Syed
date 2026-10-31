/* =====================================================================
   Bridge to the Student Assistant site (the "student assistant" folder).

   Labby has no server of its own yet, so this runs in the teacher's browser.
   While a session runs it publishes the lab under the session's live code,
   with the period's lab groups as teams, then reads each team's progress back
   into LabSessionAPI so Live Progress and the Help Queue update for real.
   Anyone with the live code can join; they don't need to be in the class.
   A replaced code is closed to new students (those already in keep going),
   and every code is ended when the session ends.

   Everything goes through the session API, so repeats are safe: each write
   has a stable event ID.
   ===================================================================== */
const StudentSite = {
  KEY: 'labby.studentSite',
  POLL_MS: 3000,
  state: 'off', // off | connected | interrupted
  published: {}, // session id -> what was last sent
  retired: new Set(), // codes already closed or ended on the student site
  helpOpen: new Set(),

  config() {
    try { return { url: 'http://localhost:8080', token: '', studentUrl: '', ...JSON.parse(localStorage.getItem(this.KEY) || '{}') }; }
    catch (e) { return { url: 'http://localhost:8080', token: '', studentUrl: '' }; }
  },
  saveConfig(next) {
    try { localStorage.setItem(this.KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable */ }
    this.published = {};
  },
  asked() {
    try { return JSON.parse(localStorage.getItem(`${this.KEY}.asked`) || '{}'); } catch (e) { return {}; }
  },
  saveAsked(asked) {
    try { localStorage.setItem(`${this.KEY}.asked`, JSON.stringify(asked)); } catch (e) { /* storage unavailable */ }
  },

  async call(path, body) {
    const { url, token } = this.config();
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/dashboard${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) { const e = new Error(`Student site returned ${res.status}`); e.status = res.status; throw e; }
    return res.json();
  },
  /** Like call, but a code the student site never saw (404) is fine. */
  async callIfKnown(path, body) {
    try { return await this.call(path, body); } catch (e) { if (e.status === 404) return null; throw e; }
  },

  /** The address students open, with the live code filled in. Empty when it isn't set up. */
  studentAddress() { const a = String(this.config().studentUrl || '').trim().replace(/\/+$/, ''); return /^https?:\/\//i.test(a) ? a : ''; },
  studentLink(code) { const a = this.studentAddress(); return a && code ? `${a}/?code=${encodeURIComponent(code)}` : ''; },

  /** Every running session of the teacher's, each under its own live code. */
  sessions() {
    return S.sessions.filter((s) => (s.status === 'active' || s.status === 'paused') && ensureLiveCode(s));
  },
  /** Codes this session used before, which may still have students working under them. */
  oldCodes(sess) { return (sess.oldLiveCodes || []).filter(Boolean); },

  /** Close replaced codes to new students, and end every code of a finished session. */
  async retire() {
    for (const sess of S.sessions) {
      const ended = sess.status === 'completed';
      if (ended && Date.now() - (sess.endedAt || 0) > 86400000) continue;
      for (const code of this.oldCodes(sess)) {
        const key = `${ended ? 'end' : 'close'}:${code}`;
        if (this.retired.has(key)) continue;
        await this.callIfKnown(`/labs/${encodeURIComponent(code)}/${ended ? 'end' : 'close'}`, {});
        this.retired.add(key);
      }
    }
  },

  labFor(sess) {
    const c = sessionContent(sess);
    const teams = progressFor(sess.id).map((p) => groupById(p.groupId)).filter(Boolean).map((g) => ({ id: g.id, name: g.name }));
    const steps = c.steps.map((s) => `${s.title}: ${s.instructions}`);
    const procedure = [
      c.title,
      c.objectives.length ? `Objectives: ${c.objectives.join('; ')}` : '',
      c.materials.length ? `Equipment: ${c.materials.map((m) => m.name).join(', ')}` : '',
      c.precautions.length ? `Safety: ${c.precautions.join('; ')}` : '',
      ...steps.map((text, i) => `${i + 1}. ${text}`),
    ].filter(Boolean).join('\n');
    return { code: sess.liveCode, procedure, teams, steps };
  },

  async publish(sess) {
    const lab = this.labFor(sess);
    const signature = JSON.stringify(lab);
    if (this.published[sess.id] === signature) return lab.code;
    await this.call('/labs', lab);
    this.published[sess.id] = signature;
    return lab.code;
  },

  /** Plan steps match Labby's steps one to one, so s3 is the third step. */
  stepAt(c, planStepId) {
    return c.steps[Number(String(planStepId).slice(1)) - 1] || null;
  },

  applyTeam(sess, c, team, students) {
    const t = LabSessionAPI.track(sess.id, team.id);
    if (!t) return false;
    const p = ensureProgressShape(t.p);
    let changed = false;

    p.connection = team.online > 0 ? 'online' : p.connection;

    for (const student of students) {
      const joined = `sa-join-${sess.id}-${student.id}`;
      if (!seenEvent(joined)) { markEvent(joined); logActivity(p, `${student.name} joined from the student site`); changed = true; }

      for (const m of student.measurements) {
        const step = this.stepAt(c, m.stepId);
        if (!step) continue;
        const res = LabSessionAPI.recordMeasurement({ eventId: `sa-m-${student.id}-${m.at}`, sessionId: sess.id, groupId: team.id, stepId: step.id, participantId: student.id, label: m.label, unit: m.unit, value: m.value });
        changed = changed || (res && res.status === 'ok');
      }

      for (const a of student.answers) {
        const key = `sa-a-${student.id}-${a.promptId}`;
        if (seenEvent(key)) continue;
        markEvent(key);
        logActivity(p, `${student.name} answered “${a.question}”: ${a.answer} (${a.correct ? 'correct' : 'needs review'})`, a.at);
        changed = true;
      }

      if (student.helpRequested && !this.helpOpen.has(student.id)) {
        this.helpOpen.add(student.id);
        const step = c.steps[Math.min(student.currentStep, c.steps.length - 1)];
        LabSessionAPI.requestHelp({ eventId: `sa-h-${student.id}-${Date.now()}`, sessionId: sess.id, groupId: team.id, participantId: student.id, category: 'Other', message: `${student.name} asked for you on step ${student.currentStep + 1}: ${step.title}` });
        changed = true;
      }
      if (!student.helpRequested) this.helpOpen.delete(student.id);

      if (student.alert) {
        const before = p.aiFlags.length;
        LabSessionAPI.flag({ sessionId: sess.id, groupId: team.id, kind: 'safety', text: student.alert, stepId: c.steps[p.stepIndex].id });
        changed = changed || p.aiFlags.length !== before;
      }
    }

    // A team moves as its furthest member does, one confirmed step at a time.
    for (let i = 0; i < team.stepsDone && i < c.steps.length; i++) {
      const stepId = c.steps[i].id;
      const res = LabSessionAPI.completeStep({ eventId: `sa-step-${sess.id}-${team.id}-${stepId}`, sessionId: sess.id, groupId: team.id, stepId, participantId: null });
      if (res.status === 'ok') changed = true;
      if (res.status === 'blocked') break;
    }

    return changed;
  },

  /** Teacher-written checkpoints reach students as questions; their answers go back through the session API. */
  async runCheckpoint(sess, c, team, codes, students) {
    const t = LabSessionAPI.track(sess.id, team.id);
    const cp = t && t.p.atCheckpoint ? checkpointById(c, t.p.atCheckpoint) : null;
    if (!cp || cp.kind !== 'response' || !cp.questions.length) return false;

    const asked = this.asked();
    const responses = {};
    for (const q of cp.questions) {
      const key = `${team.id}:${cp.id}:${q.id}`;
      const ids = [];
      for (const code of codes) {
        const codeKey = `${code}:${key}`;
        if (!asked[codeKey]) {
          const choices = q.type === 'mc' ? ` Choices: ${q.options.map((o) => o.text).join(', ')}.` : '';
          const r = await this.callIfKnown(`/labs/${encodeURIComponent(code)}/prompts`, { question: `${q.prompt}${choices}`, teamIds: [team.id] });
          if (r && r.sent.length) { asked[codeKey] = r.sent.map((s) => s.promptId); this.saveAsked(asked); }
        }
        ids.push(...(asked[codeKey] || []));
      }
      const reply = students.flatMap((s) => s.answers).find((a) => ids.includes(a.promptId));
      if (!reply) continue;
      if (q.type === 'mc') {
        const said = reply.answer.toLowerCase();
        const choice = q.options.find((o) => said.includes(o.text.toLowerCase()));
        if (choice) responses[q.id] = choice.id;
      } else if (q.type === 'numeric') {
        const number = reply.answer.match(/-?\d+(\.\d+)?/);
        if (number) responses[q.id] = number[0];
      } else responses[q.id] = reply.answer;
    }

    if (Object.keys(responses).length < cp.questions.length) return false;
    const res = LabSessionAPI.saveResponse({ eventId: `sa-cp-${sess.id}-${team.id}-${cp.id}`, sessionId: sess.id, groupId: team.id, checkpointId: cp.id, participantId: t.members[0] || null, responses, submit: true });
    return !!res && res.status === 'ok';
  },

  async tick() {
    if (typeof S === 'undefined' || !S || !this.config().token) { this.state = 'off'; return; }
    try {
      let changed = false;
      await this.retire();
      for (const sess of this.sessions()) {
        const c = sessionContent(sess);
        if (!c || !c.steps.length) continue;
        const code = await this.publish(sess);
        // Students who joined under a replaced code keep working, so read those labs too.
        const reads = [];
        for (const k of [code, ...this.oldCodes(sess)]) { const r = await this.callIfKnown(`/labs/${encodeURIComponent(k)}`); if (r && r.lab && r.lab.plan) reads.push({ code: k, ...r }); }
        const students = reads.flatMap((r) => r.students);
        const teamIds = new Set(reads.flatMap((r) => r.teams.map((t) => t.id)));
        for (const id of teamIds) {
          if (!groupById(id)) continue;
          const parts = reads.flatMap((r) => r.teams.filter((t) => t.id === id));
          const team = { ...parts[0], stepsDone: Math.max(...parts.map((t) => t.stepsDone || 0)), online: parts.reduce((n, t) => n + (t.online || 0), 0) };
          const members = students.filter((s) => s.teamId === id);
          if (this.applyTeam(sess, c, team, members)) changed = true;
          const codes = reads.filter((r) => r.students.some((s) => s.teamId === id)).map((r) => r.code);
          if (await this.runCheckpoint(sess, c, team, codes.length ? codes : [code], members)) changed = true;
        }
      }
      this.state = 'connected';
      if (changed) commit();
    } catch (e) {
      this.state = 'interrupted';
      console.warn(e);
    }
  },

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { this.tick(); }, this.POLL_MS);
  },

  card() {
    const { url, token, studentUrl } = this.config();
    const label = { off: 'Not connected', connected: 'Connected', interrupted: 'Connection interrupted' }[this.state];
    const live = this.sessions();
    return html`<section class="card card-pad stack" aria-labelledby="ss-h">
      <div class="row between"><h2 id="ss-h">Student site</h2><span class="hint">${label}</span></div>
      <p class="small muted">Students open the student site and enter the live session code from Live Progress. They don’t need to be in the class. Each lab group’s progress then appears in Live Progress and the Help Queue while the session runs.</p>
      <div class="form-grid">
        <div class="field"><label class="label" for="ss-url">Address</label><input class="input" id="ss-url" value="${url}"></div>
        <div class="field"><label class="label" for="ss-token">Dashboard token</label><input class="input" id="ss-token" type="password" autocomplete="off" value="${token}"><span class="hint">Printed when the student site’s server starts.</span></div>
        <div class="field"><label class="label" for="ss-student-url">Address students open <span class="opt">(optional)</span></label><input class="input" id="ss-student-url" placeholder="https://192.168.1.20:8443" value="${studentUrl}"><span class="hint">The https:// address the server printed for students. Labby shows it with the live session code and gives students a button that opens it with the code filled in.</span></div>
      </div>
      <div><button class="btn btn-primary" data-action="site-save">Save connection</button></div>
      ${live.length ? html`<div class="field"><label class="label" for="ss-question">Ask active classes a question</label><input class="input" id="ss-question" placeholder="Leave blank to have Gemma write one"></div>
      <div><button class="btn" data-action="site-ask">Send question</button></div>` : ''}
    </section>`;
  },

  actions: {
    'site-save': () => {
      StudentSite.saveConfig({ url: document.getElementById('ss-url').value.trim(), token: document.getElementById('ss-token').value.trim(), studentUrl: document.getElementById('ss-student-url').value.trim() });
      StudentSite.tick().then(() => { toast(StudentSite.state === 'connected' ? 'Connected to the student site.' : 'Couldn’t reach the student site. Check the address and token.', StudentSite.state === 'connected' ? 'check' : 'alert'); commit(); });
    },
    'site-ask': async () => {
      const question = document.getElementById('ss-question').value.trim();
      try {
        for (const sess of StudentSite.sessions()) await StudentSite.callIfKnown(`/labs/${encodeURIComponent(sess.liveCode)}/prompts`, { question });
        toast('Question sent to students.', 'check');
      } catch (e) { toast('Couldn’t reach the student site.', 'alert'); }
    },
  },
};
StudentSite.start();

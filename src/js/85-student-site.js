/* =====================================================================
   Bridge to the Student Assistant site (the "student assistant" folder).

   Labby has no server of its own yet, so this runs in the teacher's browser.
   While a session is active it publishes the lab under the class join code,
   with the period's lab groups as teams, then reads each team's progress back
   into LabSessionAPI so Live Progress and the Help Queue update for real.

   Everything goes through the session API, so repeats are safe: each write
   has a stable event ID.
   ===================================================================== */
const StudentSite = {
  KEY: 'labby.studentSite',
  POLL_MS: 3000,
  state: 'off', // off | connected | interrupted
  published: {}, // session id -> what was last sent
  helpOpen: new Set(),

  config() {
    try { return { url: 'http://localhost:8080', token: '', ...JSON.parse(localStorage.getItem(this.KEY) || '{}') }; }
    catch (e) { return { url: 'http://localhost:8080', token: '' }; }
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
    if (!res.ok) throw new Error(`Student site returned ${res.status}`);
    return res.json();
  },

  /** The newest active session for each class, since students join by the class code. */
  sessions() {
    const byClass = new Map();
    S.sessions.filter((s) => s.status === 'active').forEach((s) => {
      const held = byClass.get(s.classId);
      if (!held || (s.startedAt || 0) > (held.startedAt || 0)) byClass.set(s.classId, s);
    });
    return [...byClass.values()];
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
    return { code: classById(sess.classId).joinCode, procedure, teams, steps };
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
  async runCheckpoint(sess, c, team, code, students) {
    const t = LabSessionAPI.track(sess.id, team.id);
    const cp = t && t.p.atCheckpoint ? checkpointById(c, t.p.atCheckpoint) : null;
    if (!cp || cp.kind !== 'response' || !cp.questions.length) return false;

    const asked = this.asked();
    const responses = {};
    for (const q of cp.questions) {
      const key = `${team.id}:${cp.id}:${q.id}`;
      if (!asked[key]) {
        const choices = q.type === 'mc' ? ` Choices: ${q.options.map((o) => o.text).join(', ')}.` : '';
        const { sent } = await this.call(`/labs/${encodeURIComponent(code)}/prompts`, { question: `${q.prompt}${choices}`, teamIds: [team.id] });
        if (sent.length) { asked[key] = sent.map((s) => s.promptId); this.saveAsked(asked); }
        continue;
      }
      const reply = students.flatMap((s) => s.answers).find((a) => asked[key].includes(a.promptId));
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
      for (const sess of this.sessions()) {
        const c = sessionContent(sess);
        if (!c || !c.steps.length) continue;
        const code = await this.publish(sess);
        const { lab, students, teams } = await this.call(`/labs/${encodeURIComponent(code)}`);
        if (!lab.plan) continue;
        for (const team of teams) {
          if (!groupById(team.id)) continue;
          const members = students.filter((s) => s.teamId === team.id);
          if (this.applyTeam(sess, c, team, members)) changed = true;
          if (await this.runCheckpoint(sess, c, team, code, members)) changed = true;
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
    const { url, token } = this.config();
    const label = { off: 'Not connected', connected: 'Connected', interrupted: 'Connection interrupted' }[this.state];
    const live = this.sessions();
    return html`<section class="card card-pad stack" aria-labelledby="ss-h">
      <div class="row between"><h2 id="ss-h">Student site</h2><span class="hint">${label}</span></div>
      <p class="small muted">Students join with the class code. Each lab group’s progress then appears in Live Progress and the Help Queue while a session is active.</p>
      <div class="form-grid">
        <div class="field"><label class="label" for="ss-url">Address</label><input class="input" id="ss-url" value="${url}"></div>
        <div class="field"><label class="label" for="ss-token">Dashboard token</label><input class="input" id="ss-token" type="password" autocomplete="off" value="${token}"><span class="hint">Printed when the student site’s server starts.</span></div>
      </div>
      <div><button class="btn btn-primary" data-action="site-save">Save connection</button></div>
      ${live.length ? html`<div class="field"><label class="label" for="ss-question">Ask active classes a question</label><input class="input" id="ss-question" placeholder="Leave blank to have Gemma write one"></div>
      <div><button class="btn" data-action="site-ask">Send question</button></div>` : ''}
    </section>`;
  },

  actions: {
    'site-save': () => {
      StudentSite.saveConfig({ url: document.getElementById('ss-url').value.trim(), token: document.getElementById('ss-token').value.trim() });
      StudentSite.tick().then(() => { toast(StudentSite.state === 'connected' ? 'Connected to the student site.' : 'Couldn’t reach the student site. Check the address and token.', StudentSite.state === 'connected' ? 'check' : 'alert'); commit(); });
    },
    'site-ask': async () => {
      const question = document.getElementById('ss-question').value.trim();
      try {
        for (const sess of StudentSite.sessions()) await StudentSite.call(`/labs/${encodeURIComponent(classById(sess.classId).joinCode)}/prompts`, { question });
        toast('Question sent to students.', 'check');
      } catch (e) { toast('Couldn’t reach the student site.', 'alert'); }
    },
  },
};
StudentSite.start();

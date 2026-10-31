/* =====================================================================
   Teacher additions for the student phase: release settings, Preview
   as Student, join links, checkpoint review in Live Progress.
   ===================================================================== */
function releaseSection(lab) {
  if (!lab.release) lab.release = { ...RELEASE_DEFAULTS };
  const idx = S.labs.indexOf(lab); const rel = releaseOf(lab);
  const c = (S.ui.editorDraft && S.ui.editorDraft.labId === lab.id ? S.ui.editorDraft.content : latestVersion(lab).content);
  const preset = Object.entries(RELEASE_PRESETS).find(([, pr]) => Object.entries(pr.rules).every(([k, v]) => rel[k] === v));
  return html`<section class="card card-pad stack" aria-labelledby="rel-h">
    <div class="row between wrap"><h2 id="rel-h">Student Visibility & Release</h2><button class="btn btn-sm" data-action="preview-student" data-lid="${lab.id}">${icon('eye', 'sm')}Preview as Student</button></div>
    <p class="hint">Changes apply right away, including to sessions already assigned. Students always see the title, date and length once the lab is published. Teacher-only notes and answer keys are never sent to students.</p>
    <div class="chips" role="group" aria-label="Release presets">${Object.entries(RELEASE_PRESETS).map(([k, pr]) => html`<button class="chip" aria-pressed="${!!preset && preset[0] === k}" data-action="rel-preset" data-lid="${lab.id}" data-preset="${k}" title="${pr.hint}">${pr.label}</button>`)}</div>
    <div class="stack tight">${RELEASE_SECTIONS.map(([k, label]) => html`<div class="rel-row"><label for="rel-${k}" class="small strong">${label}</label>
      <select class="select sm" id="rel-${k}" data-bind="labs.${idx}.release.${k}" data-type="str">${options(stageOptions(c, k), rel[k])}</select></div>`)}</div>
    ${checkField({ label: 'After the session, students can revisit released instructions and their own responses', id: 'rel-revisit', bind: `labs.${idx}.release.revisit`, checked: rel.revisit })}
    <p class="hint">${icon('clipboard', 'sm')} Checkpoints are released one at a time, right after a group completes the step they follow. Answer feedback is set on each checkpoint.</p>
  </section>`;
}
function studentPreviewModal() {
  const m = U.modal; const lab = labById(m.labId); const v = latestVersion(lab); const c = v.content;
  const cls = myClasses()[0];
  const fake = { id: 'preview', labId: lab.id, versionId: v.id, classId: cls ? cls.id : '', periodIds: cls ? [cls.periods[0].id] : [], scheduledFor: todayISO(), scheduledTime: '', published: true, autoOpen: false };
  const n = Math.min(m.done || 0, c.steps.length);
  const view = studentLabView(fake, null, { status: m.stage, done: new Set(c.steps.slice(0, m.stage === 'completed' ? c.steps.length : n).map((s) => s.id)) });
  const stages = [['scheduled', 'Before the session'], ['active', 'During the session'], ['completed', 'After the session']];
  return modalShell({ title: 'Preview as Student', sub: `Exactly what a student sees at each stage, from saved version ${v.number}. Unsaved edits aren’t included.`, wide: true,
    body: html`<div class="row wrap" role="group" aria-label="Release stage">${stages.map(([k, l]) => html`<button class="chip" aria-pressed="${m.stage === k}" data-action="pv-stage" data-stage="${k}">${l}</button>`)}
      ${m.stage === 'active' ? html`<label class="small strong" for="pv-done">Steps completed by the group</label><select class="select sm" id="pv-done" style="width:auto" data-bind="U.modal.done" data-type="int">${options(c.steps.map((s, i) => [i, String(i)]).concat([[c.steps.length, String(c.steps.length)]]), n)}</select>` : ''}</div>
      ${view ? studentLabDetail(view, { preview: true }) : html`<p>Assign this lab to a class to preview it.</p>`}`,
    foot: html`<button class="btn" data-action="modal-close">Close preview</button>` });
}
function joinLink(cls, periodId = '') { return `${location.origin}${location.pathname}#join/${cls.joinCode}${periodId ? '/' + periodId : ''}`; }
function joinLinksBlock(cls) {
  const idx = S.classes.indexOf(cls);
  return html`<details class="join-links"${attr(U.joinLinksOpen, 'open')}><summary class="small strong" style="cursor:pointer" data-action="fold-ui" data-key-name="joinLinksOpen">${icon('send', 'sm')} Join links and settings</summary>
    <div class="stack tight" style="margin-top:8px">
      <div class="row between panel"><span class="small">Whole class <span class="muted">(students pick their period)</span></span><button class="btn btn-xs" data-action="copy-link" data-link="${joinLink(cls)}">${icon('copy', 'sm')}Copy link</button></div>
      ${cls.periods.map((p) => html`<div class="row between panel"><span class="small">${p.name} only</span><span class="row"><button class="btn btn-xs" data-action="copy-link" data-link="${joinLink(cls, p.id)}">${icon('copy', 'sm')}Copy link</button><a class="btn btn-xs btn-ghost" href="#join/${cls.joinCode}/${p.id}">Try it</a></span></div>`)}
      <span class="hint">Links contain the current code, so regenerating the code turns old links off too. In this demo, links open Labby in this browser.</span>
      ${checkField({ label: 'Accept new students with this code and its links', id: `jl-on-${cls.id}`, bind: `classes.${idx}.joinEnabled`, checked: cls.joinEnabled !== false, hint: 'Turn off to stop new joins without changing the code. Enrolled students aren’t affected.' })}
    </div></details>`;
}
function tileExtras(p) {
  const out = [];
  const flag = (p.aiFlags || []).slice(-1)[0];
  if (flag && Date.now() - flag.at < 15 * MIN) out.push(html`<span class="pill tone-warn" title="${flag.text}">${icon('sparkles')}AI flag (model-generated): ${flag.kind === 'help' ? 'may need help' : 'camera view unclear'}</span>`);
  if (p.camera && Date.now() - p.camera.beat < 90000) out.push(html`<span class="tag">${icon('eye', 'sm')}Camera: ${p.camera.holderName}</span>`);
  if ((p.joined || []).length) out.push(html`<span class="tag">${icon('users', 'sm')}${plural(p.joined.length, 'student')} in the live session</span>`);
  return out.length ? html`<div class="gt-flags">${out}</div>` : '';
}
function drawerExtras(p, sess, c) {
  const t = classTrack(sess, p.groupId);
  const released = c.checkpoints.filter((cp) => p.gates && p.gates[cp.id]);
  const flags = (p.aiFlags || []).slice().reverse();
  return html`<section class="drawer-section"><h3>Checkpoints</h3>
      ${released.length ? released.map((cp) => { const st = Engine.gateState(t, cp); const recs = cpRecordsOf(t.key, t.groupId, cp.id).filter((r) => r.submittedAt);
        return html`<div class="panel row between wrap" data-key="dcp-${cp.id}"><span class="small"><strong>${cp.title}</strong><br>${recs.length ? `${plural(recs.length, 'response')} submitted` : cp.kind === 'info' ? 'Informational' : 'No response yet'} · ${st.waitingOn === 'approval' ? 'approval pending' : st.waitingOn === 'revision' ? 'returned for revision' : st.approval === 'approved' ? 'approved' : st.satisfied ? 'complete' : 'in progress'}</span>
          <button class="btn btn-sm ${st.waitingOn === 'approval' ? 'btn-primary' : ''}" data-action="cp-review" data-pid="${p.id}" data-cp="${cp.id}">${st.waitingOn === 'approval' ? 'Review and approve' : 'View responses'}</button></div>`; })
        : html`<p class="small muted">None released yet.</p>`}</section>
    <section class="drawer-section"><h3>AI flags <span class="tag">model-generated</span></h3>
      ${flags.length ? html`<ul class="timeline">${flags.slice(0, 5).map((f) => html`<li><span class="xs muted mono">${fmtClock(f.at)}</span><span class="small">${f.kind === 'help' ? 'Suggested teacher help' : 'Camera view unclear'}: ${f.text}</span></li>`)}</ul>` : html`<p class="small muted">None. Only flags that need you are shown here, not every AI message.</p>`}
      ${p.camera ? html`<p class="small">${icon('eye', 'sm')} Group camera: ${p.camera.holderName}${p.camera.deviceLabel ? ` (${p.camera.deviceLabel})` : ''}. Video isn’t shared with teachers.</p>` : ''}</section>`;
}
function cpReviewModal() {
  const m = U.modal; const p = S.progress.find((x) => x.id === m.pid); if (!p) return '';
  const sess = sessionById(p.sessionId); const c = sessionContent(sess); const cp = checkpointById(c, m.cpId); const t = classTrack(sess, p.groupId); const g = groupById(p.groupId);
  const st = Engine.gateState(t, cp); const recs = cpRecordsOf(t.key, t.groupId, cp.id);
  return modalShell({ title: `${g.name}: ${cp.title}`, sub: `${cpRuleText(cp)}. Checkpoint approvals are separate from the Help Queue.`, wide: true,
    body: html`${cp.questions.length ? (recs.length ? recs.map((r) => html`<div class="panel stack tight" data-key="rv-${r.id}"><div class="row wrap"><strong>${r.studentId ? (studentById(r.studentId) || {}).name || 'Student' : 'Group response'}</strong><span class="xs muted">${r.submittedAt ? `Submitted ${fmtClock(r.submittedAt)}${r.submissions > 1 ? ` (attempt ${r.submissions})` : ''}` : 'Draft, not submitted'}</span>${r.simulated ? simTag('Sample answers') : ''}${r.status === 'returned' ? html`<span class="pill tone-bad">${icon('reopen')}Returned</span>` : ''}</div>
        ${cp.questions.map((q) => { const a = r.responses[q.id]; const opt = q.type === 'mc' ? q.options.find((o) => o.id === a) : null; const key = q.type === 'mc' && q.correct ? q.options.find((o) => o.id === q.correct) : null;
          return html`<div class="small"><span class="strong">${q.prompt}</span><br>${a ? (opt ? opt.text : `${a}${q.unit ? ' ' + q.unit : ''}`) : html`<span class="muted">No answer</span>`}
            ${key ? html` <span class="tag" style="${a === q.correct ? 'background:var(--ok-soft);color:var(--ok)' : 'background:var(--bad-soft);color:var(--bad)'}">${a === q.correct ? 'Correct' : `Correct answer: ${key.text}`}</span>` : ''}</div>`; })}</div>`)
        : html`<p class="muted">No responses yet.</p>`) : html`<p>${cp.info || 'No questions. This checkpoint asks you to check the group in person.'}</p>`}
      ${st.approval === 'approved' ? html`<div class="notice ok">${icon('checkCircle')}<div>Approved ${fmtClock(t.p.gates[cp.id].approvedAt)}.</div></div>` : ''}
      ${cp.approvalRequired && st.approval !== 'approved' ? textareaField({ label: 'Note to the group if you return it', id: 'rv-note', bind: 'U.modal.note', value: m.note || '', rows: 2, opt: true }) : ''}`,
    foot: cp.approvalRequired && st.approval !== 'approved' ? html`<button class="btn" data-action="modal-close">Close</button><button class="btn btn-danger" data-action="cp-return"${attr(!st.responded && cp.kind === 'response', 'disabled')}>${icon('reopen', 'sm')}Return for revision</button><button class="btn btn-primary" data-action="cp-approve"${attr(!st.responded || !st.correctOk, 'disabled')}>${icon('check', 'sm')}Approve and let them continue</button>`
      : html`<button class="btn" data-action="modal-close">Close</button>` });
}
const TEACHER2_ACTIONS = {
  'cp-add': (el) => { const c = getPath(S, el.dataset.path); normalizeContent(c); const st = c.steps.find((x) => x.id === el.dataset.sid); c.checkpoints.push({ ...blankCheckpoint(el.dataset.sid), title: st ? `Check after: ${st.title}` : '' }); commit(); },
  'cp-image-remove': (el) => { getPath(S, el.dataset.path).image = null; commit(); },
  'q-add': (el) => { getPath(S, el.dataset.path).push(blankQuestion(el.dataset.type)); commit(); },
  'opt-add': (el) => { getPath(S, el.dataset.path).push({ id: uid(), text: '' }); commit(); },
  'opt-remove': (el) => { const q = getPath(S, el.dataset.path); const [o] = q.options.splice(+el.dataset.index, 1); if (o && q.correct === o.id) q.correct = null; commit(); },
  'q-clear-correct': (el) => { getPath(S, el.dataset.path).correct = null; commit(); },
  'mf-add': (el) => { getPath(S, el.dataset.path).push({ id: uid(), name: '', unit: '' }); commit(); },
  'ref-add': (el) => { getPath(S, el.dataset.path).push({ title: '', url: '' }); commit(); },
  'rel-preset': (el) => { const lab = labById(el.dataset.lid); lab.release = { ...releaseOf(lab), ...RELEASE_PRESETS[el.dataset.preset].rules }; commit(); toast(`Release set to “${RELEASE_PRESETS[el.dataset.preset].label}”.`); },
  'preview-student': (el) => { U.modal = { type: 'student-preview', labId: el.dataset.lid, stage: 'scheduled', done: 0 }; commit(); },
  'pv-stage': (el) => { U.modal.stage = el.dataset.stage; if (el.dataset.stage === 'active' && !U.modal.done) U.modal.done = 0; commit(); },
  'copy-link': (el) => copyText(el.dataset.link),
  'fold-ui': (el) => { const k = el.dataset.keyName; U[k] = !U[k]; commit(); },
  'cp-review': (el) => { U.modal = { type: 'cp-review', pid: el.dataset.pid, cpId: el.dataset.cp, note: '' }; commit(); },
  'cp-approve': () => { const m = U.modal; const p = S.progress.find((x) => x.id === m.pid); const sess = sessionById(p.sessionId); Engine.approve(classTrack(sess, p.groupId), m.cpId, S.currentUserId); U.modal = null; commit(); toast(`Approved. ${groupById(p.groupId).name} can continue.`, 'check'); },
  'cp-return': () => { const m = U.modal; const p = S.progress.find((x) => x.id === m.pid); const sess = sessionById(p.sessionId); Engine.returnForRevision(classTrack(sess, p.groupId), m.cpId, m.note, S.currentUserId); U.modal = null; commit(); toast(`Returned to ${groupById(p.groupId).name} for revision.`, 'reopen'); },
};
const TEACHER2_CHANGES = {
  'cp-image': async (el) => { const f = el.files && el.files[0]; el.value = ''; if (!f) return; try { getPath(S, el.dataset.path).image = { name: f.name, dataUrl: await readImageDataUrl(f) }; commit(); } catch (e) { toast(e.message, 'alert'); } },
  'q-type': (el) => { const q = getPath(S, el.dataset.path); q.type = el.value; if (q.type === 'mc' && q.options.length < 2) q.options = [{ id: uid(), text: '' }, { id: uid(), text: '' }]; if (q.type !== 'mc') q.correct = null; commit(); },
  'q-correct': (el) => { getPath(S, el.dataset.path).correct = el.dataset.oid; commit(); },
  'att-pick': async (el) => {
    const f = el.files && el.files[0]; el.value = ''; if (!f) return;
    if (f.size > 15 * 1024 * 1024) { toast('Attachments must be under 15 MB.', 'alert'); return; }
    const key = `att_${uid(10)}`;
    try { await FileVault.put(key, f); getPath(S, el.dataset.path).push({ id: uid(), name: f.name, type: f.type || 'application/octet-stream', size: f.size, key }); commit(); toast(`Attached ${f.name}.`); }
    catch (e) { toast('This browser couldn’t store the file.', 'alert'); }
  },
  'as-publish': (el) => { const a = S.assignments.find((x) => x.id === el.dataset.aid); a.published = el.checked; commit(); toast(a.published ? 'Published. Students in these periods can see the lab now.' : 'Unpublished. Students no longer see this lab.', a.published ? 'eye' : 'lock'); },
};

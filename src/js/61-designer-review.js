/* =====================================================================
   AI revisions as review cards: nothing changes until the teacher accepts.
   ===================================================================== */
function applyRevisionTo(d, res) {
  if (res.groupSize && res.groupSize >= 1 && res.groupSize <= 8) d.logistics.groupSize = res.groupSize;
  if (res.labMinutes && res.labMinutes > 0) d.logistics.labMinutes = res.labMinutes;
  for (const u of res.inventoryUpdates || []) {
    const item = d.inventory.find((i) => i.name.trim().toLowerCase() === String(u.name || '').trim().toLowerCase()) || d.inventory.find((i) => normName(i.name).some((w) => normName(u.name).includes(w)));
    if (item && Number.isFinite(+u.quantity) && +u.quantity >= 0) item.qty = +u.quantity;
  }
  if (res.plan) d.plan = res.plan;
}
function proposeRevision(res, source) {
  const d = S.designer;
  const d2 = clone(d); applyRevisionTo(d2, res);
  const unchanged = JSON.stringify(stripIds(d2.plan)) === JSON.stringify(stripIds(d.plan)) && d2.logistics.groupSize == d.logistics.groupSize && d2.logistics.labMinutes == d.logistics.labMinutes && JSON.stringify(d2.inventory) === JSON.stringify(d.inventory);
  if (unchanged) { pushMsg({ role: 'assistant', source, text: res.reply }); d.pending = null; return; }
  const b = computeResources(d.plan, d), a = computeResources(d2.plan, d2);
  const mats = a.materials.map((m) => { const o = b.materials.find((x) => x.name === m.name); return o && (o.total !== m.total || o.status !== m.status) ? `${m.name}: ${fmtQty(o.total)} → ${fmtQty(m.total)}${m.status !== o.status ? ` (${m.status === 'ok' ? 'now enough' : m.note || m.status})` : ''}` : null; }).filter(Boolean);
  d.pending = { id: uid(), source, res, at: Date.now(), changes: res.changes || [], reason: res.reply,
    time: [b.time.total, a.time.total, a.time.available], groups: [b.totalGroups, a.totalGroups], problems: [b.issues.filter((i) => i.sev === 'bad').length, a.issues.filter((i) => i.sev === 'bad').length], mats };
  pushMsg({ role: 'assistant', source, text: `${res.reply}\n\nReview the proposed change on the plan before it’s applied.` });
}
function reviewCard(d) {
  const p = d.pending;
  return html`<section class="review-card" aria-labelledby="rc-h" data-key="rc-${p.id}">
    <div class="rc-head"><strong id="rc-h" class="row">${icon('sparkles', 'sm')}Proposed change</strong>${p.source === 'live' ? html`<span class="tag live">Live AI</span>` : simTag('Simulated')}</div>
    <div class="rc-body">
      <div class="stack tight"><span class="eyebrow">Suggested change</span>${p.changes.length ? html`<ul class="ul-plain small">${p.changes.map((c) => html`<li>${c}</li>`)}</ul>` : html`<p class="small">Updates the plan as described.</p>`}</div>
      <div class="stack tight"><span class="eyebrow">Reason</span><p class="small">${p.reason}</p></div>
      <div class="stack tight"><span class="eyebrow">Effect on time</span><p class="small num">${p.time[0]} → <strong>${p.time[1]}</strong> of ${p.time[2]} min${p.time[1] > p.time[2] ? ' (still over)' : ''}</p></div>
      <div class="stack tight"><span class="eyebrow">Effect on groups and materials</span><p class="small num">Groups: ${p.groups[0]} → <strong>${p.groups[1]}</strong> · problems to resolve: ${p.problems[0]} → <strong>${p.problems[1]}</strong></p>${p.mats.length ? html`<ul class="ul-plain xs">${p.mats.slice(0, 5).map((m) => html`<li>${m}</li>`)}</ul>` : ''}</div>
    </div>
    <div class="rc-foot"><button class="btn btn-primary" data-action="rc-accept">${icon('check', 'sm')}Accept</button><button class="btn" data-action="rc-edit">${icon('pencil', 'sm')}Accept and edit</button><button class="btn btn-ghost" data-action="rc-reject">${icon('x', 'sm')}Reject</button>
      <span class="xs muted" style="align-self:center">Labby recalculated these numbers; the AI didn’t.</span></div>
  </section>`;
}
function liveCodeChip(sess) {
  if (!ensureLiveCode(sess)) return '';
  return html`<span class="code-chip live-code-chip"><span class="xs strong">Live session code</span><span class="mono" id="live-code-${sess.id}" aria-label="Live session code ${sess.liveCode.split('').join(' ')}">${sess.liveCode}</span>
    <button class="btn btn-xs btn-primary" data-action="copy-live-code" data-sid="${sess.id}">${icon('copy', 'sm')}Copy</button>
    <button class="btn btn-xs" data-action="live-code-show" data-sid="${sess.id}">${icon('eye', 'sm')}Show to class</button>
    <button class="btn btn-xs btn-ghost" data-action="live-code-regen-ask" data-sid="${sess.id}">${icon('refresh', 'sm')}New code</button></span>`;
}
function joinCodeChip(cls) {
  return html`<span class="code-chip"><span class="xs strong">Class code</span><span class="mono">${cls.joinCode}</span><button class="btn btn-xs btn-primary" data-action="copy-code" data-cid="${cls.id}">${icon('copy', 'sm')}Copy code</button></span>`;
}
function recentWork(labs) {
  const done = labs.filter((x) => x.view.status === 'completed');
  const mine = S.cpRecords.filter((r) => r.submittedAt && (r.submittedBy === S.currentUserId || (!r.studentId && studentEnrollments(S.currentUserId).length))).length;
  return html`<section class="card" aria-labelledby="so-recent"><div class="card-head"><h2 id="so-recent">Recent work</h2></div>
    <div class="card-body">${done.length ? done.slice(0, 4).map((x) => html`<div class="mini-group" style="grid-template-columns:minmax(0,1fr) auto"><div class="stack tight"><a class="lib-title" href="#s/lab/${x.a.id}">${x.view.title}</a><span class="xs muted">${x.view.className} · ${fmtSchedule(x.a)}</span></div>${studentPill('completed')}</div>`)
      : html`<p class="small muted">Labs you finish show up here with your saved answers.</p>`}</div></section>`;
}
const RESEARCH_ACTIONS = {
  'rc-accept': () => { const d = S.designer; const p = d.pending; if (!p) return; d.pending = null; applyRevision(p.res, p.source); commit(); toast('Change accepted. Highlighted steps changed.'); },
  'rc-edit': () => { const d = S.designer; const p = d.pending; if (!p) return; d.pending = null; applyRevision(p.res, p.source); d.editing = true; commit(); },
  'rc-reject': () => { const d = S.designer; d.pending = null; pushMsg({ role: 'assistant', source: 'labby', text: 'Rejected. The plan wasn’t changed.' }); commit(); },
  's-search-clear': () => { S.ui.sLabQuery = ''; S.ui.topQ = ''; commit(); },
};
const RESEARCH_SUBMITS = {
  'global-search': () => { const q = (S.ui.topQ || '').trim(); const ws = workspaceOfRoute(U.route.name); if (ws === 'teacher') { S.ui.libQuery = q; S.ui.libStatus = 'all'; go('library'); } else { S.ui.sLabQuery = q; S.ui.sLabFilter = 'all'; go('s/labs'); } commit(); },
};

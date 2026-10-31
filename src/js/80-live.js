/* =====================================================================
   Live Progress: one card per group, pacing chart, group detail panel.
   Data source: S.progress + S.help, shaped like the realtime events a
   production backend would push from students' devices.
   ===================================================================== */
const shortGroup = (name) => { const m = /^bench\s*(\d+)/i.exec(name); return m ? `B${m[1]}` : initials(name); };
const naturalCmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });

function liveView() {
  if (!myClasses().length) return html`<div class="card">${emptyState({ ico: 'activity', title: 'No classes yet', text: 'Create a class and assign a lab to see live progress here.', actions: html`<a class="btn btn-primary" href="#class-new">Create class</a>` })}</div>`;
  const ctx = ensureCtx(); const sess = sessionById(ctx.sessionId);
  if (!sess || sess.classId !== ctx.classId || (ctx.periodId && sess.periodId !== ctx.periodId)) {
    return html`<div class="card">${emptyState({ ico: 'calendar', title: 'No lab sessions here yet', text: 'Assign a lab to this class and period. Its session will appear in the selector above.', actions: html`<button class="btn btn-primary" data-action="assign-open" data-cid="${ctx.classId}">${icon('send')}Assign a lab</button>` })}</div>`;
  }
  const c = sessionContent(sess); const now = Date.now();
  const cls = classById(sess.classId); const lab = labById(sess.labId); const v = versionById(lab, sess.versionId);
  const ps = progressFor(sess.id);
  const statuses = new Map(ps.map((p) => [p.id, groupStatus(p, sess, c, now)]));
  const counts = Object.fromEntries(GROUP_STATUS_ORDER.map((k) => [k, 0]));
  statuses.forEach((s) => counts[s.key]++);
  const filter = S.ui.liveFilter || 'all';
  const sortKey = S.ui.liveSort || 'name';
  let list = ps.filter((p) => filter === 'all' || statuses.get(p.id).key === filter);
  list.sort((a, b) => {
    const ga = groupById(a.groupId), gb = groupById(b.groupId);
    if (sortKey === 'progress') return b.completed.length - a.completed.length || naturalCmp(ga.name, gb.name);
    if (sortKey === 'activity') return (a.lastActivityAt || 0) - (b.lastActivityAt || 0) || naturalCmp(ga.name, gb.name);
    return naturalCmp(ga.name, gb.name);
  });
  const elapsed = sessionElapsed(sess, now); const planned = plannedMinutes(c) * MIN;
  const groupsAvailable = groupsIn(sess.classId, sess.periodId).length;
  const openHelp = S.help.filter((h) => h.sessionId === sess.id && h.status !== 'resolved').length;
  return html`<div class="stack loose">
    <section class="card card-pad stack" aria-labelledby="ls-title">
      <div class="session-head">
        <div class="stack tight" style="min-width:0"><div class="row wrap">${sessionPill(sess.status)}<span class="tag">${icon('lock', 'sm')}Version ${v.number}</span></div>
          <h2 id="ls-title" style="font-size:1.4rem">${c.title}</h2><span class="small muted">${cls.name} · ${periodName(cls.id, sess.periodId)} · ${plural(ps.length || groupsAvailable, 'group')}</span></div>
        ${sess.status === 'scheduled' ? html`<div class="stack tight" style="align-items:flex-end"><span class="small muted">Scheduled ${sess.scheduledFor === todayISO() ? 'for today' : 'for ' + fmtDate(new Date(sess.scheduledFor + 'T12:00').getTime())} · ${plannedMinutes(c)} min planned</span>
          ${groupsAvailable ? html`<button class="btn btn-primary" data-action="session-start" data-sid="${sess.id}">${icon('play')}Start session</button>`
            : html`<a class="btn" href="#class-${cls.id}" data-action="class-period-go" data-cid="${cls.id}" data-pid="${sess.periodId}">${icon('layers')}Arrange lab groups first</a>`}</div>`
          : html`<div class="clock-block">
            <div><div class="k">Elapsed</div><div class="v">${tickSession(sess, 'elapsed')}</div></div>
            <div><div class="k">${elapsed <= planned ? 'Planned time left' : 'Past planned time'}</div><div class="v">${tickSession(sess, 'remaining')}</div></div>
            <div><div class="k">Planned</div><div class="v">${plannedMinutes(c)} min</div></div></div>`}
        ${sess.status === 'active' ? html`<div class="row"><button class="btn" data-action="session-pause" data-sid="${sess.id}">${icon('pause')}Pause</button><button class="btn btn-danger" data-action="session-end-ask" data-sid="${sess.id}">${icon('stopCircle')}End session</button></div>`
          : sess.status === 'paused' ? html`<div class="row"><button class="btn btn-primary" data-action="session-resume" data-sid="${sess.id}">${icon('play')}Resume</button><button class="btn btn-danger" data-action="session-end-ask" data-sid="${sess.id}">${icon('stopCircle')}End session</button></div>`
          : sess.status === 'completed' ? html`<span class="small muted">Ended ${fmtDayTime(sess.endedAt)}</span>` : ''}
      </div>
      ${sess.status === 'paused' ? html`<div class="notice warn">${icon('pause')}<div>Paused at ${fmtClock(sess.pausedAt)}. Session and step timers are frozen; help request wait times keep counting.</div></div>` : ''}
      ${sess.status !== 'scheduled' && ps.length ? pacingChart(sess, c, ps, statuses, now) : ''}
    </section>
    ${sess.status === 'scheduled' ? html`<div class="card">${emptyState({ ico: 'play', title: 'This session hasn’t started', text: groupsAvailable ? `When you start it, ${plural(groupsAvailable, 'group')} can begin step 1 and their progress will appear here.` : 'This period has no lab groups yet. Arrange students into groups on the class page, then start the session.', compact: true })}</div>` : html`
    <div class="live-tools">
      <div class="chips" role="group" aria-label="Filter groups by status">
        <button class="chip" aria-pressed="${filter === 'all'}" data-action="live-filter" data-f="all">All<span class="count">${ps.length}</span></button>
        ${GROUP_STATUS_ORDER.map((k) => html`<button class="chip" aria-pressed="${filter === k}" data-action="live-filter" data-f="${k}"${attr(!counts[k] && filter !== k, 'aria-disabled', 'true')}>${icon(GROUP_STATUS[k].icon, 'sm')}${GROUP_STATUS[k].label}<span class="count">${counts[k]}</span></button>`)}
      </div>
      <div class="row wrap">
        <label class="small strong" for="live-sort">Sort</label>
        <select class="select sm" id="live-sort" style="width:auto" data-bind="ui.liveSort" data-type="str">${options([['name', 'Group name'], ['progress', 'Most progress'], ['activity', 'Longest since activity']], sortKey)}</select>
        ${behindExplainer()}
      </div>
    </div>
    ${list.length ? html`<div class="groups-grid">${list.map((p) => groupTile(p, sess, c, statuses.get(p.id), now))}</div>`
      : html`<div class="card">${emptyState({ ico: 'search', title: 'No groups with this status', text: 'Choose another filter to see the rest of the class.', compact: true, actions: html`<button class="btn btn-sm" data-action="live-filter" data-f="all">Show all groups</button>` })}</div>`}`}
    ${sess.status === 'active' || sess.status === 'paused' ? demoPanel(sess, ps) : ''}
    ${openHelp ? html`<p class="small"><a href="#help">${icon('lifebuoy', 'sm')} ${plural(openHelp, 'open help request')} for this session in the Help Queue</a></p>` : ''}
  </div>
  ${U.drawer ? groupDrawer(U.drawer) : ''}`;
}

function behindExplainer() {
  const t = S.settings.behindMinutes;
  return html`<details class="explain"${attr(U.explainOpen, 'open')}><summary data-action="explain-toggle" aria-expanded="${!!U.explainOpen}">${icon('info', 'sm')}How “May Be Behind” works</summary>
    ${U.explainOpen ? html`<div class="explain-pop" role="note">
      <p>A group is flagged when the session clock is more than <strong>${t} minutes</strong> past the planned finish of the step it’s on. Planned finish is setup time plus the step times up to that step.</p>
      <p class="small muted">It’s a prompt to check in, not a grade. A lost connection or a quiet group is never flagged as behind for that reason alone. Paused time doesn’t count.</p>
      <div class="row"><label class="small strong" for="behind-t">Flag after</label>
        <select class="select sm" id="behind-t" style="width:auto" data-bind="settings.behindMinutes" data-type="int">${options([2, 3, 5, 8, 10, 15].map((n) => [n, `${n} min past plan`]), t)}</select></div>
    </div>` : ''}</details>`;
}

function pacingChart(sess, c, ps, statuses, now) {
  const n = c.steps.length; const plannedIdx = plannedStepAt(c, sessionElapsed(sess, now));
  const cols = Array.from({ length: n + 1 }, () => []);
  ps.forEach((p) => cols[p.finishedAt ? n : p.stepIndex].push(p));
  const desc = cols.map((list, i) => `${i < n ? 'Step ' + (i + 1) : 'Finished'}: ${list.length ? list.map((p) => groupById(p.groupId).name).join(', ') : 'none'}`).join('; ');
  return html`<div class="pacing" role="img" aria-label="Pacing: where each group is. The plan expects groups on ${plannedIdx < n ? 'step ' + (plannedIdx + 1) : 'cleanup or done'} now. ${desc}.">
    <div class="row between wrap" style="margin-bottom:6px"><span class="eyebrow">Pacing</span><span class="xs muted">${plannedIdx < n ? html`Plan says step <strong>${plannedIdx + 1}</strong> by now (shaded)` : 'Plan says all steps should be done'}</span></div>
    <div class="pacing-cols" style="grid-template-columns:repeat(${n + 1}, minmax(0, 1fr))" aria-hidden="true">
      ${cols.map((list, i) => html`<div class="pacing-col ${i === plannedIdx ? 'planned' : ''}"><div class="pacing-stack">${list.map((p) => { const g = groupById(p.groupId); const st = GROUP_STATUS[statuses.get(p.id).key]; return html`<span class="pacing-dot tone-${st.tone}" title="${g.name}: ${st.label}">${shortGroup(g.name)}</span>`; })}</div>
        <span class="pacing-label">${i < n ? i + 1 : '✓'}</span></div>`)}
    </div></div>`;
}

function groupTile(p, sess, c, gs, now) {
  const g = groupById(p.groupId); const done = new Set(p.completed.map((x) => x.index));
  const help = openHelpForGroup(sess.id, p.groupId);
  const step = c.steps[p.stepIndex];
  const cls = { behind: 'st-behind', waiting: 'st-waiting', lost: 'st-lost' }[gs.key] || '';
  return html`<article class="group-tile ${cls} ${U.drawer === p.id ? 'sel' : ''}" data-action="group-open" data-pid="${p.id}" data-key="gt-${p.id}">
    <div class="gt-head"><div class="stack tight" style="min-width:0"><button class="link-btn gt-name" style="text-decoration:none;color:var(--ink)" data-action="group-open" data-pid="${p.id}" aria-label="Open details for ${g.name}">${g.name}</button>
      <span class="gt-members">${memberNames(g).map((n) => n.split(' ')[0]).join(', ')}</span></div>${groupPill(gs.key)}</div>
    <div class="gt-step">${p.finishedAt ? html`<strong>Finished</strong> at ${fmtClock(p.finishedAt)}` : html`<span class="muted">Step ${p.stepIndex + 1} of ${c.steps.length}</span> · <strong>${step.title}</strong>`}</div>
    <div class="stack tight">${segs(c.steps.length, done, p.stepIndex, !!p.finishedAt, `${done.size} of ${c.steps.length} steps complete`)}<span class="xs muted num">${done.size}/${c.steps.length} steps complete</span></div>
    <div class="gt-meta">
      <span>On this step<br><b>${tickStep(p, sess)}</b>${step && step.minutes && !p.finishedAt ? html` <span class="xs">/ ${step.minutes}:00 planned</span>` : ''}</span>
      <span>Last activity<br><b>${p.lastActivityAt ? tickSince(p.lastActivityAt, 'ago') : 'none yet'}</b></span>
    </div>
    ${gs.key === 'behind' ? html`<span class="small" style="color:var(--warn)">${icon('hourglass', 'sm')} ${fmtMins(gs.behindMs)} past the planned finish of this step</span>` : ''}
    ${gs.key === 'lost' ? html`<span class="small muted">${icon('wifiOff', 'sm')} Device not responding. The group may still be working.</span>` : ''}
    ${p.atCheckpoint || help.length ? html`<div class="gt-flags">
      ${p.atCheckpoint ? cpFlag(p, sess, c) : ''}
      ${help.map((h) => html`<span class="pill tone-${HELP_STATUS[h.status].tone}">${icon('lifebuoy')}${h.category} · ${HELP_STATUS[h.status].label} ${tickSince(h.createdAt)}</span>`)}
    </div>` : ''}
  </article>`;
}

function groupDrawer(pid) {
  const p = S.progress.find((x) => x.id === pid); if (!p) return '';
  const sess = sessionById(p.sessionId); const c = sessionContent(sess); const g = groupById(p.groupId);
  const gs = groupStatus(p, sess, c); const step = c.steps[p.stepIndex];
  const help = S.help.filter((h) => h.sessionId === sess.id && h.groupId === g.id).sort((a, b) => a.createdAt - b.createdAt);
  const open = help.filter((h) => h.status !== 'resolved');
  return html`<div class="drawer-scrim" data-action="drawer-close" data-key="drawer-scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-title" data-key="drawer">
    <div class="drawer-head"><div class="stack tight grow"><h2 id="dr-title">${g.name}</h2><span class="small muted">${memberNames(g).join(', ')}</span><div>${groupPill(gs.key)}</div></div>
      <button class="btn btn-ghost btn-icon" data-action="drawer-close" aria-label="Close group details">${icon('x')}</button></div>
    <div class="drawer-body">
      <section class="drawer-section"><h3>${p.finishedAt ? 'Finished' : 'Current step'}</h3>
        ${p.finishedAt ? html`<p>All ${c.steps.length} steps done at ${fmtClock(p.finishedAt)}.</p>` : html`<div class="panel stack tight"><strong>Step ${p.stepIndex + 1}: ${step.title}</strong><span class="small">${step.instructions}</span>
          <span class="xs muted">On this step ${tickStep(p, sess)} · planned ${step.minutes || '?'} min${gs.key === 'behind' ? ` · ${fmtMins(gs.behindMs)} past plan` : ''}</span></div>`}</section>
      <section class="drawer-section"><h3>Pending teacher approvals</h3>
        ${p.atCheckpoint ? cpFlag(p, sess, c, true) : html`<p class="small muted">None.</p>`}</section>
      <section class="drawer-section"><h3>Open help requests</h3>
        ${open.length ? open.map((h) => html`<div class="panel stack tight" data-key="dh-${h.id}"><div class="row wrap">${catTag(h.category)}${helpPill(h.status)}<span class="xs muted">waiting ${tickSince(h.createdAt)}</span></div>
          <span class="small" style="white-space:pre-wrap">${h.message}</span>
          <div class="row wrap">${h.status === 'waiting' ? html`<button class="btn btn-sm" data-action="help-start" data-hid="${h.id}">${icon('users', 'sm')}Start helping</button>` : ''}<button class="btn btn-sm" data-action="help-resolve" data-hid="${h.id}">${icon('check', 'sm')}Mark resolved</button><a class="btn btn-sm btn-ghost" href="#help" data-action="drawer-close">Open queue</a></div></div>`)
          : html`<p class="small muted">None.${help.length ? ` ${plural(help.length, 'request')} resolved earlier.` : ''}</p>`}</section>
      <section class="drawer-section"><h3>Measurements and observations</h3>
        ${p.observations.length ? html`<div class="table-wrap"><table class="obs-table"><thead><tr><th>Step</th><th>Recorded</th><th class="num">Value</th><th class="num">Time</th></tr></thead>
          <tbody>${[...p.observations].sort((a, b) => a.stepIndex - b.stepIndex || a.at - b.at).map((o) => html`<tr><td class="num">${o.stepIndex + 1}</td><td>${o.label}</td><td class="num mono">${o.value}${o.unit ? ' ' + o.unit : ''}</td><td class="num xs">${fmtClock(o.at)}</td></tr>`)}</tbody></table></div>` : html`<p class="small muted">Nothing recorded yet.</p>`}</section>
      <section class="drawer-section"><h3>Completed steps</h3>
        ${p.completed.length ? html`<ul class="done-steps">${p.completed.map((x) => html`<li>${icon('checkCircle', 'sm')}<span>${x.index + 1}. ${c.steps[x.index].title}</span><span class="xs muted mono" style="margin-left:auto">${fmtClock(x.at)}</span></li>`)}</ul>` : html`<p class="small muted">None yet.</p>`}</section>
      <section class="drawer-section"><h3>Recent activity</h3>
        <ul class="timeline">${[...p.activity].sort((a, b) => b.at - a.at).slice(0, 10).map((a) => html`<li><span class="xs muted mono">${fmtClock(a.at)}</span><span>${a.text}</span></li>`)}</ul></section>
    </div>
  </aside>`;
}

function demoPanel(sess, ps) {
  const gid = ps.some((p) => p.id === S.ui.demoGroupId) ? S.ui.demoGroupId : (ps[0] && ps[0].id);
  const p = ps.find((x) => x.id === gid);
  const cat = S.ui.demoCat || 'Equipment';
  const msg = S.ui.demoMsg ?? SAMPLE_HELP[cat][0];
  return html`<details class="demo-panel"${attr(U.demoOpen, 'open')} data-key="demo-panel"><summary data-action="demo-toggle" aria-expanded="${!!U.demoOpen}">${icon('zap')}Demo controls: simulate student events${icon('chevDown', 'sm')}</summary>
    ${U.demoOpen ? html`<div class="demo-body">
      <p class="small">In the real app these events come from students’ devices. Here you trigger them to try the teacher workflow.${sess.status === 'paused' ? ' The session is paused; events still arrive.' : ''}</p>
      <div class="row wrap"><label class="small strong" for="demo-g">Group</label>
        <select class="select sm" id="demo-g" style="width:auto" data-bind="ui.demoGroupId" data-type="str">${options([...ps].sort((a, b) => naturalCmp(groupById(a.groupId).name, groupById(b.groupId).name)).map((x) => [x.id, groupById(x.groupId).name]), gid)}</select>
        <button class="btn btn-sm btn-demo" data-action="demo-advance" data-pid="${gid}">${icon('arrowRight', 'sm')}Complete current step</button>
        <button class="btn btn-sm btn-demo" data-action="demo-record" data-pid="${gid}">${icon('ruler', 'sm')}Record a measurement</button>
        <button class="btn btn-sm btn-demo" data-action="demo-conn" data-pid="${gid}">${icon(p && p.connection === 'lost' ? 'wifi' : 'wifiOff', 'sm')}${p && p.connection === 'lost' ? 'Reconnect device' : 'Drop connection'}</button>
      </div>
      <form class="stack tight" data-submit="demo-help">
        <div class="row wrap"><label class="small strong" for="demo-cat">Help request</label>
          <select class="select sm" id="demo-cat" style="width:auto" data-change="demo-cat">${options(Object.keys(HELP_CATEGORIES), cat)}</select></div>
        <label class="sr-only" for="demo-msg">Student message</label>
        <textarea class="textarea" id="demo-msg" rows="2" style="min-height:48px" data-bind="ui.demoMsg" data-type="str">${msg}</textarea>
        <div class="row wrap"><button class="btn btn-sm btn-demo" type="submit">${icon('lifebuoy', 'sm')}Submit help request as this group</button>
          <span class="xs muted">A second request in the same category updates the open one instead of adding a duplicate.</span></div>
      </form>
      ${checkField({ label: 'Play random student events every few seconds', id: 'demo-auto', bind: 'demo.autoplay', checked: S.demo.autoplay })}
    </div>` : ''}</details>`;
}

function endSessionModal() {
  const sess = sessionById(U.modal.sid); const ps = progressFor(sess.id);
  const unfinished = ps.filter((p) => !p.finishedAt).length; const open = S.help.filter((h) => h.sessionId === sess.id && h.status !== 'resolved').length;
  return modalShell({ title: 'End this session?', body: html`<p>${labTitle(labById(sess.labId))} · ${periodName(sess.classId, sess.periodId)}</p>
    <ul class="ul-plain">${unfinished ? html`<li>${plural(unfinished, 'group')} haven’t finished. Their progress and measurements are kept.</li>` : html`<li>All groups have finished.</li>`}
      ${open ? html`<li>${plural(open, 'help request')} still open. They stay in the Help Queue.</li>` : ''}<li>Students can’t record anything after the session ends.</li></ul>`,
  foot: html`<button class="btn" data-action="modal-close">Keep running</button><button class="btn btn-danger solid" data-action="session-end" data-sid="${sess.id}">${icon('stopCircle')}End session</button>` });
}

/* Autoplay: random events across online groups in active sessions. */
function autoplayTick() {
  const sessions = mySessions().filter((s) => s.status === 'active');
  if (!sessions.length) return;
  const sess = sessions[Math.floor(Math.random() * sessions.length)];
  const ps = progressFor(sess.id).filter((p) => !p.finishedAt);
  if (!ps.length) return;
  const p = ps[Math.floor(Math.random() * ps.length)]; const g = groupById(p.groupId);
  const r = Math.random();
  if (p.connection === 'lost') { if (r < 0.5) { Sim.toggleConnection(p); toast(`${g.name} reconnected.`, 'wifi'); } return; }
  if (r < 0.55) { const res = Sim.advance(p, sess); if (res === 'requested') toast(`${g.name} is waiting for your checkpoint approval.`, 'clipboard'); }
  else if (r < 0.75) Sim.record(p, sess);
  else if (r < 0.88 && !openHelpForGroup(sess.id, p.groupId).length) { const cats = Object.keys(SAMPLE_HELP); const cat = cats[Math.floor(Math.random() * cats.length)]; Sim.help(p, sess, cat, SAMPLE_HELP[cat][Math.floor(Math.random() * SAMPLE_HELP[cat].length)]); toast(`${g.name} asked for help (${cat}).`, 'lifebuoy'); }
  else if (r < 0.92) { Sim.toggleConnection(p); }
}

/** Checkpoint status for a group: response, approval pending, or returned. */
function cpFlag(p, sess, c, wide = false) {
  const cp = checkpointById(c, p.atCheckpoint); if (!cp) return '';
  const st = Engine.gateState(classTrack(sess, p.groupId), cp);
  const label = st.waitingOn === 'approval' ? 'Approval pending' : st.waitingOn === 'revision' ? 'Returned for revision' : st.waitingOn === 'correct' ? 'Revising answers' : 'Working on response';
  const btn = st.approval === 'pending' ? html`<button class="btn btn-xs btn-primary" data-action="checkpoint-approve" data-pid="${p.id}">${icon('check', 'sm')}Approve</button>` : '';
  return wide ? html`<div class="panel row between wrap"><span>${icon('clipboard')} <strong>${cp.title}</strong> · ${label}</span>${btn}</div>`
    : html`<span class="pill tone-wait">${icon('clipboard')}${cp.title} · ${label}</span>${btn}`;
}

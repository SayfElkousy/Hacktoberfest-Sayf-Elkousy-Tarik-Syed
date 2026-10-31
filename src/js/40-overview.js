/* =====================================================================
   Overview: what am I teaching, what's running, how far along, who needs me.
   ===================================================================== */
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

function overviewView() {
  const user = me();
  const classes = myClasses();
  const quick = html`<div class="quick" role="group" aria-label="Quick actions">
    <a class="quick-btn" href="#class-new"><span class="qi">${icon('plus')}</span><span>Create Class<small>Get a join code</small></span></a>
    <a class="quick-btn" href="#designer"><span class="qi">${icon('sparkles')}</span><span>Plan a Lab with AI<small>Draft from your equipment</small></span></a>
    <a class="quick-btn" href="#import"><span class="qi">${icon('upload')}</span><span>Upload Procedure<small>PDF, DOCX or text</small></span></a>
    <button class="quick-btn" data-action="open-live-quick"><span class="qi">${icon('activity')}</span><span>Open Live Session<small>Follow groups in class</small></span></button>
  </div>`;
  const intro = html`<div class="page-intro"><div class="stack tight"><p class="eyebrow">${fmtDateLong(Date.now())}</p><h2 style="font-size:1.45rem">${greeting()}, ${user.name.split(' ')[0]}.</h2></div></div>`;
  if (!classes.length) {
    return html`${intro}<div class="stack loose">${quick}
      <div class="card">${emptyState({ ico: 'flask', title: 'Set up your first class', text: 'Labby works in three steps. Start by creating a class so students have a code to join.',
        actions: html`<a class="btn btn-primary" href="#class-new">${icon('plus')}Create class</a><a class="btn" href="#designer">${icon('sparkles')}Plan a lab first</a>` })}
        <div style="padding:0 20px 26px;display:flex;justify-content:center"><div class="flow">
          <div class="flow-step"><span class="n">1</span><strong>Create a class</strong><span class="small muted">Add your periods and share the join code.</span></div>
          <div class="flow-step"><span class="n">2</span><strong>Plan or upload a lab</strong><span class="small muted">Use the AI Lab Designer or import a procedure you already have.</span></div>
          <div class="flow-step"><span class="n">3</span><strong>Run it live</strong><span class="small muted">Assign it to a period, then follow groups and answer help requests.</span></div>
        </div></div></div></div>`;
  }
  const sessions = sortedSessions(mySessions());
  const running = sessions.find((s) => s.status === 'active' || s.status === 'paused');
  const next = sessions.filter((s) => s.status === 'scheduled').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0];
  return html`${intro}<div class="stack loose">
    ${quick}
    <div class="grid grid-main-side">
      ${running ? activeLabCard(running) : noActiveCard(next)}
      ${helpPreviewCard()}
    </div>
    <section class="stack" aria-labelledby="ov-classes">
      <div class="row between"><h2 id="ov-classes">Your classes</h2><a class="btn btn-sm" href="#classes">All classes</a></div>
      <div class="grid grid-3">${classes.map(classCard)}</div>
    </section>
  </div>`;
}

function sessionSummary(sess) {
  const c = sessionContent(sess); const ps = progressFor(sess.id); const now = Date.now();
  const st = ps.map((p) => groupStatus(p, sess, c, now).key);
  const unresolved = S.help.filter((h) => h.sessionId === sess.id && h.status !== 'resolved').length;
  return { c, ps, finished: st.filter((k) => k === 'completed').length, working: st.filter((k) => k !== 'completed').length, behind: st.filter((k) => k === 'behind').length, waiting: st.filter((k) => k === 'waiting').length, lost: st.filter((k) => k === 'lost').length, unresolved };
}

function activeLabCard(sess) {
  const sm = sessionSummary(sess); const c = sm.c; const now = Date.now();
  const remaining = plannedMinutes(c) * MIN - sessionElapsed(sess, now);
  const rows = [...sm.ps].sort((a, b) => groupById(a.groupId).name.localeCompare(groupById(b.groupId).name, undefined, { numeric: true }));
  return html`<section class="card" aria-labelledby="ov-active">
    <div class="card-head"><div class="stack tight"><span class="eyebrow">Active lab</span><h2 id="ov-active">${c.title}</h2>
      <span class="small muted">${classById(sess.classId).name} · ${periodName(sess.classId, sess.periodId)}</span></div><div class="row wrap">${liveCodeChip(sess)}${sessionPill(sess.status)}</div></div>
    <div class="card-body stack loose">
      <div class="clock-block">
        <div><div class="k">Elapsed</div><div class="v">${tickSession(sess, 'elapsed')}</div></div>
        <div><div class="k">${remaining >= 0 ? 'Planned time left' : 'Past planned time'}</div><div class="v">${tickSession(sess, 'remaining')}</div></div>
        <div><div class="k">Planned length</div><div class="v">${plannedMinutes(c)} min</div></div>
      </div>
      <div class="stat-line" role="list">
        <div class="stat" role="listitem"><b>${sm.working}</b><span>groups working</span></div>
        <div class="stat" role="listitem"><b>${sm.finished}</b><span>finished</span></div>
        <div class="stat" role="listitem"><b>${sm.behind}</b><span>may be behind</span></div>
        <div class="stat" role="listitem"><b>${sm.unresolved}</b><span>unresolved help ${sm.unresolved === 1 ? 'request' : 'requests'}</span></div>
      </div>
      <div><h3 class="eyebrow" style="margin-bottom:4px">Group progress</h3>
        ${rows.map((p) => {
          const g = groupById(p.groupId); const gs = groupStatus(p, sess, c, now); const done = new Set(p.completed.map((x) => x.index));
          return html`<div class="mini-group" data-key="mg-${p.id}"><strong>${g.name}</strong>
            <div class="stack tight" style="min-width:0"><span class="small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.finishedAt ? 'All steps done' : html`Step ${p.stepIndex + 1}/${c.steps.length} · ${c.steps[p.stepIndex].title}`}</span>
              ${segs(c.steps.length, done, p.stepIndex, !!p.finishedAt, `${done.size} of ${c.steps.length} steps complete`)}</div>
            <span class="pill-col">${groupPill(gs.key)}</span></div>`;
        })}
      </div>
    </div>
    <div class="card-foot"><button class="btn btn-primary" data-action="open-session" data-sid="${sess.id}" data-where="live">${icon('activity')}Open Live Progress</button>
      <span class="small muted">Statuses update as students work. In this demo, live events come from the demo controls.</span></div>
  </section>`;
}

function noActiveCard(next) {
  return html`<section class="card" aria-labelledby="ov-active">
    <div class="card-head"><div class="stack tight"><span class="eyebrow">Active lab</span><h2 id="ov-active">No lab is running</h2></div>${sessionPill(next ? 'scheduled' : 'completed')}</div>
    <div class="card-body">${next ? html`<div class="stack"><p>Next up: <strong>${labTitle(labById(next.labId))}</strong> with ${classById(next.classId).name} · ${periodName(next.classId, next.periodId)}, scheduled ${next.scheduledFor === todayISO() ? 'today' : fmtDate(new Date(next.scheduledFor + 'T12:00').getTime())}.</p>
      <div class="row wrap"><button class="btn btn-primary" data-action="open-session" data-sid="${next.id}" data-where="live">${icon('play')}Go to session</button></div></div>`
      : emptyState({ ico: 'calendar', title: 'Nothing scheduled', text: 'Assign a lab to a class period and it will show up here when it’s time to start.', compact: true, actions: html`<a class="btn btn-primary" href="#library">${icon('send')}Assign a lab</a>` })}</div>
  </section>`;
}

function helpPreviewCard() {
  const open = myHelp().filter((h) => h.status !== 'resolved').sort((a, b) => a.createdAt - b.createdAt);
  const longMs = (S.settings.longWaitMinutes || 5) * MIN;
  return html`<section class="card" aria-labelledby="ov-help">
    <div class="card-head"><div class="row"><h2 id="ov-help">Help queue</h2><span class="badge ${open.length ? '' : 'zero'}">${open.length}</span></div><a class="btn btn-sm" href="#help">Open queue</a></div>
    <div class="card-body">${open.length ? html`<div>${open.slice(0, 4).map((h, i) => {
      const g = groupById(h.groupId);
      return html`<div class="q-item" data-key="qp-${h.id}"><span class="q-pos" aria-label="Position ${i + 1}">${i + 1}</span>
        <div class="stack tight" style="min-width:0"><div class="row wrap" style="gap:6px"><strong>${groupLabel(g)}</strong>${catTag(h.category)}</div>
          <span class="xs muted">${classById(h.classId).name} · ${shortPeriod(periodName(h.classId, h.periodId))} · step ${h.stepIndex + 1}</span>
          ${helpPill(h.status)}</div>
        <div class="stack tight" style="text-align:right"><span class="xs muted">Waiting</span><span class="mono strong ${Date.now() - h.createdAt > longMs ? '' : ''}" style="${Date.now() - h.createdAt > longMs ? 'color:var(--warn)' : ''}">${tickSince(h.createdAt)}</span></div></div>`;
    })}${open.length > 4 ? html`<p class="small muted" style="padding-top:8px">${plural(open.length - 4, 'more request')} in the queue.</p>` : ''}</div>`
      : emptyState({ ico: 'lifebuoy', title: 'No one is waiting', text: 'New requests appear here in the order students send them.', compact: true })}</div>
  </section>`;
}

function classCard(cls) {
  const total = enrolledCount(cls.id); const expected = sum(cls.periods.map((p) => p.expected));
  const ss = sortedSessions(S.sessions.filter((s) => s.classId === cls.id));
  const live = ss.find((s) => s.status === 'active' || s.status === 'paused');
  const next = ss.filter((s) => s.status === 'scheduled').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0];
  const lab = live || next;
  return html`<article class="card class-card" data-key="cc-${cls.id}">
    <div class="stack tight"><h3>${cls.name}</h3><span class="small muted">${cls.subject} · ${cls.level}</span></div>
    <div class="period-chips">${cls.periods.map((p) => html`<span class="period-chip">${shortPeriod(p.name)} · ${enrolledCount(cls.id, p.id)}</span>`)}</div>
    <span class="small"><strong class="num">${total}</strong> students enrolled <span class="muted">of ${expected} expected</span></span>
    <div class="next-lab">${lab ? html`<span class="eyebrow">${live ? 'Active now' : 'Next lab'}</span><span class="small strong">${labTitle(labById(lab.labId))}</span>
      <span class="xs muted">${periodName(lab.classId, lab.periodId)} · ${live ? SESSION_STATUS[live.status].label : lab.scheduledFor === todayISO() ? 'Today' : fmtDate(new Date(lab.scheduledFor + 'T12:00').getTime())}</span>`
      : html`<span class="eyebrow">Next lab</span><span class="small muted">No lab assigned yet</span>`}</div>
    <div class="row"><a class="btn btn-sm" href="#class-${cls.id}">Open class ${icon('arrowRight', 'sm')}</a><span class="mono small muted" aria-label="Join code">${cls.joinCode}</span></div>
  </article>`;
}

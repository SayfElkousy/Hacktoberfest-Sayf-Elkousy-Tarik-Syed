/* =====================================================================
   App shell: demo band, sidebar, top bar, profile menu, toasts.
   ===================================================================== */
function demoBand() {
  const user = me();
  const current = user ? (user.demo ? user.id : 'own') : 'out';
  const demoUsers = S.users.filter((u) => u.demo);
  const roleLabel = (u) => (u.role === 'independent' ? (u.title || 'Independent') : cap(u.role));
  return html`<div class="demo-band" data-key="demo-band"><div class="demo-band-inner">
    <span class="demo-tag">${icon('zap', 'sm')}Demo mode</span>
    <span class="demo-text long">Sign-in is simulated and data stays in this browser. Simulated AI, file reading and live student events are labeled where they appear.</span><span class="demo-text short">Simulated sign-in. Data stays in this browser.</span>
    <span class="demo-switch"><label for="demo-role">Demo role switcher</label>
      <select id="demo-role" data-change="demo-role">
        ${current === 'own' ? html`<option value="own" selected>${user.name} (your account)</option>` : ''}
        ${options([...demoUsers.map((u) => [u.id, `${roleLabel(u)} · ${u.name}`]), ['out', 'Signed out (see sign-up)']], current)}
      </select></span>
    <button class="btn btn-xs btn-demo" data-action="demo-reset-ask">${icon('refresh', 'sm')}Reset demo data</button>
  </div></div>`;
}

const NAV = [
  ['overview', 'Overview', 'grid'], ['classes', 'Classes', 'users'], ['designer', 'Lab Designer', 'sparkles'],
  ['library', 'Procedures & Lab Library', 'book'], ['live', 'Live Progress', 'activity'], ['help', 'Help Queue', 'lifebuoy'], ['prefs', 'Settings', 'sliders'],
];
const NAV_MATCH = { class: 'classes', 'class-new': 'classes', lab: 'library', import: 'library' };
function sidebar(route) {
  const active = NAV_MATCH[route.name] || route.name;
  const open = myHelp().filter((h) => h.status !== 'resolved').length;
  const user = me();
  return html`<nav class="sidebar ${U.navOpen ? 'open' : ''}" id="sidebar" aria-label="Teacher navigation" data-key="sidebar">
    <a class="brand" href="#overview"><span class="brand-mark">${BRAND_MARK}</span><span class="brand-name">Labby</span></a>
    ${workspaceSwitcher('teacher')}
    <div class="nav">
      ${NAV.map(([key, label, ico]) => html`<a href="#${key}"${attr(active === key, 'aria-current', 'page')}>${icon(ico)}<span>${label}</span>
        ${key === 'help' ? html`<span class="badge ${open ? '' : 'zero'}" aria-label="${plural(open, 'unresolved request')}">${open}</span>` : ''}</a>`)}
    </div>
    <div class="sidebar-foot stack tight">
      <div class="row"><span class="avatar sm">${initials(user.name)}</span><div class="grow"><div class="small strong">${user.name}</div><div class="xs muted">${user.school || 'Teacher'}</div></div></div>
    </div>
  </nav>${U.navOpen ? html`<div class="scrim" data-action="nav-close" data-key="nav-scrim"></div>` : ''}`;
}

function ctxSelectors(page) {
  const ctx = ensureCtx();
  const classes = myClasses();
  if (!classes.length) return '';
  const cls = classById(ctx.classId);
  const sessions = sortedSessions(mySessions().filter((s) => s.classId === ctx.classId && (!ctx.periodId || s.periodId === ctx.periodId)));
  const label = (s) => `${labTitle(labById(s.labId))} · ${shortPeriod(periodName(s.classId, s.periodId))} · ${SESSION_STATUS[s.status].label}${s.status === 'completed' && s.endedAt ? ' ' + fmtDate(s.endedAt) : ''}`;
  return html`<div class="ctx" role="group" aria-label="Class, period and lab session">
    <label class="sr-only" for="ctx-class">Class</label>
    <select class="select sm" id="ctx-class" data-change="ctx-class">${options(classes.map((c) => [c.id, c.name]), ctx.classId)}</select>
    <label class="sr-only" for="ctx-period">Class period</label>
    <select class="select sm" id="ctx-period" data-change="ctx-period">${options([['', 'All periods'], ...(cls ? cls.periods.map((p) => [p.id, p.name]) : [])], ctx.periodId)}</select>
    <label class="sr-only" for="ctx-session">Lab session</label>
    <select class="select sm" id="ctx-session" data-change="ctx-session">${sessions.length ? options(sessions.map((s) => [s.id, label(s)]), ctx.sessionId) : html`<option value="">No lab sessions</option>`}</select>
  </div>`;
}

function topbar(title, ctx = '', ws = 'teacher') {
  const user = me();
  return html`<header class="topbar" data-key="topbar"><div class="topbar-inner">
    <button class="btn btn-ghost btn-icon menu-btn" data-action="nav-open" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="${U.navOpen}">${icon('menu')}</button>
    <h1 id="page-title" tabindex="-1">${title}</h1>
    ${ctx}
    <div class="profile">
      <button class="profile-btn" data-action="menu-toggle" aria-haspopup="menu" aria-expanded="${U.menu}" aria-label="Account menu for ${user.name}">
        ${avatarEl(user)}<span class="hide-sm small strong">${displayName(user).split(' ')[0]}</span>${icon('chevDown', 'sm')}</button>
      ${U.menu ? html`<div class="menu" role="menu" data-key="profile-menu">
        <div class="menu-head"><div class="strong">${user.name}</div><div class="small muted">${user.email}</div><div class="xs muted" style="margin-top:4px">${WORKSPACES[ws].label}${user.school ? ' · ' + user.school : ''}</div></div>
        <a class="menu-item" role="menuitem" href="#${{ teacher: 'prefs', student: 's/profile', research: 'r/settings' }[ws]}" data-action="menu-close">${icon('user')}Profile & settings</a>
        <button class="menu-item" role="menuitem" data-action="signout">${icon('logout')}Sign out</button>
      </div>` : ''}
    </div>
  </div></header>`;
}

function teacherShell(route, title, body, ctx = '') {
  return html`${demoBand()}<div class="app">
    ${sidebar(route)}
    <div class="main">${topbar(title, ctx)}<main class="content" id="main" tabindex="-1" data-key="main-${route.name}">${body}</main></div>
  </div>`;
}

function toastsView() {
  return html`<div class="toasts" role="status" aria-live="polite" data-key="toasts">${U.toasts.map((t) => html`<div class="toast" data-key="t-${t.id}">${icon(t.ico)}<span class="grow">${t.text}</span><button data-action="toast-close" data-id="${t.id}" aria-label="Dismiss">${icon('x', 'sm')}</button></div>`)}</div>`;
}

/* ---------- Student & independent placeholders (next phase) ---------- */
function placeholderView(role) {
  const user = me();
  const isStudent = role === 'student';
  const items = isStudent
    ? [['key', 'Join a class', 'Enter the teacher’s class code, then pick your period.'], ['flask', 'Assigned labs', 'See labs your teacher assigned, with materials and safety notes.'], ['listOrdered', 'Step-by-step guidance', 'Work through each step, record measurements, and ask for teacher checks.'], ['lifebuoy', 'Ask for help', 'Send a question to your teacher’s help queue without leaving your bench.']]
    : [['sparkles', 'Plan an experiment', 'Use the AI assistant to plan with the equipment you have.'], ['book', 'Personal lab library', 'Save procedures and reuse them.'], ['listOrdered', 'Guided runs', 'Follow your own procedure step by step and log results.'], ['bars', 'Results', 'Keep measurements and observations in one place.']];
  return html`${demoBand()}<main class="placeholder-wrap" id="main" tabindex="-1">
    <div class="row between wrap">
      <a class="brand" href="#${role}" style="padding:0"><span class="brand-mark">${BRAND_MARK}</span><span class="brand-name">Labby</span></a>
      <div class="row"><span class="avatar">${initials(user.name)}</span><div><div class="strong small">${user.name}</div><div class="xs muted">${isStudent ? 'Student' : 'Independent'} account</div></div>
        <button class="btn btn-sm" data-action="signout">${icon('logout', 'sm')}Sign out</button></div>
    </div>
    <div class="card card-pad stack">
      <span class="pill tone-idle" style="align-self:flex-start">${icon('clock')}Coming in the next phase</span>
      <h1 id="page-title" tabindex="-1">${isStudent ? 'Student dashboard' : 'Independent dashboard'}</h1>
      <p class="muted" style="max-width:62ch">You’re signed in with a${isStudent ? ' student' : 'n independent'} account, so Labby sent you here. This page is a placeholder: the route and layout are ready, and the full ${isStudent ? 'student' : 'independent'} experience will be designed in the next phase.</p>
      <ul class="plan-list">${items.map(([ico, t, d]) => html`<li>${icon(ico)}<div><div class="strong">${t}</div><div class="small muted">${d}</div></div></li>`)}</ul>
    </div>
    <p class="small muted">Want to see the finished part of the prototype? Use the demo role switcher above and choose Teacher.</p>
  </main>`;
}

/* ---------- Workspaces (shared by Student and Research) ---------- */
function avatarEl(user, cls = '') {
  const url = user && user.profile && user.profile.avatar;
  return url ? html`<img class="avatar ${cls}" src="${url}" alt="">` : html`<span class="avatar ${cls}" aria-hidden="true">${initials(user ? user.name : '?')}</span>`;
}
function workspaceSwitcher(current) {
  const ws = workspacesFor(me());
  if (ws.length < 2) return html`<div class="ws-switch"><span class="eyebrow">Workspace</span><span class="small strong">${WORKSPACES[current].label}</span></div>`;
  return html`<div class="ws-switch"><label class="eyebrow" for="ws-select">Workspace</label>
    <select id="ws-select" class="select sm" data-change="workspace">${options(ws.map((k) => [k, WORKSPACES[k].label]), current)}</select></div>`;
}
const WS_NAV = {
  student: [['s/overview', 'Overview', 'grid'], ['s/classes', 'My Classes', 'users'], ['s/labs', 'My Labs', 'flask'], ['s/live', 'Live Session', 'activity'], ['s/profile', 'Profile & Settings', 'user']],
  research: [['r/overview', 'Overview', 'grid'], ['r/projects', 'Projects', 'layers'], ['r/protocols', 'Protocols', 'listOrdered'], ['r/runs', 'Experiments & Results', 'bars'], ['r/explore', 'Explore Public Labs', 'compass'], ['r/shared', 'Shared with Me', 'users'], ['r/inventory', 'Materials & Equipment', 'archive'], ['r/settings', 'Settings', 'sliders']],
};
const WS_NAV_MATCH = { 's/class': 's/classes', 's/join': 's/classes', 's/lab': 's/labs', 'r/project': 'r/projects', 'r/protocol': 'r/protocols', 'r/import': 'r/protocols', 'r/run': 'r/runs', 'r/compare': 'r/runs', 'r/new-run': 'r/runs', 'r/public': 'r/explore' };
function wsSidebar(ws, route) {
  const active = WS_NAV_MATCH[route.name] || route.name; const user = me();
  const liveCount = ws === 'student' ? studentAssignments(user.id).filter((x) => x.sess && sessionOpen(x.sess, x.a) && x.sess.status !== 'completed').length : 0;
  const review = ws === 'research' ? researchReviewQueue(user.id).length : 0;
  return html`<nav class="sidebar ${U.navOpen ? 'open' : ''}" id="sidebar" aria-label="${WORKSPACES[ws].label} navigation" data-key="sidebar-${ws}">
    <a class="brand" href="#${WORKSPACES[ws].home}"><span class="brand-mark">${BRAND_MARK}</span><span class="brand-name">Labby</span></a>
    ${workspaceSwitcher(ws)}
    ${ws === 'research' ? html`<div class="new-wrap"><button class="btn btn-primary" style="width:100%" data-action="new-menu" aria-haspopup="menu" aria-expanded="${!!U.newMenu}">${icon('plus')}New</button>
      ${U.newMenu ? html`<div class="menu" role="menu" style="left:0;right:auto;width:100%" data-key="new-menu">
        <button class="menu-item" role="menuitem" data-action="r-new-project">${icon('layers')}Create Project</button>
        <button class="menu-item" role="menuitem" data-action="r-new-protocol">${icon('listOrdered')}Create Protocol</button>
        <a class="menu-item" role="menuitem" href="#r/new-run" data-action="menu-close">${icon('play')}Start Experiment</a>
        <a class="menu-item" role="menuitem" href="#r/import" data-action="menu-close">${icon('upload')}Import Procedure</a></div>` : ''}</div>` : ''}
    <div class="nav">
      ${WS_NAV[ws].map(([key, label, ico]) => html`<a href="#${key}"${attr(active === key, 'aria-current', 'page')}>${icon(ico)}<span>${label}</span>
        ${key === 's/live' && liveCount ? html`<span class="badge" aria-label="${plural(liveCount, 'open session')}">${liveCount}</span>` : ''}
        ${key === 'r/overview' && review ? html`<span class="badge" aria-label="${plural(review, 'item')} awaiting your review">${review}</span>` : ''}</a>`)}
    </div>
    <div class="sidebar-foot stack tight">
      <div class="row">${avatarEl(user, 'sm')}<div class="grow"><div class="small strong">${displayName(user)}</div><div class="xs muted">${(user.profile && user.profile.school) || user.school || WORKSPACES[ws].label}</div></div></div>
    </div>
  </nav>${U.navOpen ? html`<div class="scrim" data-action="nav-close" data-key="nav-scrim"></div>` : ''}`;
}
function wsShell(ws, route, title, body, ctx = '') {
  return html`${demoBand()}<div class="app">
    ${wsSidebar(ws, route)}
    <div class="main">${topbar(title, ctx, ws)}<main class="content" id="main" tabindex="-1" data-key="main-${route.name}">${body}</main></div>
  </div>`;
}

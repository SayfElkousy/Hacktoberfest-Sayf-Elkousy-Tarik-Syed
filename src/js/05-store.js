/* =====================================================================
   State: S is the persisted demo database + UI preferences; U holds
   transient UI state (open menus, toasts, modals) that is never saved.
   ===================================================================== */
let S = null;
const U = { modal: null, menu: false, navOpen: false, drawer: null, toasts: [], hqOpen: {}, dropOver: false, importBusy: false, route: null, lastRouteKey: null, focusAfter: null, storageWarned: false };

/** Shift every "...At" timestamp forward so a returning visitor finds the demo where they left it. */
function shiftTimes(obj, delta) {
  if (Array.isArray(obj)) { obj.forEach((v) => shiftTimes(v, delta)); return; }
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'number' && /At$/.test(k)) obj[k] = v + delta;
    else if (typeof v === 'object') shiftTimes(v, delta);
  }
}
function loadState() {
  const saved = Store.load();
  if (saved && saved.version === 2 && Array.isArray(saved.users)) {
    S = saved;
    const away = Date.now() - (S.demo.lastSeen || Date.now());
    if (away > 10 * MIN) {
      // Live sessions pause while nobody is watching: move their clocks forward by the time away.
      const running = new Set(S.sessions.filter((s) => s.status === 'active' || s.status === 'paused').map((s) => s.id));
      shiftTimes({ sessions: S.sessions.filter((s) => running.has(s.id)), progress: S.progress.filter((p) => running.has(p.sessionId)), help: S.help.filter((h) => running.has(h.sessionId)) }, away);
    }
  } else {
    S = makeSeed(Date.now());
  }
  S.demo.lastSeen = Date.now();
}
let saveTimer = null, renderQueued = false;
function commit() {
  if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { S.demo.lastSeen = Date.now(); Store.save(S); if (!Store.ok && !U.storageWarned) { U.storageWarned = true; toast('This browser is blocking storage, so demo changes will reset when you reload.', 'alert'); } }, 250);
}
function toast(text, ico = 'check') {
  const id = uid();
  U.toasts.push({ id, text, ico });
  if (U.toasts.length > 3) U.toasts.shift();
  setTimeout(() => { U.toasts = U.toasts.filter((t) => t.id !== id); commit(); }, 5200);
  commit();
}
function go(hash) { if (location.hash !== '#' + hash) location.hash = hash; else { U.route = parseRoute(); commit(); } }
function resetDemo() {
  Store.clear();
  S = makeSeed(Date.now());
  U.modal = null; U.drawer = null; U.menu = false;
  commit();
  go('overview');
  toast('Demo data reset. The Period 4 lab is mid-session again.');
}

/* ---------- Routing ---------- */
const TEACHER_ROUTES = ['overview', 'classes', 'class-new', 'designer', 'library', 'import', 'live', 'help', 'prefs'];
function parseRoute() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  let m;
  if ((m = /^class-([a-z0-9]+)$/i.exec(h)) && h !== 'class-new') return { name: 'class', id: m[1] };
  if ((m = /^lab-([a-z0-9]+)$/i.exec(h))) return { name: 'lab', id: m[1] };
  return { name: h || '' };
}
function homeFor(role) { return role === 'teacher' ? 'overview' : role === 'student' ? 'student' : 'independent'; }
function guardRoute(r) {
  const user = me();
  if (!user) return ['signin', 'signup'].includes(r.name) ? r : { name: 'signin' };
  if (['signin', 'signup', ''].includes(r.name)) return { name: homeFor(user.role), redirect: true };
  if (user.role === 'teacher') return TEACHER_ROUTES.includes(r.name) || r.name === 'class' || r.name === 'lab' ? r : { name: 'overview', redirect: true };
  return r.name === homeFor(user.role) ? r : { name: homeFor(user.role), redirect: true };
}

/* ---------- Shared selection: class → period → session (Live Progress + Help Queue) ---------- */
function sessionRank(s) { return { active: 0, paused: 1, scheduled: 2, completed: 3 }[s.status] ?? 4; }
function sortedSessions(list) { return [...list].sort((a, b) => sessionRank(a) - sessionRank(b) || (b.startedAt || 0) - (a.startedAt || 0)); }
function ensureCtx() {
  const ctx = S.ui.ctx;
  const sessions = mySessions();
  if (!sessions.length) { ctx.sessionId = null; if (!classById(ctx.classId) || !myClassIds().has(ctx.classId)) { const c = myClasses()[0]; ctx.classId = c ? c.id : null; ctx.periodId = ''; } return ctx; }
  let s = sessionById(ctx.sessionId);
  if (!s || !myClassIds().has(s.classId)) { s = sortedSessions(sessions)[0]; ctx.sessionId = s.id; }
  if (!ctx.classId || !classById(ctx.classId)) ctx.classId = s.classId;
  return ctx;
}
function setCtxClass(classId) {
  const ctx = S.ui.ctx; ctx.classId = classId; ctx.periodId = '';
  const best = sortedSessions(mySessions().filter((s) => s.classId === classId))[0];
  ctx.sessionId = best ? best.id : null;
}
function setCtxPeriod(periodId) {
  const ctx = S.ui.ctx; ctx.periodId = periodId;
  const best = sortedSessions(mySessions().filter((s) => s.classId === ctx.classId && (!periodId || s.periodId === periodId)))[0];
  ctx.sessionId = best ? best.id : null;
}
function setCtxSession(sessionId) {
  const s = sessionById(sessionId); if (!s) return;
  S.ui.ctx.sessionId = s.id; S.ui.ctx.classId = s.classId;
  if (S.ui.ctx.periodId && S.ui.ctx.periodId !== s.periodId) S.ui.ctx.periodId = s.periodId;
}
function openSession(sessionId, where = 'live') { setCtxSession(sessionId); S.ui.ctx.periodId = sessionById(sessionId).periodId; go(where); }

/* ---------- Domain actions ---------- */
function createAssignment(labId, versionId, classId, periodIds, dateISO) {
  const lab = labById(labId); const v = versionById(lab, versionId);
  v.locked = true; lab.updatedAt = Date.now();
  const as = { id: uid(), labId, versionId, classId, periodIds: [...periodIds], scheduledFor: dateISO, createdAt: Date.now() };
  S.assignments.push(as);
  for (const pid of periodIds) S.sessions.push({ id: uid(), assignmentId: as.id, labId, versionId, classId, periodId: pid, status: 'scheduled', scheduledFor: dateISO, pausedTotal: 0 });
  return as;
}
function startSession(sess) {
  const groups = groupsIn(sess.classId, sess.periodId);
  if (!groups.length) return false;
  const now = Date.now();
  sess.status = 'active'; sess.startedAt = now; sess.pausedTotal = 0;
  for (const g of groups) if (!S.progress.some((p) => p.sessionId === sess.id && p.groupId === g.id)) {
    S.progress.push(ensureProgressShape({ id: uid(), sessionId: sess.id, groupId: g.id, stepIndex: 0, completed: [], stepStartedAt: undefined, lastActivityAt: undefined, connection: 'online', atCheckpoint: null, observations: [], activity: [{ at: now, text: 'Session opened' }] }));
  }
  return true;
}
function pauseSession(sess) { sess.status = 'paused'; sess.pausedAt = Date.now(); }
function resumeSession(sess) {
  const delta = Date.now() - sess.pausedAt;
  sess.pausedTotal = (sess.pausedTotal || 0) + delta; sess.pausedAt = undefined; sess.status = 'active';
  progressFor(sess.id).forEach((p) => { if (p.stepStartedAt && !p.finishedAt) p.stepStartedAt += delta; });
}
function endSession(sess) { if (sess.status === 'paused') resumeSession(sess); sess.status = 'completed'; sess.endedAt = Date.now(); }
function approveCheckpoint(p) {
  const sess = sessionById(p.sessionId);
  return Engine.approve(classTrack(sess, p.groupId), p.atCheckpoint, S.currentUserId);
}
function helpSetStatus(h, status) {
  const now = Date.now();
  if (status === 'helping') { h.status = 'helping'; h.helpingAt = now; h.log.push({ at: now, text: 'Teacher started helping' }); }
  if (status === 'resolved') { h.status = 'resolved'; h.resolvedAt = now; h.log.push({ at: now, text: 'Marked resolved' }); }
  if (status === 'waiting') { h.status = 'waiting'; h.resolvedAt = undefined; h.helpingAt = undefined; h.log.push({ at: now, text: 'Reopened (keeps its original place in line)' }); }
}
/** Save a version of a lab. Locked (assigned) versions are never edited; edits become a new version. */
function saveLabVersion(lab, content, state) {
  const now = Date.now();
  const latest = latestVersion(lab);
  content = normalizeContent(clone(content));
  if (latest.locked) lab.versions.push({ id: uid(), number: latest.number + 1, state, content: clone(content), createdAt: now, approvedAt: state === 'ready' ? now : undefined, locked: false });
  else { latest.content = clone(content); latest.state = state; latest.approvedAt = state === 'ready' ? now : undefined; }
  lab.updatedAt = now;
  return latestVersion(lab);
}
function newLab(content, source, original) {
  const now = Date.now();
  const lab = { id: uid(), teacherId: S.currentUserId, source, archived: false, createdAt: now, updatedAt: now, versions: [{ id: uid(), number: 1, state: 'draft', content: clone(content), createdAt: now, locked: false }] };
  if (original) lab.original = original;
  S.labs.unshift(lab);
  return lab;
}

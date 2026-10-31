/* =====================================================================
   App: routing, rendering, event delegation, clocks, boot.
   ===================================================================== */
function teacherPage(r) {
  switch (r.name) {
    case 'overview': return ['Overview', overviewView()];
    case 'classes': return ['Classes', classesView()];
    case 'class-new': return ['Create class', createClassView()];
    case 'class': { const c = classById(r.id); return [c && c.teacherId === S.currentUserId ? c.name : 'Class', classDetailView(r.id)]; }
    case 'designer': return ['Lab Designer', designerView()];
    case 'library': return ['Procedures & Lab Library', libraryView()];
    case 'import': return ['Import a procedure', importView()];
    case 'lab': { const l = labById(r.id); return [l && l.teacherId === S.currentUserId ? (S.ui.editorDraft && S.ui.editorDraft.labId === r.id ? S.ui.editorDraft.content.title : labTitle(l)) || 'Untitled lab' : 'Lab', labEditorView(r.id)]; }
    case 'live': return ['Live Progress', liveView(), ctxSelectors('live')];
    case 'help': return ['Help Queue', helpView(), (S.ui.helpScope || 'session') === 'session' ? ctxSelectors('help') : ''];
    case 'prefs': return ['Settings', settingsView()];
    default: return ['Overview', overviewView()];
  }
}
function modalView() {
  if (!U.modal) return '';
  switch (U.modal.type) {
    case 'regen': return regenModal();
    case 'assign': return assignModal();
    case 'review': return reviewModal();
    case 'end': return endSessionModal();
    case 'live-code': return liveCodeModal();
    case 'live-code-regen': return liveCodeRegenModal();
    case 'student-preview': return studentPreviewModal();
    case 'cp-review': return cpReviewModal();
    case 'image': return modalShell({ title: U.modal.name, wide: true, body: html`<img src="${U.modal.url}" alt="${U.modal.name}" style="max-width:100%;border-radius:12px">`, foot: html`<button class="btn" data-action="modal-close">Close</button>` });
    case 'preview': return modalShell({ title: 'Preview student instructions', sub: U.modal.sub || '', body: studentPreview(U.modal.content), foot: html`<button class="btn" data-action="modal-close">Close</button>` });
    default: return '';
  }
}

let lastModal = null, lastDrawer = null, modalReturn = null;
function render() {
  const root = document.getElementById('app');
  const r = guardRoute(parseRoute());
  if (r.redirect && location.hash !== '#' + r.name) history.replaceState(null, '', '#' + r.name);
  U.route = r;
  const user = me();
  let page;
  if (!user) { page = authView(r); document.title = 'Labby'; }
  else if (r.name === 's/onboarding') { page = onboardingView(); document.title = 'Set up your profile · Labby'; }
  else if (r.name === 'join') { page = workspacesFor(user).includes('student') ? wsShell('student', r, 'Join a class', joinView(r)) : joinStandalone(r); document.title = 'Join a class · Labby'; }
  else {
    const ws = workspaceOfRoute(r.name); user.lastWorkspace = ws;
    const [title, body, ctx] = ws === 'teacher' ? teacherPage(r) : ws === 'student' ? studentPage(r) : researchPage(r);
    page = ws === 'teacher' ? teacherShell(r, title, body, ctx || '') : wsShell(ws, r, title, body, ctx || '');
    document.title = `${title} · Labby`;
  }
  morphInto(root, html`${page}${modalView()}${toastsView()}`.s);
  afterRender(r);
}
function afterRender(r) {
  // Live session lifecycle: leaving the session route stops the camera, the AI connection and pending analysis.
  const liveKey = r.name === 's/live' && r.id ? `class:${r.id}` : r.name === 'r/run' && r.sub === 'guided' ? `run:${r.id}` : null;
  if (Live.key && Live.key !== liveKey) Live.teardown();
  Live.attachVideo();
  const key = r.name + (r.id || '');
  if (key !== U.lastRouteKey) {
    U.lastRouteKey = key;
    window.scrollTo(0, 0);
    const t = document.getElementById('page-title');
    if (t && document.activeElement === document.body) t.focus({ preventScroll: true });
    else if (t && !document.activeElement.closest('.modal')) t.focus({ preventScroll: true });
  }
  const modalOpen = U.modal ? U.modal.type : null;
  if (modalOpen && modalOpen !== lastModal) { modalReturn = modalReturn || document.activeElement; const m = document.querySelector('.modal'); const f = m && m.querySelector('input:not([type=hidden]):not([disabled]), select, textarea, button:not([data-action=modal-close])'); (f || m).focus(); }
  if (!modalOpen && lastModal && modalReturn) { if (document.contains(modalReturn)) modalReturn.focus(); modalReturn = null; }
  lastModal = modalOpen;
  if (U.drawer && U.drawer !== lastDrawer) { const b = document.querySelector('.drawer [data-action=drawer-close]'); if (b) b.focus(); }
  if (!U.drawer && lastDrawer) { const tile = document.querySelector(`[data-key="gt-${lastDrawer}"] .gt-name`); if (tile) tile.focus(); }
  lastDrawer = U.drawer;
  const chatLen = S.designer.chat.length;
  if (r.name === 'designer' && chatLen !== U.chatLen) { const sc = document.querySelector('.designer-left .chat'); if (sc && sc.parentElement) sc.parentElement.scrollTop = sc.parentElement.scrollHeight; }
  U.chatLen = chatLen;
  if (U.focusAfter) { const el = document.querySelector(U.focusAfter); U.focusAfter = null; if (el) { if (!el.matches('input,select,textarea,button,a')) el.setAttribute('tabindex', '-1'); el.focus(); el.scrollIntoView({ block: 'center' }); } }
}

/* ---------- Bindings ---------- */
const BIND_HOOKS = {
  'U.modal.classId': () => { U.modal.periodIds = []; U.modal.error = ''; },
  'U.modal.labId': () => { U.modal.error = ''; },
  'U.modal.ok': () => { U.modal.error = ''; },
};
function applyBind(el) {
  const path = el.dataset.bind; const type = el.dataset.type || 'str';
  if (el.type === 'radio' && !el.checked) return;
  let v;
  switch (type) {
    case 'bool': v = el.checked; break;
    case 'int': v = el.value === '' ? '' : parseInt(el.value, 10); if (Number.isNaN(v)) v = ''; break;
    case 'num': v = el.value === '' ? '' : parseFloat(el.value); if (Number.isNaN(v)) v = ''; break;
    case 'numOrNull': v = el.value === '' ? null : Number(el.value); if (Number.isNaN(v)) v = null; break;
    case 'csv': v = el.value.split(',').map((s) => s.trim()).filter(Boolean); break;
    default: v = el.value;
  }
  if (path.startsWith('U.')) setPath(U, path.slice(2), v); else setPath(S, path, v);
  if (BIND_HOOKS[path]) BIND_HOOKS[path]();
  if (path.startsWith('designer.form') || path.startsWith('designer.logistics')) S.designer.errors = [];
  commit();
}

/* ---------- Actions ---------- */
const byId = (arr, id) => arr.find((x) => x.id === id);
function listAt(path) { return getPath(S, path); }
function copyText(text, fallbackEl) {
  const done = () => toast(`Copied ${text}`, 'copy');
  const fail = () => { if (fallbackEl) { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } toast('Copying isn’t allowed here. The code is selected: press Ctrl+C or ⌘C.', 'copy'); };
  try { navigator.clipboard.writeText(text).then(done, fail); } catch (e) { fail(); }
}
function sessFromEl(el) { return sessionById(el.dataset.sid); }
function progFromEl(el) { return S.progress.find((p) => p.id === el.dataset.pid); }

const ACTIONS = {
  ...StudentSite.actions,
  /* auth */
  'signout': () => { S.currentUserId = null; U.menu = false; commit(); go('signin'); toast('Signed out.'); },
  'toast-close': (el) => { U.toasts = U.toasts.filter((t) => t.id !== el.dataset.id); commit(); },
  /* shell */
  'nav-open': () => { U.navOpen = true; commit(); setTimeout(() => { const a = document.querySelector('#sidebar a[aria-current]') || document.querySelector('#sidebar a'); if (a) a.focus(); }, 30); },
  'nav-close': () => { U.navOpen = false; commit(); },
  'menu-toggle': () => { U.menu = !U.menu; commit(); if (U.menu) setTimeout(() => { const i = document.querySelector('.menu .menu-item'); if (i) i.focus(); }, 30); },
  'menu-close': () => { U.menu = false; commit(); },
  'modal-close': () => { U.modal = null; commit(); },
  'modal-scrim': (el, ev) => { if (ev.target === el) { U.modal = null; commit(); } },
  /* overview */
  'open-live-quick': () => {
    const s = sortedSessions(mySessions())[0];
    if (!s) { toast('No lab sessions yet. Assign a lab to a class period first.', 'info'); go('library'); return; }
    openSession(s.id, 'live');
  },
  'open-session': (el) => openSession(el.dataset.sid, el.dataset.where || 'live'),
  /* classes */
  'cc-period-add': () => { const f = S.ui.createClass; f.periods.push({ id: uid(), name: `Period ${f.periods.length + 1}`, expected: '' }); commit(); U.focusAfter = `#cc-p-${f.periods.length - 1}-name`; },
  'cc-period-remove': (el) => { S.ui.createClass.periods.splice(+el.dataset.index, 1); S.ui.createClass.errors = {}; commit(); },
  'copy-code': (el) => { const c = classById(el.dataset.cid); copyText(c.joinCode, document.getElementById(`join-code-${c.id}`)); },
  'regen-ask': (el) => { U.modal = { type: 'regen', classId: el.dataset.cid }; commit(); },
  'regen-confirm': (el) => { const c = classById(el.dataset.cid); const old = c.joinCode; c.joinCode = newJoinCode(); c.codeUpdatedAt = Date.now(); U.modal = null; commit(); toast(`New code ${c.joinCode}. ${old} no longer works.`, 'key'); },
  'class-tab': (el) => { S.ui.classTab = el.dataset.tab; commit(); },
  'class-period': (el) => { S.ui.classPeriod[el.dataset.cid] = el.dataset.pid; commit(); },
  'class-period-go': (el) => { S.ui.classPeriod[el.dataset.cid] = el.dataset.pid; S.ui.classTab = 'roster'; },
  'group-auto': (el) => { const n = arrangeGroups(el.dataset.cid, el.dataset.pid, S.ui.groupSize || 4); commit(); toast(`Arranged ${plural(n, 'lab group')} in ${periodName(el.dataset.cid, el.dataset.pid)}.`, 'layers'); },
  'group-add': (el) => { const gs = groupsIn(el.dataset.cid, el.dataset.pid); S.groups.push({ id: uid(), classId: el.dataset.cid, periodId: el.dataset.pid, name: `Bench ${gs.length + 1}`, memberIds: [] }); commit(); },
  'assign-open': (el) => {
    const lab = el.dataset.lid ? labById(el.dataset.lid) : null;
    const cid = el.dataset.cid || (myClasses()[0] || {}).id || '';
    U.modal = { type: 'assign', labId: lab ? lab.id : '', classId: cid, periodIds: [], date: todayISO(), error: '' }; commit();
  },
  'as-period': (el) => { const m = U.modal; const id = el.dataset.pid; m.periodIds = el.checked ? [...new Set([...m.periodIds, id])] : m.periodIds.filter((p) => p !== id); m.error = ''; commit(); },
  'assign-submit': () => submitAssign(),
  /* procedure editor */
  'list-add': (el) => { const list = listAt(el.dataset.path); list.push(''); commit(); U.focusAfter = `#${pidOf(el.dataset.path.replace(/\.(objectives|setup|precautions|cleanup)$/, ''))}-${{ objectives: 'obj', setup: 'setup', precautions: 'pre', cleanup: 'clean' }[el.dataset.path.split('.').pop()]}-${list.length - 1}`; },
  'list-remove': (el) => { listAt(el.dataset.path).splice(+el.dataset.index, 1); commit(); },
  'mat-add': (el) => { const list = listAt(el.dataset.path); list.push({ ...blankMaterial(), name: '' }); commit(); U.focusAfter = `#${pidOf(el.dataset.path.replace(/\.materials$/, ''))}-mat-${list.length - 1}-name`; },
  'step-add': (el) => { const list = listAt(el.dataset.path); list.push(blankStep()); commit(); U.focusAfter = `#${pidOf(el.dataset.path.replace(/\.steps$/, ''))}-step-${list.length - 1}-title`; },
  'step-move': (el) => { const list = listAt(el.dataset.path); const i = +el.dataset.index, j = i + +el.dataset.dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; commit(); U.focusAfter = `[data-action=step-move][data-index="${j}"][data-dir="${el.dataset.dir}"]`; },
  'input-add': (el) => { listAt(el.dataset.path).push({ label: '', unit: '' }); commit(); },
  'flag-go': (el) => { const c = getPath(S, el.dataset.path.replace(/^/, '')); const id = flagTargetId(el.dataset.path, el.dataset.field, c); if (id) U.focusAfter = '#' + id; commit(); },
  /* designer */
  'designer-tab': (el) => { S.designer.tab = el.dataset.tab; commit(); },
  'fold': (el) => { const k = el.dataset.fold; S.designer.folds[k] = !S.designer.folds[k]; commit(); },
  'inv-add': () => { S.designer.inventory.push({ id: uid(), name: '', qty: null, unit: '', kind: 'reusable', notes: '' }); commit(); U.focusAfter = `#inv-${S.designer.inventory.length - 1}-name`; },
  'inv-remove': (el) => { S.designer.inventory.splice(+el.dataset.index, 1); commit(); },
  'designer-generate': () => designerGenerate(),
  'designer-suggest': (el) => designerAsk(el.dataset.text),
  'ai-stop': () => { if (AI.ctl) AI.ctl.abort(); },
  'designer-revise-focus': () => { S.designer.tab = 'assistant'; commit(); U.focusAfter = '#dz-msg'; },
  'designer-edit': () => { S.designer.editing = !S.designer.editing; commit(); },
  'designer-save': () => { const lab = designerSave('draft'); commit(); toast(`Saved “${labTitle(lab)}” as a draft in your library.`); },
  'designer-preview': () => { U.modal = { type: 'preview', content: designerContent(), sub: 'Draft plan from the Lab Designer' }; commit(); },
  'designer-assign': () => { U.modal = { type: 'review', ok: false }; commit(); },
  'review-confirm': () => {
    if (!U.modal.ok) { U.modal.error = 'Confirm that you reviewed the plan to continue.'; commit(); return; }
    const errs = readyErrors(designerContent());
    if (errs.length) { U.modal.error = errs[0] + ' Use Edit manually to fix it.'; commit(); return; }
    const lab = designerSave('ready');
    const first = designerPeriods(S.designer)[0];
    const periodIds = first ? designerPeriods(S.designer).filter((p) => p.classId === first.classId).map((p) => p.periodId) : [];
    U.modal = { type: 'assign', labId: lab.id, classId: first ? first.classId : '', periodIds, date: todayISO(), error: '' };
    commit(); toast('Plan approved and saved as Ready to Assign.');
  },
  /* library + import + editor */
  'new-manual': () => newManualLab(),
  'lib-status': (el) => { S.ui.libStatus = el.dataset.status; commit(); },
  'lib-clear': () => { S.ui.libQuery = ''; S.ui.libStatus = 'all'; S.ui.libSubject = 'all'; commit(); },
  'lab-duplicate': (el) => { const src = labById(el.dataset.lid); const c = clone(latestVersion(src).content); c.title = `${c.title} (copy)`; c.steps.forEach((s) => { s.id = uid(); }); c.materials.forEach((m) => { m.id = uid(); }); const lab = newLab(c, 'duplicate'); S.ui.libStatus = 'all'; commit(); toast(`Duplicated as “${c.title}” (draft).`, 'copy'); return lab; },
  'lab-archive': (el) => { const lab = labById(el.dataset.lid); lab.archived = el.dataset.on === '1'; lab.updatedAt = Date.now(); commit(); toast(lab.archived ? `Archived “${labTitle(lab)}”. Find it under Archived. Assigned sessions aren’t affected.` : `Restored “${labTitle(lab)}”.`, lab.archived ? 'archive' : 'reopen'); },
  'import-paste': () => importText(S.ui.pasteText || '', 'paste'),
  'import-discard': () => { S.ui.importDraft = null; U.importFile = null; commit(); toast('Import discarded.'); },
  'import-save': (el) => saveImport(el.dataset.state),
  'editor-save': (el) => editorSave(el.dataset.state),
  'editor-discard': () => { S.ui.editorDraft = null; commit(); toast('Changes discarded.'); },
  'editor-preview': () => { U.modal = { type: 'preview', content: S.ui.editorDraft.content }; commit(); },
  /* live */
  'session-start': (el) => { const s = sessFromEl(el); if (!startSession(s)) { toast('Arrange this period into lab groups before starting.', 'alert'); return; } commit(); toast('Session started. Groups can begin step 1.', 'play'); },
  'session-pause': (el) => { pauseSession(sessFromEl(el)); commit(); toast('Session paused. Timers are frozen.', 'pause'); },
  'session-resume': (el) => { resumeSession(sessFromEl(el)); commit(); toast('Session resumed.', 'play'); },
  'copy-live-code': (el) => { const s = sessFromEl(el); if (!s || !s.liveCode) return; copyText(s.liveCode, document.getElementById('live-code-big') || document.getElementById(`live-code-${s.id}`)); },
  'live-code-show': (el) => { U.modal = { type: 'live-code', sid: el.dataset.sid }; commit(); },
  'live-code-regen-ask': (el) => { U.modal = { type: 'live-code-regen', sid: el.dataset.sid }; commit(); },
  'live-code-regen': (el) => { const s = sessFromEl(el); const old = replaceLiveCode(s); U.modal = null; commit(); toast(`New live session code ${s.liveCode}. ${old} no longer works.`, 'key'); },
  'session-end-ask': (el) => { U.modal = { type: 'end', sid: el.dataset.sid }; commit(); },
  'session-end': (el) => { endSession(sessFromEl(el)); U.modal = null; commit(); toast('Session ended. Results are kept.', 'stopCircle'); },
  'live-filter': (el) => { S.ui.liveFilter = el.dataset.f; commit(); },
  'explain-toggle': () => { U.explainOpen = !U.explainOpen; commit(); },
  'group-open': (el) => { U.drawer = el.dataset.pid; commit(); },
  'drawer-close': () => { U.drawer = null; commit(); },
  'checkpoint-approve': (el) => { const p = progFromEl(el); if (!p || !p.atCheckpoint) return; approveCheckpoint(p); commit(); toast(`Approved. ${groupById(p.groupId).name} can continue.`, 'check'); },
  /* help */
  'help-scope': (el) => { S.ui.helpScope = el.dataset.scope; commit(); },
  'help-tab': (el) => { S.ui.helpTab = el.dataset.tab; commit(); },
  'help-view': (el) => { U.hqOpen[el.dataset.hid] = !U.hqOpen[el.dataset.hid]; commit(); },
  'help-start': (el) => { const h = byId(S.help, el.dataset.hid); helpSetStatus(h, 'helping'); commit(); toast(`Helping ${groupById(h.groupId).name}. They keep their place in line.`, 'users'); },
  'help-resolve': (el) => { const h = byId(S.help, el.dataset.hid); helpSetStatus(h, 'resolved'); commit(); toast(`Resolved ${groupById(h.groupId).name}’s request. It moved to Resolved history.`, 'check'); },
  'help-reopen': (el) => { const h = byId(S.help, el.dataset.hid); const dup = S.help.find((x) => x.id !== h.id && x.sessionId === h.sessionId && x.groupId === h.groupId && x.category === h.category && x.status !== 'resolved'); if (dup) { toast(`${groupById(h.groupId).name} already has an open ${h.category.toLowerCase()} request. Update that one instead.`, 'alert'); return; } helpSetStatus(h, 'waiting'); S.ui.helpTab = 'open'; commit(); toast('Reopened at its original place in the queue.', 'reopen'); },
  'help-open-group': (el) => { const h = byId(S.help, el.dataset.hid); const p = S.progress.find((x) => x.sessionId === h.sessionId && x.groupId === h.groupId); openSession(h.sessionId, 'live'); if (p) { U.drawer = p.id; commit(); } },
};
const CHANGES = {
  'ctx-class': (el) => { setCtxClass(el.value); U.drawer = null; commit(); },
  'ctx-period': (el) => { setCtxPeriod(el.value); U.drawer = null; commit(); },
  'ctx-session': (el) => { if (el.value) { setCtxSession(el.value); U.drawer = null; commit(); } },
  'student-group': (el) => {
    const { sid, cid, pid } = el.dataset;
    groupsIn(cid, pid).forEach((g) => { g.memberIds = g.memberIds.filter((m) => m !== sid); });
    const g = groupById(el.value); if (g) g.memberIds.push(sid);
    commit();
  },
  'mat-basis': (el) => { const m = getPath(S, el.dataset.path); const v = el.value; if (v === 'student') { m.per = 'student'; m.sharedBy = 1; } else { m.per = 'group'; m.sharedBy = v.startsWith('share') ? +v.slice(5) : 1; } commit(); },
  'cp-toggle': (el) => { const c = getPath(S, el.dataset.path); normalizeContent(c); const ex = checkpointAfter(c, el.dataset.sid); if (ex) c.checkpoints = c.checkpoints.filter((x) => x !== ex); else { const st = c.steps.find((x) => x.id === el.dataset.sid); c.checkpoints.push({ ...blankCheckpoint(el.dataset.sid), title: `Teacher check: ${st ? st.title : 'step'}`, kind: 'info', responseRequired: false, approvalRequired: true, questions: [] }); } commit(); },
  'import-file': (el) => { const f = el.files && el.files[0]; el.value = ''; importFile(f); },
};
const SUBMITS_BASE = {
  signin: () => submitSignin(),
  signup: () => submitSignup(),
  'create-class': () => submitCreateClass(),
  'designer-ask': () => designerAsk(S.designer.draftMsg),
};

const SUBMITS = SUBMITS_BASE;
Object.assign(ACTIONS, STUDENT_ACTIONS, LIVE_ACTIONS, TEACHER2_ACTIONS, typeof RESEARCH_ACTIONS === 'object' ? RESEARCH_ACTIONS : {});
Object.assign(CHANGES, STUDENT_CHANGES, LIVE_CHANGES, TEACHER2_CHANGES, typeof RESEARCH_CHANGES === 'object' ? RESEARCH_CHANGES : {});
Object.assign(SUBMITS, STUDENT_SUBMITS, LIVE_SUBMITS, typeof RESEARCH_SUBMITS === 'object' ? RESEARCH_SUBMITS : {});

/* ---------- Event wiring ---------- */
function wireEvents() {
  document.addEventListener('click', (ev) => {
    if (U.menu && !ev.target.closest('.profile')) { U.menu = false; commit(); }
    if (U.newMenu && !ev.target.closest('.new-wrap')) { U.newMenu = false; commit(); }
    if (U.explainOpen && !ev.target.closest('.explain')) { U.explainOpen = false; commit(); }
    const el = ev.target.closest('[data-action]');
    const control = ev.target.closest('input, select, textarea, label');
    if (el && control && control !== el && el.contains(control)) return; // let form controls inside clickable areas work normally
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' && el.tagName === 'BUTTON' && el.dataset.action !== 'live-filter') return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    if (el.tagName !== 'A' && el.tagName !== 'INPUT') ev.preventDefault();
    fn(el, ev);
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.bind && el.type !== 'checkbox' && el.type !== 'radio' && el.tagName !== 'SELECT') applyBind(el);
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target; if (!el.dataset) return;
    if (el.dataset.bind && (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT')) applyBind(el);
    if (el.dataset.change && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el, ev);
  });
  document.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-submit]'); if (!f) return;
    ev.preventDefault(); const fn = SUBMITS[f.dataset.submit]; if (fn) fn(f);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (U.modal) { U.modal = null; commit(); return; }
      if (U.drawer) { U.drawer = null; commit(); return; }
      if (U.menu) { U.menu = false; commit(); const b = document.querySelector('.profile-btn'); if (b) b.focus(); return; }
      if (U.explainOpen) { U.explainOpen = false; commit(); return; }
      if (U.navOpen) { U.navOpen = false; commit(); return; }
    }
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && ev.target.id === 'dz-msg') { ev.preventDefault(); designerAsk(S.designer.draftMsg); }
    if (ev.key === 'Tab') {
      const box = document.querySelector('.modal') || document.querySelector('.drawer') || (U.navOpen && document.querySelector('.sidebar.open'));
      if (!box) return;
      const f = Array.from(box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not(.sr-only), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!box.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
      else if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('dragover', (ev) => { if (U.route && U.route.name === 'import') { ev.preventDefault(); const over = !!ev.target.closest('#dropzone'); if (over !== U.dropOver) { U.dropOver = over; commit(); } } });
  document.addEventListener('dragleave', (ev) => { if (U.dropOver && !ev.relatedTarget) { U.dropOver = false; commit(); } });
  document.addEventListener('drop', (ev) => {
    if (!U.route || U.route.name !== 'import') return;
    ev.preventDefault(); U.dropOver = false;
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) importFile(f); else commit();
  });
  window.addEventListener('hashchange', () => { U.menu = false; U.navOpen = false; U.drawer = null; U.explainOpen = false; U.modal = U.modal && U.modal.type === 'assign' ? U.modal : null; commit(); });
}

/* ---------- Clocks ---------- */
let tickCount = 0;
function tick() {
  tickCount++;
  const now = Date.now();
  document.querySelectorAll('[data-tick]').forEach((el) => {
    let txt = el.textContent;
    const kind = el.dataset.tick;
    if (kind === 'since') { const t = +el.dataset.t; txt = el.dataset.fmt === 'ago' ? fmtAgo(t, now) : el.dataset.fmt === 'mins' ? fmtMins(now - t) : fmtTimer(now - t); }
    else if (kind === 'session') { const s = sessionById(el.dataset.sid); if (s) { const e = sessionElapsed(s, now); txt = el.dataset.what === 'elapsed' ? fmtTimer(e) : fmtTimer(plannedMinutes(sessionContent(s)) * MIN - e); } }
    else if (kind === 'step') { const p = S.progress.find((x) => x.id === el.dataset.pid); const s = p && sessionById(p.sessionId); if (p && s) txt = p.stepStartedAt && !p.finishedAt ? fmtTimer(stepTimeMs(p, s, now)) : '—'; }
    if (el.textContent !== txt) el.textContent = txt;
  });
  const user = me();
  if (user && user.role === 'teacher') {
    if (tickCount % 15 === 0 && U.route && ['overview', 'live', 'help'].includes(U.route.name)) commit();
  }
  if (user && user.role !== 'teacher' || (U.route && /^(s|r)\//.test(U.route.name))) {
    if (tickCount % 10 === 0 && U.route && ['s/overview', 's/live', 's/lab', 's/labs', 'r/overview'].includes(U.route.name)) commit();
  }
}

/* ---------- Boot ---------- */
function boot() {
  loadState();
  initLiveAI();
  wireEvents();
  if (!location.hash) history.replaceState(null, '', '#' + (me() ? homeFor(me().role) : 'signin'));
  render();
  setInterval(tick, 1000);
}
boot();

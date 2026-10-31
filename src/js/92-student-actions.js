/* =====================================================================
   Student Workspace: routing and handlers.
   ===================================================================== */
function studentPage(r) {
  switch (r.name) {
    case 's/overview': return ['Overview', studentOverview(), studentClassSelect()];
    case 's/classes': return ['My Classes', studentClassesView()];
    case 's/class': { const c = classById(r.id); const e = myEnrollment(r.id); return [c && e ? c.name : 'Class', studentClassView(r.id), e ? html`<span class="tag">${enrollmentLabel(e)}</span>` : '']; }
    case 's/labs': return ['My Labs', studentLabsView(), studentClassSelect()];
    case 's/lab': { const [v, body] = studentLabView_(r.id); return [v ? v.title : 'Lab', body, v ? html`<span class="tag">${v.className} · ${v.periodName}</span>` : '']; }
    case 's/live': if (!r.id) return ['Live Session', liveStudentPicker(), studentClassSelect()]; Live.open('class', r.id); return ['Live Session', liveSessionView()];
    case 's/profile': return ['Profile & Settings', profileView()];
    case 's/join': return ['Join a class', joinView(r)];
    default: return ['Overview', studentOverview()];
  }
}
/** A join link opened by someone without a student workspace yet (teacher or researcher account). */
function joinStandalone(r) {
  return html`${demoBand()}<main class="placeholder-wrap" id="main" tabindex="-1" style="max-width:760px">
    <div class="row between wrap"><a class="brand" href="#${homeFor()}" style="padding:0"><span class="brand-mark">${BRAND_MARK}</span><span class="brand-name">Labby</span></a><a class="btn btn-sm" href="#${homeFor()}">Back to my workspace</a></div>
    <h1 id="page-title" tabindex="-1">Join a class</h1>${joinView(r)}</main>`;
}
/** Offer a file to the viewer: the page's downloads capability when present, otherwise a normal browser download. */
async function saveFile(filename, data) {
  try {
    const d = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
    if (d) { await d.save({ filename, data }); return true; }
  } catch (e) { if (e && e.code === 'declined') return false; }
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); return true;
  } catch (e) { toast('Downloads aren’t available in this view.', 'alert'); return false; }
}
const STUDENT_ACTIONS = {
  'interest-toggle': (el) => { const d = getPath(S, el.dataset.base); const v = el.dataset.v; d.interests = d.interests.includes(v) ? d.interests.filter((x) => x !== v) : [...d.interests, v]; commit(); },
  'interest-add': (el) => { const d = getPath(S, el.dataset.base); const v = String(d.custom || '').trim().slice(0, 40); if (v && !d.interests.some((x) => x.toLowerCase() === v.toLowerCase()) && d.interests.length < 15) d.interests.push(v); d.custom = ''; commit(); },
  'avatar-remove': (el) => { getPath(S, el.dataset.base).avatar = null; commit(); },
  'ob-back': () => { S.ui.onboard.step = 1; commit(); },
  'ob-finish': () => finishOnboarding(),
  'profile-reset': () => { S.ui.profileDraft = null; commit(); },
  'join-confirm': () => confirmJoin(),
  'join-cancel': () => { S.ui.joinDraft = null; S.pendingInvite = null; commit(); go(homeFor()); },
  'join-change-period': () => { S.ui.joinDraft.periodId = ''; S.ui.joinDraft.linkPeriod = ''; commit(); },
  'join-clear': () => { S.ui.joinDraft = null; S.pendingInvite = null; },
  'invite-cancel': () => { S.pendingInvite = null; commit(); },
  's-lab-filter': (el) => { S.ui.sLabFilter = el.dataset.f; commit(); },
  'open-attachment': async (el) => {
    const blob = el.dataset.key ? await FileVault.get(el.dataset.key).catch(() => null) : null;
    if (!blob) { toast('This file isn’t stored in this browser.', 'alert'); return; }
    if (/^image\//.test(blob.type)) { U.modal = { type: 'image', url: URL.createObjectURL(blob), name: el.dataset.name }; commit(); } else saveFile(el.dataset.name, blob);
  },
  'new-menu': () => { U.newMenu = !U.newMenu; commit(); },
};
const STUDENT_CHANGES = {
  workspace: (el) => { const u = me(); u.lastWorkspace = el.value; commit(); go(WORKSPACES[el.value].home); },
  's-class': (el) => { S.ui.sClass = el.value; const e = S.enrollments.find((x) => x.id === el.value); if (U.route && U.route.name === 's/class' && e) go(`s/class/${e.classId}`); commit(); },
  'avatar-pick': async (el) => {
    const f = el.files && el.files[0]; el.value = ''; if (!f) return;
    try { getPath(S, el.dataset.base).avatar = await readAvatar(f); commit(); } catch (e) { toast(e.message, 'alert'); }
  },
  'prep-check': (el) => { const key = `${S.currentUserId}:${el.dataset.aid}`; const set = new Set(S.prepChecks[key] || []); const i = +el.dataset.i; if (el.checked) set.add(i); else set.delete(i); S.prepChecks[key] = [...set]; commit(); },
};
const STUDENT_SUBMITS = {
  onboard: () => {
    const d = S.ui.onboard;
    if (d.step === 1) { d.errors = profileValidate({ ...d, bio: '' }); if (Object.keys(d.errors).length) { U.focusAfter = '#ob-errors'; commit(); return; } d.step = 2; commit(); U.focusAfter = '#page-title'; return; }
    finishOnboarding();
  },
  'profile-save': () => saveProfile(),
  'live-code': () => {
    const d = S.ui.liveCodeDraft || (S.ui.liveCodeDraft = { code: '', error: '' });
    d.code = normCode(d.code);
    const res = LabSessionAPI.joinByCode({ participantId: S.currentUserId, code: d.code });
    if (!res.ok) { d.error = res.message; U.focusAfter = '#lc-code'; commit(); return; }
    S.ui.liveCodeDraft = null; S.pendingInvite = null;
    const u = me(); if (u) u.lastWorkspace = 'student';
    commit(); go(`s/live/${res.sess.id}`);
    const where = `${res.cls.name} · ${periodName(res.cls.id, res.sess.periodId)}`;
    toast(res.added ? `You joined ${where} as a guest, in ${res.group.name}. Enter the session when your group is ready.` : `Found your session: ${sessionContent(res.sess).title}.`, 'checkCircle');
  },
  'join-lookup': () => { const d = S.ui.joinDraft; d.code = normCode(d.code); d.looked = true; d.periodId = ''; d.linkPeriod = ''; d.fromLink = d.fromLink || ''; d.periodError = ''; commit(); },
};

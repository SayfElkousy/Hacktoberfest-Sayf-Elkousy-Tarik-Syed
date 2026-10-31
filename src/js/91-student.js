/* =====================================================================
   Student Workspace: onboarding, profile, joining classes, overview,
   My Classes, My Labs and lab pages. Lab content always comes from
   studentLabView() so students only ever see released information.
   ===================================================================== */
const normCode = (s) => { const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return t.length === 6 ? `${t.slice(0, 3)}-${t.slice(3)}` : t; };
/** Look up a class code. In production this is a rate-limited server endpoint that reveals only the preview fields. */
function findClassByCode(code) {
  const c = normCode(code);
  if (!c) return { status: 'empty' };
  const cls = S.classes.find((x) => x.joinCode === c);
  if (cls) return cls.joinEnabled === false ? { status: 'disabled', cls } : { status: 'ok', cls };
  if (S.classes.some((x) => (x.previousCodes || []).some((p) => p.code === c))) return { status: 'expired' };
  return { status: 'invalid' };
}
const teacherOf = (cls) => S.users.find((u) => u.id === cls.teacherId) || null;
const myEnrollment = (classId) => S.enrollments.find((e) => e.studentId === S.currentUserId && e.classId === classId) || null;
function enrollmentLabel(e) { const c = classById(e.classId); return `${c ? c.name : 'Class'} · ${periodName(e.classId, e.periodId)}`; }

/* ---------- Onboarding ---------- */
function onboardDraft() {
  const u = me(); const p = u.profile || {};
  if (!S.ui.onboard || S.ui.onboard.uid !== u.id) S.ui.onboard = { uid: u.id, step: 1, name: u.name, displayName: p.displayName || u.name.split(' ')[0], school: p.school || u.school || '', level: p.level || '', gradYear: p.gradYear || '', interests: [...(p.interests || [])], custom: '', bio: p.bio || '', avatar: p.avatar || null, errors: {} };
  return S.ui.onboard;
}
const gradYears = () => { const y = new Date().getFullYear(); return Array.from({ length: 9 }, (_, i) => String(y + i)); };
function profileValidate(d) {
  const e = {};
  if (!d.name.trim()) e.name = 'Enter your full name.';
  if (!d.displayName.trim()) e.displayName = 'Enter the name you’d like classmates and teachers to see.';
  if (!d.school.trim()) e.school = 'Enter your school. Type “Homeschool” or “None” if that fits better.';
  if (!d.level) e.level = 'Choose High School or College / University.';
  if (!d.gradYear) e.gradYear = 'Choose your expected graduation year.';
  if ((d.bio || '').length > 300) e.bio = 'Keep your bio under 300 characters.';
  return e;
}
function profileFields(d, prefix, bindBase) {
  const e = d.errors || {};
  return html`<div class="form-grid">
    ${field({ label: 'Full name', id: `${prefix}-name`, bind: `${bindBase}.name`, value: d.name, error: e.name, attrs: 'autocomplete="name"' })}
    ${field({ label: 'Preferred display name', id: `${prefix}-dn`, bind: `${bindBase}.displayName`, value: d.displayName, error: e.displayName, hint: 'Shown to your teachers and group.' })}
    ${field({ label: 'School', id: `${prefix}-school`, bind: `${bindBase}.school`, value: d.school, error: e.school, attrs: 'autocomplete="organization"' })}
    ${selectField({ label: 'Expected graduation year', id: `${prefix}-grad`, bind: `${bindBase}.gradYear`, value: d.gradYear, opts: [['', 'Choose a year'], ...gradYears()], error: e.gradYear })}
    <fieldset class="span-2 stack tight" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Education level</legend>
      <div class="row wrap">${EDU_LEVELS.map(([v, l]) => html`<label class="check" style="padding:8px 12px;border:1px solid var(--line-strong);border-radius:10px" for="${prefix}-lvl-${v}"><input type="radio" name="${prefix}-lvl" id="${prefix}-lvl-${v}" value="${v}" data-bind="${bindBase}.level" data-type="str"${attr(d.level === v, 'checked')}><span>${l}</span></label>`)}</div>
      ${e.level ? html`<div class="err">${icon('alert', 'sm')}${e.level}</div>` : ''}</fieldset>
  </div>`;
}
function interestFields(d, prefix, bindBase) {
  const all = [...new Set([...INTERESTS, ...d.interests])];
  return html`<fieldset class="stack tight" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Academic interests <span class="opt">(optional, choose any)</span></legend>
      <div class="chips">${all.map((i) => html`<button type="button" class="chip" aria-pressed="${d.interests.includes(i)}" data-action="interest-toggle" data-base="${bindBase}" data-v="${i}">${d.interests.includes(i) ? icon('check', 'sm') : ''}${i}</button>`)}</div>
      <div class="row" style="max-width:420px"><label class="sr-only" for="${prefix}-custom">Add your own interest</label>
        <input class="input sm" id="${prefix}-custom" placeholder="Add your own, e.g. Marine biology" data-bind="${bindBase}.custom" data-type="str" value="${d.custom || ''}">
        <button type="button" class="btn btn-sm" data-action="interest-add" data-base="${bindBase}">${icon('plus', 'sm')}Add</button></div>
    </fieldset>
    ${textareaField({ label: 'Short bio', id: `${prefix}-bio`, bind: `${bindBase}.bio`, value: d.bio, opt: true, rows: 3, hint: `${(d.bio || '').length}/300 characters`, error: (d.errors || {}).bio })}
    <div class="field"><span class="label">Avatar <span class="opt">(optional)</span></span>
      <div class="row wrap">${d.avatar ? html`<img class="avatar lg" src="${d.avatar}" alt="Your avatar">` : html`<span class="avatar lg" aria-hidden="true">${initials(d.name)}</span>`}
        <label class="btn btn-sm" for="${prefix}-avatar">${icon('upload', 'sm')}${d.avatar ? 'Change photo' : 'Upload a photo'}</label>
        <input type="file" id="${prefix}-avatar" class="sr-only" accept="image/png,image/jpeg,image/webp,image/gif" data-change="avatar-pick" data-base="${bindBase}">
        ${d.avatar ? html`<button type="button" class="btn btn-sm btn-ghost" data-action="avatar-remove" data-base="${bindBase}">Remove</button>` : ''}</div>
      <span class="hint">PNG, JPEG, WebP or GIF. It’s cropped to a square and kept small.</span></div>`;
}
function onboardingView() {
  const d = onboardDraft(); const nErr = Object.keys(d.errors).length;
  return html`${demoBand()}<main class="placeholder-wrap" id="main" tabindex="-1" style="max-width:760px">
    <div class="auth-brand"><span class="brand-mark">${BRAND_MARK}</span><span class="brand-name">Labby</span></div>
    <div class="stack tight"><span class="eyebrow">Step ${d.step} of 2</span><h1 id="page-title" tabindex="-1">${d.step === 1 ? 'Set up your student profile' : 'A little more about you'}</h1>
      <p class="muted">${d.step === 1 ? 'Your teachers use this to recognize you. You can change it any time in Profile & Settings.' : 'Everything on this page is optional, and none of it is needed to join a class.'}</p></div>
    <div class="bar" aria-hidden="true"><span style="width:${d.step === 1 ? 50 : 100}%"></span></div>
    <form class="card card-pad stack loose" data-submit="onboard" novalidate>
      ${nErr ? html`<div class="error-summary" role="alert" id="ob-errors"><strong>Fix ${plural(nErr, 'field')} to continue.</strong></div>` : ''}
      ${d.step === 1 ? profileFields(d, 'ob', 'ui.onboard') : interestFields(d, 'ob', 'ui.onboard')}
      <div class="row between wrap">
        ${d.step === 2 ? html`<button type="button" class="btn btn-ghost" data-action="ob-back">${icon('arrowLeft', 'sm')}Back</button>` : html`<span></span>`}
        <div class="row">${d.step === 2 ? html`<button type="button" class="btn" data-action="ob-finish">Skip for now</button>` : ''}
          <button class="btn btn-primary" type="submit">${d.step === 1 ? html`Continue ${icon('arrowRight', 'sm')}` : html`${icon('check')}Finish setup`}</button></div>
      </div>
    </form>
    ${S.pendingInvite ? html`<div class="notice">${icon('key')}<div>After this, Labby takes you back to the class invitation you opened.</div></div>` : ''}
  </main>`;
}
function finishOnboarding() {
  const d = S.ui.onboard; const u = me();
  d.errors = profileValidate(d);
  if (Object.keys(d.errors).length) { d.step = 1; U.focusAfter = '#ob-errors'; commit(); return; }
  u.name = d.name.trim();
  u.profile = { displayName: d.displayName.trim(), school: d.school.trim(), level: d.level, gradYear: d.gradYear, interests: d.interests, bio: d.bio.trim(), avatar: d.avatar };
  u.school = u.profile.school; u.onboarded = true; S.ui.onboard = null;
  const st = S.students.find((x) => x.id === u.id); if (st) st.name = u.name;
  commit(); go(homeFor());
  toast(S.pendingInvite ? 'Profile saved. Now finish joining your class.' : 'Profile saved. Next, join a class with the code from your teacher.', 'check');
}

/* ---------- Profile & Settings ---------- */
function profileView() {
  const u = me(); const p = u.profile || {};
  if (!S.ui.profileDraft || S.ui.profileDraft.uid !== u.id) S.ui.profileDraft = { uid: u.id, name: u.name, displayName: p.displayName || '', school: p.school || u.school || '', level: p.level || '', gradYear: p.gradYear || '', interests: [...(p.interests || [])], custom: '', bio: p.bio || '', avatar: p.avatar || null, errors: {} };
  const d = S.ui.profileDraft; const nErr = Object.keys(d.errors).length;
  const enr = studentEnrollments(u.id);
  return html`<form class="stack loose" style="max-width:820px" data-submit="profile-save" novalidate>
    ${nErr ? html`<div class="error-summary" role="alert" id="pf-errors"><strong>Fix ${plural(nErr, 'field')} to save.</strong></div>` : ''}
    <section class="card card-pad stack" aria-labelledby="sp-basic"><h2 id="sp-basic">Profile</h2>${profileFields(d, 'sp', 'ui.profileDraft')}</section>
    <section class="card card-pad stack" aria-labelledby="sp-more"><h2 id="sp-more">Interests and photo</h2>${interestFields(d, 'sp', 'ui.profileDraft')}</section>
    <div class="sticky-actions"><button class="btn btn-ghost" type="button" data-action="profile-reset">Discard changes</button><span class="spacer"></span><button class="btn btn-primary" type="submit">${icon('check')}Save profile</button></div>
    <section class="card card-pad stack" aria-labelledby="sp-acct"><h2 id="sp-acct">Account</h2>
      <p class="small">${u.email} · signed up as <strong>${u.role === 'independent' ? 'Independent' : cap(u.role)}</strong>. Classes you’ve joined: ${enr.length ? enr.map(enrollmentLabel).join('; ') : 'none yet'}.</p>
      <div class="row wrap"><a class="btn btn-sm" href="#s/join">${icon('key', 'sm')}Join a class</a><button type="button" class="btn btn-sm btn-ghost" data-action="signout">${icon('logout', 'sm')}Sign out</button></div></section>
  </form>`;
}
function saveProfile() {
  const d = S.ui.profileDraft; const u = me();
  d.errors = profileValidate(d);
  if (Object.keys(d.errors).length) { U.focusAfter = '#pf-errors'; commit(); return; }
  u.name = d.name.trim(); u.profile = { displayName: d.displayName.trim(), school: d.school.trim(), level: d.level, gradYear: d.gradYear, interests: d.interests, bio: d.bio.trim(), avatar: d.avatar };
  u.school = u.profile.school; S.ui.profileDraft = null;
  const st = S.students.find((x) => x.id === u.id); if (st) st.name = u.name;
  commit(); toast('Profile saved.');
}
async function readAvatar(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose an image file (PNG, JPEG, WebP or GIF).');
  if (file.size > 8 * 1024 * 1024) throw new Error('That image is larger than 8 MB. Choose a smaller one.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image couldn’t be read.')); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight); const cv = document.createElement('canvas'); cv.width = cv.height = 160;
    cv.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 160, 160);
    return cv.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- Joining a class ---------- */
function joinDraft(r) {
  const d = S.ui.joinDraft;
  if (r && r.name === 'join' && (!d || d.fromLink !== r.hash)) {
    S.ui.joinDraft = { code: r.code, periodId: r.periodId, fromLink: r.hash, linkPeriod: r.periodId, looked: true };
  } else if (!d) S.ui.joinDraft = { code: '', periodId: '', looked: false };
  return S.ui.joinDraft;
}
function joinView(r) {
  const d = joinDraft(r); const u = me();
  const res = d.looked ? findClassByCode(d.code) : null;
  const cls = res && res.cls;
  const already = cls ? myEnrollment(cls.id) : null;
  const owner = cls && cls.teacherId === u.id;
  const linkPeriod = cls && d.linkPeriod && periodOf(cls, d.linkPeriod);
  const msgs = {
    empty: 'Enter the 6-character code from your teacher.',
    invalid: 'No class uses that code. Check for typos: codes look like K7Q-M4X.',
    expired: 'That code isn’t active anymore. Your teacher replaced it, so ask them for the new code or link.',
    disabled: 'This class isn’t accepting new students right now. Ask your teacher to turn joining back on.',
  };
  return html`<div class="stack loose" style="max-width:720px">
    ${S.pendingInvite ? html`<div class="notice">${icon('key')}<div>You opened a class invitation${d.fromLink ? '' : ' earlier'}. Review it below.</div></div>` : ''}
    <form class="card card-pad stack" data-submit="join-lookup" novalidate>
      <h2>Enter a class code</h2>
      <p class="muted small">Your teacher shares a code like <span class="mono">K7Q-M4X</span>, or a join link that fills it in for you.</p>
      <div class="row wrap" style="align-items:flex-end">
        ${field({ label: 'Class code', id: 'jn-code', bind: 'ui.joinDraft.code', value: d.code, cls: 'grow', attrs: 'autocomplete="off" autocapitalize="characters" spellcheck="false" style="font-family:var(--font-mono);letter-spacing:0.12em;text-transform:uppercase;max-width:220px"', error: res && res.status !== 'ok' ? msgs[res.status] : '' })}
        <button class="btn btn-primary" type="submit">${icon('search')}Find class</button>
      </div>
    </form>
    ${cls && res.status === 'ok' ? html`<section class="card" aria-labelledby="jn-name">
      <div class="card-body stack">
        <div class="row between wrap top"><div class="stack tight"><span class="eyebrow">Class found</span><h2 id="jn-name" style="font-size:1.35rem">${cls.name}</h2>
          <span class="small muted">${cls.subject} · ${cls.level}</span></div><span class="tag mono">${cls.joinCode}</span></div>
        <div class="row wrap small"><span>${icon('user', 'sm')} Teacher: <strong>${(teacherOf(cls) || {}).name || 'Unknown'}</strong></span>${(teacherOf(cls) || {}).school ? html`<span>${icon('cap', 'sm')} ${teacherOf(cls).school}</span>` : ''}</div>
        ${owner ? html`<div class="notice warn">${icon('alert')}<div>You teach this class, so you can’t join it as a student.</div></div>`
        : already ? html`<div class="notice ok">${icon('checkCircle')}<div>You’re already enrolled in ${cls.name} · <strong>${periodName(cls.id, already.periodId)}</strong>. Nothing else to do.</div></div>
          <div><a class="btn btn-primary" href="#s/class/${cls.id}" data-action="join-clear">Open class</a></div>`
        : html`<fieldset class="stack tight" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">${linkPeriod && d.periodId === d.linkPeriod ? 'Your period' : 'Choose your class period'}</legend>
            ${linkPeriod && d.periodId === d.linkPeriod ? html`<div class="panel row between wrap"><span>${icon('check')} Your link is for <strong>${linkPeriod.name}</strong>.</span><button type="button" class="link-btn small" data-action="join-change-period">Not your period?</button></div>`
            : html`${d.linkPeriod && !linkPeriod ? html`<p class="small" style="color:var(--warn)">${icon('alert', 'sm')} The period in your link no longer exists. Choose your period below.</p>` : ''}
              <div class="stack tight" role="radiogroup">${cls.periods.map((p) => html`<label class="jp-period" for="jn-p-${p.id}" style="cursor:pointer;padding:10px 12px"><input type="radio" name="jn-period" id="jn-p-${p.id}" value="${p.id}" data-bind="ui.joinDraft.periodId" data-type="str"${attr(d.periodId === p.id, 'checked')}><span>${p.name}</span></label>`)}</div>`}
            ${d.periodError ? html`<div class="err" id="jn-perr">${icon('alert', 'sm')}${d.periodError}</div>` : ''}</fieldset>
          <div class="row wrap"><button class="btn btn-primary" data-action="join-confirm">${icon('check')}Join ${cls.name}${d.periodId && periodOf(cls, d.periodId) ? ' · ' + periodOf(cls, d.periodId).name : ''}</button>
            <button class="btn btn-ghost" data-action="join-cancel">Cancel</button></div>
          <p class="hint">Joining shares your name and profile with ${(teacherOf(cls) || {}).name || 'the teacher'}. It doesn’t give you any teacher access.</p>`}
      </div></section>` : ''}
  </div>`;
}
function confirmJoin() {
  const d = S.ui.joinDraft; const res = findClassByCode(d.code); const u = me();
  if (res.status !== 'ok') { d.looked = true; commit(); return; }
  const cls = res.cls;
  if (cls.teacherId === u.id || myEnrollment(cls.id)) { commit(); return; }
  const per = periodOf(cls, d.periodId);
  if (!per) { d.periodError = 'Choose your class period.'; U.focusAfter = '#jn-perr'; commit(); return; }
  ensureStudentRecord(u);
  S.enrollments.push({ id: uid(), classId: cls.id, periodId: per.id, studentId: u.id, joinedAt: Date.now() });
  S.pendingInvite = null; S.ui.joinDraft = null; S.ui.sClass = '';
  u.lastWorkspace = 'student';
  commit(); go(`s/class/${cls.id}`);
  toast(`You joined ${cls.name} · ${per.name}.`, 'checkCircle');
}

/* ---------- Lab cards and pages ---------- */
function studentLabsFor(uid, classFilter = '') {
  return studentAssignments(uid).filter((x) => !classFilter || x.e.id === classFilter).map((x) => ({ ...x, view: studentLabView(x.a, uid) })).filter((x) => x.view);
}
const studentPill = (k) => pill(STUDENT_LAB_STATUS[k]);
function sessionLine(v) {
  if (v.sessionStatus === 'paused') return 'Paused by your teacher';
  if (v.status === 'ready') return 'Your teacher opened the live session';
  if (v.status === 'inprogress') return 'Session in progress';
  if (v.status === 'completed') return 'Session complete';
  return v.autoOpen ? 'Opens automatically at the scheduled time' : 'Opens when your teacher starts it';
}
function labCard(x) {
  const v = x.view; const prep = v.sections.prep;
  return html`<article class="card class-card" data-key="slc-${v.assignmentId}">
    <div class="row between top wrap"><div class="stack tight" style="min-width:0"><h3>${v.title}</h3><span class="small muted">${v.className} · ${v.periodName}</span></div>${studentPill(v.status)}</div>
    ${v.description ? html`<p class="small">${v.description}</p>` : ''}
    <div class="row wrap small" style="gap:6px 14px"><span>${icon('calendar', 'sm')} ${fmtSchedule({ scheduledFor: v.scheduledFor, scheduledTime: v.scheduledTime })}</span><span>${icon('clock', 'sm')} About ${v.durationMin} min</span></div>
    ${prep && prep.length ? html`<div class="next-lab"><span class="eyebrow">Prepare</span><span class="small">${prep[0]}${prep.length > 1 ? ` (+${prep.length - 1} more)` : ''}</span></div>` : ''}
    <span class="xs muted">${sessionLine(v)}</span>
    <div class="row wrap"><a class="btn btn-sm" href="#s/lab/${v.assignmentId}">View lab</a>
      ${v.status === 'ready' || v.status === 'inprogress' ? html`<a class="btn btn-sm btn-primary" href="#s/live/${v.sessionId}">${icon('activity', 'sm')}${v.status === 'inprogress' ? 'Resume' : 'Enter'} Live Session</a>` : ''}</div>
  </article>`;
}
function studentClassSelect() {
  const enr = studentEnrollments(S.currentUserId);
  if (enr.length < 2) return enr.length ? html`<span class="tag">${enrollmentLabel(enr[0])}</span>` : '';
  return html`<div class="ctx"><label class="sr-only" for="s-class">Class</label><select class="select sm" id="s-class" data-change="s-class">${options([['', 'All my classes'], ...enr.map((e) => [e.id, enrollmentLabel(e)])], S.ui.sClass || '')}</select></div>`;
}

function studentOverview() {
  const u = me(); const enr = studentEnrollments(u.id);
  const intro = html`<div class="page-intro"><div class="stack tight"><p class="eyebrow">${fmtDateLong(Date.now())}</p><h2 style="font-size:1.45rem">${greeting()}, ${displayName(u)}.</h2></div>
    <a class="btn" href="#s/join">${icon('key')}Join a class</a></div>`;
  if (!enr.length) return html`${intro}<div class="card">${emptyState({ ico: 'key', title: 'Join your first class', text: 'Ask your teacher for the class code or join link. Once you join, your labs show up here.', actions: html`<a class="btn btn-primary" href="#s/join">${icon('key')}Join a class</a>` })}</div>`;
  const labs = studentLabsFor(u.id, S.ui.sClass);
  const live = labs.filter((x) => x.view.status === 'ready' || x.view.status === 'inprogress');
  const upcoming = labs.filter((x) => x.view.status === 'upcoming' || x.view.status === 'prepare').sort((a, b) => scheduledAt(a.a) - scheduledAt(b.a));
  const prepping = upcoming.filter((x) => (x.view.sections.prep || []).length);
  return html`${intro}<div class="stack loose">
    ${live.map((x) => { const v = x.view; return html`<section class="card live-hero" aria-labelledby="lh-${v.assignmentId}" data-key="lh-${v.assignmentId}">
      <div class="card-body row between wrap"><div class="stack tight"><div class="row wrap">${studentPill(v.status)}${v.sessionStatus === 'paused' ? html`<span class="pill tone-warn">${icon('pause')}Paused by teacher</span>` : ''}</div>
        <h2 id="lh-${v.assignmentId}" style="font-size:1.35rem">${v.title}</h2><span class="small muted">${v.className} · ${v.periodName}${v.group ? ` · ${v.group.name}` : ''}</span></div>
        <a class="btn btn-primary btn-lg" href="#s/live/${v.sessionId}">${icon('activity')}${v.status === 'inprogress' ? 'Resume Live Session' : 'Enter Live Session'}</a></div></section>`; })}
    <div class="grid grid-main-side">
      <section class="card" aria-labelledby="so-up"><div class="card-head"><h2 id="so-up">Upcoming labs</h2><a class="btn btn-sm" href="#s/labs">All labs</a></div>
        <div class="card-body">${upcoming.length ? html`<div>${upcoming.map((x) => html`<div class="mini-group" style="grid-template-columns:minmax(0,1fr) auto" data-key="su-${x.a.id}">
            <div class="stack tight" style="min-width:0"><a class="lib-title" href="#s/lab/${x.a.id}">${x.view.title}</a><span class="xs muted">${x.view.className} · ${fmtSchedule(x.a)}</span></div>${studentPill(x.view.status)}</div>`)}</div>`
          : labs.length ? html`<p class="small muted">Nothing scheduled right now.</p>` : emptyState({ ico: 'flask', title: 'Your teacher hasn’t published any labs yet', text: 'Labs show up here as soon as your teacher publishes them.', compact: true })}</div></section>
      <section class="card" aria-labelledby="so-prep"><div class="card-head"><h2 id="so-prep">Get ready</h2></div>
        <div class="card-body">${prepping.length ? prepping.slice(0, 2).map((x) => html`<div class="stack tight" style="margin-bottom:12px"><a class="lib-title small" href="#s/lab/${x.a.id}">${x.view.title}</a>${prepList(x.view, true)}</div>`)
          : html`<p class="small muted">No preparation tasks right now.</p>`}</div></section>
    </div>
    <section class="stack" aria-labelledby="so-classes"><div class="row between"><h2 id="so-classes">My classes</h2><a class="btn btn-sm" href="#s/classes">All classes</a></div>
      <div class="grid grid-3">${enr.map(studentClassCard)}</div></section>
  </div>`;
}
function studentClassCard(e) {
  const cls = classById(e.classId); const t = teacherOf(cls); const g = studentGroup(cls.id, e.periodId, S.currentUserId);
  const n = studentLabsFor(S.currentUserId, e.id).length;
  return html`<article class="card class-card" data-key="scc-${e.id}"><div class="stack tight"><h3>${cls.name}</h3><span class="small muted">${cls.subject} · ${periodName(cls.id, e.periodId)}</span></div>
    <span class="small">${icon('user', 'sm')} ${t ? t.name : 'Teacher'}${t && t.school ? ` · ${t.school}` : ''}</span>
    <span class="small">${icon('users', 'sm')} ${g ? `${g.name}: ${memberNames(g).filter((nm) => nm !== me().name).map((nm) => nm.split(' ')[0]).join(', ')}` : 'No lab group yet'}</span>
    <span class="small"><strong>${n}</strong> published ${n === 1 ? 'lab' : 'labs'}</span>
    <div><a class="btn btn-sm" href="#s/class/${cls.id}">Open class ${icon('arrowRight', 'sm')}</a></div></article>`;
}
function studentClassesView() {
  const enr = studentEnrollments(S.currentUserId);
  return html`<div class="page-intro"><p>Classes you’ve joined. Each one shows your period, teacher and lab group.</p><a class="btn btn-primary" href="#s/join">${icon('key')}Join a class</a></div>
    ${enr.length ? html`<div class="grid grid-3">${enr.map(studentClassCard)}</div>` : html`<div class="card">${emptyState({ ico: 'key', title: 'Join your first class', text: 'Enter the code or open the link from your teacher.', actions: html`<a class="btn btn-primary" href="#s/join">Join a class</a>` })}</div>`}`;
}
function studentClassView(id) {
  const e = myEnrollment(id); const cls = classById(id);
  if (!e || !cls) return html`<div class="card">${emptyState({ ico: 'lock', title: 'You’re not in this class', text: 'You can only see classes you’ve joined. Ask your teacher for the class code.', actions: html`<a class="btn" href="#s/join">Join a class</a>` })}</div>`;
  const t = teacherOf(cls); const g = studentGroup(cls.id, e.periodId, S.currentUserId);
  const labs = studentLabsFor(S.currentUserId, e.id);
  return html`<div class="stack loose">
    <section class="card card-pad stack tight"><div class="row wrap">${pill({ label: periodName(cls.id, e.periodId), icon: 'calendar', tone: 'accent' })}<span class="small muted">${cls.subject} · ${cls.level}</span></div>
      <p class="small">${icon('user', 'sm')} Teacher: <strong>${t ? t.name : 'Unknown'}</strong>${t && t.school ? ` · ${t.school}` : ''}</p>
      ${cls.description ? html`<p class="small muted">${cls.description}</p>` : ''}
      <p class="small">${icon('users', 'sm')} ${g ? html`Lab group <strong>${g.name}</strong>: ${memberNames(g).join(', ')}` : 'Your teacher hasn’t put you in a lab group yet.'}</p></section>
    <section class="stack" aria-labelledby="sc-labs"><h2 id="sc-labs">Published labs</h2>
      ${labs.length ? html`<div class="grid grid-2">${labs.map(labCard)}</div>` : html`<div class="card">${emptyState({ ico: 'flask', title: 'Your teacher hasn’t published any labs yet', text: 'When they do, the lab and its preparation materials appear here.', compact: true })}</div>`}</section>
  </div>`;
}
function studentLabsView() {
  const all = studentLabsFor(S.currentUserId, S.ui.sClass);
  const f = S.ui.sLabFilter || 'all';
  const counts = {}; all.forEach((x) => { counts[x.view.status] = (counts[x.view.status] || 0) + 1; });
  const list = all.filter((x) => f === 'all' || x.view.status === f);
  return html`<div class="page-intro"><p>Labs your teachers have published. You only see what each teacher has released so far.</p></div>
    <div class="chips" role="group" aria-label="Filter labs by status" style="margin-bottom:14px">
      <button class="chip" aria-pressed="${f === 'all'}" data-action="s-lab-filter" data-f="all">All<span class="count">${all.length}</span></button>
      ${Object.keys(STUDENT_LAB_STATUS).map((k) => html`<button class="chip" aria-pressed="${f === k}" data-action="s-lab-filter" data-f="${k}">${icon(STUDENT_LAB_STATUS[k].icon, 'sm')}${STUDENT_LAB_STATUS[k].label}<span class="count">${counts[k] || 0}</span></button>`)}</div>
    ${!studentEnrollments(S.currentUserId).length ? html`<div class="card">${emptyState({ ico: 'key', title: 'Join your first class', text: 'Labs appear after you join a class.', actions: html`<a class="btn btn-primary" href="#s/join">Join a class</a>` })}</div>`
      : list.length ? html`<div class="grid grid-2">${list.map(labCard)}</div>` : html`<div class="card">${emptyState({ ico: 'flask', title: all.length ? 'No labs with this status' : 'Your teacher hasn’t published any labs yet', text: all.length ? 'Choose another filter.' : 'Labs show up here once your teacher publishes them.', compact: true })}</div>`}`;
}

function prepList(v, compact = false) {
  const key = `${S.currentUserId}:${v.assignmentId}`; const done = new Set(S.prepChecks[key] || []);
  return html`<ul class="check-list">${(v.sections.prep || []).map((t, i) => html`<li><label class="check" for="prep-${v.assignmentId}-${i}${compact ? '-c' : ''}"><input type="checkbox" id="prep-${v.assignmentId}-${i}${compact ? '-c' : ''}" data-change="prep-check" data-aid="${v.assignmentId}" data-i="${i}"${attr(done.has(i), 'checked')}${attr(v.preview, 'disabled')}><span>${t}</span></label></li>`)}</ul>`;
}
/** Lab page body shared by students and the teacher’s Preview as Student. Reads only the projection. */
function studentLabDetail(v, { preview = false } = {}) {
  v.preview = preview; const s = v.sections;
  const cta = preview ? '' : v.status === 'ready' || v.status === 'inprogress' ? html`<a class="btn btn-primary btn-lg" href="#s/live/${v.sessionId}">${icon('activity')}${v.status === 'inprogress' ? 'Resume Live Session' : 'Enter Live Session'}</a>`
    : v.status === 'completed' ? html`<a class="btn" href="#s/live/${v.sessionId}">${icon('eye')}Review the session</a>` : '';
  const rec = (cp) => (v.sessionId && v.group ? cpRecordFor(v.sessionId, v.group.id, cp, S.currentUserId) : null);
  return html`<div class="stack loose">
    <section class="card card-pad stack">
      <div class="row between wrap top"><div class="stack tight" style="min-width:0"><div class="row wrap">${studentPill(v.status)}<span class="tag">${icon('lock', 'sm')}Version ${v.versionNumber}</span></div>
        ${preview ? html`<h2 style="font-size:1.35rem">${v.title}</h2>` : ''}
        ${v.description ? html`<p>${v.description}</p>` : ''}
        <div class="row wrap small" style="gap:6px 16px"><span>${icon('users', 'sm')} ${v.className} · ${v.periodName}</span>${v.teacherName ? html`<span>${icon('user', 'sm')} ${v.teacherName}</span>` : ''}
          <span>${icon('calendar', 'sm')} ${fmtSchedule({ scheduledFor: v.scheduledFor, scheduledTime: v.scheduledTime })}</span><span>${icon('clock', 'sm')} About ${v.durationMin} min</span></div></div>${cta}</div>
      <div class="notice">${icon('info')}<div><strong>${sessionLine(v)}.</strong> ${v.status === 'prepare' || v.status === 'upcoming' ? 'The scheduled date is when your class plans to run the lab. The live session starts when your teacher opens it.' : ''}</div></div>
      ${preview ? '' : html`<p class="small">${icon('users', 'sm')} ${v.group ? html`Your lab group: <strong>${v.group.name}</strong> (${v.group.members.join(', ')})` : 'You’re not in a lab group yet. Ask your teacher to add you before the session.'}</p>`}
    </section>
    ${v.locked.length ? html`<section class="panel stack tight" aria-labelledby="lk-h"><h3 id="lk-h" class="row">${icon('lock', 'sm')}Not released yet</h3>
      <ul class="ul-plain small">${v.locked.map((l) => html`<li><strong>${l.label}</strong>: ${l.when}</li>`)}</ul></section>` : ''}
    ${s.objectives ? html`<section class="card card-pad stack tight"><h2>Learning objectives</h2><ul class="ul-plain">${s.objectives.map((o) => html`<li>${o}</li>`)}</ul></section>` : ''}
    ${s.background ? html`<section class="card card-pad stack tight"><h2>Background</h2><p style="white-space:pre-wrap">${s.background}</p></section>` : ''}
    ${s.prep ? html`<section class="card card-pad stack tight"><h2>Preparation tasks</h2>${prepList(v)}</section>` : ''}
    ${s.materials ? html`<section class="card card-pad stack tight"><h2>Materials and equipment</h2><div class="table-wrap"><table><thead><tr><th>Item</th><th>Your group needs</th></tr></thead>
      <tbody>${s.materials.map((m) => html`<tr><td>${m.name}</td><td>${fmtQty(m.qty)} ${m.unit}${m.per === 'student' ? ' per student' : m.sharedBy > 1 ? ` (shared by ${m.sharedBy} groups)` : ''}</td></tr>`)}</tbody></table></div></section>` : ''}
    ${s.precautions ? html`<section class="card card-pad stack tight" style="border-color:color-mix(in srgb,var(--warn) 45%,var(--line))"><h2 class="row">${icon('alert')}Precautions</h2><ul class="ul-plain">${s.precautions.map((o) => html`<li>${o}</li>`)}</ul></section>` : ''}
    ${s.studentNotes ? html`<section class="card card-pad stack tight"><h2>Notes from your teacher</h2><p style="white-space:pre-wrap">${s.studentNotes}</p></section>` : ''}
    ${s.attachments ? html`<section class="card card-pad stack tight"><h2>Attachments</h2>${s.attachments.map((f) => html`<div class="row between panel"><span>${icon('file', 'sm')} ${f.name} <span class="xs muted">${(f.size / 1024).toFixed(0)} KB</span></span><button class="btn btn-sm" data-action="open-attachment" data-key="${f.key || ''}" data-name="${f.name}"${attr(!f.key, 'disabled')}>Open</button></div>`)}</section>` : ''}
    ${v.procedure ? html`<section class="card card-pad stack" aria-labelledby="sl-proc"><h2 id="sl-proc">Procedure</h2>
      <ol class="step-list">${v.procedure.steps.map((st, i) => { const cp = v.procedure.checkpoints.find((x) => x.afterStepId === st.id); return html`<li class="step-item" data-key="sls-${st.id}"><span class="step-n" aria-hidden="true">${i + 1}</span>
        <div class="stack tight" style="min-width:0"><strong>${st.title}</strong><span class="small">${st.instructions}</span>${st.inputs.length ? html`<span class="xs muted">${icon('ruler', 'sm')} Record: ${st.inputs.map((x) => `${x.label}${x.unit ? ` (${x.unit})` : ''}`).join(', ')}</span>` : ''}</div>
        <span class="step-min">${st.minutes ? `${st.minutes} min` : ''}</span></li>${cp ? checkpointReview(cp, rec(cp)) : ''}`; })}</ol>
      ${v.procedure.cleanup.length ? html`<h3>Cleanup</h3><ul class="ul-plain small">${v.procedure.cleanup.map((o) => html`<li>${o}</li>`)}</ul>` : ''}</section>` : ''}
  </div>`;
}
/** A released checkpoint shown for review (lab page and after the session). */
function checkpointReview(cp, rec) {
  return html`<li class="cp-block" data-key="cpr-${cp.id}"><div class="row wrap">${icon('clipboard')}<strong>Checkpoint: ${cp.title}</strong><span class="xs muted">${cp.rule}</span></div>
    ${cp.info ? html`<p class="small">${cp.info}</p>` : ''}
    ${cp.questions.map((q) => { const a = rec ? rec.responses[q.id] : ''; const res = (cp.results || []).find((x) => x.qid === q.id);
      return html`<div class="small"><span class="strong">${q.prompt}</span><br>${a ? html`<span>${q.type === 'mc' ? ((q.options.find((o) => o.id === a) || {}).text || '') : a}${q.unit ? ' ' + q.unit : ''}</span>` : html`<span class="muted">No answer saved</span>`}
        ${res ? html`<span class="tag" style="margin-left:6px">${res.correct ? 'Correct' : 'Not quite'}</span>${res.feedback ? html`<br><span class="muted">${res.feedback}</span>` : ''}` : ''}</div>`; })}
  </li>`;
}
function studentLabView_(id) {
  const a = S.assignments.find((x) => x.id === id);
  const v = a ? studentLabView(a, S.currentUserId) : null;
  if (!v) return [null, html`<div class="card">${emptyState({ ico: 'lock', title: 'This lab isn’t available to you', text: 'It may not be published yet, or it’s for a class period you’re not in.', actions: html`<a class="btn" href="#s/labs">Back to My Labs</a>` })}</div>`];
  return [v, studentLabDetail(v)];
}

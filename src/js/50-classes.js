/* =====================================================================
   Classes: create, join codes, enrollment by period, lab groups, labs.
   Production: a class code grants enrollment only (never teacher
   permissions), and code checks + enrollment happen on the server.
   ===================================================================== */
function classesView() {
  const classes = myClasses();
  return html`<div class="page-intro"><p>Each class has one join code. Students enter it, then choose their period, so they always land in the right section.</p>
    <a class="btn btn-primary" href="#class-new">${icon('plus')}Create class</a></div>
    ${classes.length ? html`<div class="grid grid-3">${classes.map(classCard)}</div>`
      : html`<div class="card">${emptyState({ ico: 'users', title: 'No classes yet', text: 'Create a class to get a join code for your students. You can add as many periods or sections as you teach.', actions: html`<a class="btn btn-primary" href="#class-new">${icon('plus')}Create class</a>` })}</div>`}`;
}

function newClassDraft() { return { name: '', subject: '', level: '', description: '', periods: [{ id: uid(), name: 'Period 1', expected: '' }], errors: {} }; }
function createClassView() {
  if (!S.ui.createClass) S.ui.createClass = newClassDraft();
  const f = S.ui.createClass; const e = f.errors || {};
  const nErr = Object.keys(e).length;
  return html`<div class="page-intro"><p>You’ll get a join code as soon as the class is created. You can change periods and groups later.</p></div>
  <form class="card" style="max-width:820px" data-submit="create-class" novalidate>
    <div class="card-body stack loose">
      ${nErr ? html`<div class="error-summary" role="alert" id="cc-errors"><strong>Fix ${plural(nErr, 'problem')} to create the class:</strong><ul>${Object.values(e).map((m) => html`<li>${m}</li>`)}</ul></div>` : ''}
      <div class="form-grid">
        ${field({ label: 'Class name', id: 'cc-name', bind: 'ui.createClass.name', value: f.name, placeholder: 'e.g. Chemistry 1', error: e.name })}
        ${field({ label: 'Subject or course', id: 'cc-subject', bind: 'ui.createClass.subject', value: f.subject, placeholder: 'e.g. Chemistry', error: e.subject })}
        ${selectField({ label: 'Grade or education level', id: 'cc-level', bind: 'ui.createClass.level', value: f.level, opts: [['', 'Choose a level'], ...LEVELS], error: e.level })}
        ${textareaField({ label: 'Description', id: 'cc-desc', bind: 'ui.createClass.description', value: f.description, opt: true, rows: 2, cls: 'span-2', placeholder: 'What students should know about this class' })}
      </div>
      <fieldset class="stack" style="border:0;padding:0;margin:0">
        <legend><h2 style="font-size:1.05rem">Periods or sections</h2></legend>
        <p class="hint">Expected enrollment is your planning number. Actual enrollment counts students who have joined with the code.</p>
        ${f.periods.map((p, i) => html`<div class="period-row" data-key="pr-${p.id}">
          ${field({ label: i === 0 ? 'Period or section name' : html`<span class="sr-only">Period ${i + 1} name</span>`, id: `cc-p-${i}-name`, bind: `ui.createClass.periods.${i}.name`, value: p.name, error: e[`p${i}name`] || '' })}
          ${field({ label: i === 0 ? 'Expected students' : html`<span class="sr-only">Period ${i + 1} expected students</span>`, id: `cc-p-${i}-exp`, bind: `ui.createClass.periods.${i}.expected`, value: p.expected, type: 'number', min: 0, max: 200, error: e[`p${i}exp`] || '' })}
          <button type="button" class="btn btn-ghost btn-icon" data-action="cc-period-remove" data-index="${i}" aria-label="Remove ${p.name || 'period ' + (i + 1)}"${attr(f.periods.length === 1, 'disabled')}>${icon('trash', 'sm')}</button>
        </div>`)}
        <button type="button" class="btn btn-sm" style="align-self:flex-start" data-action="cc-period-add">${icon('plus', 'sm')}Add period</button>
        <p class="small num"><strong>${sum(f.periods.map((p) => parseInt(p.expected, 10) || 0))}</strong> students expected across ${plural(f.periods.length, 'period')}.</p>
      </fieldset>
    </div>
    <div class="card-foot"><button class="btn btn-primary" type="submit">${icon('check')}Create class</button><a class="btn btn-ghost" href="#classes">Cancel</a></div>
  </form>`;
}
function submitCreateClass() {
  const f = S.ui.createClass; const e = {};
  if (!f.name.trim()) e.name = 'Enter a class name.';
  if (!f.subject.trim()) e.subject = 'Enter the subject or course.';
  if (!f.level) e.level = 'Choose a grade or education level.';
  const names = new Set();
  f.periods.forEach((p, i) => {
    const n = p.name.trim();
    if (!n) e[`p${i}name`] = `Period ${i + 1} needs a name.`;
    else if (names.has(n.toLowerCase())) e[`p${i}name`] = `“${n}” is listed twice. Each period needs its own name.`;
    names.add(n.toLowerCase());
    const x = parseInt(p.expected, 10);
    if (p.expected === '' || isNaN(x) || x < 0) e[`p${i}exp`] = `Enter expected enrollment for ${n || 'period ' + (i + 1)} (0 or more).`;
  });
  f.errors = e;
  if (Object.keys(e).length) { U.focusAfter = '#cc-errors'; commit(); return; }
  const now = Date.now();
  const cls = { id: uid(), teacherId: S.currentUserId, name: f.name.trim(), subject: f.subject.trim(), level: f.level, description: f.description.trim(), joinCode: newJoinCode(), codeUpdatedAt: now, createdAt: now, periods: f.periods.map((p) => ({ id: uid(), name: p.name.trim(), expected: parseInt(p.expected, 10) })) };
  S.classes.push(cls); S.ui.createClass = null; U.justCreated = cls.id;
  S.ui.classTab = 'roster';
  commit(); go(`class-${cls.id}`);
  toast(`${cls.name} created. Share code ${cls.joinCode} with your students.`);
}

function classDetailView(id) {
  const cls = classById(id);
  if (!cls || cls.teacherId !== S.currentUserId) return html`<div class="card">${emptyState({ ico: 'lock', title: 'Class not found', text: 'This class doesn’t exist or belongs to another teacher.', actions: html`<a class="btn" href="#classes">Back to classes</a>` })}</div>`;
  const tab = S.ui.classTab || 'roster';
  const total = enrolledCount(cls.id); const expected = sum(cls.periods.map((p) => p.expected));
  return html`<div class="stack loose">
    <div class="row between wrap top"><div class="stack tight"><a href="#classes" class="small">${icon('arrowLeft', 'sm')} All classes</a>
      <p class="muted">${cls.subject} · ${cls.level}${cls.description ? ' · ' + cls.description : ''}</p></div>
      <button class="btn" data-action="assign-open" data-cid="${cls.id}">${icon('send')}Assign a lab</button></div>
    ${U.justCreated === cls.id ? html`<div class="notice ok" role="status">${icon('checkCircle')}<div><strong>Class created.</strong> Share the join code below. Students who join will appear under their period.</div></div>` : ''}
    <section class="code-panel" aria-labelledby="jc-h">
      <div class="stack tight"><span class="eyebrow" id="jc-h">Class join code</span>
        <span class="join-code" id="join-code-${cls.id}" aria-label="Join code ${cls.joinCode.split('').join(' ')}">${cls.joinCode}</span>
        <span class="small" style="max-width:44ch">Students sign in to Labby, choose <strong>Join a class</strong>, enter this code, then pick their period. Codes aren’t case-sensitive.</span>
        <div class="row wrap" style="margin-top:6px"><button class="btn btn-primary" data-action="copy-code" data-cid="${cls.id}">${icon('copy')}Copy code</button>
          <button class="btn btn-ghost" data-action="regen-ask" data-cid="${cls.id}">${icon('refresh')}Regenerate code</button></div>
        <span class="xs muted">Code created ${fmtDayTime(cls.codeUpdatedAt)}${cls.joinEnabled === false ? ' · joining is turned off' : ''}</span>
        ${joinLinksBlock(cls)}
      </div>
      <div class="join-preview" aria-label="What students see when they join">
        <div class="jp-step"><span class="eyebrow">Student step 1</span><span class="small strong">Enter class code</span><span class="fake-input">${cls.joinCode}</span></div>
        <div class="jp-step"><span class="eyebrow">Student step 2</span><span class="small strong">Choose your period</span>
          ${cls.periods.map((p) => html`<span class="jp-period"><span class="dot"></span>${p.name}</span>`)}</div>
      </div>
    </section>
    <div class="tabs" role="tablist" aria-label="Class sections">
      <button class="tab" role="tab" aria-selected="${tab === 'roster'}" data-action="class-tab" data-tab="roster">${icon('users', 'sm')}Students & groups</button>
      <button class="tab" role="tab" aria-selected="${tab === 'labs'}" data-action="class-tab" data-tab="labs">${icon('flask', 'sm')}Labs</button>
    </div>
    ${tab === 'roster' ? rosterTab(cls, total, expected) : classLabsTab(cls)}
  </div>`;
}

function rosterTab(cls, total, expected) {
  const pid = S.ui.classPeriod[cls.id] && periodOf(cls, S.ui.classPeriod[cls.id]) ? S.ui.classPeriod[cls.id] : cls.periods[0].id;
  const per = periodOf(cls, pid);
  const students = enrolledStudents(cls.id, pid);
  const groups = groupsIn(cls.id, pid);
  const groupOf = (sid) => groups.find((g) => g.memberIds.includes(sid));
  const unassigned = students.filter((s) => !groupOf(s.id));
  const running = S.sessions.some((s) => s.classId === cls.id && s.periodId === pid && (s.status === 'active' || s.status === 'paused'));
  const size = S.ui.groupSize || 4;
  return html`<div class="stack loose">
    <div class="table-wrap"><table>
      <caption class="sr-only">Enrollment by period</caption>
      <thead><tr><th>Period</th><th class="num">Expected</th><th class="num">Joined</th><th class="num">Lab groups</th><th>Note</th></tr></thead>
      <tbody>${cls.periods.map((p) => { const n = enrolledCount(cls.id, p.id); const d = n - p.expected; return html`<tr class="clickable" data-action="class-period" data-cid="${cls.id}" data-pid="${p.id}" data-key="er-${p.id}">
        <td><strong>${p.name}</strong></td><td class="num">${p.expected}</td><td class="num">${n}</td><td class="num">${groupsIn(cls.id, p.id).length}</td>
        <td class="small">${d === 0 ? html`<span class="muted">Everyone has joined</span>` : d < 0 ? html`${-d} not joined yet` : html`${d} more than expected`}</td></tr>`; })}</tbody>
      <tfoot><tr><td>All periods</td><td class="num">${expected}</td><td class="num">${total}</td><td class="num">${S.groups.filter((g) => g.classId === cls.id).length}</td><td class="small">${total} of ${expected} expected students</td></tr></tfoot>
    </table></div>
    <div class="chips" role="group" aria-label="Choose a period">${cls.periods.map((p) => html`<button class="chip" aria-pressed="${p.id === pid}" data-action="class-period" data-cid="${cls.id}" data-pid="${p.id}">${p.name}<span class="count">${enrolledCount(cls.id, p.id)}</span></button>`)}</div>
    <div class="grid grid-2" style="align-items:start">
      <section class="card" aria-labelledby="st-h">
        <div class="card-head"><h2 id="st-h">${per.name} students</h2></div>
        <div class="card-body">${students.length ? html`<div class="table-wrap" style="border:0"><table><thead><tr><th>Name</th><th>Lab group</th></tr></thead><tbody>
          ${students.map((s) => { const g = groupOf(s.id); return html`<tr data-key="st-${s.id}"><td>${s.name}</td><td>
            <label class="sr-only" for="sg-${s.id}">Lab group for ${s.name}</label>
            <select class="select sm" id="sg-${s.id}" data-change="student-group" data-sid="${s.id}" data-cid="${cls.id}" data-pid="${pid}"${attr(running, 'disabled')}>${options([['', 'Not in a group'], ...groups.map((x) => [x.id, x.name])], g ? g.id : '')}</select></td></tr>`; })}
        </tbody></table></div>` : emptyState({ ico: 'users', title: 'No students yet', text: `When students join with code ${cls.joinCode} and choose ${per.name}, they’ll appear here.`, compact: true })}</div>
      </section>
      <section class="card" aria-labelledby="gr-h">
        <div class="card-head"><h2 id="gr-h">Lab groups</h2><span class="small muted">${plural(groups.length, 'group')} · ${unassigned.length} not in a group</span></div>
        <div class="card-body stack">
          ${running ? html`<div class="notice warn">${icon('lock')}<div>A lab is running in ${per.name}. Groups are locked until the session ends.</div></div>` : html`
          <div class="row wrap"><label for="grp-size" class="small strong">Students per group</label>
            <select class="select sm" id="grp-size" style="width:auto" data-bind="ui.groupSize" data-type="int">${options([2, 3, 4, 5], size)}</select>
            <button class="btn btn-sm" data-action="group-auto" data-cid="${cls.id}" data-pid="${pid}"${attr(!students.length, 'disabled')}>${icon('layers', 'sm')}${groups.length ? 'Rearrange all groups' : 'Arrange into groups'}</button>
            <button class="btn btn-sm btn-ghost" data-action="group-add" data-cid="${cls.id}" data-pid="${pid}">${icon('plus', 'sm')}Add empty group</button></div>
          ${students.length ? html`<p class="hint">Arranging makes ${Math.ceil(students.length / size)} balanced groups of about ${size}. You can move individual students with the menus on the left.</p>` : ''}`}
          ${groups.length ? html`<div class="grid grid-2" style="gap:10px">${groups.map((g) => html`<div class="group-card" data-key="gc-${g.id}"><div class="row between"><strong>${g.name}</strong><span class="xs muted">${plural(g.memberIds.length, 'student')}</span></div>
            <div class="member-list">${g.memberIds.length ? memberNames(g).map((n) => html`<span class="member">${n}</span>`) : html`<span class="xs muted">Empty</span>`}</div></div>`)}</div>`
            : emptyState({ ico: 'layers', title: 'No lab groups yet', text: 'Groups are what Labby tracks during a live lab. Arrange students into groups before starting a session.', compact: true })}
        </div>
      </section>
    </div>
  </div>`;
}

function classLabsTab(cls) {
  const sessions = S.sessions.filter((s) => s.classId === cls.id).sort((a, b) => sessionRank(a) - sessionRank(b) || b.scheduledFor.localeCompare(a.scheduledFor));
  if (!sessions.length) return html`<div class="card">${emptyState({ ico: 'flask', title: 'No labs assigned yet', text: 'Assign a lab from your library to one or more periods. Each period gets its own live session.', actions: html`<button class="btn btn-primary" data-action="assign-open" data-cid="${cls.id}">${icon('send')}Assign a lab</button>` })}</div>`;
  return html`<div class="table-wrap"><table><caption class="sr-only">Assigned and completed labs</caption>
    <thead><tr><th>Lab</th><th>Period</th><th>Scheduled</th><th>Status</th><th>Groups</th><th>Students see it</th><th></th></tr></thead>
    <tbody>${sessions.map((s) => { const lab = labById(s.labId); const v = versionById(lab, s.versionId); const ps = progressFor(s.id);
      return html`<tr data-key="cs-${s.id}"><td><a class="lib-title" href="#lab-${lab.id}">${v.content.title}</a><div class="xs muted">Version ${v.number}</div></td>
        <td>${periodName(cls.id, s.periodId)}</td><td class="num">${s.scheduledFor === todayISO() ? 'Today' : fmtDate(new Date(s.scheduledFor + 'T12:00').getTime())}</td>
        <td>${sessionPill(s.status)}</td><td class="num small">${s.status === 'scheduled' ? groupsIn(cls.id, s.periodId).length : `${ps.filter((p) => p.finishedAt).length}/${ps.length} finished`}</td>
        <td>${(() => { const as = S.assignments.find((x) => x.id === s.assignmentId); return html`<label class="check small" for="pub-${s.id}"><input type="checkbox" id="pub-${s.id}" data-change="as-publish" data-aid="${as.id}"${attr(as.published !== false, 'checked')}><span>Published</span></label>`; })()}</td>
        <td style="text-align:right">${s.status === 'scheduled' ? html`<button class="btn btn-sm" data-action="open-session" data-sid="${s.id}" data-where="live">${icon('play', 'sm')}Open to start</button>`
          : html`<button class="btn btn-sm" data-action="open-session" data-sid="${s.id}" data-where="live">${s.status === 'completed' ? 'View results' : html`${icon('activity', 'sm')}Live progress`}</button>`}</td></tr>`; })}
    </tbody></table></div>`;
}

function arrangeGroups(classId, periodId, size) {
  const students = enrolledStudents(classId, periodId);
  S.groups = S.groups.filter((g) => !(g.classId === classId && g.periodId === periodId));
  const n = Math.max(1, Math.ceil(students.length / size));
  const groups = Array.from({ length: n }, (_, i) => ({ id: uid(), classId, periodId, name: `Bench ${i + 1}`, memberIds: [] }));
  students.forEach((s, i) => groups[i % n].memberIds.push(s.id));
  S.groups.push(...groups);
  return groups.length;
}

/* ---------- Modals: regenerate code, assign lab ---------- */
function regenModal() {
  const cls = classById(U.modal.classId);
  return modalShell({ title: 'Regenerate join code?', body: html`<p>Code <strong class="mono">${cls.joinCode}</strong> will stop working right away.</p>
    <ul class="ul-plain"><li>Students who already joined stay enrolled in their periods.</li><li>Anyone who hasn’t joined yet will need the new code.</li></ul>`,
  foot: html`<button class="btn" data-action="modal-close">Keep current code</button><button class="btn btn-danger solid" data-action="regen-confirm" data-cid="${cls.id}">${icon('refresh')}Regenerate code</button>` });
}

function assignModal() {
  const m = U.modal; const classes = myClasses();
  const labs = myLabs().filter((l) => !l.archived && latestReady(l));
  const lab = labById(m.labId); const cls = classById(m.classId);
  const ready = lab && latestReady(lab); const latest = lab && latestVersion(lab);
  const body = !classes.length ? emptyState({ ico: 'users', title: 'Create a class first', text: 'Labs are assigned to class periods.', compact: true, actions: html`<a class="btn btn-primary" href="#class-new" data-action="modal-close">Create class</a>` })
    : !labs.length ? emptyState({ ico: 'book', title: 'No labs are ready to assign', text: 'Review a draft and mark it Ready to Assign first.', compact: true, actions: html`<a class="btn btn-primary" href="#library" data-action="modal-close">Open library</a>` })
    : html`${m.error ? html`<div class="error-summary" role="alert">${m.error}</div>` : ''}
      ${selectField({ label: 'Lab', id: 'as-lab', bind: 'U.modal.labId', value: m.labId || '', opts: [['', 'Choose a lab'], ...labs.map((l) => [l.id, labTitle(l)])] })}
      ${ready ? html`<div class="notice">${icon('lock')}<div>Students will get <strong>version ${ready.number}</strong>${latest.id !== ready.id ? html` (version ${latest.number} is still a draft and won’t be used)` : ''}. Later edits create a new version, so this session’s instructions won’t change mid-lab.</div></div>` : ''}
      ${selectField({ label: 'Class', id: 'as-class', bind: 'U.modal.classId', value: m.classId || '', opts: [['', 'Choose a class'], ...classes.map((c) => [c.id, c.name])] })}
      ${cls ? html`<fieldset class="stack tight" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Periods</legend>
        ${cls.periods.map((p) => { const ng = groupsIn(cls.id, p.id).length; return html`<label class="check" for="as-p-${p.id}"><input type="checkbox" id="as-p-${p.id}" data-action="as-period" data-pid="${p.id}"${attr(m.periodIds.includes(p.id), 'checked')}>
          <span>${p.name} <span class="muted small">· ${enrolledCount(cls.id, p.id)} students, ${plural(ng, 'lab group')}</span>${!ng ? html`<span class="hint" style="display:block">Arrange groups before this session starts.</span>` : ''}</span></label>`; })}
      </fieldset>` : ''}
      <div class="form-grid">${field({ label: 'Lab date', id: 'as-date', bind: 'U.modal.date', value: m.date, type: 'date' })}${field({ label: 'Start time', id: 'as-time', bind: 'U.modal.time', value: m.time || '', type: 'time', opt: true })}</div>
      ${checkField({ label: 'Publish to students now', id: 'as-pub', bind: 'U.modal.published', checked: m.published !== false, hint: 'Students see what your release settings allow. You can unpublish from the class page.' })}
      ${checkField({ label: 'Let students start at the scheduled time without me opening the session', id: 'as-auto', bind: 'U.modal.autoOpen', checked: !!m.autoOpen, hint: 'Off by default: the session opens only when you start it in Live Progress.' })}`;
  return modalShell({ title: 'Assign a lab', sub: 'Each selected period gets its own session you can start from Live Progress.', body,
    foot: classes.length && labs.length ? html`<button class="btn" data-action="modal-close">Cancel</button><button class="btn btn-primary" data-action="assign-submit">${icon('send')}Assign lab</button>` : '' });
}
function submitAssign() {
  const m = U.modal; const lab = labById(m.labId); const cls = classById(m.classId);
  if (!lab) { m.error = 'Choose a lab.'; commit(); return; }
  const v = latestReady(lab);
  if (!v) { m.error = 'This lab has no version marked Ready to Assign.'; commit(); return; }
  if (!cls) { m.error = 'Choose a class.'; commit(); return; }
  if (!m.periodIds.length) { m.error = 'Choose at least one period.'; commit(); return; }
  if (!m.date) { m.error = 'Choose a date.'; commit(); return; }
  createAssignment(lab.id, v.id, cls.id, m.periodIds, m.date, { time: m.time, published: m.published !== false, autoOpen: !!m.autoOpen });
  const names = m.periodIds.map((p) => periodName(cls.id, p)).join(', ');
  U.modal = null; commit();
  toast(`${v.content.title} assigned to ${cls.name} · ${names}.`, 'send');
}

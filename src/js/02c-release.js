/* =====================================================================
   Student Visibility & Release + the student data-access layer.

   studentLabView() is the ONLY way student screens read lab content.
   It returns a projection that contains just what the release rules
   allow right now. Teacher-only notes, answer keys and unreleased
   questions are never copied into it. In production this function runs
   on the server and the browser only ever receives its output.
   ===================================================================== */
const RELEASE_SECTIONS = [
  ['objectives', 'Learning objectives'], ['background', 'Background information'], ['materials', 'Materials and equipment'],
  ['prep', 'Preparation tasks'], ['precautions', 'Precautions'], ['studentNotes', 'Notes for students'],
  ['attachments', 'Attachments'], ['procedure', 'Procedure steps'],
];
const RELEASE_PRESETS = {
  recommended: { label: 'Recommended', hint: 'Prep in advance, procedure when the session opens', rules: { objectives: 'before', background: 'before', materials: 'before', prep: 'before', precautions: 'before', studentNotes: 'before', attachments: 'during', procedure: 'during' } },
  advance: { label: 'Everything in advance', hint: 'Students can read the whole lab before class', rules: { objectives: 'before', background: 'before', materials: 'before', prep: 'before', precautions: 'before', studentNotes: 'before', attachments: 'before', procedure: 'before' } },
  live: { label: 'Only during the session', hint: 'Students see only the title and date beforehand', rules: { objectives: 'during', background: 'during', materials: 'during', prep: 'during', precautions: 'during', studentNotes: 'during', attachments: 'during', procedure: 'during' } },
};
const RELEASE_DEFAULTS = { ...RELEASE_PRESETS.recommended.rules, revisit: true };
const releaseOf = (lab) => ({ ...RELEASE_DEFAULTS, ...((lab && lab.release) || {}) });

function stageOptions(c, key) {
  const base = [['before', 'Before the live session'], ['during', 'When the live session opens']];
  if (key === 'procedure') return base; // the live session needs the procedure, so it can't come later
  return [...base, ...c.steps.map((s, i) => [`step:${s.id}`, `After step ${i + 1} is completed${s.title ? ` (${s.title})` : ''}`]), ['after', 'After the session is complete'], ['hidden', 'Not shown to students']];
}
function releaseWhenText(rule, c) {
  if (rule === 'before') return 'available now';
  if (rule === 'during') return 'when the live session opens';
  if (rule === 'after') return 'after the session is complete';
  if (rule === 'hidden') return 'not shown to students';
  if (String(rule).startsWith('step:')) { const i = stepIndexById(c, rule.slice(5)); return i === -1 ? 'when the live session opens' : `after step ${i + 1} is completed`; }
  return '';
}
/** ctx: {status:'scheduled'|'active'|'paused'|'completed', open:boolean, done:Set<stepId>} */
function isReleased(rule, c, ctx) {
  if (rule === 'before') return true;
  if (rule === 'during') return ctx.open || ['active', 'paused', 'completed'].includes(ctx.status);
  if (rule === 'after') return ctx.status === 'completed';
  if (rule === 'hidden') return false;
  if (String(rule).startsWith('step:')) {
    const id = rule.slice(5);
    if (stepIndexById(c, id) === -1) return ctx.open || ['active', 'paused', 'completed'].includes(ctx.status);
    return ctx.done.has(id) || ctx.status === 'completed';
  }
  return false;
}

/* ---------- Student enrollment helpers ---------- */
const studentEnrollments = (userId) => S.enrollments.filter((e) => e.studentId === userId && classById(e.classId));
const studentGroup = (classId, periodId, userId) => groupsIn(classId, periodId).find((g) => g.memberIds.includes(userId)) || null;
const sessionForPeriod = (a, periodId) => S.sessions.find((s) => s.assignmentId === a.id && s.periodId === periodId) || null;
function scheduledAt(a) {
  const t = a.scheduledTime || '08:00';
  return new Date(`${a.scheduledFor}T${t}`).getTime();
}
const fmtSchedule = (a) => `${a.scheduledFor === todayISO() ? 'Today' : fmtDateLong(scheduledAt(a))}${a.scheduledTime ? ', ' + fmtClock(scheduledAt(a)) : ''}`;
/** Is the session open to students? A scheduled time alone never opens it unless the teacher turned on autoOpen. */
function sessionOpen(sess, a, now = Date.now()) {
  if (!sess) return false;
  if (sess.status === 'active' || sess.status === 'paused') return true;
  return sess.status === 'scheduled' && !!a.autoOpen && scheduledAt(a) <= now;
}
/** Published assignments for a student, newest first. Unpublished labs are never listed. */
function studentAssignments(userId) {
  const out = [];
  for (const e of studentEnrollments(userId)) {
    for (const a of S.assignments) {
      if (a.classId !== e.classId || !a.periodIds.includes(e.periodId) || a.published === false) continue;
      const lab = labById(a.labId); if (!lab) continue;
      out.push({ a, e, sess: sessionForPeriod(a, e.periodId) });
    }
  }
  return out.sort((x, y) => scheduledAt(y.a) - scheduledAt(x.a));
}
const STUDENT_LAB_STATUS = {
  upcoming: { label: 'Upcoming', icon: 'calendar', tone: 'idle' },
  prepare: { label: 'Available to Prepare', icon: 'book', tone: 'accent' },
  ready: { label: 'Ready to Start', icon: 'play', tone: 'ok' },
  inprogress: { label: 'In Progress', icon: 'playCircle', tone: 'blue' },
  completed: { label: 'Completed', icon: 'checkCircle', tone: 'idle' },
};
function studentLabStatus(a, sess, p, c, rel) {
  if (!sess) return 'upcoming';
  if (sess.status === 'completed' || (p && p.finishedAt)) return 'completed';
  if (sessionOpen(sess, a)) return p && (p.completed.length || (p.joined || []).length) ? 'inprogress' : 'ready';
  const prepReleased = ['objectives', 'background', 'materials', 'prep', 'precautions', 'studentNotes', 'attachments', 'procedure'].some((k) => rel[k] === 'before' && sectionHasContent(c, k));
  return prepReleased ? 'prepare' : 'upcoming';
}
function sectionHasContent(c, k) {
  if (k === 'procedure') return c.steps.length > 0;
  if (k === 'background' || k === 'studentNotes') return !!String(c[k] || '').trim();
  return (c[k] || []).filter((x) => (typeof x === 'string' ? x.trim() : true)).length > 0;
}

/**
 * Build the student projection of an assigned lab.
 * @param preview  teacher "Preview as Student": {status, done:Set<stepId>} replaces live session data.
 */
function studentLabView(a, userId, preview = null) {
  const lab = labById(a.labId); if (!lab) return null;
  const v = versionById(lab, a.versionId); if (!v) return null;
  const c = v.content; const rel = releaseOf(lab);
  const cls = classById(a.classId);
  const enr = preview ? null : S.enrollments.find((e) => e.studentId === userId && e.classId === a.classId && a.periodIds.includes(e.periodId));
  if (!preview && (!enr || a.published === false)) return null; // not enrolled in an assigned period, or not published
  const periodId = preview ? (preview.periodId || a.periodIds[0]) : enr.periodId;
  const sess = preview ? null : sessionForPeriod(a, periodId);
  const group = preview ? null : studentGroup(a.classId, periodId, userId);
  const p = sess && group ? S.progress.find((x) => x.sessionId === sess.id && x.groupId === group.id) : null;
  const ctx = preview
    ? { status: preview.status, open: preview.status !== 'scheduled', done: preview.done || new Set() }
    : { status: sess ? sess.status : 'scheduled', open: sessionOpen(sess, a), done: new Set(p ? p.completed.map((x) => x.stepId) : []) };
  const status = preview ? ({ scheduled: 'prepare', active: 'inprogress', completed: 'completed' }[preview.status] || 'prepare') : studentLabStatus(a, sess, p, c, rel);
  const afterRevisitBlocked = ctx.status === 'completed' && !rel.revisit;
  const view = {
    assignmentId: a.id, labId: lab.id, versionId: v.id, versionNumber: v.number, classId: a.classId, className: cls ? cls.name : '',
    periodId, periodName: periodName(a.classId, periodId), teacherName: (S.users.find((u) => cls && u.id === cls.teacherId) || {}).name || '',
    sessionId: sess ? sess.id : null, sessionStatus: ctx.status, sessionOpen: ctx.open,
    title: c.title, description: c.description || '', subject: c.subject,
    scheduledFor: a.scheduledFor, scheduledTime: a.scheduledTime || '', autoOpen: !!a.autoOpen,
    durationMin: plannedMinutes(c), status, acknowledgment: c.acknowledgment || '', revisit: !!rel.revisit,
    group: group ? { id: group.id, name: group.name, members: memberNames(group) } : null,
    stepCount: c.steps.length, sections: {}, locked: [], procedure: null,
  };
  const released = (k) => !afterRevisitBlocked && isReleased(rel[k], c, ctx);
  const lock = (k, label) => { if (rel[k] !== 'hidden' && sectionHasContent(c, k)) view.locked.push({ key: k, label, when: afterRevisitBlocked ? 'closed after the session' : releaseWhenText(rel[k], c) }); };
  for (const [k, label] of RELEASE_SECTIONS) {
    if (k === 'procedure') continue;
    if (!sectionHasContent(c, k)) continue;
    if (!released(k)) { lock(k, label); continue; }
    if (k === 'materials') view.sections.materials = c.materials.filter((m) => m.name.trim()).map((m) => ({ name: m.name, qty: m.qtyPerGroup, unit: m.unit, per: m.per, sharedBy: m.sharedBy }));
    else if (k === 'attachments') view.sections.attachments = c.attachments.map((f) => ({ id: f.id, name: f.name, type: f.type, size: f.size, key: f.key }));
    else if (k === 'background' || k === 'studentNotes') view.sections[k] = c[k];
    else view.sections[k] = c[k].filter((x) => String(x).trim());
  }
  if (released('procedure')) {
    view.procedure = {
      setupMinutes: c.setupMinutes || 0,
      steps: c.steps.map((s) => ({ id: s.id, title: s.title, instructions: s.instructions, minutes: s.minutes, materials: [...s.materials], inputs: s.inputs.map((x) => ({ ...x })) })),
      cleanup: c.cleanup.filter((x) => x.trim()),
      // A checkpoint is released only once its step is completed by this student's group.
      checkpoints: c.checkpoints.filter((cp) => ctx.done.has(cp.afterStepId))
        .map((cp) => projectCheckpoint(cp, preview ? { preview: true, sessionStatus: ctx.status } : { trackKey: sess ? sess.id : null, groupId: group ? group.id : null, userId, sessionStatus: ctx.status })),
    };
  } else lock('procedure', 'Procedure steps');
  return view;
}

/** Student-visible copy of a checkpoint. Answer keys stay out; feedback is computed here when allowed. */
function projectCheckpoint(cp, { trackKey = null, groupId = null, userId = null, sessionStatus = 'active', preview = false } = {}) {
  const out = {
    id: cp.id, afterStepId: cp.afterStepId, title: cp.title, info: cp.info, observe: cp.observe, image: cp.image ? { name: cp.image.name, dataUrl: cp.image.dataUrl } : null,
    kind: cp.kind, responseRequired: cp.responseRequired, approvalRequired: cp.approvalRequired, scope: cp.scope, requireCorrect: cp.requireCorrect,
    questions: cp.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options.filter((o) => o.text.trim()).map((o) => ({ id: o.id, text: o.text })), unit: q.unit, required: q.required })),
    rule: cpRuleText(cp), results: null, incorrect: [],
  };
  if (preview || !trackKey) return out;
  const rec = cpRecordFor(trackKey, groupId, cp, userId);
  if (rec && rec.submittedAt) {
    const res = mcResults(cp, rec.responses);
    if (cp.requireCorrect) out.incorrect = res.filter((r) => !r.correct).map((r) => r.qid); // which ones to revise, never the right choice
    const canShow = cp.feedbackRelease === 'onSubmit' || (cp.feedbackRelease === 'afterSession' && sessionStatus === 'completed');
    if (canShow) out.results = res.map((r) => { const q = cp.questions.find((x) => x.id === r.qid); return { qid: r.qid, correct: r.correct, feedback: q.feedback || '' }; });
  }
  return out;
}

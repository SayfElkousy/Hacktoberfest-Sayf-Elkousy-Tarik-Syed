/* =====================================================================
   v2 models: teacher-authored checkpoints, student profiles, workspaces.
   ===================================================================== */

/**
 * @typedef {{id:string,type:'short'|'long'|'mc'|'numeric',prompt:string,options:{id:string,text:string}[],
 *            correct:string|null,feedback:string,unit:string,required:boolean}} CheckpointQuestion
 *   `correct` and `feedback` are answer-key data: teacher-only unless the checkpoint's feedbackRelease allows it.
 * @typedef {{id:string,afterStepId:string,title:string,info:string,observe:string,image:null|{name:string,dataUrl:string},
 *            kind:'info'|'response',responseRequired:boolean,approvalRequired:boolean,scope:'group'|'individual',
 *            requireCorrect:boolean,feedbackRelease:'never'|'onSubmit'|'afterSession',questions:CheckpointQuestion[]}} Checkpoint
 * @typedef {{id:string,trackKey:string,groupId:string,studentId:string|null,checkpointId:string,
 *            status:'draft'|'submitted'|'returned',responses:Object<string,string>,savedAt:number,
 *            submittedAt?:number,submittedBy?:string,submissions:number,history:{at:number,text:string}[]}} CheckpointRecord
 *   One record per group (group scope) or per student (individual scope). Stable id = trackKey:owner:checkpointId,
 *   so repeated events update the same record instead of creating duplicates.
 * @typedef {{releasedAt:number,approval:'none'|'pending'|'approved'|'returned',requestedAt?:number,
 *            approvedAt?:number,returnedAt?:number,note?:string}} GateState   // stored in progress.gates[checkpointId]
 */
const Q_TYPES = [['short', 'Short text'], ['long', 'Long text'], ['mc', 'Multiple choice'], ['numeric', 'Number']];
function blankQuestion(type = 'short') {
  return { id: uid(), type, prompt: '', options: type === 'mc' ? [{ id: uid(), text: '' }, { id: uid(), text: '' }] : [], correct: null, feedback: '', unit: '', required: true };
}
function blankCheckpoint(afterStepId) {
  return { id: uid(), afterStepId, title: '', info: '', observe: '', image: null, kind: 'response', responseRequired: true, approvalRequired: false, scope: 'group', requireCorrect: false, feedbackRelease: 'onSubmit', questions: [blankQuestion('short')] };
}
/** Bring any procedure content up to the v2 shape. Old `step.checkpoint: true` becomes an approval checkpoint. */
function normalizeContent(c) {
  if (!c) return c;
  c.description = c.description || ''; c.background = c.background || '';
  c.prep = Array.isArray(c.prep) ? c.prep : []; c.studentNotes = c.studentNotes || ''; c.teacherNotes = c.teacherNotes || '';
  c.acknowledgment = c.acknowledgment || ''; c.attachments = Array.isArray(c.attachments) ? c.attachments : [];
  c.checkpoints = Array.isArray(c.checkpoints) ? c.checkpoints : [];
  c.objectives = c.objectives || []; c.materials = c.materials || []; c.setup = c.setup || []; c.cleanup = c.cleanup || []; c.precautions = c.precautions || [];
  c.steps = (c.steps || []).map((s) => {
    if (!s.id) s.id = uid();
    s.materials = s.materials || []; s.inputs = s.inputs || []; s.expected = s.expected || '';
    if (s.checkpoint === true && !c.checkpoints.some((cp) => cp.afterStepId === s.id)) {
      c.checkpoints.push({ ...blankCheckpoint(s.id), title: `Teacher check: ${s.title}`, info: 'Ask your teacher to check your setup before you continue.', kind: 'info', responseRequired: false, approvalRequired: true, questions: [] });
    }
    delete s.checkpoint;
    return s;
  });
  c.checkpoints.forEach((cp) => { cp.questions = cp.questions || []; cp.questions.forEach((q) => { q.options = q.options || []; }); });
  return c;
}
const checkpointAfter = (c, stepId) => (c.checkpoints || []).find((cp) => cp.afterStepId === stepId) || null;
const checkpointById = (c, id) => (c.checkpoints || []).find((cp) => cp.id === id) || null;
const stepIndexById = (c, id) => c.steps.findIndex((s) => s.id === id);
/** Does this checkpoint hold students until something happens? */
const cpBlocks = (cp) => !!(cp.approvalRequired || (cp.kind === 'response' && (cp.responseRequired || cp.requireCorrect)));
function cpRuleText(cp) {
  const parts = [];
  if (cp.kind === 'info') parts.push('Informational');
  else parts.push(cp.responseRequired ? 'Response required to continue' : 'Response optional');
  if (cp.requireCorrect) parts.push('must answer multiple choice correctly');
  if (cp.approvalRequired) parts.push('teacher approval required');
  parts.push(cp.scope === 'group' ? 'one response per group' : 'each student responds');
  return parts.join(' · ');
}
function checkpointErrors(c) {
  const e = [];
  c.checkpoints.forEach((cp) => {
    const i = stepIndexById(c, cp.afterStepId);
    const where = i === -1 ? 'A checkpoint' : `The checkpoint after step ${i + 1}`;
    if (i === -1) e.push('A checkpoint is attached to a step that no longer exists. Move or delete it.');
    if (!cp.title.trim()) e.push(`${where} needs a title.`);
    if (cp.kind === 'response' && !cp.questions.length) e.push(`${where} asks for a response but has no questions.`);
    cp.questions.forEach((q, j) => {
      if (!q.prompt.trim()) e.push(`${where}: question ${j + 1} needs a prompt.`);
      if (q.type === 'mc' && q.options.filter((o) => o.text.trim()).length < 2) e.push(`${where}: question ${j + 1} needs at least two choices.`);
    });
    if (cp.requireCorrect && !cp.questions.some((q) => q.type === 'mc' && q.correct)) e.push(`${where} requires correct answers but no multiple-choice question has a correct answer set.`);
  });
  return e;
}
/** Is a submitted multiple-choice answer correct? Only questions with a key count. */
function mcResults(cp, responses) {
  return cp.questions.filter((q) => q.type === 'mc' && q.correct).map((q) => ({ qid: q.id, correct: responses[q.id] === q.correct }));
}
const allCorrect = (cp, responses) => mcResults(cp, responses).every((r) => r.correct);
function missingAnswers(cp, responses) {
  return cp.questions.filter((q) => q.required && !String(responses[q.id] ?? '').trim()).map((q) => q.id);
}

/* ---------- Student profiles ---------- */
const INTERESTS = ['Biology', 'Chemistry', 'Physics', 'Earth & space', 'Environmental science', 'Engineering', 'Robotics', 'Computer science', 'Medicine & health', 'Mathematics', 'Data science', 'Neuroscience'];
const EDU_LEVELS = [['hs', 'High School'], ['college', 'College / University']];
const displayName = (u) => (u && u.profile && u.profile.displayName) || (u && u.name) || 'Student';
function ensureStudentRecord(user) {
  if (!S.students.some((s) => s.id === user.id)) S.students.push({ id: user.id, name: user.name, userId: user.id });
}

/* ---------- Workspaces: initial role ≠ current workspace ---------- */
const WORKSPACES = {
  teacher: { label: 'Teacher Workspace', short: 'Teacher', icon: 'board', home: 'overview' },
  student: { label: 'Student Workspace', short: 'Student', icon: 'cap', home: 's/overview' },
  research: { label: 'Research Workspace', short: 'Research', icon: 'compass', home: 'r/overview' },
};
/** Which workspaces this account may open. Teacher access comes only from a teacher account, never from research. */
function workspacesFor(user) {
  if (!user) return [];
  const w = [];
  if (user.role === 'teacher') w.push('teacher');
  if (user.role === 'student' || S.enrollments.some((e) => e.studentId === user.id)) w.push('student');
  w.push('research');
  return w;
}
function workspaceOfRoute(name) {
  if (name.startsWith('s/') || name === 'onboarding') return 'student';
  if (name.startsWith('r/')) return 'research';
  return 'teacher';
}
function defaultWorkspace(user) {
  const ws = workspacesFor(user);
  if (user.lastWorkspace && ws.includes(user.lastWorkspace)) return user.lastWorkspace;
  return user.role === 'independent' ? 'research' : ws[0];
}

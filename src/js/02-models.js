/* =====================================================================
   Data models (documented shapes) and derived calculations.
   In production these records live in a server database; the server
   must enforce role permissions and class ownership (teachers only
   see their own classes, students, sessions and help requests).
   ===================================================================== */

/**
 * @typedef {'teacher'|'student'|'independent'} Role
 * @typedef {{id:string,name:string,email:string,role:Role,school?:string,createdAt:number}} User
 * @typedef {{id:string,name:string,expected:number}} Period              // expected = planned enrollment
 * @typedef {{id:string,teacherId:string,name:string,subject:string,level:string,description?:string,
 *            joinCode:string,codeUpdatedAt:number,createdAt:number,periods:Period[]}} ClassRecord
 * @typedef {{id:string,name:string,email?:string}} Student
 * @typedef {{id:string,classId:string,periodId:string,studentId:string,joinedAt:number}} Enrollment  // actual enrollment
 * @typedef {{id:string,classId:string,periodId:string,name:string,memberIds:string[]}} LabGroup
 * @typedef {{id:string,name:string,qty:number,unit:string,kind:'reusable'|'consumable',notes?:string}} InventoryItem
 * @typedef {{id:string,name:string,qtyPerGroup:number|null,unit:string,kind:'reusable'|'consumable'|'unknown',
 *            per:'group'|'student',sharedBy:number,inventory?:string|null}} Material
 * @typedef {{label:string,unit:string}} StudentInput
 * @typedef {{id:string,title:string,instructions:string,minutes:number|null,materials:string[],
 *            inputs:StudentInput[],expected?:string}} ProcedureStep   // checkpoints live in ProcedureContent.checkpoints (see 02b)
 * @typedef {{title:string,subject:string,level:string,objectives:string[],materials:Material[],setup:string[],
 *            steps:ProcedureStep[],cleanup:string[],precautions:string[],setupMinutes:number,cleanupMinutes:number,
 *            groupSize?:number,assumptions?:string[],questions?:string[]}} ProcedureContent
 * @typedef {{id:string,number:number,state:'draft'|'ready',content:ProcedureContent,createdAt:number,
 *            approvedAt?:number,locked:boolean}} LabVersion       // locked once assigned: never edited in place
 * @typedef {{id:string,teacherId:string,source:'ai'|'upload'|'paste'|'manual'|'duplicate',archived:boolean,
 *            createdAt:number,updatedAt:number,original?:{name:string,size:number,type:string,key?:string,text:string,note?:string},
 *            versions:LabVersion[]}} Lab
 * @typedef {{id:string,labId:string,versionId:string,classId:string,periodIds:string[],scheduledFor:string,createdAt:number}} Assignment
 * @typedef {{id:string,assignmentId:string,labId:string,versionId:string,classId:string,periodId:string,
 *            status:'scheduled'|'active'|'paused'|'completed',scheduledFor:string,startedAt?:number,
 *            pausedAt?:number,pausedTotal:number,endedAt?:number,
 *            liveCode?:string|null,liveCodeAt?:number,oldLiveCodes?:string[]}} Session  // liveCode exists only while active or paused
 * @typedef {{stepIndex:number,label:string,value:string,unit:string,at:number}} Observation
 * @typedef {{id:string,sessionId:string,groupId:string,stepIndex:number,completed:{index:number,at:number}[],
 *            stepStartedAt?:number,lastActivityAt?:number,connection:'online'|'lost',
 *            atCheckpoint:string|null,gates:Object<string,GateState>,joined:string[],camera:null|object,
 *            aiFlags:object[],guidance:object[],observations:Observation[],
 *            activity:{at:number,text:string}[],finishedAt?:number}} GroupProgress
 * @typedef {{id:string,sessionId:string,classId:string,periodId:string,groupId:string,labId:string,stepIndex:number,
 *            category:'Equipment'|'Procedure'|'Measurement'|'Other',message:string,createdAt:number,updatedAt:number,
 *            updates:number,status:'waiting'|'helping'|'resolved',helpingAt?:number,resolvedAt?:number,
 *            log:{at:number,text:string}[]}} HelpRequest   // createdAt never changes: it fixes queue order
 */

const GROUP_STATUS = {
  notStarted: { label: 'Not Started', icon: 'dashed', tone: 'idle' },
  inProgress: { label: 'In Progress', icon: 'playCircle', tone: 'blue' },
  behind: { label: 'May Be Behind', icon: 'hourglass', tone: 'warn' },
  waiting: { label: 'Waiting for Teacher', icon: 'hand', tone: 'wait' },
  completed: { label: 'Completed', icon: 'checkCircle', tone: 'ok' },
  lost: { label: 'Connection Lost', icon: 'wifiOff', tone: 'lost' },
};
const GROUP_STATUS_ORDER = ['notStarted', 'inProgress', 'behind', 'waiting', 'completed', 'lost'];
const LAB_STATUS = {
  draft: { label: 'Draft', icon: 'pencil', tone: 'idle' },
  ready: { label: 'Ready to Assign', icon: 'checkCircle', tone: 'accent' },
  assigned: { label: 'Assigned', icon: 'send', tone: 'blue' },
  archived: { label: 'Archived', icon: 'archive', tone: 'idle' },
};
const SESSION_STATUS = {
  scheduled: { label: 'Scheduled', icon: 'calendar', tone: 'idle' },
  active: { label: 'Active', icon: 'dot', tone: 'ok' },
  paused: { label: 'Paused', icon: 'pause', tone: 'warn' },
  completed: { label: 'Completed', icon: 'checkCircle', tone: 'idle' },
};
const HELP_STATUS = {
  waiting: { label: 'Waiting', icon: 'hand', tone: 'wait' },
  helping: { label: 'Being Helped', icon: 'users', tone: 'blue' },
  resolved: { label: 'Resolved', icon: 'checkCircle', tone: 'ok' },
};
const HELP_CATEGORIES = { Equipment: 'wrench', Procedure: 'listOrdered', Measurement: 'ruler', Other: 'question' };
const LEVELS = ['Middle school (grades 6–8)', 'High school (grades 9–10)', 'High school (grades 11–12)', 'AP / IB', 'College introductory', 'College upper-level'];
const SOURCE_LABEL = { ai: 'AI-assisted', upload: 'Uploaded file', paste: 'Pasted text', manual: 'Written manually', duplicate: 'Duplicated' };

/* ---------- Lookups (scoped to the signed-in teacher) ---------- */
const me = () => S.users.find((u) => u.id === S.currentUserId) || null;
const myClasses = () => S.classes.filter((c) => c.teacherId === S.currentUserId);
const myLabs = () => S.labs.filter((l) => l.teacherId === S.currentUserId);
const myClassIds = () => new Set(myClasses().map((c) => c.id));
const mySessions = () => { const ids = myClassIds(); return S.sessions.filter((s) => ids.has(s.classId)); };
const myHelp = () => { const ids = myClassIds(); return S.help.filter((h) => ids.has(h.classId)); };
const classById = (id) => S.classes.find((c) => c.id === id) || null;
const periodOf = (cls, pid) => (cls ? cls.periods.find((p) => p.id === pid) : null) || null;
const periodName = (classId, pid) => { const p = periodOf(classById(classId), pid); return p ? p.name : 'Unknown period'; };
const shortPeriod = (name) => { const m = /^period\s*(\S+)/i.exec(name || ''); return m ? `P${m[1]}` : name; };
const labById = (id) => S.labs.find((l) => l.id === id) || null;
const latestVersion = (lab) => lab.versions[lab.versions.length - 1];
const versionById = (lab, vid) => lab.versions.find((v) => v.id === vid) || null;
const latestReady = (lab) => [...lab.versions].reverse().find((v) => v.state === 'ready') || null;
const labTitle = (lab) => (lab ? latestVersion(lab).content.title || 'Untitled lab' : 'Deleted lab');
const sessionById = (id) => S.sessions.find((s) => s.id === id) || null;
const sessionContent = (sess) => { const lab = labById(sess.labId); const v = lab && versionById(lab, sess.versionId); return v ? v.content : null; };
const groupById = (id) => S.groups.find((g) => g.id === id) || null;
const studentById = (id) => S.students.find((s) => s.id === id) || null;
const enrolledStudents = (classId, periodId) => S.enrollments.filter((e) => e.classId === classId && e.periodId === periodId).map((e) => studentById(e.studentId)).filter(Boolean);
const enrolledCount = (classId, periodId) => S.enrollments.filter((e) => e.classId === classId && (!periodId || e.periodId === periodId)).length;
const groupsIn = (classId, periodId) => S.groups.filter((g) => g.classId === classId && g.periodId === periodId);
const progressFor = (sessionId) => S.progress.filter((p) => p.sessionId === sessionId);
const assignmentsForLab = (labId) => S.assignments.filter((a) => a.labId === labId);

function labStatus(lab) {
  if (lab.archived) return 'archived';
  if (assignmentsForLab(lab.id).length) return 'assigned';
  return latestVersion(lab).state === 'ready' ? 'ready' : 'draft';
}

/* ---------- Session time ---------- */
/** The clock a session runs on: frozen while paused, stopped when completed. */
function sessionClock(sess, now = Date.now()) {
  if (sess.status === 'paused') return sess.pausedAt;
  if (sess.status === 'completed') return sess.endedAt || now;
  return now;
}
function sessionElapsed(sess, now = Date.now()) {
  if (!sess.startedAt || sess.status === 'scheduled') return 0;
  return Math.max(0, sessionClock(sess, now) - sess.startedAt - (sess.pausedTotal || 0));
}
const stepsMinutes = (c) => sum(c.steps.map((s) => s.minutes || 0));
const plannedMinutes = (c) => (c.setupMinutes || 0) + stepsMinutes(c) + (c.cleanupMinutes || 0);
/** Planned finish time (ms from session start) of each step. */
function plannedEnds(c) {
  let t = (c.setupMinutes || 0) * MIN;
  return c.steps.map((s) => (t += (s.minutes || 0) * MIN));
}
/** Index of the step the plan expects groups to be on right now. */
function plannedStepAt(c, elapsed) {
  const ends = plannedEnds(c);
  const i = ends.findIndex((e) => elapsed < e);
  return i === -1 ? c.steps.length : i;
}

/* ---------- Group status ---------- */
const openHelpForGroup = (sessionId, groupId) => S.help.filter((h) => h.sessionId === sessionId && h.groupId === groupId && h.status !== 'resolved');

/**
 * Derive a group's live status. Order matters: a lost connection is shown as
 * its own state and never counted as "behind"; missing activity alone never
 * marks a group as struggling.
 */
function groupStatus(p, sess, c, now = Date.now()) {
  const thresholdMs = (S.settings.behindMinutes || 5) * MIN;
  const elapsed = sessionElapsed(sess, now);
  const ends = plannedEnds(c);
  const out = { key: 'inProgress', behindMs: 0, plannedEnd: ends[p.stepIndex] };
  if (p.finishedAt) { out.key = 'completed'; return out; }
  if (p.connection === 'lost') { out.key = 'lost'; return out; }
  const gate = p.atCheckpoint && p.gates ? p.gates[p.atCheckpoint] : null;
  if ((gate && gate.approval === 'pending') || openHelpForGroup(sess.id, p.groupId).length) { out.key = 'waiting'; return out; }
  const pastPlan = elapsed - (ends[p.stepIndex] ?? ends[ends.length - 1] ?? 0);
  if (sess.status !== 'scheduled' && pastPlan > thresholdMs) { out.key = 'behind'; out.behindMs = pastPlan; return out; }
  if (!p.completed.length && !p.stepStartedAt) { out.key = 'notStarted'; return out; }
  return out;
}
const stepTimeMs = (p, sess, now = Date.now()) => (p.stepStartedAt && !p.finishedAt ? Math.max(0, sessionClock(sess, now) - p.stepStartedAt) : 0);

/* ---------- Lab Designer resource math (deterministic, never invented) ---------- */
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((w) => w.replace(/(es|s)$/, '')).filter((w) => !['ml', 'l', 'g', 'the', 'a', 'of', 'per'].includes(w));
function matchInventory(mat, inventory) {
  if (!inventory.length) return null;
  if (mat.inventory) {
    const exact = inventory.find((i) => i.name.trim().toLowerCase() === String(mat.inventory).trim().toLowerCase());
    if (exact) return exact;
  }
  const mt = normName(mat.name);
  let best = null, bestScore = 0;
  for (const it of inventory) {
    const it_ = normName(it.name);
    if (!it_.length) continue;
    const shared = it_.filter((w) => mt.includes(w)).length;
    const score = shared / Math.max(1, Math.min(it_.length, mt.length));
    if (shared && score > bestScore) { best = it; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Periods selected in the designer, with enrollment-based defaults and teacher overrides. */
function designerPeriods(d) {
  const out = [];
  for (const cls of myClasses()) for (const per of cls.periods) {
    const sel = d.logistics.sel[`${cls.id}:${per.id}`];
    if (!sel || !sel.on) continue;
    const enrolled = enrolledCount(cls.id, per.id);
    const students = sel.override !== '' && sel.override != null ? Math.max(0, parseInt(sel.override, 10) || 0) : enrolled;
    out.push({ key: `${cls.id}:${per.id}`, classId: cls.id, periodId: per.id, label: `${cls.name} · ${per.name}`, short: `${shortPeriod(per.name)}`, enrolled, students });
  }
  const size = Math.max(1, parseInt(d.logistics.groupSize, 10) || 1);
  out.forEach((p) => { p.groups = p.students ? Math.ceil(p.students / size) : 0; });
  return out;
}

function computeResources(plan, d) {
  const periods = designerPeriods(d);
  const reuse = !!d.logistics.reuseAcrossPeriods;
  const inventory = d.inventory.filter((i) => i.name.trim());
  const materials = (plan.materials || []).map((m) => {
    const per = m.per === 'student' ? 'student' : 'group';
    const q = Number(m.qtyPerGroup) || 0;
    const shared = Math.max(1, parseInt(m.sharedBy, 10) || 1);
    const perPeriod = periods.map((p) => {
      if (per === 'student') return q * p.students;
      if (m.kind === 'reusable') return Math.ceil(p.groups / shared) * q;
      return p.groups * q;
    });
    const peak = perPeriod.length ? Math.max(...perPeriod) : 0;
    const total = m.kind === 'reusable' ? (reuse ? peak : sum(perPeriod)) : sum(perPeriod);
    const inv = matchInventory(m, inventory);
    let status = 'ok', note = '';
    if (!inv) { status = 'unlisted'; note = 'Not in your inventory list'; }
    else if (inv.unit && m.unit && normName(inv.unit).join() !== normName(m.unit).join() && !(normName(m.name).some((w) => normName(inv.unit).includes(w)))) {
      status = 'units'; note = `Units differ (plan: ${m.unit}, inventory: ${inv.unit})`;
    } else if (m.kind === 'reusable' && peak > inv.qty) { status = 'bottleneck'; note = `Need ${fmtQty(peak)} at once, have ${fmtQty(inv.qty)}`; }
    else if (total > inv.qty) { status = 'short'; note = `Short by ${fmtQty(round(total - inv.qty))}`; }
    else if (m.kind === 'consumable' && total === inv.qty && total > 0) { status = 'tight'; note = 'Uses every one you have; no spares'; }
    return { ...m, per, shared, perPeriod, peak: round(peak), total: round(total), inv, status, note };
  });
  const stepsMin = sum((plan.steps || []).map((s) => s.minutes || 0));
  const setup = Number(d.logistics.setupMinutes) || 0, cleanup = Number(d.logistics.cleanupMinutes) || 0;
  const available = Number(d.logistics.labMinutes) || 0;
  const time = { setup, cleanup, steps: stepsMin, total: setup + stepsMin + cleanup, available };
  time.over = time.total - available;

  const issues = [];
  if (time.over > 0) issues.push({ sev: 'bad', text: `The plan runs ${time.over} min over your ${available}-minute lab time (${time.total} min including setup and cleanup).` });
  for (const m of materials) {
    if (m.status === 'bottleneck') {
      const worst = periods[m.perPeriod.indexOf(m.peak)];
      issues.push({ sev: 'bad', text: `${m.name}: ${worst ? worst.short + ' needs' : 'need'} ${fmtQty(m.peak)} at the same time, but you listed ${fmtQty(m.inv.qty)}. Groups would have to wait or share.` });
    } else if (m.status === 'short') issues.push({ sev: 'bad', text: `${m.name}: ${fmtQty(m.total)} ${m.unit} needed across the selected periods, ${fmtQty(m.inv.qty)} available.` });
    else if (m.status === 'unlisted') issues.push({ sev: 'warn', text: `${m.name} isn't in your inventory. Add it with the quantity you have, or remove it from the plan.` });
    else if (m.status === 'units') issues.push({ sev: 'warn', text: `${m.name}: ${m.note}. Check the totals by hand.` });
    else if (m.status === 'tight') issues.push({ sev: 'warn', text: `${m.name}: the plan uses all ${fmtQty(m.inv.qty)} you have, with nothing left for a repeat trial.` });
  }
  if (!periods.length) issues.push({ sev: 'warn', text: 'No class periods are selected, so group counts and totals are zero.' });
  return { periods, materials, time, issues, totalStudents: sum(periods.map((p) => p.students)), totalGroups: sum(periods.map((p) => p.groups)) };
}

/* ---------- Procedure checks (flag, never fill in) ---------- */
const VAGUE = /\b(appropriate amount|as needed|some|a few|a little|enough|etc\.?|approximately|until done|a bit)\b/i;
function procedureFlags(c) {
  const f = [];
  const add = (level, field, text) => f.push({ level, field, text });
  if (!c.title || !c.title.trim()) add('missing', 'title', 'The lab has no title.');
  if (!c.objectives.filter((o) => o.trim()).length) add('missing', 'objectives', 'No learning objectives were found.');
  if (!c.materials.length) add('missing', 'materials', 'No materials list was found.');
  c.materials.forEach((m, i) => {
    if (!m.name.trim()) add('missing', `materials.${i}`, `Material ${i + 1} has no name.`);
    else if (m.qtyPerGroup == null || m.qtyPerGroup === '') add('missing', `materials.${i}`, `“${m.name}” has no quantity.`);
    if (m.name.trim() && m.kind === 'unknown') add('unclear', `materials.${i}`, `Is “${m.name}” reusable equipment or a consumable?`);
  });
  if (!c.steps.length) add('missing', 'steps', 'No numbered procedure steps were found.');
  c.steps.forEach((s, i) => {
    const n = i + 1;
    if (!s.instructions.trim()) add('missing', `steps.${i}`, `Step ${n} has no instructions.`);
    if (!s.minutes) add('missing', `steps.${i}`, `Step ${n} has no time estimate. Live tracking needs one to spot groups that may be behind.`);
    const m = VAGUE.exec(s.instructions);
    if (m) add('unclear', `steps.${i}`, `Step ${n} says “${m[0]}”. Students may need an exact amount or condition.`);
  });
  if (!c.steps.some((s) => s.inputs.length)) add('unclear', 'steps', 'No step asks students to record a measurement or observation.');
  if (!c.precautions.filter((p) => p.trim()).length) add('missing', 'precautions', 'No precautions were found. Add any that apply to this lab.');
  if (!c.cleanup.filter((p) => p.trim()).length) add('missing', 'cleanup', 'No cleanup instructions were found.');
  return f;
}
/** Blocking problems before a version can be marked Ready to Assign. */
function readyErrors(c) {
  const e = [];
  if (!c.title.trim()) e.push('Add a title.');
  if (!c.steps.length) e.push('Add at least one procedure step.');
  c.steps.forEach((s, i) => {
    if (!s.title.trim() || !s.instructions.trim()) e.push(`Step ${i + 1} needs a title and instructions.`);
    if (!s.minutes || s.minutes <= 0) e.push(`Step ${i + 1} needs a time estimate in minutes.`);
  });
  c.materials.forEach((m, i) => { if (!m.name.trim()) e.push(`Material ${i + 1} needs a name.`); });
  e.push(...checkpointErrors(c));
  return e;
}
function blankContent() {
  return normalizeContent({ title: '', subject: '', level: LEVELS[2], objectives: [''], materials: [], setup: [''], steps: [blankStep()], cleanup: [''], precautions: [''], setupMinutes: 5, cleanupMinutes: 5, assumptions: [], questions: [] });
}
function blankStep() { return { id: uid(), title: '', instructions: '', minutes: null, materials: [], inputs: [], expected: '' }; }
function blankMaterial() { return { id: uid(), name: '', qtyPerGroup: 1, unit: '', kind: 'reusable', per: 'group', sharedBy: 1, inventory: null }; }

/* ---------- Join codes ---------- */
const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
/** Every class and live session code, current or retired, so a new code never collides with one a student might still type. */
function codesInUse() {
  const taken = new Set();
  S.classes.forEach((c) => { taken.add(c.joinCode); (c.previousCodes || []).forEach((p) => taken.add(p.code)); });
  S.sessions.forEach((s) => { if (s.liveCode) taken.add(s.liveCode); (s.oldLiveCodes || []).forEach((c) => taken.add(c)); });
  return taken;
}
function newJoinCode() {
  const taken = codesInUse();
  let code;
  do {
    const pick = () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    code = `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}`;
  } while (taken.has(code));
  return code;
}

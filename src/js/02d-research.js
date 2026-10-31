/* =====================================================================
   Research Workspace models. Classroom membership (S.enrollments) and
   research-project membership (project.members) are separate: being in
   a class never grants project access and vice versa.

   @typedef {{id,ownerId,title,question,hypothesis,description,tags:string[],startDate,targetDate,
     status:'planning'|'active'|'paused'|'completed',visibility:'private',inventoryId?,
     members:{userId?,email?,role:'editor'|'contributor'|'viewer',pending?,addedAt}[],
     tasks:{id,text,assigneeId,dueAt,done}[],notes:{id,text,by,at}[],activity:{at,by,text}[],createdAt,updatedAt}} Project
   @typedef {{id,ownerId,projectId|null,origin:{type:'manual'|'import'|'paste'|'public'|'ai'|'class',publicationId?,version?,classLabId?},
     archived,shares:{userId,role}[],versions:{id,number,state,content,createdAt,locked}[],createdAt,updatedAt}} Protocol
     A version is locked once any run uses it; edits then create a new version.
   @typedef {{id,ownerId,projectId|null,protocolId,versionId,title,participants:string[],conditions:string[],samples:string[],
     mode:'guided'|'notebook',status,assignmentId?,progress,measurements,notebook,files,deviations,review,activity,
     publicSource?:{publicationId,version},createdAt,updatedAt,startedAt?,completedAt?}} Run   // one execution of one protocol version
   @typedef {{id,projectId,protocolId,versionId,assignedBy,assignees:string[],mode:'independent'|'shared',instructions,
     availableFrom?,dueAt?,requiredFields:string[],requireFiles:boolean,review:'completion'|'none',runIds:string[],createdAt}} ResearchAssignment
   @typedef {{id,authorId,org,title,description,subject,level,durationMin,suitability,materials:string[],license,attribution,
     protocolId,origin,versions:{number,publishedAt,content,includes,changelog}[],reports:object[]}} Publication
   @typedef {{id,ownerId,name,projectIds:string[],items:{id,name,qty,unit,kind,location,notes}[],log:object[]}} Inventory
   ===================================================================== */
const PROJECT_STATUS = {
  planning: { label: 'Planning', icon: 'pencil', tone: 'idle' }, active: { label: 'Active', icon: 'playCircle', tone: 'blue' },
  paused: { label: 'Paused', icon: 'pause', tone: 'warn' }, completed: { label: 'Completed', icon: 'checkCircle', tone: 'ok' },
};
const RUN_STATUS = {
  not_started: { label: 'Not Started', icon: 'dashed', tone: 'idle' }, in_progress: { label: 'In Progress', icon: 'playCircle', tone: 'blue' },
  paused: { label: 'Paused', icon: 'pause', tone: 'warn' }, awaiting_review: { label: 'Awaiting Review', icon: 'hourglass', tone: 'wait' },
  needs_revision: { label: 'Needs Revision', icon: 'reopen', tone: 'bad' }, completed: { label: 'Completed', icon: 'checkCircle', tone: 'ok' },
};
const MEMBER_ROLES = {
  owner: { label: 'Owner', text: 'Manages the project, access and deletion.' },
  editor: { label: 'Editor', text: 'Edits protocols, contributes results and manages permitted work.' },
  contributor: { label: 'Contributor', text: 'Conducts assigned experiments and contributes results.' },
  viewer: { label: 'Viewer', text: 'Reads what they have access to.' },
};
const ROLE_RANK = { viewer: 1, contributor: 2, editor: 3, owner: 4 };
const atLeast = (role, need) => !!role && ROLE_RANK[role] >= ROLE_RANK[need];
const LICENSES = [['CC BY 4.0', 'CC BY 4.0: reuse with attribution'], ['CC BY-SA 4.0', 'CC BY-SA 4.0: share alike'], ['CC BY-NC 4.0', 'CC BY-NC 4.0: non-commercial'], ['All rights reserved', 'All rights reserved: view only']];
const NOTE_KINDS = { observation: { label: 'Observation', icon: 'eye', tone: 'blue' }, interpretation: { label: 'Interpretation', icon: 'message', tone: 'accent' }, question: { label: 'Question', icon: 'question', tone: 'warn' }, next: { label: 'Next step', icon: 'arrowRight', tone: 'idle' }, ai: { label: 'AI suggestion', icon: 'sparkles', tone: 'wait' } };

const userById = (id) => S.users.find((u) => u.id === id) || null;
const userName = (id) => { const u = userById(id); return u ? displayName(u) : 'Unknown user'; };
const projectById = (id) => S.projects.find((p) => p.id === id) || null;
const protocolById = (id) => S.protocols.find((p) => p.id === id) || null;
const runById = (id) => S.runs.find((r) => r.id === id) || null;
const pubById = (id) => S.publications.find((p) => p.id === id) || null;
const inventoryById = (id) => S.inventories.find((i) => i.id === id) || null;
const protocolLatest = (pt) => pt.versions[pt.versions.length - 1];
const protocolVersion = (pt, vid) => (pt ? pt.versions.find((v) => v.id === vid) : null) || null;
const protocolTitle = (pt) => (pt ? protocolLatest(pt).content.title || 'Untitled protocol' : 'Deleted protocol');

/* ---------- Access (research permissions are checked here and, in production, on the server) ---------- */
function projectRole(pr, uid) {
  if (!pr || !uid) return null;
  if (pr.ownerId === uid) return 'owner';
  const m = pr.members.find((x) => x.userId === uid && !x.pending);
  return m ? m.role : null;
}
const higher = (a, b) => (!a ? b : !b ? a : ROLE_RANK[a] >= ROLE_RANK[b] ? a : b);
function protocolRole(pt, uid) {
  if (!pt) return null;
  if (pt.ownerId === uid) return 'owner';
  let r = ((pt.shares || []).find((s) => s.userId === uid) || {}).role || null;
  if (pt.projectId) { const pr = projectRole(projectById(pt.projectId), uid); if (pr) r = higher(r, atLeast(pr, 'editor') ? 'editor' : 'viewer'); }
  return r;
}
function runRole(run, uid) {
  if (!run) return null;
  if (run.ownerId === uid) return 'owner';
  let r = run.participants.includes(uid) ? 'contributor' : null;
  r = higher(r, ((run.shares || []).find((s) => s.userId === uid) || {}).role || null);
  if (run.projectId) { const pr = projectRole(projectById(run.projectId), uid); if (pr) r = higher(r, pr === 'owner' ? 'editor' : pr); }
  return r;
}
const visibleProjects = (uid) => S.projects.filter((p) => projectRole(p, uid));
const visibleProtocols = (uid) => S.protocols.filter((p) => protocolRole(p, uid));
const visibleRuns = (uid) => S.runs.filter((r) => runRole(r, uid));
/** Who may review a run: project owners and editors (never the person who ran it). */
const canReviewRun = (run, uid) => !!run.projectId && atLeast(projectRole(projectById(run.projectId), uid), 'editor') && run.ownerId !== uid;

/* ---------- Protocol content ---------- */
function normalizeProtocolContent(c) {
  normalizeContent(c);
  c.objective = c.objective || ''; c.variables = c.variables || { independent: '', dependent: '', controlled: '' };
  c.conditions = c.conditions || []; c.trials = c.trials || 1; c.participantsCount = c.participantsCount || 1;
  c.measurementFields = c.measurementFields || []; c.references = c.references || []; c.timeLimit = c.timeLimit || null;
  return c;
}
const runContent = (run) => { const pt = protocolById(run.protocolId); const v = protocolVersion(pt, run.versionId); return v ? v.content : null; };
function newRunProgress() { return ensureProgressShape({ stepIndex: 0, completed: [], stepStartedAt: undefined, lastActivityAt: undefined, connection: 'online', atCheckpoint: null, observations: [], activity: [] }); }
function runTrack(run) {
  const c = runContent(run); if (!c) return null;
  ensureProgressShape(run.progress);
  return { kind: 'run', key: `run:${run.id}`, run, p: run.progress, c, groupId: run.id, versionId: run.versionId, members: run.participants, open: run.status === 'in_progress' };
}
function logRun(run, text, by = S.currentUserId) { run.activity.push({ at: Date.now(), by, text }); run.updatedAt = Date.now(); }
function logProject(pr, text, by = S.currentUserId) { if (!pr) return; pr.activity.push({ at: Date.now(), by, text }); pr.updatedAt = Date.now(); if (pr.activity.length > 200) pr.activity.shift(); }

/** Work waiting on this user: runs to review and research checkpoints waiting for their approval. */
function researchReviewQueue(uid) {
  const out = [];
  for (const run of S.runs) {
    if (!canReviewRun(run, uid)) continue;
    if (run.status === 'awaiting_review') out.push({ kind: 'run', run });
    if (run.progress && run.progress.atCheckpoint) { const g = run.progress.gates[run.progress.atCheckpoint]; if (g && g.approval === 'pending') out.push({ kind: 'gate', run, cpId: run.progress.atCheckpoint }); }
  }
  return out;
}

/* ---------- Descriptive statistics (no claims of significance) ---------- */
function describe(values) {
  const v = values.map(Number).filter((x) => Number.isFinite(x));
  const n = v.length; if (!n) return { n: 0 };
  const mean = sum(v) / n; const min = Math.min(...v), max = Math.max(...v);
  const sd = n > 1 ? Math.sqrt(sum(v.map((x) => (x - mean) ** 2)) / (n - 1)) : null;
  return { n, mean, min, max, sd };
}
const fmtNum = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : String(round(x, d)));

/* ---------- Inventory readiness ---------- */
function readinessCheck(c, inv, { groups = 1, trials = 1 } = {}) {
  const items = inv ? inv.items.filter((i) => i.name.trim()) : [];
  return c.materials.filter((m) => m.name.trim()).map((m) => {
    const q = Number(m.qtyPerGroup) || 0;
    const need = round(m.kind === 'consumable' ? q * groups * trials : q * groups, 2);
    const it = items.length ? matchInventory(m, items) : null;
    let status = 'ok', note = '';
    if (!it) { status = 'missing'; note = 'Not in this inventory'; }
    else if (it.unit && m.unit && normName(it.unit).join() !== normName(m.unit).join() && !normName(m.name).some((w) => normName(it.unit).includes(w))) { status = 'units'; note = `Units differ (${m.unit} vs ${it.unit})`; }
    else if (need > Number(it.qty)) { status = 'short'; note = `Need ${fmtQty(need)}, have ${fmtQty(it.qty)}`; }
    return { name: m.name, unit: m.unit, kind: m.kind, need, item: it, status, note };
  });
}

/* ---------- Public content ---------- */
/** What leaves a private protocol when it is published. Answer keys, teacher notes and unpublished notes never do. */
function sanitizeForPublic(c) {
  const x = clone(c);
  delete x.teacherNotes; delete x.studentNotes; delete x.acknowledgment; delete x.assumptions; delete x.questions;
  x.attachments = []; x.checkpoints = (x.checkpoints || []).map((cp) => ({ ...cp, questions: cp.questions.map((q) => ({ ...q, correct: null, feedback: '' })) }));
  return x;
}
const pubLatest = (pub) => pub.versions[pub.versions.length - 1];

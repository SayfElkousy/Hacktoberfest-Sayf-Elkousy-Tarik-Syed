/* =====================================================================
   The state a new browser starts with: no accounts, classes or labs.
   ===================================================================== */
function makeEmptyState() {
  return {
    version: 2,
    cpRecords: [], events: [], processed: [],
    users: [], currentUserId: null,
    classes: [], students: [], enrollments: [], groups: [],
    labs: [], assignments: [], sessions: [], progress: [], help: [],
    publications: [], comments: [], projects: [], protocols: [], runs: [], researchAssignments: [], inventories: [],
    liveState: {}, prepChecks: {}, pendingInvite: null,
    designer: {
      form: { subject: '', topic: '', level: '', objectives: '', experiment: '', existing: '' },
      inventory: [],
      logistics: { sel: {}, groupSize: 3, labMinutes: 50, setupMinutes: 5, cleanupMinutes: 5, reuseAcrossPeriods: true, allowSharing: true },
      plan: null, planMeta: null, chat: [], labId: null, editing: false, revised: [],
      draftMsg: '', tab: 'inputs', errors: [],
    },
    settings: { behindMinutes: 5, longWaitMinutes: 5 },
    ui: { ctx: { classId: null, periodId: '', sessionId: null }, liveFilter: 'all', liveSort: 'name', helpTab: 'open', libQuery: '', libStatus: 'all', libSubject: 'all', classTab: 'roster', classPeriod: {}, importDraft: null, editorDraft: null, createClass: null, sClass: '', sLabFilter: 'all', onboard: null, joinDraft: null, profileDraft: null },
    lastSeen: Date.now(),
  };
}

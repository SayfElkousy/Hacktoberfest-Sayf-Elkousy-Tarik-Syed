/* =====================================================================
   Procedures & Lab Library, procedure import + review, and lab editor.
   Assigned versions are locked; edits always go into a newer version.
   ===================================================================== */
function libraryView() {
  const labs = myLabs();
  const q = (S.ui.libQuery || '').trim().toLowerCase();
  const st = S.ui.libStatus || 'all'; const subj = S.ui.libSubject || 'all';
  const counts = { all: 0, draft: 0, ready: 0, assigned: 0, archived: 0 };
  labs.forEach((l) => { const s = labStatus(l); counts[s]++; if (s !== 'archived') counts.all++; });
  const subjects = [...new Set(labs.map((l) => latestVersion(l).content.subject).filter(Boolean))].sort();
  const list = labs.filter((l) => {
    const s = labStatus(l); const c = latestVersion(l).content;
    if (st === 'all' ? s === 'archived' : s !== st) return false;
    if (subj !== 'all' && c.subject !== subj) return false;
    if (q && !`${c.title} ${c.subject} ${c.objectives.join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => b.updatedAt - a.updatedAt);
  const chips = [['all', 'All active'], ['draft', 'Draft'], ['ready', 'Ready to Assign'], ['assigned', 'Assigned'], ['archived', 'Archived']];
  return html`<div class="page-intro"><p>Every lab you plan, import or write lives here. Assigned labs keep the exact version students were given, even if you edit the draft later.</p>
    <div class="row wrap"><a class="btn" href="#import">${icon('upload')}Upload procedure</a><button class="btn" data-action="new-manual">${icon('pencil')}Write manually</button><a class="btn btn-ai" href="#designer">${icon('sparkles')}Plan with AI</a></div></div>
  ${!labs.length ? html`<div class="card">${emptyState({ ico: 'book', title: 'Your library is empty', text: 'Upload a procedure you already use, write one from scratch, or plan a new lab with the AI assistant.', actions: html`<a class="btn btn-primary" href="#import">${icon('upload')}Upload procedure</a><a class="btn" href="#designer">${icon('sparkles')}Plan with AI</a>` })}</div>` : html`
  <div class="lib-toolbar">
    <div class="search">${icon('search')}<label class="sr-only" for="lib-q">Search labs</label><input class="input" id="lib-q" type="search" placeholder="Search by title, subject or objective" data-bind="ui.libQuery" data-type="str" value="${S.ui.libQuery || ''}"></div>
    <label class="sr-only" for="lib-subj">Subject</label>
    <select class="select" id="lib-subj" style="width:auto" data-bind="ui.libSubject" data-type="str">${options([['all', 'All subjects'], ...subjects], subj)}</select>
  </div>
  <div class="chips" role="group" aria-label="Filter by status" style="margin-bottom:14px">${chips.map(([k, l]) => html`<button class="chip" aria-pressed="${st === k}" data-action="lib-status" data-status="${k}">${k !== 'all' ? icon(LAB_STATUS[k].icon, 'sm') : ''}${l}<span class="count">${counts[k]}</span></button>`)}</div>
  ${list.length ? html`
  <div class="table-wrap lib-table"><table><caption class="sr-only">Labs</caption>
    <thead><tr><th>Lab</th><th>Status</th><th>Version</th><th>Source</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${list.map((l) => libRow(l))}</tbody></table></div>
  <div class="lib-cards">${list.map((l) => libCard(l))}</div>`
    : html`<div class="card">${emptyState({ ico: 'search', title: 'No labs match', text: 'Try a different search, status or subject.', compact: true, actions: html`<button class="btn btn-sm" data-action="lib-clear">Clear filters</button>` })}</div>`}`}`;
}
function versionNote(l) {
  const latest = latestVersion(l); const used = [...new Set(assignmentsForLab(l.id).map((a) => versionById(l, a.versionId).number))];
  if (used.length && !used.includes(latest.number)) return `v${latest.number} ${latest.state === 'draft' ? 'draft' : 'ready'} · students use v${used.join(', v')}`;
  return `v${latest.number}`;
}
function labActions(l) {
  const s = labStatus(l);
  return html`<a class="btn btn-xs" href="#lab-${l.id}">${icon('pencil', 'sm')}Edit</a>
    ${s !== 'archived' && latestReady(l) ? html`<button class="btn btn-xs" data-action="assign-open" data-lid="${l.id}">${icon('send', 'sm')}Assign</button>` : ''}
    <button class="btn btn-xs btn-ghost" data-action="lab-duplicate" data-lid="${l.id}" aria-label="Duplicate ${labTitle(l)}">${icon('copy', 'sm')}Duplicate</button>
    ${s === 'archived' ? html`<button class="btn btn-xs btn-ghost" data-action="lab-archive" data-lid="${l.id}" data-on="0">${icon('reopen', 'sm')}Restore</button>`
      : html`<button class="btn btn-xs btn-ghost" data-action="lab-archive" data-lid="${l.id}" data-on="1" aria-label="Archive ${labTitle(l)}">${icon('archive', 'sm')}Archive</button>`}`;
}
function libRow(l) {
  const c = latestVersion(l).content;
  return html`<tr data-key="lr-${l.id}"><td style="min-width:220px"><a class="lib-title" href="#lab-${l.id}">${c.title || 'Untitled lab'}</a><div class="xs muted">${[c.subject, c.level].filter(Boolean).join(' · ') || 'No subject set'} · ${plural(c.steps.length, 'step')}</div></td>
    <td>${labPill(labStatus(l))}</td><td class="small num">${versionNote(l)}</td><td class="small">${SOURCE_LABEL[l.source]}</td><td class="small num">${fmtDate(l.updatedAt)}</td>
    <td><div class="row" style="justify-content:flex-end;flex-wrap:wrap;gap:4px">${labActions(l)}</div></td></tr>`;
}
function libCard(l) {
  const c = latestVersion(l).content;
  return html`<article class="card card-pad stack tight" data-key="lc-${l.id}"><div class="row between top"><a class="lib-title" href="#lab-${l.id}">${c.title || 'Untitled lab'}</a>${labPill(labStatus(l))}</div>
    <span class="xs muted">${[c.subject, SOURCE_LABEL[l.source], versionNote(l), 'updated ' + fmtDate(l.updatedAt)].filter(Boolean).join(' · ')}</span>
    <div class="row wrap" style="gap:4px">${labActions(l)}</div></article>`;
}

/* ---------- Import ---------- */
function importView() {
  const d = S.ui.importDraft;
  if (U.importBusy) return html`<div class="card card-pad stack" style="align-items:center;padding:48px 20px" aria-busy="true"><span class="spinner" style="width:30px;height:30px"></span><h2>Reading ${U.importBusy}…</h2><p class="muted">Extracting text and finding the title, materials, steps and safety notes.</p></div>`;
  if (d && d.stage === 'review') return importReview(d);
  const pdfFmt = Formats.pdf === 'unavailable' ? html`<span class="pill tone-bad">${icon('x')}PDF reader unavailable right now</span>` : html`<span class="pill tone-ok">${icon('check')}PDF with selectable text</span>`;
  return html`<div class="page-intro"><p>Bring in a procedure you already use. Labby turns it into editable steps, then shows you what’s missing or unclear before you save. The original file is kept with the lab.</p></div>
  ${d && d.error ? html`<div class="error-summary" role="alert" id="imp-error" style="margin-bottom:14px"><strong>${d.error.message}</strong> ${d.error.hint}</div>` : ''}
  <div class="grid grid-main-side" style="align-items:start">
    <div class="stack">
      <section class="dropzone ${U.dropOver ? 'over' : ''}" id="dropzone" aria-labelledby="dz-h">
        <span class="empty-ico" style="width:52px;height:52px;border-radius:16px;background:var(--accent-soft);color:var(--accent-ink);display:grid;place-items:center">${icon('upload', 'lg')}</span>
        <h2 id="dz-h">Drop a procedure file here</h2>
        <p class="muted small">or</p>
        <label class="btn btn-primary" for="imp-file">${icon('file')}Choose a file</label>
        <input type="file" id="imp-file" class="sr-only" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" data-change="import-file">
        <div class="formats" aria-label="Supported formats">${pdfFmt}
          ${Formats.docx === 'ok' ? html`<span class="pill tone-ok">${icon('check')}Word (.docx)</span>` : html`<span class="pill tone-bad">${icon('x')}.docx not supported in this browser</span>`}
          <span class="pill tone-ok">${icon('check')}Plain text (.txt)</span>
          <span class="pill tone-idle">${icon('x')}Not yet: scanned PDFs, photos, .doc</span></div>
        <p class="hint">Up to 15 MB. Text is read in your browser; nothing is uploaded.</p>
      </section>
      <section class="card card-pad stack" aria-labelledby="paste-h">
        <h2 id="paste-h">Paste the procedure</h2>
        ${textareaField({ label: 'Procedure text', id: 'imp-paste', bind: 'ui.pasteText', value: S.ui.pasteText || '', rows: 6, placeholder: 'Paste from a document, website or email. Headings like Materials, Procedure and Safety help Labby sort it.' })}
        <div class="row wrap"><button class="btn" data-action="import-paste"${attr(!(S.ui.pasteText || '').trim(), 'disabled')}>${icon('arrowRight')}Import pasted text</button></div>
      </section>
    </div>
    <aside class="card card-pad stack" aria-labelledby="manual-h">
      <h2 id="manual-h">Write it yourself</h2>
      <p class="muted small">Start from a blank procedure with the same fields: objectives, materials, timed steps, student measurements, checkpoints, precautions and cleanup.</p>
      <button class="btn" data-action="new-manual">${icon('pencil')}Open the manual editor</button>
      <hr class="divider">
      <h3>What gets imported</h3>
      <ul class="ul-plain small"><li>Title, objectives, materials and quantities</li><li>Numbered steps, with times written like “(5 min)”</li><li>Measurements from the Data section and “record …” phrases</li><li>Safety or precautions, and cleanup</li></ul>
      <p class="hint">Analysis questions and background stay in the original file.</p>
    </aside>
  </div>`;
}

function importReview(d) {
  const flags = [...d.notes.filter((n) => n.level !== 'info'), ...procedureFlags(d.content), ...d.notes.filter((n) => n.level === 'info')];
  const errs = d.readyErrors || [];
  return html`<div class="stack loose">
    <div class="page-intro" style="margin:0"><div class="stack tight"><span class="eyebrow">Import review</span><h2>${d.file.name}</h2>
      <p class="small">${(d.file.size / 1024).toFixed(0)} KB · read ${d.source === 'paste' ? 'from pasted text' : d.source === 'pdf' ? 'with the PDF reader' : d.source === 'docx' ? 'from the Word document' : 'as plain text'}</p></div></div>
    <div class="notice">${icon('info')}<div>Labby’s importer is rule-based: it only uses what the file says. Anything missing or unclear is flagged below and left blank for you to fill in.</div></div>
    ${errs.length ? html`<div class="error-summary" role="alert" id="imp-ready-errors"><strong>Fix these before marking it Ready to Assign, or save it as a draft for now:</strong><ul>${errs.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
    <div class="import-grid">
      <aside class="orig-col card card-pad stack" aria-labelledby="orig-h">
        <div class="row between"><h2 id="orig-h">Original</h2><span class="tag">${icon('lock', 'sm')}Kept for reference</span></div>
        <span class="xs muted">${d.file.name} · ${d.source.toUpperCase()}</span>
        <pre class="original" tabindex="0" aria-label="Extracted text of the original file">${d.text}</pre>
      </aside>
      <div class="stack" style="min-width:0">
        <section class="card card-pad">${flagsPanel(flags, 'ui.importDraft.content')}</section>
        ${procedureEditor('ui.importDraft.content', d.content, { errors: errs })}
        <div class="sticky-actions">
          <button class="btn btn-ghost" data-action="import-discard">Discard</button><span class="spacer"></span>
          <button class="btn" data-action="import-save" data-state="draft">${icon('check')}Save as draft</button>
          <button class="btn btn-primary" data-action="import-save" data-state="ready">${icon('checkCircle')}Save and mark ready</button>
        </div>
      </div>
    </div>
  </div>`;
}

async function importFile(file) {
  if (!file) return;
  U.importBusy = file.name; U.importFile = null; S.ui.importDraft = null; commit();
  try {
    const res = await readProcedureFile(file);
    const parsed = parseProcedureText(res.text);
    U.importFile = file;
    S.ui.importDraft = { stage: 'review', source: res.kind, file: { name: file.name, size: file.size, type: file.type || res.kind }, text: res.text, content: parsed.content, notes: parsed.notes };
  } catch (e) {
    S.ui.importDraft = { stage: 'pick', error: { message: e.message || 'This file couldn’t be read.', hint: e.hint || 'Paste the text instead.' } };
    U.focusAfter = '#imp-error';
  } finally { U.importBusy = false; commit(); }
}
function importText(text, source) {
  const parsed = parseProcedureText(text);
  const name = `Pasted text (${fmtDayTime(Date.now())})`;
  U.importFile = null;
  S.ui.importDraft = { stage: 'review', source, file: { name, size: new Blob([text]).size, type: 'text/plain' }, text, content: parsed.content, notes: parsed.notes };
  commit(); window.scrollTo(0, 0);
}
function saveImport(state) {
  const d = S.ui.importDraft;
  if (state === 'ready') { d.readyErrors = readyErrors(d.content); if (d.readyErrors.length) { U.focusAfter = '#imp-ready-errors'; commit(); return; } }
  const lab = newLab(d.content, d.source === 'paste' ? 'paste' : 'upload', { name: d.file.name, size: d.file.size, type: d.file.type, text: d.text });
  if (state === 'ready') saveLabVersion(lab, d.content, 'ready');
  if (U.importFile) { const f = U.importFile; FileVault.put(lab.id, f).then(() => { lab.original.key = lab.id; commit(); }).catch(() => { lab.original.note = 'The original file couldn’t be stored in this browser; the extracted text is kept.'; commit(); }); }
  S.ui.importDraft = null; U.importFile = null; S.ui.libStatus = 'all';
  commit(); go('library');
  if (state === 'ready') { U.modal = { type: 'assign', labId: lab.id, classId: (myClasses()[0] || {}).id || '', periodIds: [], date: todayISO() }; toast(`${lab.versions[0].content.title || 'Lab'} saved as Ready to Assign. Choose periods now or later.`); }
  else toast(`${lab.versions[0].content.title || 'Lab'} saved as a draft.`);
}

/* ---------- Lab editor ---------- */
function labEditorView(id) {
  const lab = labById(id);
  if (!lab || lab.teacherId !== S.currentUserId) return html`<div class="card">${emptyState({ ico: 'lock', title: 'Lab not found', text: 'This lab doesn’t exist or belongs to another teacher.', actions: html`<a class="btn" href="#library">Back to library</a>` })}</div>`;
  const latest = latestVersion(lab);
  if (!S.ui.editorDraft || S.ui.editorDraft.labId !== id) S.ui.editorDraft = { labId: id, content: clone(latest.content), readyErrors: [] };
  const ed = S.ui.editorDraft; const c = ed.content;
  const dirty = JSON.stringify(c) !== JSON.stringify(latest.content);
  const assigned = assignmentsForLab(lab.id);
  const flags = procedureFlags(c);
  return html`<div class="stack loose">
    <div class="row between wrap top"><div class="stack tight"><a href="#library" class="small">${icon('arrowLeft', 'sm')} Library</a>
      <div class="row wrap">${labPill(labStatus(lab))}<span class="tag">Editing version ${latest.locked ? latest.number + 1 : latest.number}${latest.locked ? ' (new)' : ''}</span><span class="tag">${SOURCE_LABEL[lab.source]}</span>${dirty ? html`<span class="tag" style="background:var(--warn-soft);color:var(--warn)">Unsaved changes</span>` : ''}</div></div>
      <div class="row wrap"><button class="btn btn-sm" data-action="preview-student" data-lid="${lab.id}">${icon('eye', 'sm')}Preview as Student</button>
        ${latestReady(lab) && !lab.archived ? html`<button class="btn btn-sm" data-action="assign-open" data-lid="${lab.id}">${icon('send', 'sm')}Assign</button>` : ''}</div></div>
    ${assigned.length ? html`<div class="notice">${icon('lock')}<div>${assigned.map((a) => html`<div><strong>Version ${versionById(lab, a.versionId).number}</strong> is assigned to ${classById(a.classId).name} · ${a.periodIds.map((p) => shortPeriod(periodName(a.classId, p))).join(', ')}.</div>`)}
      <div class="small" style="margin-top:4px">${latest.locked ? `Saving creates version ${latest.number + 1}. Students in those sessions keep the version they were given.` : `You’re editing version ${latest.number}, which isn’t assigned. Sessions already assigned won’t change.`}</div></div></div>` : ''}
    ${ed.readyErrors.length ? html`<div class="error-summary" role="alert" id="ed-errors"><strong>Fix these before marking it Ready to Assign:</strong><ul>${ed.readyErrors.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
    <div class="import-grid" style="grid-template-columns:minmax(0,1.5fr) minmax(280px,0.75fr)">
      <div class="stack" style="min-width:0">
        ${procedureEditor('ui.editorDraft.content', c, { errors: ed.readyErrors, mode: 'class' })}
        <div class="sticky-actions">
          <button class="btn btn-ghost" data-action="editor-discard"${attr(!dirty, 'disabled')}>Discard changes</button><span class="spacer"></span>
          <button class="btn" data-action="editor-save" data-state="draft">${icon('check')}Save draft</button>
          <button class="btn btn-primary" data-action="editor-save" data-state="ready">${icon('checkCircle')}Save and mark ready</button>
        </div>
      </div>
      <aside class="stack orig-col" style="min-width:0">
        <section class="card card-pad">${flagsPanel(flags, 'ui.editorDraft.content')}</section>
        ${releaseSection(lab)}
        <section class="card card-pad stack tight" aria-labelledby="vh-h"><h2 id="vh-h">Versions</h2>
          ${[...lab.versions].reverse().map((v) => { const uses = assigned.filter((a) => a.versionId === v.id); return html`<div class="row between" style="padding:6px 0;border-bottom:1px dashed var(--line)"><div><strong class="small">Version ${v.number}</strong><div class="xs muted">${v.state === 'ready' ? 'Ready' : 'Draft'} · ${fmtDayTime(v.createdAt)}</div></div>
            ${uses.length ? html`<span class="pill tone-blue">${icon('lock')}Assigned</span>` : v.state === 'ready' ? html`<span class="pill tone-accent">${icon('check')}Ready</span>` : html`<span class="pill tone-idle">${icon('pencil')}Draft</span>`}</div>`; })}
        </section>
        ${lab.original ? html`<details class="card card-pad"><summary class="strong" style="cursor:pointer">${icon('file', 'sm')} Original: ${lab.original.name}</summary>
          <div class="stack tight" style="margin-top:10px"><span class="xs muted">${(lab.original.size / 1024).toFixed(0)} KB · ${lab.original.key ? 'stored in this browser' : 'extracted text only'}</span>
          ${lab.original.note ? html`<span class="xs muted">${lab.original.note}</span>` : ''}
          ${lab.original.text ? html`<pre class="original" style="max-height:340px">${lab.original.text}</pre>` : ''}</div></details>` : ''}
      </aside>
    </div>
  </div>`;
}
function editorSave(state) {
  const ed = S.ui.editorDraft; const lab = labById(ed.labId);
  if (state === 'ready') { ed.readyErrors = readyErrors(ed.content); if (ed.readyErrors.length) { U.focusAfter = '#ed-errors'; commit(); return; } }
  ed.readyErrors = [];
  const wasLocked = latestVersion(lab).locked;
  const v = saveLabVersion(lab, ed.content, state);
  ed.content = clone(v.content);
  commit();
  toast(`${wasLocked ? `Saved as version ${v.number}` : `Version ${v.number} saved`}${state === 'ready' ? ' and marked Ready to Assign' : ' as a draft'}.`);
}
function newManualLab() {
  const c = blankContent(); c.subject = (myClasses()[0] || {}).subject || '';
  const lab = newLab(c, 'manual');
  S.ui.editorDraft = null; commit(); go(`lab-${lab.id}`);
  toast('New draft created. Fill in the steps, then save.');
}

/* =====================================================================
   Teacher authoring: checkpoints between steps, student-facing
   information, and research protocol fields.
   ===================================================================== */
function checkpointSlot(path, p, c, s, i) {
  const idx = (c.checkpoints || []).findIndex((cp) => cp.afterStepId === s.id);
  if (idx === -1) return html`<div class="cp-add-row" data-key="${p}-cpadd-${s.id}"><button class="btn btn-xs btn-ghost" data-action="cp-add" data-path="${path}" data-sid="${s.id}">${icon('plus', 'sm')}Add a checkpoint after step ${i + 1}</button></div>`;
  return checkpointEditor(path, p, c, c.checkpoints[idx], idx, i);
}
function checkpointEditor(path, p, c, cp, idx, stepI) {
  const base = `${path}.checkpoints.${idx}`; const id = `${p}-cp-${idx}`;
  const hasKey = cp.questions.some((q) => q.type === 'mc' && q.correct);
  return html`<article class="cp-edit" data-key="${p}-cp-${cp.id}" aria-labelledby="${id}-h">
    <div class="cp-edit-head"><span class="row">${icon('clipboard')}<strong id="${id}-h">Checkpoint after step ${stepI + 1}</strong></span>
      <div class="row"><label class="sr-only" for="${id}-after">Released after</label><select class="select sm" id="${id}-after" style="width:auto" data-bind="${base}.afterStepId" data-type="str">${options(c.steps.map((s, i) => [s.id, `After step ${i + 1}`]), cp.afterStepId)}</select>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="list-remove" data-path="${path}.checkpoints" data-index="${idx}" aria-label="Delete the checkpoint after step ${stepI + 1}">${icon('trash', 'sm')}</button></div></div>
    <div class="cp-edit-body stack">
      <div class="form-grid">
        ${field({ label: 'Checkpoint title', id: `${id}-title`, bind: `${base}.title`, value: cp.title, cls: 'span-2', error: cp.title.trim() ? '' : 'Add a title.' })}
        ${textareaField({ label: 'Guiding information', id: `${id}-info`, bind: `${base}.info`, value: cp.info, rows: 2, cls: 'span-2', opt: true, placeholder: 'Explain what this checkpoint is about' })}
        ${field({ label: 'What students should observe or consider', id: `${id}-obs`, bind: `${base}.observe`, value: cp.observe, cls: 'span-2', opt: true })}
      </div>
      <div class="row wrap">${cp.image ? html`<img src="${cp.image.dataUrl}" alt="${cp.image.name}" class="cp-thumb"><span class="small">${cp.image.name}</span><button class="btn btn-xs btn-ghost" data-action="cp-image-remove" data-path="${base}">Remove image</button>`
        : html`<label class="btn btn-xs" for="${id}-img">${icon('upload', 'sm')}Add an image <span class="opt">(optional)</span></label>`}
        <input type="file" class="sr-only" id="${id}-img" accept="image/png,image/jpeg,image/webp,image/gif" data-change="cp-image" data-path="${base}"></div>
      <div class="cp-settings">
        ${selectField({ label: 'Type', id: `${id}-kind`, bind: `${base}.kind`, value: cp.kind, opts: [['response', 'Requires a response'], ['info', 'Informational only']] })}
        ${selectField({ label: 'Who responds', id: `${id}-scope`, bind: `${base}.scope`, value: cp.scope, opts: [['group', 'One response per group'], ['individual', 'Each student responds']] })}
        ${selectField({ label: 'Answer feedback', id: `${id}-fb`, bind: `${base}.feedbackRelease`, value: cp.feedbackRelease, opts: [['never', 'Never shown to students'], ['onSubmit', 'Shown after they submit'], ['afterSession', 'Shown after the session']] })}
        <div class="stack tight span-all">
          ${cp.kind === 'response' ? checkField({ label: 'A response is required before continuing', id: `${id}-req`, bind: `${base}.responseRequired`, checked: cp.responseRequired }) : ''}
          ${checkField({ label: 'Teacher approval is required before continuing', id: `${id}-appr`, bind: `${base}.approvalRequired`, checked: cp.approvalRequired, hint: 'Shows in Live Progress for you to approve or return. It never goes to the Help Queue.' })}
          ${cp.kind === 'response' ? checkField({ label: 'Must answer multiple-choice questions correctly to continue', id: `${id}-corr`, bind: `${base}.requireCorrect`, checked: cp.requireCorrect, hint: hasKey ? 'Off by default: submitting is separate from answering correctly.' : 'Set a correct answer on a multiple-choice question first.' }) : ''}
        </div>
      </div>
      ${cp.kind === 'response' ? html`<div class="stack">${cp.questions.map((q, j) => questionEditor(base, id, q, j))}
        <div class="row wrap"><span class="small strong">Add a question:</span>${Q_TYPES.map(([t, l]) => html`<button class="btn btn-xs" data-action="q-add" data-path="${base}.questions" data-type="${t}">${icon('plus', 'sm')}${l}</button>`)}</div></div>` : ''}
    </div></article>`;
}
function questionEditor(base, id, q, j) {
  const qb = `${base}.questions.${j}`; const qid = `${id}-q${j}`;
  return html`<div class="q-edit" data-key="${qid}-${q.id}">
    <div class="row wrap"><span class="step-n" style="width:26px;height:26px">${j + 1}</span>
      <label class="sr-only" for="${qid}-type">Question ${j + 1} type</label><select class="select sm" style="width:auto" id="${qid}-type" data-change="q-type" data-path="${qb}">${options(Q_TYPES, q.type)}</select>
      <label class="check small" for="${qid}-req"><input type="checkbox" id="${qid}-req" data-bind="${qb}.required" data-type="bool"${attr(q.required, 'checked')}><span>Required</span></label>
      <span class="spacer"></span><button class="btn btn-ghost btn-icon btn-sm" data-action="list-remove" data-path="${base}.questions" data-index="${j}" aria-label="Delete question ${j + 1}">${icon('x', 'sm')}</button></div>
    ${field({ label: 'Question', id: `${qid}-prompt`, bind: `${qb}.prompt`, value: q.prompt, error: q.prompt.trim() ? '' : 'Write the question.' })}
    ${q.type === 'numeric' ? field({ label: 'Unit', id: `${qid}-unit`, bind: `${qb}.unit`, value: q.unit, opt: true, placeholder: 'e.g. °C' }) : ''}
    ${q.type === 'mc' ? html`<fieldset class="stack tight" style="border:0;padding:0;margin:0"><legend class="label">Choices <span class="opt">(select the correct one, optional)</span></legend>
      ${q.options.map((o, k) => html`<div class="row" data-key="${qid}-o-${o.id}"><input type="radio" name="${qid}-correct" aria-label="Mark choice ${k + 1} correct" data-change="q-correct" data-path="${qb}" data-oid="${o.id}"${attr(q.correct === o.id, 'checked')}>
        <input class="input sm grow" data-bind="${qb}.options.${k}.text" data-type="str" value="${o.text}" placeholder="Choice ${k + 1}" aria-label="Choice ${k + 1}">
        <button class="btn btn-ghost btn-icon btn-sm" data-action="opt-remove" data-path="${qb}" data-index="${k}" aria-label="Remove choice ${k + 1}"${attr(q.options.length <= 2, 'disabled')}>${icon('x', 'sm')}</button></div>`)}
      <div class="row wrap"><button class="btn btn-xs btn-ghost" data-action="opt-add" data-path="${qb}.options">${icon('plus', 'sm')}Add choice</button>${q.correct ? html`<button class="btn btn-xs btn-ghost" data-action="q-clear-correct" data-path="${qb}">Clear correct answer</button>` : ''}</div>
      ${textareaField({ label: 'Feedback', id: `${qid}-fb`, bind: `${qb}.feedback`, value: q.feedback, rows: 2, opt: true, hint: 'Teacher-only unless this checkpoint’s answer feedback is released.' })}</fieldset>` : ''}
  </div>`;
}
function studentInfoSection(path, p, c) {
  return html`<section class="card card-pad stack" aria-labelledby="${p}-sinfo">
    <div class="row between wrap"><h2 id="${p}-sinfo">Information for students</h2><span class="hint">Choose when students see each part under Student Visibility & Release.</span></div>
    ${textareaField({ label: 'Short description', id: `${p}-desc`, bind: `${path}.description`, value: c.description, rows: 2, opt: true })}
    ${textareaField({ label: 'Background information', id: `${p}-bg`, bind: `${path}.background`, value: c.background, rows: 3, opt: true })}
    ${listEditor(`${path}.prep`, c.prep, { label: 'Preparation task', idBase: `${p}-prep`, addLabel: 'Add preparation task' })}
    ${textareaField({ label: 'Notes for students', id: `${p}-snotes`, bind: `${path}.studentNotes`, value: c.studentNotes, rows: 2, opt: true })}
    ${field({ label: 'Acknowledgment students confirm before entering the live session', id: `${p}-ack`, bind: `${path}.acknowledgment`, value: c.acknowledgment, opt: true, placeholder: 'e.g. I read the precautions and will wear goggles.' })}
    <div class="field"><span class="label">Attachments <span class="opt">(optional)</span></span>
      ${c.attachments.map((f, i) => html`<div class="row between panel" data-key="${p}-att-${f.id}"><span class="small">${icon('file', 'sm')} ${f.name} <span class="muted">${(f.size / 1024).toFixed(0)} KB</span></span><button class="btn btn-ghost btn-icon btn-sm" data-action="list-remove" data-path="${path}.attachments" data-index="${i}" aria-label="Remove ${f.name}">${icon('x', 'sm')}</button></div>`)}
      <div><label class="btn btn-sm" for="${p}-att">${icon('upload', 'sm')}Attach a file</label><input type="file" class="sr-only" id="${p}-att" data-change="att-pick" data-path="${path}.attachments"></div>
      <span class="hint">Up to 15 MB. Stored in this browser.</span></div>
    <div class="teacher-only">${textareaField({ label: 'Teacher-only notes', id: `${p}-tnotes`, bind: `${path}.teacherNotes`, value: c.teacherNotes, rows: 2, opt: true, hint: 'Never sent to students, whatever the release settings say.' })}</div>
  </section>`;
}
function researchFieldsSection(path, p, c) {
  return html`<section class="card card-pad stack" aria-labelledby="${p}-rs">
    <h2 id="${p}-rs">Research design</h2>
    ${textareaField({ label: 'Research objective', id: `${p}-obj2`, bind: `${path}.objective`, value: c.objective, rows: 2 })}
    <div class="form-grid">
      ${field({ label: 'Independent variable', id: `${p}-iv`, bind: `${path}.variables.independent`, value: c.variables.independent })}
      ${field({ label: 'Dependent variable', id: `${p}-dv`, bind: `${path}.variables.dependent`, value: c.variables.dependent })}
      ${field({ label: 'Controlled variables', id: `${p}-cv`, bind: `${path}.variables.controlled`, value: c.variables.controlled, cls: 'span-2' })}
      ${field({ label: 'Trials or replicates per condition', id: `${p}-tr`, bind: `${path}.trials`, value: c.trials, type: 'number', min: 1 })}
      ${field({ label: 'Participants', id: `${p}-pc`, bind: `${path}.participantsCount`, value: c.participantsCount, type: 'number', min: 1 })}
      ${field({ label: 'Time limit (min)', id: `${p}-tl`, bind: `${path}.timeLimit`, value: c.timeLimit ?? '', type: 'number', min: 0, opt: true })}
    </div>
    ${listEditor(`${path}.conditions`, c.conditions, { label: 'Experimental condition or sample label', idBase: `${p}-cond`, addLabel: 'Add condition' })}
    <div class="field"><span class="label">Measurement fields</span><p class="hint">Define these once and reuse them in every run’s measurement table.</p>
      ${c.measurementFields.map((f, i) => html`<div class="input-row" data-key="${p}-mf-${f.id}"><input class="input sm" data-bind="${path}.measurementFields.${i}.name" data-type="str" value="${f.name}" placeholder="Measurement name" aria-label="Measurement ${i + 1} name"><input class="input sm" data-bind="${path}.measurementFields.${i}.unit" data-type="str" value="${f.unit}" placeholder="unit" aria-label="Measurement ${i + 1} unit"><button class="btn btn-ghost btn-icon btn-sm" data-action="list-remove" data-path="${path}.measurementFields" data-index="${i}" aria-label="Remove measurement ${i + 1}">${icon('x', 'sm')}</button></div>`)}
      <button class="btn btn-xs btn-ghost" style="align-self:flex-start" data-action="mf-add" data-path="${path}.measurementFields">${icon('plus', 'sm')}Add measurement field</button></div>
    <div class="field"><span class="label">References</span>
      ${c.references.map((r, i) => html`<div class="input-row" style="grid-template-columns:minmax(0,1fr) minmax(0,0.7fr) 32px"><input class="input sm" data-bind="${path}.references.${i}.title" data-type="str" value="${r.title}" placeholder="Citation" aria-label="Reference ${i + 1}"><input class="input sm" data-bind="${path}.references.${i}.url" data-type="str" value="${r.url}" placeholder="Link (optional)" aria-label="Reference ${i + 1} link"><button class="btn btn-ghost btn-icon btn-sm" data-action="list-remove" data-path="${path}.references" data-index="${i}" aria-label="Remove reference ${i + 1}">${icon('x', 'sm')}</button></div>`)}
      <button class="btn btn-xs btn-ghost" style="align-self:flex-start" data-action="ref-add" data-path="${path}.references">${icon('plus', 'sm')}Add reference</button>
      <span class="hint">Add only sources you have read. Labby and its AI never generate citations.</span></div>
  </section>`;
}
async function readImageDataUrl(file, max = 900) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose an image file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Images must be under 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image couldn’t be read.')); i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.8);
  } finally { URL.revokeObjectURL(url); }
}

/* =====================================================================
   Procedure editor (shared by import review, the lab editor and the
   Lab Designer's "Edit manually"), flags list, and student preview.
   ===================================================================== */
const pidOf = (path) => path.replace(/[^a-z0-9]/gi, '-');
const BASIS_OPTS = [['group', 'per group'], ['student', 'per student'], ['share2', '1 per 2 groups'], ['share3', '1 per 3 groups'], ['share4', '1 per 4 groups']];
const basisOf = (m) => (m.per === 'student' ? 'student' : m.sharedBy > 1 ? `share${Math.min(4, m.sharedBy)}` : 'group');

function listEditor(path, items, { label, idBase, placeholder, addLabel }) {
  return html`<div class="field"><span class="label" id="${idBase}-lbl">${label}</span>
    <div class="list-edit" role="group" aria-labelledby="${idBase}-lbl">
      ${items.map((it, i) => html`<div class="list-edit-row" data-key="${idBase}-r${i}">
        <textarea class="textarea" style="min-height:40px" rows="1" id="${idBase}-${i}" data-bind="${path}.${i}" data-type="str" aria-label="${label} ${i + 1}"${attr(placeholder, 'placeholder', placeholder)}>${it}</textarea>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="list-remove" data-path="${path}" data-index="${i}" aria-label="Remove ${label.toLowerCase()} ${i + 1}">${icon('x', 'sm')}</button></div>`)}
      <button class="btn btn-sm btn-ghost" style="align-self:flex-start" id="${idBase}-add" data-action="list-add" data-path="${path}">${icon('plus', 'sm')}${addLabel}</button>
    </div></div>`;
}

function procedureEditor(path, c, { errors = [], hideTiming = false, mode = 'class' } = {}) {
  const p = pidOf(path); normalizeContent(c);
  return html`<div class="editor" data-key="editor-${p}">
    <section class="card card-pad stack" aria-labelledby="${p}-basics">
      <h2 id="${p}-basics">Basics</h2>
      <div class="form-grid">
        ${field({ label: 'Lab title', id: `${p}-title`, bind: `${path}.title`, value: c.title, cls: 'span-2', error: errors.includes('Add a title.') ? 'Add a title.' : '' })}
        ${field({ label: 'Subject or course', id: `${p}-subject`, bind: `${path}.subject`, value: c.subject, placeholder: 'e.g. Chemistry' })}
        ${selectField({ label: 'Education level', id: `${p}-level`, bind: `${path}.level`, value: c.level, opts: [['', 'Not set'], ...LEVELS] })}
        ${hideTiming ? '' : html`${field({ label: 'Student setup time (min)', id: `${p}-setupmin`, bind: `${path}.setupMinutes`, value: c.setupMinutes, type: 'number', min: 0, hint: 'Counted before step 1 when tracking pace.' })}
        ${field({ label: 'Cleanup time (min)', id: `${p}-cleanmin`, bind: `${path}.cleanupMinutes`, value: c.cleanupMinutes, type: 'number', min: 0 })}`}
      </div>
      ${listEditor(`${path}.objectives`, c.objectives, { label: 'Learning objectives', idBase: `${p}-obj`, addLabel: 'Add objective' })}
    </section>
    ${mode === 'class' ? studentInfoSection(path, p, c) : mode === 'research' ? researchFieldsSection(path, p, c) : ''}

    <section class="card card-pad stack" aria-labelledby="${p}-mats">
      <div class="row between"><h2 id="${p}-mats">Materials and quantities</h2><span class="hint">Quantities are per group unless you choose otherwise.</span></div>
      ${c.materials.length ? html`<div class="mat-row head" aria-hidden="true"><span>Item</span><span>Qty</span><span>Unit</span><span>Type</span><span>Basis</span><span></span></div>` : html`<p class="muted small">No materials yet.</p>`}
      ${c.materials.map((m, i) => html`<div class="mat-row" data-key="${p}-m-${m.id}">
        <input class="input sm" id="${p}-mat-${i}-name" data-bind="${path}.materials.${i}.name" data-type="str" value="${m.name}" aria-label="Material ${i + 1} name"${attr(!m.name.trim(), 'aria-invalid', 'true')}>
        <input class="input sm" type="number" min="0" step="0.01" id="${p}-mat-${i}-qty" data-bind="${path}.materials.${i}.qtyPerGroup" data-type="numOrNull" value="${m.qtyPerGroup ?? ''}" placeholder="?" aria-label="Quantity for ${m.name || 'material ' + (i + 1)}"${attr(m.qtyPerGroup == null || m.qtyPerGroup === '', 'aria-invalid', 'true')}>
        <input class="input sm" id="${p}-mat-${i}-unit" data-bind="${path}.materials.${i}.unit" data-type="str" value="${m.unit}" aria-label="Unit for ${m.name || 'material ' + (i + 1)}" placeholder="unit">
        <select class="select sm" id="${p}-mat-${i}-kind" data-bind="${path}.materials.${i}.kind" data-type="str" aria-label="Type for ${m.name || 'material ' + (i + 1)}"${attr(m.kind === 'unknown', 'aria-invalid', 'true')}>${options([['reusable', 'Reusable'], ['consumable', 'Consumable'], ['unknown', 'Not set']], m.kind)}</select>
        <select class="select sm" id="${p}-mat-${i}-basis" data-change="mat-basis" data-path="${path}.materials.${i}" aria-label="Basis for ${m.name || 'material ' + (i + 1)}">${options(BASIS_OPTS, basisOf(m))}</select>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="list-remove" data-path="${path}.materials" data-index="${i}" aria-label="Remove ${m.name || 'material ' + (i + 1)}">${icon('x', 'sm')}</button>
      </div>`)}
      <button class="btn btn-sm btn-ghost" style="align-self:flex-start" id="${p}-mat-add" data-action="mat-add" data-path="${path}.materials">${icon('plus', 'sm')}Add material</button>
    </section>

    <section class="card card-pad stack" aria-labelledby="${p}-setup-h">
      <h2 id="${p}-setup-h">Setup</h2>
      ${listEditor(`${path}.setup`, c.setup, { label: 'Setup instruction', idBase: `${p}-setup`, addLabel: 'Add setup instruction' })}
    </section>

    <section class="stack" aria-labelledby="${p}-steps-h">
      <div class="row between"><h2 id="${p}-steps-h">Procedure steps</h2><span class="hint num">${plural(c.steps.length, 'step')} · ${stepsMinutes(c)} min planned</span></div>
      ${c.steps.map((s, i) => html`${stepEditor(path, p, s, i, c.steps.length, errors, mode)}${checkpointSlot(path, p, c, s, i)}`)}
      <button class="btn btn-sm" style="align-self:flex-start" id="${p}-step-add" data-action="step-add" data-path="${path}.steps">${icon('plus', 'sm')}Add step</button>
    </section>

    <section class="card card-pad stack" aria-labelledby="${p}-safety-h">
      <h2 id="${p}-safety-h">Precautions and cleanup</h2>
      ${listEditor(`${path}.precautions`, c.precautions, { label: 'Precaution', idBase: `${p}-pre`, addLabel: 'Add precaution' })}
      ${listEditor(`${path}.cleanup`, c.cleanup, { label: 'Cleanup instruction', idBase: `${p}-clean`, addLabel: 'Add cleanup instruction' })}
    </section>
  </div>`;
}

function stepEditor(path, p, s, i, n, errors, mode = 'class') {
  const sp = `${path}.steps.${i}`; const id = `${p}-step-${i}`;
  const noMin = !s.minutes;
  return html`<article class="step-edit" data-key="${p}-s-${s.id}" aria-labelledby="${id}-lbl">
    <div class="step-edit-head">
      <span class="step-n" id="${id}-lbl" aria-label="Step ${i + 1}">${i + 1}</span>
      <input class="input sm grow" style="flex:1 1 200px" id="${id}-title" data-bind="${sp}.title" data-type="str" value="${s.title}" placeholder="Step title" aria-label="Step ${i + 1} title"${attr(!s.title.trim(), 'aria-invalid', 'true')}>
      <label class="row small" for="${id}-min" style="gap:6px"><span class="muted">Minutes</span>
        <input class="input sm num-in" type="number" min="1" id="${id}-min" data-bind="${sp}.minutes" data-type="numOrNull" value="${s.minutes ?? ''}" placeholder="?"${attr(noMin, 'aria-invalid', 'true')}></label>
      <div class="row" style="gap:2px">
        <button class="btn btn-ghost btn-icon btn-sm" data-action="step-move" data-path="${path}.steps" data-index="${i}" data-dir="-1" aria-label="Move step ${i + 1} up"${attr(i === 0, 'disabled')}>${icon('arrowUp', 'sm')}</button>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="step-move" data-path="${path}.steps" data-index="${i}" data-dir="1" aria-label="Move step ${i + 1} down"${attr(i === n - 1, 'disabled')}>${icon('arrowDown', 'sm')}</button>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="list-remove" data-path="${path}.steps" data-index="${i}" aria-label="Delete step ${i + 1}">${icon('trash', 'sm')}</button>
      </div>
    </div>
    <div class="step-edit-body">
      ${textareaField({ label: 'Instructions', id: `${id}-instr`, bind: `${sp}.instructions`, value: s.instructions, cls: 'span-2', rows: 2, error: !s.instructions.trim() ? 'Add instructions for students.' : '' })}
      <div class="field span-2"><label for="${id}-mats">Materials used in this step <span class="opt">(comma-separated)</span></label>
        <input class="input sm" id="${id}-mats" data-bind="${sp}.materials" data-type="csv" value="${s.materials.join(', ')}"></div>
      <div class="field span-2"><span class="label" id="${id}-in-lbl">Measurements or observations students record</span>
        <div class="stack tight" role="group" aria-labelledby="${id}-in-lbl">
          ${s.inputs.map((inp, j) => html`<div class="input-row" data-key="${id}-in-${j}">
            <input class="input sm" id="${id}-in-${j}" data-bind="${sp}.inputs.${j}.label" data-type="str" value="${inp.label}" placeholder="What to record" aria-label="Input ${j + 1} label">
            <input class="input sm" data-bind="${sp}.inputs.${j}.unit" data-type="str" value="${inp.unit}" placeholder="unit" aria-label="Input ${j + 1} unit">
            <button class="btn btn-ghost btn-icon btn-sm" data-action="list-remove" data-path="${sp}.inputs" data-index="${j}" aria-label="Remove input ${j + 1}">${icon('x', 'sm')}</button></div>`)}
          <button class="btn btn-xs btn-ghost" style="align-self:flex-start" data-action="input-add" data-path="${sp}.inputs">${icon('plus', 'sm')}Add measurement</button>
        </div></div>
      ${mode === 'research' ? field({ label: 'Expected observation', id: `${id}-exp`, bind: `${sp}.expected`, value: s.expected || '', cls: 'span-2', opt: true, hint: 'Shown to participants labeled as an expectation, not a result.' }) : ''}
    </div>
  </article>`;
}

function flagsPanel(flags, path) {
  if (!flags.length) return html`<div class="notice ok">${icon('checkCircle')}<div>Nothing missing or unclear was found. Review the procedure before assigning it.</div></div>`;
  const missing = flags.filter((f) => f.level === 'missing').length;
  const unclear = flags.filter((f) => f.level === 'unclear').length;
  return html`<div class="stack tight">
    <div class="row wrap"><strong>Needs your review</strong>${missing ? html`<span class="pill tone-bad">${icon('alert')}${missing} missing</span>` : ''}${unclear ? html`<span class="pill tone-warn">${icon('question')}${unclear} unclear</span>` : ''}</div>
    <p class="hint">Labby doesn’t fill these in for you. Click an item to jump to it.</p>
    <div class="flag-list">${flags.map((f) => html`<div class="flag ${f.level === 'missing' ? 'missing' : ''}" ${f.level === 'info' ? raw('style="background:var(--blue-soft)"') : ''}>
      ${icon(f.level === 'missing' ? 'alert' : f.level === 'info' ? 'info' : 'question')}<span>${f.text}</span>
      ${f.field ? html`<button class="link-btn small" data-action="flag-go" data-path="${path}" data-field="${f.field}">Go to</button>` : html`<span></span>`}</div>`)}</div>
  </div>`;
}
function flagTargetId(path, fieldName, c) {
  const p = pidOf(path); const [kind, idx] = fieldName.split('.');
  if (kind === 'title') return `${p}-title`;
  if (kind === 'objectives') return c.objectives.length ? `${p}-obj-0` : `${p}-obj-add`;
  if (kind === 'materials') { if (idx == null) return `${p}-mat-add`; const m = c.materials[idx]; return !m ? `${p}-mat-add` : !m.name.trim() ? `${p}-mat-${idx}-name` : m.qtyPerGroup == null ? `${p}-mat-${idx}-qty` : `${p}-mat-${idx}-kind`; }
  if (kind === 'steps') { if (idx == null) return `${p}-step-add`; const s = c.steps[idx]; return !s ? `${p}-step-add` : !s.minutes ? `${p}-step-${idx}-min` : `${p}-step-${idx}-instr`; }
  if (kind === 'precautions') return c.precautions.length ? `${p}-pre-0` : `${p}-pre-add`;
  if (kind === 'cleanup') return c.cleanup.length ? `${p}-clean-0` : `${p}-clean-add`;
  return null;
}

/* ---------- Student preview ---------- */
function studentPreview(c) {
  const mats = c.materials.filter((m) => m.name.trim());
  return html`<div class="stack">
    <div class="notice">${icon('info')}<div>This shows the content students will get, in a simple layout. The student app itself is designed in the next phase.</div></div>
    <div class="phone" aria-label="Student view preview"><div class="phone-screen">
      <div class="sp-card"><span class="eyebrow">Lab</span><strong style="font-size:1.05rem">${c.title || 'Untitled lab'}</strong>
        ${c.objectives.filter(Boolean).length ? html`<ul class="ul-plain small">${c.objectives.filter(Boolean).map((o) => html`<li>${o}</li>`)}</ul>` : ''}</div>
      ${mats.length ? html`<div class="sp-card"><span class="eyebrow">Your group needs</span><ul class="ul-plain small">${mats.map((m) => html`<li>${fmtQty(m.qtyPerGroup)} ${m.unit} ${m.name}${m.per === 'student' ? ' (each student)' : m.sharedBy > 1 ? ` (shared by ${m.sharedBy} groups)` : ''}</li>`)}</ul></div>` : ''}
      ${c.precautions.filter(Boolean).length ? html`<div class="sp-card" style="border-color:var(--warn)"><span class="eyebrow" style="color:var(--warn)">Before you start</span><ul class="ul-plain small">${c.precautions.filter(Boolean).map((o) => html`<li>${o}</li>`)}</ul></div>` : ''}
      ${c.steps.map((s, i) => html`<div class="sp-card">
        <div class="row between"><span class="eyebrow">Step ${i + 1} of ${c.steps.length}</span><span class="xs muted mono">${s.minutes ? `~${s.minutes} min` : ''}</span></div>
        <strong>${s.title || 'Untitled step'}</strong><span class="small">${s.instructions}</span>
        ${s.inputs.map((inp) => html`<div class="field"><span class="small strong">${inp.label}${inp.unit ? ` (${inp.unit})` : ''}</span><span class="input sm" style="color:var(--muted)" aria-hidden="true">Enter value</span></div>`)}
        ${checkpointAfter(c, s.id) ? html`<span class="pill tone-wait" style="align-self:flex-start">${icon('hand')}${checkpointAfter(c, s.id).title}</span>` : ''}
      </div>`)}
      ${c.cleanup.filter(Boolean).length ? html`<div class="sp-card"><span class="eyebrow">Cleanup</span><ul class="ul-plain small">${c.cleanup.filter(Boolean).map((o) => html`<li>${o}</li>`)}</ul></div>` : ''}
    </div></div></div>`;
}

/* =====================================================================
   Shared UI pieces. Status is always text + icon, never color alone.
   ===================================================================== */
function pill(meta, extraText = '') {
  return html`<span class="pill tone-${meta.tone}">${icon(meta.icon)}${meta.label}${extraText}</span>`;
}
const groupPill = (key) => pill(GROUP_STATUS[key]);
const labPill = (key) => pill(LAB_STATUS[key]);
const sessionPill = (key) => pill(SESSION_STATUS[key]);
const helpPill = (key) => pill(HELP_STATUS[key]);
const catTag = (cat) => html`<span class="tag">${icon(HELP_CATEGORIES[cat] || 'question', 'sm')}${cat}</span>`;

/** Step-segmented progress bar: one segment per procedure step. */
function segs(total, doneSet, current, finished, label) {
  const parts = [];
  for (let i = 0; i < total; i++) parts.push(html`<span class="seg ${doneSet.has(i) ? 'done' : !finished && i === current ? 'now' : ''}"></span>`);
  return html`<div class="segs" role="img" aria-label="${label}">${parts}</div>`;
}
function progressFrac(p, c) { return c.steps.length ? p.completed.length / c.steps.length : 0; }

function emptyState({ ico = 'flask', title, text, actions = '', compact = false }) {
  return html`<div class="empty ${compact ? 'compact' : ''}"><div class="empty-ico">${icon(ico)}</div><h2>${title}</h2>${text ? html`<p>${text}</p>` : ''}${actions ? html`<div class="row wrap" style="justify-content:center">${actions}</div>` : ''}</div>`;
}

/* ---------- Form fields (data-bind keeps state in sync) ---------- */
function field({ label, id, bind, value = '', type = 'text', hint = '', error = '', opt = false, placeholder = '', min, max, step, required = false, cls = '', attrs = '' }) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ');
  const dt = type === 'number' ? (step && String(step).includes('.') ? 'num' : 'int') : 'str';
  return html`<div class="field ${cls}">
    <label for="${id}">${label}${opt ? html` <span class="opt">(optional)</span>` : ''}</label>
    <input class="input" id="${id}" type="${type}" value="${value ?? ''}" ${raw(bind ? `data-bind="${esc(bind)}" data-type="${dt}"` : '')}
      ${attr(placeholder, 'placeholder', placeholder)}${attr(min != null, 'min', min)}${attr(max != null, 'max', max)}${attr(step != null, 'step', step)}${attr(required, 'required')}${attr(!!error, 'aria-invalid', 'true')}${attr(!!describedBy, 'aria-describedby', describedBy)} ${raw(attrs)}>
    ${hint ? html`<div class="hint" id="${id}-hint">${hint}</div>` : ''}
    ${error ? html`<div class="err" id="${id}-err">${icon('alert', 'sm')}${error}</div>` : ''}
  </div>`;
}
function textareaField({ label, id, bind, value = '', hint = '', error = '', opt = false, placeholder = '', rows = 3, cls = '' }) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ');
  return html`<div class="field ${cls}">
    <label for="${id}">${label}${opt ? html` <span class="opt">(optional)</span>` : ''}</label>
    <textarea class="textarea" id="${id}" rows="${rows}" ${raw(bind ? `data-bind="${esc(bind)}" data-type="str"` : '')}${attr(placeholder, 'placeholder', placeholder)}${attr(!!error, 'aria-invalid', 'true')}${attr(!!describedBy, 'aria-describedby', describedBy)}>${value ?? ''}</textarea>
    ${hint ? html`<div class="hint" id="${id}-hint">${hint}</div>` : ''}
    ${error ? html`<div class="err" id="${id}-err">${icon('alert', 'sm')}${error}</div>` : ''}
  </div>`;
}
function options(list, selected) {
  return list.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return html`<option value="${v}"${attr(String(v) === String(selected), 'selected')}>${l}</option>`; });
}
function selectField({ label, id, bind, value, opts, hint = '', error = '', cls = '', action = '' }) {
  return html`<div class="field ${cls}">
    <label for="${id}">${label}</label>
    <select class="select" id="${id}" ${raw(bind ? `data-bind="${esc(bind)}" data-type="str"` : '')}${raw(action ? ` data-change="${esc(action)}"` : '')}${attr(!!error, 'aria-invalid', 'true')}>${options(opts, value)}</select>
    ${hint ? html`<div class="hint">${hint}</div>` : ''}
    ${error ? html`<div class="err">${icon('alert', 'sm')}${error}</div>` : ''}
  </div>`;
}
function checkField({ label, id, bind, checked, hint = '' }) {
  return html`<label class="check" for="${id}"><input type="checkbox" id="${id}" data-bind="${bind}" data-type="bool"${attr(checked, 'checked')}><span>${label}${hint ? html`<span class="hint" style="display:block">${hint}</span>` : ''}</span></label>`;
}

/* ---------- Live clocks: updated every second without a full re-render ---------- */
const tickSince = (ts, fmt = 'timer') => html`<span data-tick="since" data-t="${ts}" data-fmt="${fmt}">${fmt === 'ago' ? fmtAgo(ts) : fmt === 'mins' ? fmtMins(Date.now() - ts) : fmtTimer(Date.now() - ts)}</span>`;
const tickSession = (sess, what) => {
  const c = sessionContent(sess);
  const el = sessionElapsed(sess);
  const val = what === 'elapsed' ? fmtTimer(el) : fmtTimer(plannedMinutes(c) * MIN - el);
  return html`<span data-tick="session" data-sid="${sess.id}" data-what="${what}">${val}</span>`;
};
const tickStep = (p, sess) => html`<span data-tick="step" data-pid="${p.id}">${p.stepStartedAt && !p.finishedAt ? fmtTimer(stepTimeMs(p, sess)) : '—'}</span>`;

/* ---------- Modal shell ---------- */
function modalShell({ title, sub = '', body, foot, wide = false, labelId = 'modal-title' }) {
  return html`<div class="modal-scrim" data-action="modal-scrim">
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${labelId}" data-key="modal">
      <div class="modal-head"><div class="stack tight"><h2 id="${labelId}">${title}</h2>${sub ? html`<p class="muted small">${sub}</p>` : ''}</div>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="modal-close" aria-label="Close dialog">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      ${foot ? html`<div class="modal-foot">${foot}</div>` : ''}
    </div></div>`;
}
const groupLabel = (g) => (g ? g.name : 'Unknown group');
const memberNames = (g) => (g ? g.memberIds.map((id) => (studentById(id) || { name: '?' }).name) : []);

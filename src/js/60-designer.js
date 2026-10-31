/* =====================================================================
   AI-assisted Lab Designer: structured inputs + assistant + live plan.
   The assistant proposes; Labby does the arithmetic; the teacher decides.
   ===================================================================== */
const SUGGESTIONS = ['Can we finish this in 45 minutes?', 'We only have six thermometers. How should we organize the groups?', 'Adjust this for four students per group.'];

function designerView() {
  const d = S.designer;
  if (!d.folds) d.folds = { context: true, resources: true, logistics: true };
  d.chat = d.chat.filter((m) => !m.pending || AI.busy);
  return html`<div class="page-intro"><p>Describe the experiment, list what you have, and pick the periods. The assistant drafts a plan; Labby calculates groups, totals and shortages from your numbers. Plans stay drafts until you approve them.</p></div>
  <div class="notice ai" style="margin-bottom:16px">${icon('info')}<div>AI suggestions support your judgment. Labby does not verify experimental safety, so review every step, quantity and precaution before class.</div></div>
  <div class="designer">
    <section class="card designer-left" aria-label="Planning inputs and assistant">
      <div class="tabs" role="tablist" aria-label="Designer panels">
        <button class="tab" role="tab" aria-selected="${d.tab === 'inputs'}" data-action="designer-tab" data-tab="inputs">${icon('sliders', 'sm')}Plan inputs</button>
        <button class="tab" role="tab" aria-selected="${d.tab === 'assistant'}" data-action="designer-tab" data-tab="assistant">${icon('sparkles', 'sm')}Assistant${d.chat.length ? html` <span class="badge zero">${d.chat.filter((m) => m.role === 'assistant' && !m.pending).length}</span>` : ''}</button>
      </div>
      ${d.tab === 'inputs' ? designerInputs(d) : designerAssistant(d)}
    </section>
    <div class="stack" style="min-width:0">${planPreview(d)}</div>
  </div>`;
}

function fold(key, title, ico, body, d) {
  const open = d.folds[key];
  return html`<details class="fold"${attr(open, 'open')} data-key="fold-${key}"><summary data-action="fold" data-fold="${key}" aria-expanded="${!!open}">${icon(ico)}${title}${icon('chevDown', 'chev sm')}</summary>${open ? html`<div class="fold-body">${body}</div>` : ''}</details>`;
}

function designerInputs(d) {
  const f = d.form; const lg = d.logistics;
  const periods = designerPeriods(d);
  const errs = d.errors || [];
  const contextBody = html`
    <div class="form-grid">
      ${field({ label: 'Subject', id: 'dz-subject', bind: 'designer.form.subject', value: f.subject })}
      ${selectField({ label: 'Education level', id: 'dz-level', bind: 'designer.form.level', value: f.level, opts: [['', 'Choose a level'], ...LEVELS] })}
    </div>
    ${field({ label: 'Topic', id: 'dz-topic', bind: 'designer.form.topic', value: f.topic, placeholder: 'e.g. Reaction rates' })}
    ${textareaField({ label: 'Learning objectives', id: 'dz-obj', bind: 'designer.form.objectives', value: f.objectives, hint: 'One per line.', rows: 3 })}
    ${textareaField({ label: 'Desired experiment or concept', id: 'dz-exp', bind: 'designer.form.experiment', value: f.experiment, rows: 2, error: errs.includes('experiment') ? 'Describe the experiment or concept you want to teach.' : '' })}
    ${textareaField({ label: 'Existing instructions', id: 'dz-existing', bind: 'designer.form.existing', value: f.existing, opt: true, rows: 2, placeholder: 'Paste any notes or a rough procedure to build on' })}`;
  const invErrors = d.inventory.map((it) => it.name.trim() && !(Number(it.qty) >= 0 && it.qty !== '') );
  const resourcesBody = html`
    <p class="hint">List what you actually have. Labby compares the plan against these numbers and flags anything short. It never assumes extra supplies.</p>
    ${d.inventory.length ? html`<div class="inv-row head" aria-hidden="true"><span>Item</span><span>Qty</span><span>Unit</span><span>Type</span><span></span></div>` : ''}
    ${d.inventory.map((it, i) => html`<div class="inv-item" data-key="inv-${it.id}">
      <div class="inv-row">
        <input class="input sm" id="inv-${i}-name" data-bind="designer.inventory.${i}.name" data-type="str" value="${it.name}" aria-label="Item ${i + 1} name" placeholder="Item name">
        <input class="input sm" type="number" min="0" step="any" id="inv-${i}-qty" data-bind="designer.inventory.${i}.qty" data-type="numOrNull" value="${it.qty ?? ''}" aria-label="Available quantity of ${it.name || 'item ' + (i + 1)}"${attr(invErrors[i], 'aria-invalid', 'true')}>
        <input class="input sm" id="inv-${i}-unit" data-bind="designer.inventory.${i}.unit" data-type="str" value="${it.unit}" aria-label="Unit for ${it.name || 'item ' + (i + 1)}" placeholder="unit">
        <select class="select sm" id="inv-${i}-kind" data-bind="designer.inventory.${i}.kind" data-type="str" aria-label="Type for ${it.name || 'item ' + (i + 1)}">${options([['reusable', 'Reusable'], ['consumable', 'Consumable']], it.kind)}</select>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="inv-remove" data-index="${i}" aria-label="Remove ${it.name || 'item ' + (i + 1)}">${icon('x', 'sm')}</button>
      </div>
      <input class="input sm inv-notes" data-bind="designer.inventory.${i}.notes" data-type="str" value="${it.notes || ''}" placeholder="Constraints or notes (optional)" aria-label="Notes for ${it.name || 'item ' + (i + 1)}">
      ${invErrors[i] ? html`<span class="err">${icon('alert', 'sm')}Enter how many ${it.name} you have.</span>` : ''}
    </div>`)}
    <button class="btn btn-sm" style="align-self:flex-start" data-action="inv-add">${icon('plus', 'sm')}Add material or equipment</button>`;
  const classes = myClasses();
  const logisticsBody = html`
    <div class="stack tight"><span class="label">Classes and periods</span>
      ${classes.length ? classes.map((c) => html`<div class="period-pick"><span class="small strong">${c.name}</span>
        ${c.periods.map((p) => { const key = `${c.id}:${p.id}`; const sel = lg.sel[key] || {}; const info = periods.find((x) => x.key === key); const enrolled = enrolledCount(c.id, p.id);
          return html`<div class="period-pick-row ${sel.on ? '' : 'off'}" data-key="pp-${p.id}">
            <label class="check" for="pp-${p.id}"><input type="checkbox" id="pp-${p.id}" data-bind="designer.logistics.sel.${key}.on" data-type="bool"${attr(sel.on, 'checked')}><span>${p.name}<span class="xs muted" style="display:block">${enrolled} enrolled</span></span></label>
            <input class="input sm" type="number" min="0" id="pp-${p.id}-n" data-bind="designer.logistics.sel.${key}.override" data-type="str" value="${sel.override ?? ''}" placeholder="${enrolled}" aria-label="Students to plan for in ${p.name} (defaults to ${enrolled} enrolled)"${attr(!sel.on, 'disabled')}>
            <span class="small num" aria-live="polite">${sel.on && info ? html`<strong>${info.groups}</strong> groups` : html`<span class="muted">—</span>`}</span>
          </div>`; })}</div>`) : html`<p class="small muted">No classes yet. <a href="#class-new">Create a class</a> to plan with real enrollment.</p>`}
      ${errs.includes('periods') ? html`<span class="err">${icon('alert', 'sm')}Select at least one period.</span>` : ''}
      <p class="hint">Student counts default to actual enrollment. Type a number to plan for a different count.</p>
      <p class="small num"><strong>${sum(periods.map((p) => p.students))}</strong> students across ${plural(periods.length, 'period')} · <strong>${sum(periods.map((p) => p.groups))}</strong> groups</p>
    </div>
    <div class="form-grid">
      ${field({ label: 'Target students per group', id: 'dz-gs', bind: 'designer.logistics.groupSize', value: lg.groupSize, type: 'number', min: 1, max: 8, error: errs.includes('groupSize') ? 'Use 1 to 8 students.' : '' })}
      ${field({ label: 'Lab time (min)', id: 'dz-time', bind: 'designer.logistics.labMinutes', value: lg.labMinutes, type: 'number', min: 10, error: errs.includes('time') ? 'Lab time must be longer than setup plus cleanup.' : '' })}
      ${field({ label: 'Setup (min)', id: 'dz-setup', bind: 'designer.logistics.setupMinutes', value: lg.setupMinutes, type: 'number', min: 0 })}
      ${field({ label: 'Cleanup (min)', id: 'dz-clean', bind: 'designer.logistics.cleanupMinutes', value: lg.cleanupMinutes, type: 'number', min: 0 })}
    </div>
    ${checkField({ label: 'Periods run one after another, so reusable equipment is reused', id: 'dz-reuse', bind: 'designer.logistics.reuseAcrossPeriods', checked: lg.reuseAcrossPeriods, hint: 'Consumables are always counted for every group in every period.' })}
    ${checkField({ label: 'Groups may share equipment within a period', id: 'dz-share', bind: 'designer.logistics.allowSharing', checked: lg.allowSharing })}`;
  return html`<div class="designer-scroll">
    ${errs.length ? html`<div class="error-summary" role="alert" id="dz-errors">Check the highlighted fields before generating a plan.</div>` : ''}
    ${fold('context', 'Learning context', 'cap', contextBody, d)}
    ${fold('resources', `Available resources (${d.inventory.filter((i) => i.name.trim()).length})`, 'layers', resourcesBody, d)}
    ${fold('logistics', 'Class logistics', 'users', logisticsBody, d)}
  </div>
  <div class="composer">
    <div class="row between wrap"><span class="small muted">Assistant: ${aiMode() === 'live' ? html`<span class="tag live">${icon('sparkles', 'sm')}Live AI</span>` : simTag('Simulated')}</span>
      <button class="btn btn-ai" data-action="designer-generate"${attr(AI.busy, 'disabled')}>${AI.busy ? html`<span class="spinner"></span>Working…` : html`${icon('sparkles')}${d.plan ? 'Generate new plan' : 'Generate plan'}`}</button></div>
    ${d.plan ? html`<span class="hint">Generating again replaces the current draft. To change it instead, use Revise with AI.</span>` : ''}
  </div>`;
}

function aiModeSwitch() {
  const avail = AI.available; const mode = aiMode();
  return html`<div class="stack tight">
    <div class="chips" role="radiogroup" aria-label="Assistant mode">
      <button class="chip" role="radio" aria-checked="${mode === 'live'}" aria-pressed="${mode === 'live'}" data-action="ai-mode" data-mode="live"${attr(!avail || AI.denied, 'disabled')}>${icon('sparkles', 'sm')}Live AI</button>
      <button class="chip" role="radio" aria-checked="${mode === 'simulated'}" aria-pressed="${mode === 'simulated'}" data-action="ai-mode" data-mode="simulated">${icon('zap', 'sm')}Simulated</button>
    </div>
    <span class="hint">${avail === null ? 'Checking whether live AI is available here…'
      : AI.denied ? 'Live AI was declined for this page, so the simulated assistant is answering.'
      : !avail ? 'Live AI isn’t available in this view. The simulated assistant knows four sample experiments and three kinds of follow-up.'
      : mode === 'live' ? 'The AI answers using your account. You’ll be asked to allow it the first time.' : 'The simulated assistant knows four sample experiments and three kinds of follow-up.'}</span>
  </div>`;
}

function designerAssistant(d) {
  return html`<div class="designer-scroll" style="flex:1">
    ${aiModeSwitch()}
    <div class="chat" aria-live="polite">
      ${d.chat.length ? d.chat.map(chatMessage) : html`<div class="msg assistant"><span>Fill in the plan inputs and choose <strong>Generate plan</strong>. Then ask me to adjust timing, groups or equipment here.</span></div>`}
    </div>
  </div>
  <form class="composer" data-submit="designer-ask">
    ${d.plan ? html`<div class="chips">${SUGGESTIONS.map((s) => html`<button type="button" class="suggest" data-action="designer-suggest" data-text="${s}"${attr(AI.busy, 'disabled')}>${s}</button>`)}</div>` : ''}
    <label class="sr-only" for="dz-msg">Ask the assistant to revise the plan</label>
    <textarea class="textarea" id="dz-msg" rows="2" style="min-height:58px" data-bind="designer.draftMsg" data-type="str" placeholder="${d.plan ? 'Ask a question or request a change' : 'Generate a plan first'}"${attr(!d.plan, 'disabled')}>${d.draftMsg}</textarea>
    <div class="row between"><span class="xs muted">Revisions explain what changed. Nothing is saved until you choose Save draft.</span>
      <button class="btn btn-ai btn-sm" type="submit"${attr(!d.plan || AI.busy || !d.draftMsg.trim(), 'disabled')}>${icon('send', 'sm')}Revise with AI</button></div>
  </form>`;
}

function chatMessage(m) {
  if (m.role === 'user') return html`<div class="msg user" data-key="m-${m.id}">${m.text}</div>`;
  if (m.pending) return html`<div class="msg assistant" data-key="m-${m.id}"><div class="msg-meta">${m.source === 'live' ? html`<span class="tag live">${icon('sparkles', 'sm')}Live AI</span>` : simTag('Simulated assistant')}</div>
    <div class="row"><span class="spinner"></span><span>${m.source === 'live' ? 'The AI is working on it. This usually takes 20–60 seconds.' : 'Drafting a sample plan…'}</span></div>
    ${m.source === 'live' ? html`<button class="btn btn-xs" style="align-self:flex-start" data-action="ai-stop">${icon('stopCircle', 'sm')}Stop</button>` : ''}</div>`;
  return html`<div class="msg assistant ${m.error ? 'error' : ''}" data-key="m-${m.id}">
    <div class="msg-meta">${m.source === 'live' ? html`<span class="tag live">${icon('sparkles', 'sm')}Live AI</span>` : m.source === 'simulated' ? simTag('Simulated assistant') : html`<span class="tag">Labby</span>`}<span>${fmtClock(m.at)}</span></div>
    <span style="white-space:pre-wrap">${m.text}</span>
    ${(m.changes && m.changes.length) || (m.check && m.check.length) ? html`<div class="changes"><strong class="small">What changed</strong><ul>
      ${(m.changes || []).map((c) => html`<li>${c}</li>`)}${(m.check || []).map((c) => html`<li><span class="muted">Labby’s check:</span> ${c}</li>`)}</ul></div>` : ''}
  </div>`;
}

function planPreview(d) {
  if (!d.plan) {
    if (AI.busy) return html`<div class="card card-pad stack" aria-busy="true"><span class="sr-only">Drafting plan</span><div class="skel" style="height:28px;width:60%"></div><div class="skel" style="height:14px;width:90%"></div><div class="skel" style="height:14px;width:80%"></div><div class="skel" style="height:120px"></div><div class="skel" style="height:220px"></div></div>`;
    return html`<div class="card">${emptyState({ ico: 'sparkles', title: 'Your draft plan will appear here', text: 'It will include groups per period, materials per group and in total, timing for each step, what students record, precautions for your review, and anything that doesn’t fit your inventory or time.',
      actions: html`<button class="btn btn-ai" data-action="designer-generate"${attr(AI.busy, 'disabled')}>${icon('sparkles')}Generate plan</button><a class="btn" href="#import">${icon('upload')}Use an existing procedure</a>` })}</div>`;
  }
  const plan = d.plan; const r = computeResources(plan, d);
  const meta = d.planMeta || {};
  const saved = d.labId && labById(d.labId);
  const revised = d.revised || [];
  return html`<section class="card" aria-labelledby="plan-title" aria-busy="${AI.busy}">
    <div class="card-head" style="align-items:flex-start">
      <div class="stack tight" style="min-width:0;flex:1 1 300px">
        <div class="row wrap">${labPill('draft')}${meta.source === 'live' ? html`<span class="tag live">${icon('sparkles', 'sm')}Drafted by AI</span>` : meta.source === 'simulated' ? simTag('Simulated plan') : ''}${saved ? html`<span class="tag">${icon('check', 'sm')}Saved to library</span>` : html`<span class="tag">Not saved</span>`}${AI.busy ? html`<span class="tag"><span class="spinner" style="width:12px;height:12px"></span>Revising…</span>` : ''}</div>
        <h2 id="plan-title" style="font-size:1.35rem">${plan.title}</h2>
      </div>
    </div>
    <div class="card-foot" style="border-top:0;border-bottom:1px solid var(--line)">
      <button class="btn btn-sm" data-action="designer-revise-focus">${icon('sparkles', 'sm')}Revise with AI</button>
      <button class="btn btn-sm" data-action="designer-edit" aria-pressed="${!!d.editing}">${icon('pencil', 'sm')}${d.editing ? 'Done editing' : 'Edit manually'}</button>
      <button class="btn btn-sm" data-action="designer-save">${icon('check', 'sm')}Save draft</button>
      <button class="btn btn-sm" data-action="designer-preview">${icon('eye', 'sm')}Preview student instructions</button>
      <span class="spacer"></span>
      <button class="btn btn-sm btn-primary" data-action="designer-assign">${icon('send', 'sm')}Assign to class</button>
    </div>
    <div class="card-body stack loose">
      ${d.pending ? reviewCard(d) : ''}
      ${d.editing ? html`<p class="hint">Setup, cleanup and lab time come from Class logistics. Changes here update the plan’s totals right away.</p>${procedureEditor('designer.plan', plan, { hideTiming: true })}` : planReadView(plan, r, revised)}
    </div>
  </section>`;
}

function planReadView(plan, r, revised) {
  const issues = r.issues;
  const time = r.time;
  const scale = Math.max(time.total, time.available, 1);
  const pct = (n) => `${(n / scale) * 100}%`;
  return html`
    ${plan.objectives.length ? html`<div class="plan-section"><h3>Learning objectives</h3><ul class="ul-plain">${plan.objectives.map((o) => html`<li>${o}</li>`)}</ul></div>` : ''}
    <div class="plan-section"><h3>${icon('alert', 'sm')}Needs your decision</h3>
      ${issues.length || plan.questions.length ? html`<div class="stack tight">
        ${issues.map((i) => html`<div class="issue ${i.sev}">${icon(i.sev === 'bad' ? 'alert' : 'question')}<span>${i.text}</span></div>`)}
        ${plan.questions.map((q) => html`<div class="issue info">${icon('message')}<span><strong>Question:</strong> ${q}</span></div>`)}
      </div>` : html`<div class="notice ok">${icon('checkCircle')}<div>Your inventory covers this plan and it fits the lab time. Review the steps and precautions before assigning it.</div></div>`}
      ${plan.assumptions.length ? html`<details class="small"><summary class="strong" style="cursor:pointer">Assumptions the plan makes (${plan.assumptions.length})</summary><ul class="ul-plain" style="margin-top:6px">${plan.assumptions.map((a) => html`<li>${a}</li>`)}</ul></details>` : ''}
    </div>
    <div class="plan-section"><h3>${icon('users', 'sm')}Groups</h3>
      ${r.periods.length ? html`<div class="table-wrap"><table><thead><tr><th>Period</th><th class="num">Students</th><th class="num">Groups of ~${S.designer.logistics.groupSize}</th></tr></thead>
        <tbody>${r.periods.map((p) => html`<tr><td>${p.label}${p.students !== p.enrolled ? html` <span class="tag">planning for ${p.students}, ${p.enrolled} enrolled</span>` : ''}</td><td class="num">${p.students}</td><td class="num">${p.groups}</td></tr>`)}</tbody>
        <tfoot><tr><td>All selected periods</td><td class="num">${r.totalStudents}</td><td class="num">${r.totalGroups}</td></tr></tfoot></table></div>` : html`<p class="muted small">Select periods in Class logistics to calculate groups.</p>`}
    </div>
    <div class="plan-section"><h3>${icon('layers', 'sm')}Materials</h3>
      <div class="table-wrap"><table><thead><tr><th>Item</th><th>Status</th><th>Per group</th>${r.periods.map((p) => html`<th class="num">${p.short}</th>`)}<th class="num">Total</th><th class="num">You have</th></tr></thead>
        <tbody>${r.materials.map((m) => {
          const tone = { ok: 'ok', tight: 'warn', short: 'bad', bottleneck: 'bad', unlisted: 'warn', units: 'warn' }[m.status];
          const label = { ok: 'Enough', tight: 'No spares', short: 'Short', bottleneck: 'Bottleneck', unlisted: 'Not listed', units: 'Check units' }[m.status];
          const ico = { ok: 'check', tight: 'alert', short: 'alert', bottleneck: 'hourglass', unlisted: 'question', units: 'question' }[m.status];
          return html`<tr><td style="min-width:150px"><strong>${m.name}</strong><div class="xs muted">${m.kind === 'reusable' ? 'Reusable' : 'Consumable'}${m.shared > 1 ? ` · 1 per ${m.shared} groups` : ''}</div></td>
            <td><span class="pill tone-${tone}">${icon(ico)}${label}</span>${m.note && m.status !== 'ok' ? html`<div class="xs muted" style="margin-top:3px;max-width:180px">${m.note}</div>` : ''}</td>
            <td class="num">${fmtQty(m.qtyPerGroup)} ${m.unit}${m.per === 'student' ? ' per student' : ''}</td>
            ${m.perPeriod.map((n) => html`<td class="num">${fmtQty(round(n))}</td>`)}
            <td class="num"><strong>${fmtQty(m.total)}</strong>${m.kind === 'reusable' && r.periods.length > 1 ? html`<div class="xs muted">${S.designer.logistics.reuseAcrossPeriods ? 'reused' : 'not reused'}</div>` : ''}</td>
            <td class="num">${m.inv ? `${fmtQty(m.inv.qty)} ${m.inv.unit}` : '—'}</td></tr>`;
        })}</tbody></table></div>
      <p class="hint">Reusable equipment counts the most needed at once${S.designer.logistics.reuseAcrossPeriods ? ', since periods reuse it' : ' in every period'}. Consumables count every group in every selected period.</p>
    </div>
    <div class="plan-section"><h3>${icon('clock', 'sm')}Timing</h3>
      <div class="timebar" role="img" aria-label="Setup ${time.setup} minutes, steps ${time.steps} minutes, cleanup ${time.cleanup} minutes, total ${time.total} of ${time.available} available">
        ${time.setup ? html`<span class="tb-setup" style="width:${pct(time.setup)}">Setup</span>` : ''}
        <span class="tb-steps" style="width:${pct(Math.min(time.steps, Math.max(0, time.available - time.setup)))}">Steps ${time.steps} min</span>
        ${time.over > 0 ? html`<span class="tb-over" style="width:${pct(Math.min(time.over, time.steps + time.cleanup))}">+${time.over}</span>` : ''}
        ${time.cleanup && time.over <= 0 ? html`<span class="tb-clean" style="width:${pct(time.cleanup)}">Clean</span>` : ''}
        <span class="tb-limit" style="left:calc(${pct(time.available)} - 1px)" aria-hidden="true"></span>
      </div>
      <p class="small num">${time.total} of ${time.available} minutes · ${time.over > 0 ? html`<strong style="color:var(--bad)">${time.over} min over</strong>` : html`${-time.over} min to spare`}. The dark line marks the end of your lab time.</p>
    </div>
    ${plan.setup.length ? html`<div class="plan-section"><h3>Setup</h3><ul class="ul-plain">${plan.setup.map((s) => html`<li>${s}</li>`)}</ul></div>` : ''}
    <div class="plan-section"><h3>${icon('listOrdered', 'sm')}Procedure</h3>
      <ol class="step-list">${plan.steps.map((s, i) => html`<li class="step-item ${revised[i] ? 'revised' : ''}" data-key="ps-${s.id}">
        <span class="step-n" aria-hidden="true">${i + 1}</span>
        <div class="stack tight" style="min-width:0"><div class="row wrap"><strong>${s.title}</strong>${revised[i] ? html`<span class="tag live">Revised</span>` : ''}${s.checkpoint ? html`<span class="pill tone-wait">${icon('clipboard')}Teacher checkpoint</span>` : ''}</div>
          <span class="small">${s.instructions}</span>
          ${s.inputs.length ? html`<span class="xs muted">${icon('ruler', 'sm')} Students record: ${s.inputs.map((x) => `${x.label}${x.unit ? ` (${x.unit})` : ''}`).join(', ')}</span>` : ''}</div>
        <span class="step-min">${s.minutes ? `${s.minutes} min` : '— min'}</span></li>`)}</ol>
    </div>
    ${plan.cleanup.length ? html`<div class="plan-section"><h3>Cleanup</h3><ul class="ul-plain">${plan.cleanup.map((s) => html`<li>${s}</li>`)}</ul></div>` : ''}
    <div class="plan-section"><h3>${icon('alert', 'sm')}Precautions for your review</h3>
      ${plan.precautions.length ? html`<ul class="ul-plain">${plan.precautions.map((s) => html`<li>${s}</li>`)}</ul>` : html`<p class="small muted">No precautions were suggested. Add any that apply.</p>`}
      <p class="hint">Suggested by the assistant. Check them against your school’s safety rules and the materials’ safety data sheets.</p>
    </div>`;
}

/* ---------- Designer actions ---------- */
function designerValidate() {
  const d = S.designer; const e = [];
  if (!d.form.experiment.trim() && !d.form.topic.trim()) e.push('experiment');
  if (!designerPeriods(d).length) e.push('periods');
  const gs = parseInt(d.logistics.groupSize, 10); if (!(gs >= 1 && gs <= 8)) e.push('groupSize');
  if (!(Number(d.logistics.labMinutes) > (Number(d.logistics.setupMinutes) || 0) + (Number(d.logistics.cleanupMinutes) || 0))) e.push('time');
  if (d.inventory.some((it) => it.name.trim() && !(Number(it.qty) >= 0 && it.qty !== '' && it.qty != null))) e.push('inventory');
  d.errors = e;
  return !e.length;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function pushMsg(m) { const msg = { id: uid(), at: Date.now(), changes: [], check: [], ...m }; S.designer.chat.push(msg); if (S.designer.chat.length > 40) S.designer.chat.shift(); return msg; }

async function designerGenerate() {
  const d = S.designer;
  if (AI.busy) return;
  if (!designerValidate()) { d.tab = 'inputs'; U.focusAfter = '#dz-errors'; commit(); return; }
  const mode = aiMode();
  d.tab = 'assistant'; AI.busy = true;
  pushMsg({ role: 'user', text: 'Generate a plan from my inputs.' });
  const pending = pushMsg({ role: 'assistant', source: mode, pending: true });
  commit();
  try {
    let res;
    if (mode === 'live') res = await callLive('generate');
    else { await sleep(900); res = simGenerate(d); }
    d.chat = d.chat.filter((m) => m.id !== pending.id);
    if (res.error) pushMsg({ role: 'assistant', source: 'simulated', text: res.error, error: true });
    else {
      d.plan = res.plan; d.planMeta = { source: mode, at: Date.now() }; d.revised = []; d.editing = false; d.labId = null;
      const r = computeResources(d.plan, d);
      pushMsg({ role: 'assistant', source: mode, text: res.reply, check: r.issues.length ? [`${plural(r.issues.length, 'item')} flagged for your decision.`] : [] });
    }
  } catch (e) {
    d.chat = d.chat.filter((m) => m.id !== pending.id);
    if (e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(e.code)) AI.denied = true;
    pushMsg({ role: 'assistant', source: 'live', text: liveErrorText(e), error: e && e.code !== 'cancelled' });
  } finally { AI.busy = false; AI.ctl = null; commit(); }
}

async function designerAsk(question) {
  const d = S.designer;
  question = String(question || '').trim();
  if (!question || !d.plan || AI.busy) return;
  const mode = aiMode();
  d.draftMsg = ''; d.tab = 'assistant'; AI.busy = true;
  pushMsg({ role: 'user', text: question });
  const pending = pushMsg({ role: 'assistant', source: mode, pending: true });
  commit();
  try {
    const res = mode === 'live' ? await callLive('revise', question) : (await sleep(700), simRevise(d, question));
    d.chat = d.chat.filter((m) => m.id !== pending.id);
    proposeRevision(res, mode);
  } catch (e) {
    d.chat = d.chat.filter((m) => m.id !== pending.id);
    if (e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(e.code)) AI.denied = true;
    pushMsg({ role: 'assistant', source: 'live', text: liveErrorText(e), error: e && e.code !== 'cancelled' });
  } finally { AI.busy = false; AI.ctl = null; commit(); }
}

function applyRevision(res, source) {
  const d = S.designer; const old = d.plan; const oldRes = computeResources(old, d);
  if (res.groupSize && res.groupSize !== Number(d.logistics.groupSize) && res.groupSize >= 1 && res.groupSize <= 8) d.logistics.groupSize = res.groupSize;
  if (res.labMinutes && res.labMinutes > 0) d.logistics.labMinutes = res.labMinutes;
  for (const u of res.inventoryUpdates || []) {
    const item = d.inventory.find((i) => i.name.trim().toLowerCase() === String(u.name || '').trim().toLowerCase()) || d.inventory.find((i) => normName(i.name).some((w) => normName(u.name).includes(w)));
    if (item && Number.isFinite(+u.quantity) && +u.quantity >= 0) item.qty = +u.quantity;
  }
  if (res.plan) { d.revised = revisedSteps(old, res.plan); d.plan = res.plan; d.planMeta = { source, at: Date.now() }; }
  const check = planDiff(old, d.plan, oldRes, computeResources(d.plan, d));
  pushMsg({ role: 'assistant', source, text: 'Accepted. The plan was updated and the changed steps are highlighted.', changes: res.changes || [], check });
}

function designerContent() {
  const d = S.designer; const p = clone(d.plan);
  return { ...p, setupMinutes: Number(d.logistics.setupMinutes) || 0, cleanupMinutes: Number(d.logistics.cleanupMinutes) || 0, groupSize: Number(d.logistics.groupSize) || 3 };
}
function designerSave(state = 'draft') {
  const d = S.designer; let lab = d.labId && labById(d.labId);
  if (!lab) { lab = newLab(designerContent(), 'ai'); d.labId = lab.id; if (state === 'ready') saveLabVersion(lab, designerContent(), 'ready'); }
  else saveLabVersion(lab, designerContent(), state);
  return lab;
}
function reviewModal() {
  const m = U.modal;
  return modalShell({ title: 'Review before assigning', sub: 'Assigning approves this plan. Students will see it exactly as written.',
    body: html`<ul class="ul-plain"><li>Labby checked group counts, totals and timing against your inventory and lab time.</li><li>Labby did <strong>not</strong> check whether the experiment is safe or the chemistry is right. That’s your call.</li>
      ${(() => { const r = computeResources(S.designer.plan, S.designer); const bad = r.issues.filter((i) => i.sev === 'bad'); return bad.length ? html`<li style="color:var(--bad)"><strong>${plural(bad.length, 'unresolved problem')}</strong> still listed under Needs your decision.</li>` : ''; })()}</ul>
      <label class="check" for="rv-ok"><input type="checkbox" id="rv-ok" data-bind="U.modal.ok" data-type="bool"${attr(m.ok, 'checked')}><span>I reviewed the steps, materials and precautions, and I approve this plan for my students.</span></label>
      ${m.error ? html`<div class="err">${icon('alert', 'sm')}${m.error}</div>` : ''}`,
    foot: html`<button class="btn" data-action="modal-close">Keep editing</button><button class="btn btn-primary" data-action="review-confirm">${icon('check')}Approve and choose periods</button>` });
}

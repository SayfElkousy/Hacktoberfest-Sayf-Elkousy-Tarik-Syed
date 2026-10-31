/* =====================================================================
   Help Queue (first in, first out) and Settings.
   Order is fixed by each request's original submission time. Labby never
   reorders it, and starting or reopening a request keeps its place.
   ===================================================================== */
function helpView() {
  const ctx = ensureCtx();
  const scope = S.ui.helpScope || 'session';
  const sess = sessionById(ctx.sessionId);
  const pool = scope === 'all' || !sess ? myHelp() : S.help.filter((h) => h.sessionId === sess.id);
  const open = pool.filter((h) => h.status !== 'resolved').sort((a, b) => a.createdAt - b.createdAt);
  const resolved = pool.filter((h) => h.status === 'resolved').sort((a, b) => b.resolvedAt - a.resolvedAt);
  const tab = S.ui.helpTab || 'open';
  const allOpen = myHelp().filter((h) => h.status !== 'resolved').length;
  const live = sess && (sess.status === 'active' || sess.status === 'paused');
  return html`<div class="stack loose">
    <div class="row between wrap">
      <div class="chips" role="group" aria-label="Which requests to show">
        <button class="chip" aria-pressed="${scope === 'session'}" data-action="help-scope" data-scope="session"${attr(!sess, 'disabled')}>${icon('activity', 'sm')}Selected session${sess ? html`<span class="count">${shortPeriod(periodName(sess.classId, sess.periodId))}</span>` : ''}</button>
        <button class="chip" aria-pressed="${scope === 'all' || !sess}" data-action="help-scope" data-scope="all">${icon('users', 'sm')}All my classes<span class="count">${allOpen} open</span></button>
      </div>
      <p class="small muted" style="max-width:56ch">${icon('info', 'sm')} First come, first served. Requests stay in the order students sent them; starting or reopening one never changes its place.</p>
    </div>
    <div class="tabs" role="tablist" aria-label="Help requests">
      <button class="tab" role="tab" aria-selected="${tab === 'open'}" data-action="help-tab" data-tab="open">${icon('hand', 'sm')}Unresolved <span class="badge ${open.length ? '' : 'zero'}">${open.length}</span></button>
      <button class="tab" role="tab" aria-selected="${tab === 'resolved'}" data-action="help-tab" data-tab="resolved">${icon('checkCircle', 'sm')}Resolved history <span class="badge zero">${resolved.length}</span></button>
    </div>
    ${tab === 'open'
      ? (open.length ? html`<ol class="hq" style="list-style:none;margin:0;padding:0" aria-label="Unresolved requests in arrival order">${open.map((h, i) => helpItem(h, i + 1))}</ol>`
        : html`<div class="card">${emptyState({ ico: 'lifebuoy', title: 'No one is waiting', text: scope === 'all' ? 'When students ask for help in any of your classes, their requests line up here in the order they arrive.' : 'Requests from this session will line up here in the order they arrive.', compact: true })}</div>`)
      : (resolved.length ? html`<ol class="hq" style="list-style:none;margin:0;padding:0" aria-label="Resolved requests, most recent first">${resolved.map((h) => helpItem(h, null))}</ol>`
        : html`<div class="card">${emptyState({ ico: 'checkCircle', title: 'Nothing resolved yet', text: 'Resolved requests move here so the queue only shows who still needs you.', compact: true })}</div>`)}
    ${scope === 'session' && live ? demoPanel(sess, progressFor(sess.id)) : ''}
  </div>`;
}

function helpItem(h, pos) {
  const g = groupById(h.groupId); const sess = sessionById(h.sessionId); const c = sessionContent(sess);
  const step = c.steps[h.stepIndex];
  const longMs = (S.settings.longWaitMinutes || 5) * MIN;
  const isLong = h.status === 'waiting' && Date.now() - h.createdAt > longMs;
  const expanded = !!U.hqOpen[h.id];
  const msg = h.message.length > 180 && !expanded ? h.message.slice(0, 180) + '…' : h.message;
  return html`<li class="hq-item ${h.status} ${isLong ? 'long' : ''}" data-key="hq-${h.id}">
    <div class="hq-main">
      <span class="hq-pos" aria-label="${pos ? 'Position ' + pos : 'Resolved'}">${pos || icon('check')}</span>
      <div style="min-width:0">
        <div class="row wrap" style="gap:8px"><strong style="font-size:1.05rem">${groupLabel(g)}</strong>${catTag(h.category)}${helpPill(h.status)}${h.updates ? html`<span class="tag">${icon('message', 'sm')}Updated ${h.updates}×</span>` : ''}${isLong ? html`<span class="pill tone-warn">${icon('clock')}Long wait</span>` : ''}</div>
        <p class="hq-msg" style="white-space:pre-wrap">${msg}</p>
        <div class="hq-meta"><span>${classById(h.classId).name} · ${periodName(h.classId, h.periodId)}</span><span>${c.title} · step ${h.stepIndex + 1}${step ? ': ' + step.title : ''}</span>
          <span>Sent ${fmtClock(h.createdAt)}</span>
          ${h.status === 'resolved' ? html`<span>Resolved ${fmtClock(h.resolvedAt)} · waited ${fmtMins((h.helpingAt || h.resolvedAt) - h.createdAt)}</span>` : html`<span>Waiting <span class="hq-wait" style="${isLong ? 'color:var(--warn)' : ''}">${tickSince(h.createdAt)}</span></span>`}</div>
      </div>
      <div class="hq-actions">
        <button class="btn btn-sm btn-ghost" data-action="help-view" data-hid="${h.id}" aria-expanded="${expanded}">${icon(expanded ? 'chevUp' : 'eye', 'sm')}${expanded ? 'Hide' : 'View request'}</button>
        ${h.status === 'waiting' ? html`<button class="btn btn-sm" data-action="help-start" data-hid="${h.id}">${icon('users', 'sm')}Start helping</button>` : ''}
        ${h.status !== 'resolved' ? html`<button class="btn btn-sm btn-primary" data-action="help-resolve" data-hid="${h.id}">${icon('check', 'sm')}Mark resolved</button>`
          : html`<button class="btn btn-sm" data-action="help-reopen" data-hid="${h.id}">${icon('reopen', 'sm')}Reopen request</button>`}
      </div>
    </div>
    ${expanded ? html`<div class="hq-detail">
      <div class="stack tight"><span class="eyebrow">Step ${h.stepIndex + 1} instructions</span><span class="small">${step ? step.instructions : 'Step not found.'}</span>
        <span class="eyebrow" style="margin-top:8px">Group</span><span class="small">${sessionMemberNames(sess, g, true).join(', ')}</span>
        ${sess.status !== 'scheduled' ? html`<button class="link-btn small" style="align-self:flex-start" data-action="help-open-group" data-hid="${h.id}">Open ${groupLabel(g)} in Live Progress</button>` : ''}</div>
      <div class="stack tight"><span class="eyebrow">History</span><ul class="timeline">${h.log.map((l) => html`<li><span class="xs muted mono">${fmtClock(l.at)}</span><span class="small">${l.text}</span></li>`)}</ul></div>
    </div>` : ''}
  </li>`;
}

function settingsView() {
  const user = me(); const idx = S.users.indexOf(user);
  return html`<div class="stack loose" style="max-width:820px">
    <section class="card card-pad stack" aria-labelledby="pf-h"><div class="row between"><h2 id="pf-h">Profile</h2><span class="hint">Changes save automatically</span></div>
      <div class="form-grid">
        ${field({ label: 'Name', id: 'pf-name', bind: `users.${idx}.name`, value: user.name })}
        ${field({ label: 'School or organization', id: 'pf-school', bind: `users.${idx}.school`, value: user.school || '' })}
        <div class="field span-2"><span class="label">Email</span><span>${user.email}</span><span class="hint">Your role is <strong>Teacher</strong>. Roles are set when the account is created.</span></div>
      </div></section>
    <section class="card card-pad stack" aria-labelledby="lt-h"><h2 id="lt-h">Live tracking</h2>
      <div class="form-grid">
        ${selectField({ label: '“May Be Behind” threshold', id: 'st-behind', bind: 'settings.behindMinutes', value: S.settings.behindMinutes, opts: [2, 3, 5, 8, 10, 15].map((n) => [n, `${n} minutes past the step’s planned finish`]), hint: 'A group is flagged when the session clock passes the planned finish of its current step by this much.' })}
        ${selectField({ label: 'Highlight help requests waiting longer than', id: 'st-wait', bind: 'settings.longWaitMinutes', value: S.settings.longWaitMinutes, opts: [2, 3, 5, 8, 10].map((n) => [n, `${n} minutes`]), hint: 'Highlighting never changes queue order.' })}
      </div></section>
    ${StudentSite.card()}
    <section class="card card-pad stack" aria-labelledby="dm-h" style="border-style:dashed"><div class="row"><span class="demo-tag">${icon('zap', 'sm')}Demo</span><h2 id="dm-h">About this prototype</h2></div>
      <ul class="ul-plain small">
        <li><strong>Sign-in</strong> is simulated. Accounts and data are saved only in this browser.</li>
        <li><strong>Lab Designer</strong> uses live AI responses when this page is allowed to; otherwise a labeled simulated assistant answers.</li>
        <li><strong>File import</strong> really reads PDF (text-based), DOCX and TXT files in your browser. Structuring the text is rule-based.</li>
        <li><strong>Live student events</strong> come from real student devices when the student site is connected above. Otherwise they come from the demo controls on Live Progress.</li>
      </ul>
      <div><button class="btn btn-danger" data-action="demo-reset-ask">${icon('refresh')}Reset demo data</button></div></section>
  </div>`;
}
function resetModal() {
  return modalShell({ title: 'Reset demo data?', body: html`<p>This replaces everything in this browser with the original sample classes, labs and live session. Accounts you created here will be removed.</p>`,
    foot: html`<button class="btn" data-action="modal-close">Cancel</button><button class="btn btn-danger solid" data-action="demo-reset">${icon('refresh')}Reset demo</button>` });
}

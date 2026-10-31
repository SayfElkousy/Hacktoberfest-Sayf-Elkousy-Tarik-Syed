/* =====================================================================
   Labby — core utilities
   Safe HTML templating, a small DOM morpher (keeps focus while
   re-rendering), icons, formatting and storage helpers.
   ===================================================================== */
'use strict';

/* ---------- Safe HTML templates ---------- */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
function fmtVal(v) {
  if (v === null || v === undefined) return '';
  if (v === false || v === true) return String(v); // aria-pressed="${x}" etc. need explicit true/false
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmtVal).join('');
  return esc(v);
}
/** Tagged template: interpolations are escaped unless wrapped in raw()/html``. */
function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += fmtVal(vals[i]) + strings[i + 1];
  return new Raw(out);
}
const raw = (s) => new Raw(String(s));
const attr = (cond, name, value = '') => (cond ? raw(value === '' ? ` ${name}` : ` ${name}="${esc(value)}"`) : '');

/* ---------- DOM morph: patch existing DOM to match new markup ---------- */
function morphInto(container, markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup;
  morphChildren(container, tpl.content);
}
function nodeKey(n) { return n.nodeType === 1 ? (n.getAttribute('data-key') || n.id || null) : null; }
function sameKind(a, b) { return a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName); }
function morphNode(from, to) {
  if (from.nodeType !== 1) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
  for (const a of Array.from(from.attributes)) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
  for (const a of Array.from(to.attributes)) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  const tag = from.tagName;
  if (tag === 'TEXTAREA') {
    const v = to.textContent;
    if (document.activeElement !== from && from.value !== v) from.value = v;
    return;
  }
  if (tag === 'INPUT') {
    const type = from.type;
    if (type === 'checkbox' || type === 'radio') from.checked = to.hasAttribute('checked');
    else if (type !== 'file' && document.activeElement !== from) {
      const v = to.getAttribute('value') ?? '';
      if (from.value !== v) from.value = v;
    }
    return;
  }
  if (from.hasAttribute('data-morph-skip')) return;
  morphChildren(from, to);
  if (tag === 'SELECT') {
    const sel = Array.from(to.querySelectorAll('option')).find((o) => o.hasAttribute('selected'));
    const v = sel ? (sel.getAttribute('value') ?? sel.textContent) : (from.options[0] ? from.options[0].value : '');
    if (from.value !== v) from.value = v;
  }
}
function morphChildren(fromParent, toParent) {
  const toKids = Array.from(toParent.childNodes);
  const keyed = new Map();
  for (let c = fromParent.firstChild; c; c = c.nextSibling) { const k = nodeKey(c); if (k) keyed.set(k, c); }
  let cursor = fromParent.firstChild;
  for (const toNode of toKids) {
    const k = nodeKey(toNode);
    let match = null;
    if (k) { match = keyed.get(k) || null; if (match && !sameKind(match, toNode)) match = null; }
    else if (cursor && !nodeKey(cursor) && sameKind(cursor, toNode)) match = cursor;
    if (match) {
      if (match === cursor) cursor = cursor.nextSibling;
      else fromParent.insertBefore(match, cursor);
      if (k) keyed.delete(k);
      morphNode(match, toNode);
    } else {
      fromParent.insertBefore(toNode, cursor);
    }
  }
  while (cursor) { const next = cursor.nextSibling; fromParent.removeChild(cursor); cursor = next; }
}

/* ---------- Icons (24px grid, stroke) ---------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v6.5L4.6 18.2A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.8L14 9.5V3"/><path d="M7.4 15h9.2"/>',
  sparkles: '<path d="M11 3l1.9 4.6L17.5 9.5l-4.6 1.9L11 16l-1.9-4.6L4.5 9.5l4.6-1.9z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  lifebuoy: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M4.9 4.9l4.3 4.3M14.8 14.8l4.3 4.3M14.8 9.2l4.3-4.3M4.9 19.1l4.3-4.3"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.7 2.7L16 9.8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  hourglass: '<path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M19 12.9a10 10 0 0 0-2.3-1.6"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8a15 15 0 0 0-11.3-3.8"/><path d="M12 20h.01"/>',
  wifi: '<path d="M5 12.6a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 20 0M12 20h.01"/>',
  dashed: '<path d="M10.1 2.2a10 10 0 0 1 3.8 0M17.6 3.7a10 10 0 0 1 2.7 2.7M21.8 10.1a10 10 0 0 1 0 3.8M20.3 17.6a10 10 0 0 1-2.7 2.7M13.9 21.8a10 10 0 0 1-3.8 0M6.4 20.3a10 10 0 0 1-2.7-2.7M2.2 13.9a10 10 0 0 1 0-3.8M3.7 6.4a10 10 0 0 1 2.7-2.7"/>',
  playCircle: '<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  stopCircle: '<circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  chevDown: '<path d="M6 9l6 6 6-6"/>',
  chevRight: '<path d="M9 6l6 6-6 6"/>',
  chevUp: '<path d="M18 15l-6-6-6 6"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  reopen: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  cap: '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
  board: '<path d="M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M7 21l5-5 5 5"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  listOrdered: '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z"/><path d="M14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
  question: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  bars: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  thermo: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/>',
  layers: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
};
function icon(name, cls = '') {
  return raw(`<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`);
}
const BRAND_MARK = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6"/><path d="M10 3v6.2L5 17.6A2.3 2.3 0 0 0 7 21h10a2.3 2.3 0 0 0 2-3.4L14 9.2V3"/><circle cx="10.5" cy="16" r="1.2" fill="currentColor" stroke="none"/><circle cx="13.8" cy="13.6" r="0.9" fill="currentColor" stroke="none"/></svg>');

/* ---------- IDs, numbers, time ---------- */
const uid = (len = 8) => { let s = ''; while (s.length < len) s += Math.random().toString(36).slice(2); return s.slice(0, len).replace(/^[0-9]/, 'k'); };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
const round = (n, d = 2) => { const f = 10 ** d; return Math.round(n * f) / f; };
const fmtQty = (n) => (n == null || n === '' ? '—' : (Number.isInteger(+n) ? String(+n) : String(round(+n, 2))));
const MIN = 60000;
function fmtClock(ts) { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function fmtDate(ts) { return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function fmtDateLong(ts) { return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); }
function fmtDayTime(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  return `${sameDay ? 'Today' : yest ? 'Yesterday' : fmtDate(ts)}, ${fmtClock(ts)}`;
}
/** mm:ss under an hour, h:mm:ss above. */
function fmtTimer(ms) {
  const neg = ms < 0; ms = Math.abs(ms);
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
  return (neg ? '−' : '') + body;
}
function fmtMins(ms) { const m = Math.floor(Math.abs(ms) / MIN); return m < 1 ? '<1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; }
function fmtAgo(ts, now = Date.now()) {
  const d = now - ts;
  if (d < 45000) return 'just now';
  if (d < 3600000) return `${Math.max(1, Math.round(d / MIN))} min ago`;
  if (d < 86400000) return `${Math.round(d / 3600000)} h ago`;
  return fmtDate(ts);
}
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

/* ---------- Object paths (for data-bind) ---------- */
function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {}; o = o[keys[i]]; }
  o[keys[keys.length - 1]] = value;
}
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- Storage (everything is kept in this browser) ---------- */
const Store = {
  KEY: 'labby-state-v1',
  ok: true,
  load() { try { const s = localStorage.getItem(this.KEY); return s ? JSON.parse(s) : null; } catch (e) { this.ok = false; return null; } },
  save(state) { try { localStorage.setItem(this.KEY, JSON.stringify(state)); this.ok = true; } catch (e) { this.ok = false; } },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* storage unavailable */ } },
};
/** Original uploaded files are kept in IndexedDB. */
const FileVault = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open('labby-files', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('files');
        req.onsuccess = () => { this.db = req.result; resolve(this.db); };
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  },
  async put(key, blob) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, key); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); },
  async get(key) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readonly'); const r = tx.objectStore('files').get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); },
};

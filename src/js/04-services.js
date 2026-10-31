/* =====================================================================
   Services: file reading, procedure import, AI planning through Gemma,
   and help requests.
   ===================================================================== */

/* ---------------------------------------------------------------
   1. File reading — DOCX (built-in ZIP reader), PDF (pdf.js), TXT
   --------------------------------------------------------------- */
const PDFJS_SRC = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
];
const Formats = { pdf: 'unknown', docx: typeof DecompressionStream === 'function' ? 'ok' : 'unavailable', txt: 'ok' };
class ImportError extends Error { constructor(message, hint) { super(message); this.hint = hint; } }

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}
let pdfLoading = null;
function loadPdfJs() {
  if (window.pdfjsLib && window.pdfjsWorker) return Promise.resolve(window.pdfjsLib);
  if (!pdfLoading) {
    // Loading the worker script first lets pdf.js parse on the page itself (no separate worker needed).
    pdfLoading = (async () => {
      for (const src of PDFJS_SRC) await loadScript(src);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_SRC[0];
      Formats.pdf = 'ok';
      return window.pdfjsLib;
    })().catch((e) => { pdfLoading = null; Formats.pdf = 'unavailable'; throw e; });
  }
  return pdfLoading;
}

async function readPdf(file) {
  let lib;
  try { lib = await loadPdfJs(); } catch (e) {
    throw new ImportError('The PDF reader couldn’t load right now, so this PDF can’t be read.', 'Paste the procedure text instead, or try again later.');
  }
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try { doc = await lib.getDocument({ data, isEvalSupported: false }).promise; } catch (e) {
    if (e && e.name === 'PasswordException') throw new ImportError('This PDF is password-protected.', 'Remove the password and upload it again, or paste the text.');
    throw new ImportError('This file couldn’t be opened as a PDF. It may be damaged.', 'Try exporting the PDF again, or paste the text.');
  }
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let out = '', lastY = null;
    for (const it of tc.items) {
      const y = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
      out += it.str;
      if (it.hasEOL) out += '\n';
      if (y !== null) lastY = y;
    }
    pages.push(out.trim());
  }
  const text = pages.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.replace(/\s/g, '').length < 20) throw new ImportError('No readable text was found. This looks like a scanned or image-only PDF.', 'Scanned pages aren’t supported yet. Paste the text or type the procedure in the editor.');
  return { text, pages: doc.numPages };
}

async function unzipEntry(buf, wanted) {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new ImportError('This file isn’t a valid .docx document.', 'Open it in Word or Google Docs and save it as .docx again.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    if (name === wanted) {
      const start = localOff + 30 + dv.getUint16(localOff + 26, true) + dv.getUint16(localOff + 28, true);
      const bytes = new Uint8Array(buf, start, compSize);
      if (method === 0) return dec.decode(bytes);
      if (method === 8) return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      throw new ImportError('This .docx uses a compression method Labby can’t read.', 'Save it again from Word or Google Docs, or paste the text.');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new ImportError('This .docx has no document body.', 'Save it again from Word or Google Docs, or paste the text.');
}
async function readDocx(file) {
  if (Formats.docx !== 'ok') throw new ImportError('This browser can’t unpack .docx files.', 'Paste the text instead, or use a recent version of Chrome, Edge, Firefox or Safari.');
  const xml = await unzipEntry(await file.arrayBuffer(), 'word/document.xml');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const lines = [];
  for (const para of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
    let t = '';
    const walk = (node) => {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.namespaceURI === W && ch.localName === 't') t += ch.textContent;
        else if (ch.namespaceURI === W && ch.localName === 'tab') t += ' ';
        else if (ch.namespaceURI === W && (ch.localName === 'br' || ch.localName === 'cr')) t += '\n';
        else if (ch.nodeType === 1 && ch.localName !== 'pPr') walk(ch);
      }
    };
    walk(para);
    const isList = para.getElementsByTagNameNS(W, 'numPr').length > 0;
    if (t.trim()) lines.push((isList ? '- ' : '') + t.trim());
    else lines.push('');
  }
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new ImportError('This .docx has no text in it.', 'Check that you picked the right file.');
  return { text };
}

async function readProcedureFile(file) {
  const name = file.name.toLowerCase();
  if (file.size > 15 * 1024 * 1024) throw new ImportError('This file is larger than 15 MB.', 'Upload a smaller file or paste the procedure text.');
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return { kind: 'pdf', ...(await readPdf(file)) };
  if (name.endsWith('.docx')) return { kind: 'docx', ...(await readDocx(file)) };
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type === 'text/plain') {
    const text = (await file.text()).trim();
    if (!text) throw new ImportError('This text file is empty.', 'Check that you picked the right file.');
    return { kind: 'txt', text };
  }
  if (name.endsWith('.doc')) throw new ImportError('Older Word files (.doc) can’t be read.', 'In Word, choose File → Save As → .docx, or paste the text.');
  if (/\.(png|jpe?g|heic|gif|webp)$/.test(name)) throw new ImportError('Photos of procedures can’t be read yet.', 'Paste the text or type it into the manual editor.');
  if (/\.(pages|odt|rtf)$/.test(name)) throw new ImportError('This document format isn’t supported.', 'Export it as PDF or .docx, or paste the text.');
  throw new ImportError('Labby can read PDF, DOCX and plain-text files.', 'Pick a different file or paste the text.');
}

/* ---------------------------------------------------------------
   2. Procedure text → structured, editable procedure
      Rule-based: it only uses what the text says. Anything missing
      stays blank and is flagged by procedureFlags().
   --------------------------------------------------------------- */
const SECTION_RX = [
  ['objectives', /^(learning\s+)?(objectives?|purpose|aims?|goals?)$/i],
  ['materials', /^(materials?|equipment|supplies|apparatus)(\s+(and|&)\s+(equipment|materials|supplies))?( list)?$/i],
  ['setup', /^(set\s?-?up|preparation|teacher prep(aration)?|pre-?lab set\s?-?up|before you begin)$/i],
  ['steps', /^(procedures?|method|methods|steps|instructions|directions)(\s*\(.*\))?$/i],
  ['data', /^(data( table| collection| to record)?|observations?|measurements?|results)$/i],
  ['precautions', /^(safety( notes| precautions| rules)?|precautions?|hazards?|warnings?)$/i],
  ['cleanup', /^(clean\s?-?up|disposal|cleaning up)$/i],
  ['ignore', /^(analysis( questions)?|questions|conclusions?|discussion|post-?lab( questions)?|extensions?|background|introduction|pre-?lab questions|calculations?)$/i],
];
const REUSABLE_RX = /beaker|cylinder|thermometer|balance|scale\b|hot ?plate|burner|goggle|stopwatch|timer|tongs|ruler|pencil|clip|rack|flask|burette|buret|pipette|funnel|tube|probe|stand|clamp|tray|spatula|magnifier|microscope|calorimeter|marker|dish|cup|stopper|bolt|marble|lab coat|apron/i;
const CONSUMABLE_RX = /water|solution|tablet|paper|towel|\bice\b|acid|hcl|naoh|peroxide|salt|sugar|vinegar|indicator|potato|splint|tape|foil|filter|baking soda|coloring|reagent|cube|alcohol|glue|string/i;
const PER_STUDENT_RX = /goggle|glove|apron|lab coat/i;

function headerOf(line) {
  const t = line.replace(/^\s*((part\s+)?[ivx]+\.|[a-h]\.|\d+\.)\s+/i, '').replace(/[:.]\s*$/, '').trim();
  if (t.length > 40) return null;
  for (const [key, rx] of SECTION_RX) if (rx.test(t)) return { key, label: t };
  return null;
}
const BULLET_RX = /^\s*(?:[-•*–·▪◦]|\(?[a-z]\))\s+/;
const NUM_RX = /^\s*(?:step\s*)?(\d{1,2})\s*[.):]\s+/i;
function splitItems(lines) {
  const hasMarkers = lines.some((l) => BULLET_RX.test(l) || NUM_RX.test(l));
  const items = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (BULLET_RX.test(line) || NUM_RX.test(line)) items.push(line.replace(BULLET_RX, '').replace(NUM_RX, '').trim());
    else if (hasMarkers && items.length) items[items.length - 1] += ' ' + line;
    else items.push(line);
  }
  return items;
}
function stepTitleFrom(text) {
  let first = text.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, '');
  if (first.length > 46) {
    const cut = first.slice(0, 46).search(/\s(and|on|so|to|using|with|in|into|from|until|by|then|,)\s|,\s/);
    first = cut > 12 ? first.slice(0, cut) : first.split(/\s+/).slice(0, 6).join(' ');
  }
  first = first.replace(/[,;:]$/, '').trim();
  return first.charAt(0).toUpperCase() + first.slice(1);
}
const UNIT_WORDS = { grams: 'g', gram: 'g', g: 'g', cm: 'cm', mm: 'mm', ml: 'mL', milliliters: 'mL', seconds: 's', s: 's', minutes: 'min', '°c': '°C', degrees: '°C', celsius: '°C' };
function guessInputs(text) {
  const out = [];
  const unitM = /\bin\s+(grams|gram|g|cm|mm|ml|milliliters|seconds|°c|degrees(?: celsius)?)\b/i.exec(text);
  const unit = unitM ? (UNIT_WORDS[unitM[1].toLowerCase().split(' ')[0]] || unitM[1]) : '';
  if (/\brecord(s|ed)?\s+(it|them|this|these)\b/i.test(text)) {
    const obj = /\b(?:measure|calculate|find|determine|note)\s+(?:the\s+|your\s+)?([a-z][\w\s-]{2,40}?)(?=\s+(?:of|for|by|on|in|from|using|and)\b|[.,;]|$)/i.exec(text);
    if (obj) out.push({ label: cap(obj[1]), unit });
  } else {
    const m = /\brecord\s+(?:the\s+|your\s+|both\s+|each\s+|all\s+)?([a-z][\w\s-]{2,40}?)(?=\s+(?:in|to|on|for|and|before|after|of)\b|[.,;]|$)/i.exec(text);
    if (m) out.push({ label: cap(m[1]), unit });
  }
  return out;
}
const cap = (s) => { s = s.trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
function parseMaterial(line) {
  let name = line.trim(), qty = null, unit = '', note = '';
  const paren = /^(.+?)\s*\(([^)]*)\)\s*$/.exec(name);
  if (paren && /\d/.test(paren[2])) {
    if (/per (class|room|lab)|class set|shared|for the class/i.test(paren[2])) { name = paren[1]; note = paren[2]; }
    else { const pm = /^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)/.exec(paren[2].trim()); if (pm) { name = paren[1]; qty = +pm[1]; unit = pm[2] || ''; } }
  }
  if (qty == null && !note) {
    const lead = /^(\d+(?:\.\d+)?)\s*(?:x\s+)?(mL|L|g|kg|cm|mm|pcs?|pairs?|sets?|strips?|drops?|sheets?)?\s+(?:of\s+)?(.+)$/i.exec(name);
    if (lead) { qty = +lead[1]; unit = lead[2] || ''; name = lead[3]; }
    const trail = /^(.+?)\s*[x×]\s*(\d+)$/i.exec(name);
    if (qty == null && trail) { name = trail[1]; qty = +trail[2]; }
  }
  name = name.replace(/\s+/g, ' ').trim();
  let kind = 'unknown';
  if (REUSABLE_RX.test(name)) kind = 'reusable'; else if (CONSUMABLE_RX.test(name)) kind = 'consumable';
  if (!unit && qty != null) unit = kind === 'consumable' ? '' : 'each';
  return { id: uid(), name, qtyPerGroup: qty, unit, kind, per: PER_STUDENT_RX.test(name) ? 'student' : 'group', sharedBy: 1, inventory: null };
}
function parseProcedureText(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const sections = {}; const ignored = [];
  let current = 'preamble'; const pre = [];
  for (const line of lines) {
    const h = line.trim() ? headerOf(line.trim()) : null;
    if (h) { current = h.key; if (h.key === 'ignore') ignored.push(h.label); sections[current] = sections[current] || []; continue; }
    if (current === 'preamble') pre.push(line); else sections[current].push(line);
  }
  const preLines = pre.map((l) => l.trim()).filter(Boolean);
  const c = blankContent();
  c.title = preLines[0] || '';
  c.level = ''; c.setupMinutes = 0; c.cleanupMinutes = 0;
  c.objectives = sections.objectives ? splitItems(sections.objectives) : [];
  c.materials = sections.materials ? splitItems(sections.materials).map(parseMaterial) : [];
  c.setup = sections.setup ? splitItems(sections.setup) : [];
  c.precautions = sections.precautions ? splitItems(sections.precautions) : [];
  c.cleanup = sections.cleanup ? splitItems(sections.cleanup) : [];
  let detected = false;
  c.steps = (sections.steps ? splitItems(sections.steps) : []).map((t) => {
    let minutes = null;
    const dm = /\(\s*(?:about\s+|~|approx\.?\s*)?(\d+(?:\.\d+)?)\s*(?:[-–]|to)?\s*(\d+)?\s*min(?:ute)?s?\s*\)|\btime:\s*(\d+)\s*min/i.exec(t);
    if (dm) { minutes = +(dm[2] || dm[1] || dm[3]); t = t.replace(dm[0], '').replace(/\s{2,}/g, ' ').trim(); }
    const inputs = guessInputs(t); if (inputs.length) detected = true;
    return { id: uid(), title: stepTitleFrom(t), instructions: t, minutes, materials: [], inputs, checkpoint: /\bteacher\b[^.]*\b(check|initial|approve|sign|inspect)|\b(check|initial|approve|sign)\b[^.]*\bteacher\b/i.test(t) };
  });
  // Attach items from a Data section to the steps that mention them
  const unassigned = [];
  if (sections.data) {
    let pointer = 0;
    for (const item of splitItems(sections.data)) {
      const um = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(item);
      const label = um ? um[1].trim() : item.trim(); const unit = um ? um[2].trim() : '';
      const words = normName(label);
      const scoreOf = (s) => normName(s.instructions).filter((w) => words.includes(w)).length;
      let idx = c.steps.findIndex((s, i) => i >= pointer && /record|measure/i.test(s.instructions) && scoreOf(s) > 0);
      if (idx === -1) idx = c.steps.findIndex((s) => scoreOf(s) > 0);
      if (idx === -1) { unassigned.push(label); continue; }
      const st = c.steps[idx];
      st.inputs = st.inputs.filter((x) => !normName(x.label).some((w) => words.includes(w)));
      st.inputs.push({ label, unit });
      pointer = idx + 1; detected = true;
    }
  }
  const notes = [];
  if (detected) notes.push({ level: 'unclear', field: 'steps', text: 'Student inputs were picked up from words like “record” and the Data section. Check each one.' });
  unassigned.forEach((l) => notes.push({ level: 'unclear', field: 'steps', text: `“${l}” is listed under Data but no step mentions it. Add it to the right step.` }));
  ignored.forEach((l) => notes.push({ level: 'info', field: '', text: `The “${l}” section wasn’t imported. It stays in the original file.` }));
  sections.materials && splitItems(sections.materials).forEach((l) => { if (/per (class|room|lab)|class set|shared/i.test(l)) notes.push({ level: 'unclear', field: 'materials', text: `“${l}” gives a class-wide amount, not a per-group quantity.` }); });
  normalizeContent(c);
  return { content: c, notes };
}

/* ---------------------------------------------------------------
   3. AI planning
   --------------------------------------------------------------- */
const AI = { sample: null, available: null, busy: false, ctl: null, error: null };

/** Live AI is Gemma, running on the student site's server. Availability follows that connection. */
const GemmaAI = {
  limits() { return Promise.resolve({ images: true }); },
  async json(prompt, { signal, images = [] } = {}) {
    const encoded = await Promise.all(images.map((blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    })));
    const { url, token } = StudentSite.config();
    let res;
    try {
      res = await fetch(`${url.replace(/\/+$/, '')}/api/dashboard/ai`, {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, images: encoded }),
      });
    } catch (e) { throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'unreachable' }; }
    if (!res.ok) throw { code: res.status === 422 ? 'invalid_json' : 'unreachable' };
    return res.json();
  },
};
function initLiveAI() { AI.sample = GemmaAI; }

function normalizePlan(raw, fallbackTitle) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : []);
  const plan = {
    title: String(p.title || fallbackTitle || 'Untitled lab').trim(),
    subject: String(p.subject || S.designer.form.subject || ''), level: String(p.level || S.designer.form.level || ''),
    objectives: arr(p.objectives),
    materials: (Array.isArray(p.materials) ? p.materials : []).map((m) => ({
      id: uid(), name: String(m.name || '').trim(), qtyPerGroup: Number.isFinite(+m.qtyPerGroup) ? +m.qtyPerGroup : null,
      unit: String(m.unit || ''), kind: m.kind === 'consumable' ? 'consumable' : 'reusable', per: m.per === 'student' ? 'student' : 'group',
      sharedBy: Math.max(1, parseInt(m.sharedBy, 10) || 1), inventory: m.inventory ? String(m.inventory) : null,
    })).filter((m) => m.name),
    setup: arr(p.setup),
    steps: (Array.isArray(p.steps) ? p.steps : []).map((s) => ({
      id: uid(), title: String(s.title || '').trim(), instructions: String(s.instructions || '').trim(),
      minutes: Number.isFinite(+s.minutes) && +s.minutes > 0 ? Math.round(+s.minutes) : null,
      materials: arr(s.materials), inputs: (Array.isArray(s.inputs) ? s.inputs : []).map((i) => ({ label: String(i.label || '').trim(), unit: String(i.unit || '') })).filter((i) => i.label),
      checkpoint: !!s.checkpoint,
    })).filter((s) => s.title || s.instructions),
    cleanup: arr(p.cleanup), precautions: arr(p.precautions), assumptions: arr(p.assumptions), questions: arr(p.questions),
  };
  return normalizeContent(plan);
}

function planningContext(d) {
  const periods = designerPeriods(d);
  return {
    learningContext: { subject: d.form.subject, topic: d.form.topic, level: d.form.level, objectives: d.form.objectives.split('\n').map((s) => s.trim()).filter(Boolean), desiredExperiment: d.form.experiment, existingInstructions: d.form.existing || null },
    inventory: d.inventory.filter((i) => i.name.trim()).map((i) => ({ name: i.name, quantity: Number(i.qty) || 0, unit: i.unit, type: i.kind, notes: i.notes || undefined })),
    logistics: {
      periods: periods.map((p) => ({ period: p.label, students: p.students, groups: p.groups })),
      targetStudentsPerGroup: Number(d.logistics.groupSize), labMinutes: Number(d.logistics.labMinutes), setupMinutes: Number(d.logistics.setupMinutes), cleanupMinutes: Number(d.logistics.cleanupMinutes),
      periodsRunOneAfterAnother_equipmentReused: !!d.logistics.reuseAcrossPeriods, groupsMayShareEquipment: !!d.logistics.allowSharing,
    },
  };
}
const PLAN_SHAPE = `{
  "reply": "2-4 plain sentences to the teacher: what you did and what needs their decision",
  "changes": ["each concrete change you made to the plan (empty for a first draft)"],
  "groupSize": 3,
  "labMinutes": null,
  "inventoryUpdates": [{"name": "exact inventory item name", "quantity": 6}],
  "plan": {
    "title": "...", "objectives": ["..."],
    "materials": [{"name": "...", "qtyPerGroup": 1, "unit": "...", "kind": "reusable", "per": "group", "sharedBy": 1, "inventory": "exact inventory item name, or null if not in the inventory"}],
    "setup": ["..."],
    "steps": [{"title": "...", "instructions": "...", "minutes": 5, "materials": ["..."], "inputs": [{"label": "...", "unit": "..."}], "checkpoint": false}],
    "cleanup": ["..."], "precautions": ["..."], "assumptions": ["..."], "questions": ["..."]
  }
}`;
const PLAN_RULES = `Rules:
- The teacher makes every decision. Your plan is a draft for their review. Never say or imply the plan has been verified as safe.
- Use the teacher's inventory. If the experiment needs something that isn't listed, include it with "inventory": null so the app can flag it. Never invent how many of something the teacher has.
- Quantities are PER GROUP ("per": "group") or PER STUDENT ("per": "student", e.g. goggles). The app calculates period totals, overall totals and shortages itself, so do not add totals.
- Reusable equipment that several groups share: set "sharedBy" to how many groups share one item. Only do this if groups may share equipment.
- Give every step a realistic whole-number "minutes". Do not include setup or cleanup time inside the steps; those are separate.
- Mark "checkpoint": true on steps where students should get teacher approval before continuing (for example before handling hot liquids or flames).
- "inputs" are the measurements or observations students record in that step, with units.
- If a constraint cannot be met (time, equipment), say so in "reply" and "questions" instead of pretending it fits.
- "labMinutes" and "inventoryUpdates": fill these only when the teacher tells you new facts (e.g. "we only have 45 minutes", "we only have six thermometers"). Otherwise use null and [].
- "groupSize": the target number of students per group the plan assumes.
- Plain language for a busy teacher. No markdown.`;

function livePrompt(kind, d, question) {
  const ctx = planningContext(d);
  let p = `You are the lab-planning assistant inside Labby, an app teachers use to plan classroom science labs.\n\n${PLAN_RULES}\n\n`;
  p += `Teacher's planning inputs (JSON):\n${JSON.stringify(ctx, null, 1)}\n\n`;
  if (kind === 'generate') {
    p += 'Task: draft a complete lab plan from these inputs.\n\n';
  } else {
    const history = d.chat.filter((m) => !m.pending && !m.error).slice(-6).map((m) => `${m.role === 'user' ? 'Teacher' : 'Assistant'}: ${m.text}`).join('\n');
    p += `Current draft plan (JSON):\n${JSON.stringify(stripIds(d.plan), null, 1)}\n\nRecent conversation:\n${history}\n\nThe teacher now asks: "${question}"\n\nTask: answer the question and revise the plan if needed. List every change in "changes". If no change is needed, return the plan unchanged and say why in "reply".\n\n`;
  }
  p += `Reply with only one JSON object in exactly this shape:\n${PLAN_SHAPE}`;
  return p;
}
function stripIds(plan) { return JSON.parse(JSON.stringify(plan, (k, v) => (k === 'id' ? undefined : v))); }

async function callLive(kind, question) {
  const d = S.designer;
  AI.ctl = new AbortController();
  const data = await AI.sample.json(livePrompt(kind, d, question), { signal: AI.ctl.signal, cache: false });
  if (!data || typeof data !== 'object' || !data.plan) throw { code: 'invalid_json' };
  const plan = normalizePlan(data.plan, d.plan && d.plan.title);
  if (!plan.steps.length) throw { code: 'invalid_json' };
  return {
    plan, reply: String(data.reply || '').trim() || 'Here is the updated plan.',
    changes: Array.isArray(data.changes) ? data.changes.map(String).filter(Boolean) : [],
    groupSize: parseInt(data.groupSize, 10) || null, labMinutes: parseInt(data.labMinutes, 10) || null,
    inventoryUpdates: Array.isArray(data.inventoryUpdates) ? data.inventoryUpdates : [],
  };
}
function liveErrorText(e) {
  switch (e && e.code) {
    case 'cancelled': return 'Stopped. The plan wasn’t changed.';
    case 'invalid_json': case 'empty_completion': return 'The response couldn’t be read as a lab plan. Try again, or ask for a smaller change.';
    case 'prompt_too_large': return 'The plan is too long to send. Remove some steps or notes and try again.';
    default: return 'Gemma didn’t respond. Check that the student site server and Ollama are running, then try again.';
  }
}

/** App-side comparison of two plans so the teacher sees exactly what moved. */
function planDiff(oldPlan, newPlan, oldRes, newRes) {
  const lines = [];
  if (oldRes.time.total !== newRes.time.total) lines.push(`Total time: ${oldRes.time.total} → ${newRes.time.total} min (of ${newRes.time.available}).`);
  if (oldRes.totalGroups !== newRes.totalGroups) lines.push(`Groups: ${oldRes.totalGroups} → ${newRes.totalGroups} across the selected periods.`);
  if (oldPlan.steps.length !== newPlan.steps.length) lines.push(`Steps: ${oldPlan.steps.length} → ${newPlan.steps.length}.`);
  const key = (i) => i.text.replace(/\d+/g, '#');
  const before = new Set(oldRes.issues.filter((i) => i.sev === 'bad').map(key));
  const after = new Set(newRes.issues.filter((i) => i.sev === 'bad').map(key));
  const resolved = [...before].filter((k) => !after.has(k)).length, added = [...after].filter((k) => !before.has(k)).length;
  if (resolved) lines.push(`${plural(resolved, 'problem')} resolved.`);
  if (added) lines.push(`${plural(added, 'new problem')} to review.`);
  return lines;
}
function revisedSteps(oldPlan, newPlan) {
  return newPlan.steps.map((s, i) => {
    const o = oldPlan.steps.find((x) => x.title === s.title) || oldPlan.steps[i];
    return !o || o.title !== s.title || o.instructions !== s.instructions || o.minutes !== s.minutes;
  });
}

/* ---------------------------------------------------------------
   4. Live lab events, which arrive from the student site.
   --------------------------------------------------------------- */
function logActivity(p, text, at = Date.now()) { p.activity.push({ at, text }); p.lastActivityAt = at; }
/** One open request per group and category: a repeat updates the existing request instead. */
function createHelpRequest(p, sess, category, message) {
    const now = Date.now();
    const existing = S.help.find((h) => h.sessionId === sess.id && h.groupId === p.groupId && h.category === category && h.status !== 'resolved');
    if (existing) {
      existing.message = `${existing.message}\n\nUpdate (${fmtClock(now)}): ${message}`;
      existing.updatedAt = now; existing.updates += 1; existing.stepIndex = p.stepIndex;
      existing.log.push({ at: now, text: 'Student added an update' });
      logActivity(p, `Updated ${category.toLowerCase()} help request`, now);
      return { updated: true, request: existing };
    }
    const req = { id: uid(), sessionId: sess.id, classId: sess.classId, periodId: sess.periodId, groupId: p.groupId, labId: sess.labId, stepIndex: p.stepIndex, category, message, createdAt: now, updatedAt: now, updates: 0, status: 'waiting', log: [{ at: now, text: 'Request submitted' }] };
    S.help.push(req);
    logActivity(p, `Asked for help (${category})`, now);
    return { updated: false, request: req };
}

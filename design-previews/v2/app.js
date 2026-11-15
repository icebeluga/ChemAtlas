// ChemAtlas v2 prototype: shared data, question rendering and worksheet store
// for the Question Bank (index.html) and Practice Builder (builder.html).
// Read-only against the real catalog; nothing here writes outside localStorage.
import * as pdfjs from "/node_modules/pdfjs-dist/build/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "/public/pdf.worker.min.mjs";

export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// reviewed text blocks mark sub/superscripts as _{2} and ^{2+}
export const chem = s => esc(s).replace(/_\{(.+?)\}/g, "<sub>$1</sub>").replace(/\^\{(.+?)\}/g, "<sup>$1</sup>");
const svg = d => `<svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.7" fill="none" aria-hidden="true">${d}</svg>`;
export const icon = { plus: svg('<path d="M7 2v10M2 7h10"/>'), check: svg('<path d="M2 7.5 5.5 11 12 3.5"/>'), up: svg('<path d="M7 11V3M3.5 6.5 7 3l3.5 3.5"/>'), down: svg('<path d="M7 3v8M3.5 7.5 7 11l3.5-3.5"/>'),
  x: svg('<path d="m3 3 8 8M11 3l-8 8"/>'), prev: svg('<path d="M9 2 4 7l5 5"/>'), next: svg('<path d="m5 2 5 5-5 5"/>'), search: svg('<circle cx="6" cy="6" r="4"/><path d="m9 9 3.5 3.5"/>'),
  grip: svg('<path d="M5 3v0M9 3v0M5 7v0M9 7v0M5 11v0M9 11v0" stroke-linecap="round" stroke-width="2.2"/>'), flag: svg('<path d="M7 1.5 13 12H1z"/><path d="M7 6v2.5M7 10.4v.1"/>') };

// FLIP: slide keyed elements from old to new position, fade in new ones. Never blocks input.
export function flip(root, change, { selector = "[data-id]", duration = 300 } = {}) {
  if (reducedMotion) { change(); return; }
  const easing = "cubic-bezier(.2,.8,.2,1)";
  const before = new Map([...root.querySelectorAll(selector)].map(el => [el.dataset.id, el.getBoundingClientRect()]));
  change();
  let entered = 0;
  for (const el of root.querySelectorAll(selector)) {
    const was = before.get(el.dataset.id), now = el.getBoundingClientRect();
    if (!was) { if (now.top < innerHeight) el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration, easing, delay: Math.min(entered++, 8) * 18, fill: "backwards" }); }
    else if (Math.abs(was.top - now.top) > 1 || Math.abs(was.left - now.left) > 1)
      el.animate([{ transform: `translate(${was.left - now.left}px,${was.top - now.top}px)` }, { transform: "none" }], { duration, easing });
  }
}

export async function loadCatalog() {
  const [raw, content] = await Promise.all(["student-questions", "worksheet-content"].map(async name => {
    const response = await fetch(`/public/${name}.json`);
    if (!response.ok) throw new Error(`Could not load ${name}.json (${response.status})`);
    return response.json();
  }));
  const topicUnit = new Map(), topicName = new Map();
  raw.units.forEach(u => u.topics.forEach(([id, name]) => { topicUnit.set(id, u.id); topicName.set(id, name); }));
  const questions = raw.questions.filter(q => q.status === "classified" && q.primaryTopic).map(q => {
    const related = q.relatedTopics?.length ? q.relatedTopics : [q.primaryTopic], reviewed = content.questions[q.id];
    return { ...q, related, unit: topicUnit.get(q.primaryTopic), units: [...new Set(related.map(t => topicUnit.get(t)))],
      title: `${q.year ?? "Undated"} ${q.type} ${q.number}`, text: (q.textPreview ?? "").replace(/^\d+\.\s*/, ""),
      // print = the reviewed layout the PDF export uses; anything without it exports as full source pages
      print: reviewed ? { shared: reviewed.context ? content.contexts[reviewed.context] ?? [] : [], blocks: reviewed.blocks } : null,
      note: reviewed ? "" : content.review?.[q.id] ?? "",
      sourcePages: q.sourcePagesOriginal?.length ? q.sourcePagesOriginal : q.pages };
  });
  const units = raw.units.map((u, i) => ({ id: u.id, n: i + 1, name: u.name, count: questions.filter(q => q.units.includes(u.id)).length,
    topics: u.topics.map(([id, name]) => ({ id, name, unit: u.id, count: questions.filter(q => q.related.includes(id)).length })) }));
  const maxTopic = Math.max(...units.flatMap(u => u.topics.map(t => t.count)));
  return { units, questions, byId: new Map(questions.map(q => [q.id, q])), topicName, topicUnit, topicDetails: raw.topicDetails ?? {}, sourceFiles: raw.sourceFiles,
    years: [...new Set(questions.map(q => q.year).filter(Boolean))].sort().reverse(),
    density: n => n ? [.15, .4, .7, 1][Math.min(3, Math.floor(Math.sqrt(n / maxTopic) * 4))] : 0 };
}

export function filterQuestions(questions, { unit = "all", topic = "all", type = "all", year = "all", ready = false, query = "" }) {
  const needle = query.trim().toLowerCase();
  return questions.filter(q => (unit === "all" || q.units.includes(unit)) && (topic === "all" || q.related.includes(topic))
    && (type === "all" || q.type === type) && (year === "all" || q.year === year) && (!ready || q.print)
    && (!needle || `${q.title} ${q.exam} ${q.text} ${q.topicName} ${q.related.join(" ")}`.toLowerCase().includes(needle)));
}

// ---- printed question rendering -------------------------------------------------
const docs = new Map();
function pageFor(sourceFiles, original) {
  const file = sourceFiles.find(f => original >= f.from && original <= f.to);
  if (!file) throw new Error(`Source page ${original} is not in the bundled PDFs`);
  if (!docs.has(file.url)) docs.set(file.url, pdfjs.getDocument({ url: `/public${file.url}` }).promise);
  return docs.get(file.url).then(doc => doc.getPage(original - file.from + 1));
}
const canvasFor = (regions, label) => `<figure class="q-fig"><canvas data-regions='${esc(JSON.stringify(regions))}' role="img" aria-label="${esc(label)}"></canvas><div class="q-wait"></div></figure>`;
const blocksHtml = (blocks, label) => blocks.map(b => b.kind === "paragraph" ? `<p class="q-text">${chem(b.text)}</p>`
  : b.kind === "choices" ? `<ol class="q-choices">${b.choices.map(c => `<li>${chem(c)}</li>`).join("")}</ol>`
  : canvasFor([{ page: b.page, rect: b.rect }], label)).join("");

// mode "question": reviewed layout if there is one, else the unreviewed crop, else full pages.
// mode "page": always the full source page(s), the fallback the app and the PDF export rely on.
export function questionHtml(q, mode = "question") {
  if (mode === "page" || (!q.print && !q.sourceRegions?.length)) return q.sourcePages.map(page => canvasFor([{ page }], `${q.title}, source page ${page}`)).join("");
  if (q.print) return (q.print.shared.length ? `<div class="q-shared"><span>Shared with neighbouring questions</span>${blocksHtml(q.print.shared, `Shared material for ${q.title}`)}</div>` : "") + blocksHtml(q.print.blocks, `${q.title} as printed`);
  return canvasFor(q.sourceRegions, `${q.title} as printed, unreviewed crop`);
}
export const statusOf = q => q.print ? { key: "ready", label: "Print-ready", detail: "Reviewed layout. Exports as a cropped question." }
  : { key: "draft", label: "Needs review", detail: `${q.sourceRegions?.length ? "Unreviewed crop." : "No crop yet."} ${q.note || ""} Exports as the full source page.`.replace(/\s+/g, " ") };

// Paint every canvas under `root`. Crops are stacked into one canvas; a region without a rect is a whole page.
export function paint(catalog, root) {
  root.querySelectorAll("canvas[data-regions]:not([data-ready])").forEach(async canvas => {
    const cssWidth = canvas.parentElement.clientWidth; if (cssWidth <= 0) return; // hidden; caller paints again when shown
    const regions = JSON.parse(canvas.dataset.regions), token = canvas.dataset.token = String(Math.random());
    try {
      const dpr = Math.min(2, devicePixelRatio || 1), parts = [];
      for (const region of regions) {
        const page = await pageFor(catalog.sourceFiles, region.page), base = page.getViewport({ scale: 1 });
        const rect = region.rect?.length ? region.rect : [0, 0, base.width, base.height];
        parts.push({ page, rect });
      }
      const widest = Math.max(...parts.map(p => p.rect[2] - p.rect[0])), scale = Math.min(3, cssWidth * dpr / widest);
      canvas.style.setProperty("--pt", widest);
      for (const p of parts) {
        const viewport = p.page.getViewport({ scale }), scratch = document.createElement("canvas");
        scratch.width = Math.ceil(viewport.width); scratch.height = Math.ceil(viewport.height);
        await p.page.render({ canvas: scratch, canvasContext: scratch.getContext("2d"), viewport }).promise;
        const [x0, y0, x1, y1] = p.rect.map(v => v * scale);
        Object.assign(p, { scratch, x: x0, y: y0, w: Math.min(scratch.width, x1) - x0, h: Math.min(scratch.height, y1) - y0 });
      }
      if (canvas.dataset.token !== token) return;
      const drawn = parts.filter(p => p.w > 0 && p.h > 0); if (!drawn.length) throw new Error("Empty crop region");
      canvas.width = Math.ceil(widest * scale); canvas.height = Math.ceil(drawn.reduce((sum, p) => sum + p.h, 0));
      canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
      const context = canvas.getContext("2d"); let top = 0;
      context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
      for (const p of drawn) { context.drawImage(p.scratch, p.x, p.y, p.w, p.h, 0, top, p.w, p.h); top += p.h; }
      canvas.dataset.ready = "true";
    } catch (error) {
      if (canvas.dataset.token === token) canvas.parentElement.innerHTML = `<p class="q-error" role="alert">${icon.flag} This source image could not be drawn (${esc(error.message)}). Reload, or open the full page.</p>`;
    }
  });
}

// ---- worksheet store, shared by both pages through localStorage -----------------
const KEY = "chematlas-v2-worksheet";
const blank = { ids: [], title: "Untitled worksheet", grouping: "none", fields: true, citations: true };
export function createSheet() {
  let state = { ...blank }; const listeners = new Set();
  const read = () => { try { state = { ...blank, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { /* storage blocked or damaged: start empty */ } };
  read();
  const commit = patch => { state = { ...state, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* keep in memory */ } listeners.forEach(fn => fn(state)); };
  addEventListener("storage", e => { if (e.key === KEY) { read(); listeners.forEach(fn => fn(state)); } }); // other tab changed it
  return {
    get state() { return state; }, get ids() { return state.ids; },
    has: id => state.ids.includes(id),
    add: (id, at = state.ids.length) => { if (!state.ids.includes(id)) { const ids = [...state.ids]; ids.splice(at, 0, id); commit({ ids }); } },
    remove: id => commit({ ids: state.ids.filter(x => x !== id) }),
    toggle(id) { this.has(id) ? this.remove(id) : this.add(id); },
    move(from, to) { if (to < 0 || to >= state.ids.length || from === to) return; const ids = [...state.ids]; ids.splice(to, 0, ids.splice(from, 1)[0]); commit({ ids }); },
    set: commit, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

// Shared top bar so both pages carry the same navigation.
export function topBar(current, count) {
  return `<a class="mark" href="index.html">ChemAtlas</a>
    <nav class="nav" aria-label="Main"><a href="index.html" ${current === "bank" ? 'aria-current="page"' : ""}>Question bank</a>
    <a href="builder.html" ${current === "builder" ? 'aria-current="page"' : ""}>Practice builder <b class="count" id="nav-count">${count}</b></a></nav>`;
}
export function bump(el) { if (!el || reducedMotion) return; el.animate([{ transform: "scale(1)" }, { transform: "scale(1.45)" }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(.3,1.4,.5,1)" }); }

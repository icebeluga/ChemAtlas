// Shared data + behaviour for the three direction previews. Each direction owns
// its own markup, CSS and motion; this file only reads the real catalog, renders
// real question crops from the source PDFs, and keeps a worksheet list.
import * as pdfjs from "/node_modules/pdfjs-dist/build/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "/public/pdf.worker.min.mjs";

export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// FLIP: run `change`, then slide every keyed element from where it was to where
// it is now, and fade in the new ones. Interruptible and never blocks input
// (whole-page view transitions did, which made fast filtering feel stuck).
export function flip(root, change, { selector = "[data-id]", duration = 300, easing = "cubic-bezier(.2,.8,.2,1)" } = {}) {
  if (reducedMotion) { change(); return; }
  const before = new Map([...root.querySelectorAll(selector)].map(el => [el.dataset.id, el.getBoundingClientRect()]));
  change();
  let entered = 0;
  for (const el of root.querySelectorAll(selector)) {
    const was = before.get(el.dataset.id), now = el.getBoundingClientRect();
    if (!was) { if (now.top < innerHeight) el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration, easing, delay: Math.min(entered++, 8) * 22, fill: "backwards" }); }
    else if (Math.abs(was.top - now.top) > 1 || Math.abs(was.left - now.left) > 1)
      el.animate([{ transform: `translate(${was.left - now.left}px,${was.top - now.top}px)` }, { transform: "none" }], { duration, easing });
  }
}

export async function loadCatalog() {
  const raw = await (await fetch("/public/student-questions.json")).json();
  const topicUnit = new Map(), topicName = new Map();
  raw.units.forEach(u => u.topics.forEach(([id, name]) => { topicUnit.set(id, u.id); topicName.set(id, name); }));
  const questions = raw.questions.filter(q => q.status === "classified" && q.primaryTopic && q.sourceRegions?.length).map(q => {
    const related = q.relatedTopics?.length ? q.relatedTopics : [q.primaryTopic];
    return { ...q, related, unit: topicUnit.get(q.primaryTopic), units: [...new Set(related.map(t => topicUnit.get(t)))],
      title: `${q.year ?? "Undated"} ${q.type} ${q.number}`,
      text: (q.textPreview ?? "").replace(/^\d+\.\s*/, "") };
  });
  const units = raw.units.map((u, i) => ({ id: u.id, n: i + 1, name: u.name,
    count: questions.filter(q => q.units.includes(u.id)).length,
    topics: u.topics.map(([id, name]) => ({ id, name, unit: u.id, count: questions.filter(q => q.related.includes(id)).length })) }));
  return { units, questions, byId: new Map(questions.map(q => [q.id, q])), topicName, topicUnit, topicDetails: raw.topicDetails ?? {}, sourceFiles: raw.sourceFiles };
}

export function filterQuestions(questions, { unit = "all", topic = "all", type = "all", query = "" }) {
  const needle = query.trim().toLowerCase();
  return questions.filter(q => (unit === "all" || q.units.includes(unit)) && (topic === "all" || q.related.includes(topic))
    && (type === "all" || q.type === type) && (!needle || `${q.title} ${q.exam} ${q.text} ${q.topicName}`.toLowerCase().includes(needle)));
}

const docs = new Map();
function pageFor(sourceFiles, original) {
  const file = sourceFiles.find(f => original >= f.from && original <= f.to);
  if (!docs.has(file.url)) docs.set(file.url, pdfjs.getDocument({ url: `/public${file.url}` }).promise);
  return docs.get(file.url).then(doc => doc.getPage(original - file.from + 1));
}

// Draw a question's verified crop regions, stacked, into one canvas at `cssWidth`.
export async function renderCrop(catalog, q, canvas, cssWidth) {
  if (cssWidth <= 0) return; // container is hidden; caller renders again when it is shown
  const token = canvas.dataset.token = `${q.id}:${cssWidth}`;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const widest = Math.max(...q.sourceRegions.map(r => r.rect[2] - r.rect[0]));
  canvas.style.setProperty("--pt", widest); // crop width in PDF points, so each layout can show it near print scale
  const scale = Math.min(3, cssWidth * dpr / widest);
  const parts = [];
  for (const region of q.sourceRegions) {
    const page = await pageFor(catalog.sourceFiles, region.page);
    const viewport = page.getViewport({ scale });
    const scratch = document.createElement("canvas");
    scratch.width = Math.ceil(viewport.width); scratch.height = Math.ceil(viewport.height);
    await page.render({ canvas: scratch, canvasContext: scratch.getContext("2d"), viewport }).promise;
    const [x0, y0, x1, y1] = region.rect.map(v => v * scale);
    parts.push({ scratch, x: x0, y: y0, w: Math.min(scratch.width, x1) - x0, h: Math.min(scratch.height, y1) - y0 });
  }
  if (canvas.dataset.token !== token) return; // a newer render replaced this one
  canvas.width = Math.ceil(widest * scale); canvas.height = Math.ceil(parts.reduce((sum, p) => sum + p.h, 0));
  canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
  const context = canvas.getContext("2d"); let top = 0;
  context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
  for (const p of parts) { if (p.w <= 0 || p.h <= 0) continue; context.drawImage(p.scratch, p.x, p.y, p.w, p.h, 0, top, p.w, p.h); top += p.h; }
  canvas.dataset.ready = "true";
}

export function createSheet(key) {
  let ids = []; const listeners = new Set();
  try { ids = JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { /* storage blocked: start empty */ }
  const commit = next => { ids = next; try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* keep in memory */ } listeners.forEach(fn => fn(ids)); };
  return {
    get ids() { return ids; },
    has: id => ids.includes(id),
    add: id => ids.includes(id) || commit([...ids, id]),
    remove: id => commit(ids.filter(x => x !== id)),
    toggle(id) { this.has(id) ? this.remove(id) : this.add(id); },
    move(from, to) { if (to < 0 || to >= ids.length || from === to) return; const next = [...ids]; next.splice(to, 0, next.splice(from, 1)[0]); commit(next); },
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

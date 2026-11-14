// Standalone HTML review sheet: one card per question with images, tags, evidence, flags and the second-pass alternatives,
// plus a panel for the open boundary conventions. Reviewers approve / reject / flag, untick or add tags per part, and
// download a decisions JSON for `cli.mjs review --file`. Work is autosaved in the browser only.
// Independent of the private question-image review service; it never writes anywhere itself.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ROLES = ["primary", "supporting", "contextual"];
const ORDER = { needs_attention: 1, machine_generated: 2, machine_reviewed: 3, human_verified: 4, rejected: 5, blocked: 6 };

// records: current records; packets/comparisons by question id; imageSrc(repoPath) -> URL relative to the sheet;
// benchmarkIds: questions in a reference set (reviewed first); conventions: research/concepts/conventions.json entries.
export function renderReviewSheet({ run, records, packets, comparisons, taxonomy, imageSrc, benchmarkIds = [], conventions = [] }) {
  const names = Object.fromEntries(taxonomy.concepts.map(c => [c.id, c.name]));
  const bench = new Set(benchmarkIds);
  const sorted = [...records].sort((a, b) => (bench.has(b.questionId) - bench.has(a.questionId)) || (ORDER[a.reviewStatus] ?? 9) - (ORDER[b.reviewStatus] ?? 9) || a.questionId.localeCompare(b.questionId));
  const tag = (q, partId, role, conceptId, evidence, checked, source) => `
      <label class="tag ${role}${checked ? "" : " alt"}"><input type="checkbox"${checked ? " checked" : ""} data-q="${esc(q)}" data-part="${esc(partId)}" data-role="${role}" data-concept="${esc(conceptId)}" data-evidence="${esc(evidence)}" data-source="${source}">
      <span>${source === "b" ? "second pass suggests " : ""}${role}: ${esc(names[conceptId] ?? conceptId)} <code>${esc(conceptId)}</code></span>${evidence ? `<small>${esc(evidence)}</small>` : ""}</label>`;
  const cards = sorted.map(r => {
    const q = r.questionId, p = packets[q] ?? { images: [] }, cmp = comparisons[q];
    const shown = p.images.filter(i => i.kind !== "page-context"), context = p.images.filter(i => i.kind === "page-context");
    const imgs = shown.map(i => `<figure><img loading="lazy" src="${esc(imageSrc(i.path))}" alt="${esc(i.kind)} image for ${esc(q)}"><figcaption>${esc(i.kind)} · ${esc(i.pdf)} p${esc(i.page)}</figcaption></figure>`).join("");
    const ctx = context.length ? `<details><summary>Full source page${context.length > 1 ? "s" : ""}</summary>${context.map(i => `<img loading="lazy" src="${esc(imageSrc(i.path))}" alt="full page for ${esc(q)}">`).join("")}</details>` : "";
    const parts = r.parts.map(part => {
      const mine = ROLES.flatMap(role => part[role].map(a => tag(q, part.partId, role, a.conceptId, a.evidence, true, "a"))).join("");
      const have = new Set(ROLES.flatMap(role => part[role].map(a => `${role}:${a.conceptId}`)));
      const other = cmp?.parts?.find(x => x.partId === part.partId)?.b;
      const alts = other ? ["primary", "supporting"].flatMap(role => (other[role] ?? []).filter(id => !have.has(`${role}:${id}`)).map(id => tag(q, part.partId, role, id, "", false, "b"))).join("") : "";
      return `<div class="part"><b>${esc(part.label)}</b> <small>${esc((part.actions ?? []).join(", "))}${part.representations?.length ? " · " + esc(part.representations.join(", ")) : ""}</small>${mine}${alts}
      <input class="add" placeholder="add to ${esc(part.label)}: role:concept-id, e.g. supporting:electron-domains" data-add="${esc(q)}" data-part="${esc(part.partId)}" list="concepts" aria-label="Add a concept to ${esc(part.label)}"></div>`;
    }).join("");
    return `<article data-q="${esc(q)}" data-status="${esc(r.reviewStatus)}" data-bench="${bench.has(q) ? 1 : 0}">
  <h2>${esc(q)} <span class="status">${esc(r.reviewStatus)}</span>${bench.has(q) ? ' <span class="badge">benchmark</span>' : ""}</h2>
  <p class="meta">Topic ${esc(r.officialTopics.primary ?? "-")} ${esc(r.officialTopics.additional.join(", "))} · content ${esc(r.contentStatus)} · diagram ${esc(r.diagramStatus)} · crop ${esc(r.cropIssue)}${r.flags.length ? ` · flags: ${esc(r.flags.join(", "))}` : ""}</p>
  ${p.supplement ? `<p class="note">Content supplement (${esc(p.supplement.mode)}): ${esc(p.supplement.reason)} <em>Located by a model; confirm the page is right.</em></p>` : ""}
  ${r.contentNotes ? `<p class="note">${esc(r.contentNotes)}</p>` : ""}${r.uncertainty ? `<p class="note">Uncertain: ${esc(r.uncertainty)}</p>` : ""}
  ${cmp ? `<p class="cmp ${esc(cmp.agreement)}">Second pass: ${esc(cmp.agreement)}${cmp.summary ? ` (${esc(cmp.summary)})` : ""}</p>` : ""}
  <div class="imgs">${imgs || "<em>No rendered image; open the source PDF page.</em>"}</div>${ctx}
  ${parts || "<p><em>No concept tags (content blocked).</em></p>"}
  <div class="decide"><select data-q="${esc(q)}" aria-label="Decision for ${esc(q)}"><option value="">Decision</option><option value="approve">Approve (with any tag changes)</option><option value="reject">Reject</option><option value="flag">Needs attention</option></select>
  <input placeholder="notes" data-notes="${esc(q)}" aria-label="Notes for ${esc(q)}"></div>
</article>`;
  }).join("\n");
  const convPanel = conventions.length ? `<details class="conv" open><summary><b>Boundary conventions (${conventions.length})</b>: decide how these recurring cases should be tagged</summary>
${conventions.map(c => `<fieldset data-conv="${esc(c.id)}"><legend>${esc(c.question)}</legend>
${Object.entries(c.options).map(([k, v]) => `<label><input type="radio" name="${esc(c.id)}" value="${esc(k)}"${c.decision === k ? " checked" : ""}> ${esc(k)}: ${esc(v)}</label>`).join("")}
<label><input type="radio" name="${esc(c.id)}" value=""${c.decision ? "" : " checked"}> Leave undecided</label>
<small>Cases: ${esc(c.affects.map(a => `${a.questionId} (${a.partId})`).join(", "))}</small>
<details><summary>Model suggestion (not a decision)</summary><small>${esc(c.modelLean)}</small></details>
<input placeholder="notes / exact rule wording" data-conv-notes="${esc(c.id)}" aria-label="Notes for ${esc(c.id)}"></fieldset>`).join("\n")}</details>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Concept Review ${esc(run)}</title>
<style>:root{--bg:#fff;--fg:#1d1d1f;--muted:#666;--line:#ddd;--p:#e8f0ff;--s:#eef8ee;--c:#f4f4f4;--alt:#fff7e6;--warn:#b45309}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141414;--fg:#eee;--muted:#aaa;--line:#333;--p:#1c2a44;--s:#1d3320;--c:#262626;--alt:#3a2e14;--warn:#f0a040}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:0 16px 32px}article{border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:16px 0}
h2{font-size:17px;margin:0}.status,.meta,small,figcaption{color:var(--muted);font-weight:400}.badge{font-size:12px;border:1px solid var(--line);border-radius:10px;padding:1px 8px}
.imgs img,details img{max-width:100%;border:1px solid var(--line);background:#fff}figure{margin:6px 0}.part{margin:10px 0}
.tag{display:block;padding:6px 8px;border-radius:6px;margin:4px 0}.tag small{display:block}.primary{background:var(--p)}.supporting{background:var(--s)}.contextual{background:var(--c)}.tag.alt{background:var(--alt)}
.cmp.disagree,.cmp.partial{color:var(--warn)}.decide{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.decide input,.add{flex:1;min-width:200px;width:100%;box-sizing:border-box}
header{position:sticky;top:0;z-index:1;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line)}header .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
fieldset{border:1px solid var(--line);border-radius:8px;margin:8px 0}fieldset label{display:block}.conv{margin:12px 0}article.hidden{display:none}code{font-size:12px}</style></head>
<body><header><div class="row"><b>ChemAtlas concept review · ${esc(run)}</b><span id="progress"></span>
<label>Reviewer <input id="reviewer" autocomplete="name"></label>
<label>Show <select id="filter"><option value="all">all</option><option value="bench">benchmark</option><option value="needs_attention">needs attention</option><option value="machine_reviewed">machine reviewed</option><option value="open">not yet decided</option></select></label>
<button id="dl">Download decisions JSON</button><button id="clear" type="button">Clear saved work</button></div>
<p class="meta">Benchmark questions come first. Unticking a tag, ticking a second-pass suggestion or adding a tag turns an approval into an edit. Your work is saved in this browser only; apply it with <code>node scripts/concepts/cli.mjs review --file &lt;downloaded file&gt;</code>. Nothing here is published.</p></header>
${convPanel}
<datalist id="concepts">${taxonomy.concepts.map(c => `<option value="supporting:${esc(c.id)}">${esc(c.name)}</option><option value="primary:${esc(c.id)}">${esc(c.name)}</option>`).join("")}</datalist>
${cards}
<script>
const RUN = ${JSON.stringify(run)}, KEY = "concept-review:" + RUN;
const $$ = s => [...document.querySelectorAll(s)];
const fields = () => $$("#reviewer, select[data-q], input[data-notes], input[data-add], input[type=checkbox][data-q], input[type=radio], input[data-conv-notes]");
const keyOf = el => el.id || [el.dataset.q, el.dataset.part, el.dataset.role, el.dataset.concept, el.dataset.notes !== undefined ? "notes" : "", el.dataset.add !== undefined ? "add" : "", el.name, el.value && el.type === "radio" ? el.value : "", el.dataset.convNotes].join("|");
function save() { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(fields().map(el => [keyOf(el), el.type === "checkbox" || el.type === "radio" ? el.checked : el.value])))); } catch {} progress(); }
function restore() { let s = null; try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {} if (!s) return; for (const el of fields()) { const v = s[keyOf(el)]; if (v === undefined) continue; if (el.type === "checkbox" || el.type === "radio") el.checked = v; else el.value = v; } }
function progress() { const sel = $$("select[data-q]"); document.getElementById("progress").textContent = sel.filter(s => s.value).length + " of " + sel.length + " decided"; applyFilter(); }
function applyFilter() { const f = document.getElementById("filter").value; for (const a of $$("article")) { const decided = a.querySelector("select[data-q]").value; a.classList.toggle("hidden", !(f === "all" || (f === "bench" && a.dataset.bench === "1") || f === a.dataset.status || (f === "open" && !decided))); } }
document.addEventListener("change", save); document.addEventListener("input", e => { if (e.target.matches("input[type=text], input:not([type])")) save(); });
document.getElementById("filter").onchange = applyFilter;
document.getElementById("clear").onclick = () => { if (confirm("Clear the saved review work in this browser?")) { try { localStorage.removeItem(KEY); } catch {} location.reload(); } };
document.getElementById("dl").onclick = () => {
  const reviewer = document.getElementById("reviewer").value.trim();
  if (!reviewer) { alert("Enter a reviewer name first."); return; }
  const decisions = [], bad = [];
  for (const sel of $$("select[data-q]")) {
    const q = sel.dataset.q, decision = sel.value; if (!decision) continue;
    const notes = document.querySelector('[data-notes="' + CSS.escape(q) + '"]').value.trim();
    const boxes = $$('input[type=checkbox][data-q="' + CSS.escape(q) + '"]');
    const adds = $$('input[data-add="' + CSS.escape(q) + '"]').filter(i => i.value.trim());
    const changed = boxes.some(b => b.checked !== (b.dataset.source === "a")) || adds.length;
    if (decision !== "approve" || !changed) { decisions.push({ questionId: q, decision, reviewer, notes }); continue; }
    const parts = {};
    const part = id => parts[id] ??= { partId: id, primary: [], supporting: [], contextual: [], actions: [], representations: [], skills: [] };
    for (const b of boxes) { part(b.dataset.part); if (b.checked) part(b.dataset.part)[b.dataset.role].push({ conceptId: b.dataset.concept, evidence: b.dataset.source === "a" && b.dataset.evidence ? b.dataset.evidence : "Chosen by reviewer " + reviewer + (notes ? ": " + notes : "") }); }
    for (const i of adds) { const v = i.value.trim(), [role, id] = v.includes(":") ? v.split(":") : ["supporting", v]; if (!["primary", "supporting", "contextual"].includes(role) || !id) { bad.push(q + ": " + v); continue; } part(i.dataset.part)[role].push({ conceptId: id.trim(), evidence: "Added by reviewer " + reviewer + (notes ? ": " + notes : "") }); }
    for (const p of Object.values(parts)) {
      const ids = ["primary", "supporting", "contextual"].flatMap(r => p[r].map(a => a.conceptId));
      if (!p.primary.length) bad.push(q + " part " + p.partId + ": keep or add at least one primary concept");
      const dup = ids.find((id, i) => ids.indexOf(id) !== i); if (dup) bad.push(q + " part " + p.partId + ": " + dup + " is ticked in two roles");
    }
    decisions.push({ questionId: q, decision: "edit", reviewer, notes, parts: Object.values(parts) });
  }
  if (bad.length) { alert("Fix these before downloading:\\n" + bad.join("\\n")); return; }
  const conventions = $$("fieldset[data-conv]").map(f => ({ id: f.dataset.conv, decision: (f.querySelector("input[type=radio]:checked") || {}).value || "", notes: f.querySelector("[data-conv-notes]").value.trim() })).filter(c => c.decision);
  const out = { format: "concept-review-decisions/v2", run: RUN, reviewer, exportedAt: new Date().toISOString(), decisions, conventions };
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" })); a.download = "concept-review-decisions-" + RUN + ".json"; a.click();
};
restore(); progress();
</script></body></html>`;
}

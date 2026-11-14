// Standalone HTML review sheet: one card per question with images, tags, evidence, flags and pass-B comparison.
// Reviewers choose approve / reject / flag (or remove/add tags) and download a decisions JSON for `cli.mjs review --file`.
// Independent of the private question-image review service; it never writes anywhere itself.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function renderReviewSheet({ run, records, packets, comparisons, taxonomy, imageBase }) {
  const names = Object.fromEntries(taxonomy.concepts.map(c => [c.id, c.name]));
  const cards = records.map(r => {
    const p = packets[r.questionId] ?? { images: [] };
    const cmp = comparisons[r.questionId];
    const imgs = p.images.filter(i => i.kind !== "page-context").map(i => `<img loading="lazy" src="${esc(imageBase + i.path.split("/").pop())}" alt="${esc(i.kind)} for ${esc(r.questionId)}">`).join("");
    const tags = r.parts.map(part => `<div class="part"><b>${esc(part.label)}</b>${["primary", "supporting", "contextual"].map(role => part[role].map(a => `
      <label class="tag ${role}"><input type="checkbox" checked data-q="${esc(r.questionId)}" data-part="${esc(part.partId)}" data-role="${role}" data-concept="${esc(a.conceptId)}">
      <span>${role}: ${esc(names[a.conceptId] ?? a.conceptId)}</span><small>${esc(a.evidence)}</small></label>`).join("")).join("")}</div>`).join("");
    return `<article data-q="${esc(r.questionId)}" data-status="${esc(r.reviewStatus)}">
  <h2>${esc(r.questionId)} <span class="status">${esc(r.reviewStatus)}</span></h2>
  <p class="meta">Topic ${esc(r.officialTopics.primary ?? "-")} ${esc(r.officialTopics.additional.join(", "))} · content ${esc(r.contentStatus)} · diagram ${esc(r.diagramStatus)} · crop ${esc(r.cropIssue)}${r.flags.length ? ` · flags: ${esc(r.flags.join(", "))}` : ""}</p>
  ${r.contentNotes ? `<p class="note">${esc(r.contentNotes)}</p>` : ""}${r.uncertainty ? `<p class="note">Uncertain: ${esc(r.uncertainty)}</p>` : ""}
  ${cmp ? `<p class="cmp ${esc(cmp.agreement)}">Second pass: ${esc(cmp.agreement)}${cmp.summary ? ` — ${esc(cmp.summary)}` : ""}</p>` : ""}
  <div class="imgs">${imgs || "<em>No rendered image; open the source PDF page.</em>"}</div>
  ${tags || "<p><em>No concept tags (content blocked).</em></p>"}
  <div class="decide"><select data-q="${esc(r.questionId)}"><option value="">— decision —</option><option value="approve">Approve</option><option value="reject">Reject</option><option value="flag">Needs attention</option></select>
  <input placeholder="add concept id (role:id, e.g. supporting:electron-domains)" data-add="${esc(r.questionId)}" list="concepts"><input placeholder="notes" data-notes="${esc(r.questionId)}"></div>
</article>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Concept Review ${esc(run)}</title>
<style>:root{--bg:#fff;--fg:#1d1d1f;--muted:#666;--line:#ddd;--p:#e8f0ff;--s:#eef8ee;--c:#f4f4f4}@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--muted:#aaa;--line:#333;--p:#1c2a44;--s:#1d3320;--c:#262626}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}article{border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:16px 0}
h2{font-size:17px;margin:0}.status,.meta,small{color:var(--muted);font-weight:400}.imgs img{max-width:100%;border:1px solid var(--line);margin:6px 0;background:#fff}
.tag{display:block;padding:6px 8px;border-radius:6px;margin:4px 0}.tag small{display:block}.primary{background:var(--p)}.supporting{background:var(--s)}.contextual{background:var(--c)}
.cmp.disagree,.cmp.partial{color:#b45309}.decide{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.decide input{flex:1;min-width:200px}header{position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line)}</style></head>
<body><header><b>ChemAtlas concept review · ${esc(run)}</b> · ${records.length} questions · <label>Reviewer <input id="reviewer"></label> <button id="dl">Download decisions JSON</button>
<p class="meta">Unchecking a tag or adding one turns an approval into an edit. Run <code>node scripts/concepts/cli.mjs review --file &lt;downloaded file&gt;</code> to apply. Nothing here is published.</p></header>
<datalist id="concepts">${taxonomy.concepts.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</datalist>
${cards}
<script>
document.getElementById("dl").onclick = () => {
  const reviewer = document.getElementById("reviewer").value.trim();
  if (!reviewer) { alert("Enter a reviewer name first."); return; }
  const out = [];
  for (const sel of document.querySelectorAll("select[data-q]")) {
    const q = sel.dataset.q, decision = sel.value; if (!decision) continue;
    const boxes = [...document.querySelectorAll('input[type=checkbox][data-q="' + CSS.escape(q) + '"]')];
    const add = document.querySelector('[data-add="' + CSS.escape(q) + '"]').value.trim();
    const notes = document.querySelector('[data-notes="' + CSS.escape(q) + '"]').value.trim();
    const changed = boxes.some(b => !b.checked) || add;
    if (decision === "approve" && changed) {
      const parts = {};
      for (const b of boxes) { const p = parts[b.dataset.part] ??= { partId: b.dataset.part, primary: [], supporting: [], contextual: [], actions: [], representations: [], skills: [] }; if (b.checked) p[b.dataset.role].push({ conceptId: b.dataset.concept, evidence: "Kept by reviewer " + reviewer }); }
      if (add) { const [role, id] = add.includes(":") ? add.split(":") : ["supporting", add]; const first = Object.values(parts)[0]; if (first && first[role]) first[role].push({ conceptId: id, evidence: "Added by reviewer " + reviewer + (notes ? ": " + notes : "") }); }
      out.push({ questionId: q, decision: "edit", reviewer, notes, parts: Object.values(parts) });
    } else out.push({ questionId: q, decision, reviewer, notes });
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" })); a.download = "concept-review-decisions.json"; a.click();
};
</script></body></html>`;
}

// Independent-review package: everything an outside reviewer (another AI model or a teacher) needs to classify the
// benchmark questions from the original sources, with Claude's classifications kept apart for a second phase.
// Pure helpers; scripts/concepts/cli.mjs (export-review-package) does the file I/O.

const READINESS_NOTES = {
  "possible-ocr-loss": "OCR text contains garbled characters; read the images.",
  "refers-to-visual-content": "The question depends on a diagram, table or graph; read the images.",
  "choices-not-in-text": "Answer choices are not in the OCR text (probably drawn or tabular); read the images.",
  "adjacent-question-text": "OCR text includes a neighbouring question; classify only this question number.",
  "text-too-short": "OCR text is very short; the images are the only reliable source.",
  "scanned-no-text-layer": "Scanned page; text comes from OCR.",
  "question-number-not-confirmed": "The question number was not confirmed in OCR.",
};
const CROP_NOTES = {
  "missing-content-recovered-from-page": "The crop cuts off part of the question; the full source page shows all of it.",
  "extra-content": "The crop includes neighbouring questions; classify only this question number.",
  "no-crop": "No crop exists; use the full source page.",
  "wrong-question": "The catalog's original crop showed a different question; a corrected page is supplied.",
  "missing-content": "Content was missing from the catalog's crop; a supplemented page is supplied.",
};

// Machine-derived completeness flags. They never assert a question is complete; they say what to look out for.
export function completenessFlags({ content, record, holdoutRef, catalogIssues = [] }) {
  const flags = [];
  for (const r of content.readiness.reasons) if (READINESS_NOTES[r]) flags.push({ kind: r, note: READINESS_NOTES[r] });
  const crop = record?.cropIssue;
  if (crop && CROP_NOTES[crop]) flags.push({ kind: `crop:${crop}`, note: CROP_NOTES[crop] });
  if (["partially-readable", "unreadable"].includes(record?.diagramStatus)) flags.push({ kind: `diagram:${record.diagramStatus}`, note: "A classifier could not read a diagram fully; check whether the question is answerable." });
  if (content.supplement) flags.push({ kind: `supplement:${content.supplement.mode}`, note: `Extra source page added by the pipeline (located by a model, not confirmed by a human): ${content.supplement.reason}` });
  if (content.supplement && !content.text) flags.push({ kind: "ocr-text-withheld", note: "The catalog's text belongs to a different question, so no OCR text is given; use the images." });
  if (holdoutRef && holdoutRef.contentStatus !== "complete") flags.push({ kind: "reference-content-status", note: `The blind reference marked this question ${holdoutRef.contentStatus} before a supplement was added.` });
  for (const i of catalogIssues.filter(i => i.questionId === content.questionId)) flags.push({ kind: `catalog:${i.kind}`, note: i.detail });
  const blocking = !record || record.contentStatus !== "complete";
  return { status: blocking ? "incomplete" : flags.length ? "complete-with-cautions" : "complete", flags };
}

export function questionMarkdown(q) {
  const lines = [
    `# ${q.questionId}`, "",
    `- Set: ${q.set}`, `- Type: ${q.type} · ${q.exam ?? ""} · question ${q.number ?? "?"}`,
    `- Catalog topic (unverified hint): ${q.catalogTopics.primary ?? "none"}${q.catalogTopics.status === "review" ? " (topic not verified)" : ""}`,
    `- Completeness: **${q.completeness.status}**`, "",
  ];
  if (q.completeness.flags.length) lines.push("## Cautions", "", ...q.completeness.flags.map(f => `- ${f.note}`), "");
  lines.push("## Images (authoritative)", "", ...q.images.map(i => `- ${i.kind}: \`${i.file}\` (${i.pdf}, page ${i.page}${i.rect ? ", cropped" : ", full page"})`), "");
  lines.push("## Parts to classify", "", ...q.parts.map(p => `- \`${p.partId}\` ${p.label}`), "");
  if (q.type === "FRQ") lines.push("You may split a part into its printed subparts (for example `b` into `b-i` and `b-ii`) when they assess different concepts, or classify a range part (`a–c`, `d-onward`, `remaining-visible-parts`) by its printed letters.", "");
  lines.push("## OCR text (not authoritative)", "", "Extracted automatically. It loses subscripts, superscripts, charges, arrows, structures and graphs, and can include neighbouring questions. Use it only to search; read the images.", "", "```text", q.ocrText || "(none)", "```", "");
  return lines.join("\n");
}

export function claudeView(record, names) {
  const tag = a => ({ conceptId: a.conceptId, name: names[a.conceptId] ?? a.conceptId, evidence: a.evidence ?? "" });
  return {
    questionId: record.questionId,
    source: "Claude Code pilot, pass A (stored record)",
    model: record.method?.model ?? null, promptVersion: record.promptVersion, reviewStatus: record.reviewStatus,
    officialTopics: record.officialTopics,
    contentCheck: { status: record.contentStatus, diagramStatus: record.diagramStatus, cropIssue: record.cropIssue, notes: record.contentNotes ?? "" },
    parts: record.parts.map(p => ({ partId: p.partId, label: p.label, primary: p.primary.map(tag), supporting: p.supporting.map(tag), contextual: p.contextual.map(tag), actions: p.actions, representations: p.representations, skills: p.skills ?? [] })),
    uncertainty: record.uncertainty ?? "", flags: record.flags,
  };
}

const list = xs => (xs?.length ? xs.join(", ") : "none");
export function conceptsMarkdown(taxonomy) {
  const groups = new Map(taxonomy.groups.map(g => [g.id, g.name]));
  const out = [`# Concept taxonomy ${taxonomy.taxonomyVersion}`, "", `${taxonomy.concepts.length} concepts and ${taxonomy.skills.length} skills. Concept ids are the only valid tags. Skills (arithmetic, unit conversion, graph reading and similar) are not concepts and are never tagged as primary or supporting.`, "", "Machine-readable: `taxonomy/concepts.json`.", ""];
  for (const [gid, gname] of groups) {
    const cs = taxonomy.concepts.filter(c => c.group === gid);
    if (!cs.length) continue;
    out.push(`## ${gname}`, "");
    for (const c of cs) out.push(
      `### \`${c.id}\`: ${c.name}${c.scope === "beyond-ap" ? " (beyond the current AP course; legacy questions only)" : ""}`, "",
      c.definition, "",
      `- **Tag when:** ${c.include}`, `- **Do not tag when:** ${c.exclude}`,
      ...(c.examples ? [`- **Example:** ${c.examples.positive}`, `- **Not an example:** ${c.examples.negative}`] : []),
      `- CED topics: ${list(c.topics.primary)} (related: ${list(c.topics.related)})`,
      `- Related: ${list(c.related)} · Prerequisites: ${list(c.prerequisites)}`, "");
  }
  out.push("## Skills (not concepts)", "", ...taxonomy.skills.map(s => `- \`${s.id}\`: ${s.name}`), "");
  return out.join("\n");
}

export function conventionsMarkdown(conventions) {
  const out = ["# Unresolved classification conventions", "", "Claude's classifiers and Claude's adjudicator disagreed on these recurring boundary cases. None has been decided by a person. Evaluate each on its merits; the model suggestion is Claude's and is shown only for comparison.", ""];
  for (const c of conventions) out.push(
    `## ${c.id}`, "", c.question, "",
    ...Object.entries(c.options).map(([k, v]) => `- **${k}:** ${v}`), "",
    `Affected benchmark cases: ${c.affects.map(a => `\`${a.questionId}\` (${a.partId})`).join(", ")}`, "",
    `Claude's suggestion (not a decision): ${c.modelLean}`, "");
  return out.join("\n");
}

export function correctionsMarkdown(supplements, catalogIssues, pageFile, originals = {}) {
  const out = ["# Proposed source-page and shared-stimulus corrections", "", "The catalog's crop or page for these questions missed content. The pipeline adds or replaces pages without changing the catalog. Each was located by Claude looking at the PDF pages and has **not** been confirmed by a person. Please check that each supplied page really holds the missing content.", ""];
  for (const [id, s] of Object.entries(supplements)) out.push(
    `## \`${id}\` (${s.mode})`, "", s.reason, "",
    ...(originals[id]?.length ? [`- Catalog's original page(s): ${originals[id].map(f => `\`${f}\``).join(", ")}`] : []),
    ...s.regions.map(r => `- Supplied ${r.role} page: \`${pageFile(r.page) ?? `compiled page ${r.page}`}\``),
    ...(s.catalogCorrection ? [`- Proposed catalog fix: ${s.catalogCorrection}`] : []),
    `- Located by: ${s.checkedBy}`, "");
  out.push("## Other catalog issues found", "", ...catalogIssues.filter(i => !supplements[i.questionId]).map(i => `- ${i.questionId ? `\`${i.questionId}\`` : "(catalog-wide)"} (${i.kind}): ${i.detail}`), "");
  return out.join("\n");
}

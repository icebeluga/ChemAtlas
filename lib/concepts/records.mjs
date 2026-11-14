import { partCovered } from "./content.mjs";
// Classification records: validation of classifier output, versioned storage with history, review transitions, staleness.
export const ACTIONS = ["identify", "calculate", "predict", "explain", "justify", "compare", "rank", "represent", "interpret", "derive", "evaluate-procedure", "evaluate-error", "classify", "write-equation"];
export const REPRESENTATIONS = ["text-only", "chemical-equation", "lewis-structure", "molecular-structure", "particulate-diagram", "table", "graph", "spectrum", "energy-diagram", "titration-curve", "cell-diagram", "apparatus-diagram", "experimental-data", "chromatogram", "calibration-curve", "potential-table"];
export const REVIEW_STATUSES = ["machine_generated", "machine_reviewed", "needs_attention", "human_verified", "rejected", "blocked"];
const TRANSITIONS = {
  machine_generated: ["machine_reviewed", "needs_attention", "human_verified", "rejected"],
  machine_reviewed: ["human_verified", "rejected", "needs_attention"],
  needs_attention: ["machine_reviewed", "human_verified", "rejected"],
  human_verified: ["rejected", "needs_attention"],
  rejected: [],
  blocked: [],
};
export const canTransition = (from, to) => TRANSITIONS[from]?.includes(to) ?? false;
const ROLES = ["primary", "supporting", "contextual"];
export const CROP_ISSUES = ["none", "extra-content", "missing-content-recovered-from-page", "missing-content", "wrong-question", "no-crop"];

// Tag pairs in one part where concept a's exclude text says "(tag b)". Often a real error (a routine step tagged next to
// the concept that covers it), sometimes legitimate (both steps are used), so it is a review warning, never a rejection.
export function excludeConflicts(ids, conceptsById) {
  const out = [];
  for (const a of ids) for (const m of conceptsById.get(a)?.exclude?.matchAll(/tag ([a-z0-9-]+)/g) ?? []) if (m[1] !== a && ids.includes(m[1])) out.push([a, m[1]]);
  return out;
}

// Returns { record, errors, warnings }. A result with errors must never become a current record.
export function validateResult(result, { content, taxonomy, topicIds, resolver, method, promptVersion, now = new Date().toISOString() }) {
  const errors = [], warnings = [], flags = new Set();
  if (!content) return { record: null, errors: [`question ${result?.questionId} does not resolve to a catalog record`], warnings };
  if (result.questionId !== content.questionId) errors.push(`questionId ${result.questionId} != ${content.questionId}`);
  const check = result.contentCheck ?? {};
  if (!["complete", "partial", "unreadable"].includes(check.status)) errors.push("contentCheck.status must be complete|partial|unreadable");
  if (!["none", "analyzed", "partially-readable", "unreadable"].includes(check.diagramStatus)) errors.push("contentCheck.diagramStatus invalid");
  const cropIssue = check.cropIssue ?? "none";
  if (!CROP_ISSUES.includes(cropIssue)) errors.push(`contentCheck.cropIssue invalid: ${cropIssue}`);
  else if (!["none", "no-crop"].includes(cropIssue)) flags.add(`crop-issue:${cropIssue}`);
  if (content.readiness.status === "needs-visual-check" && check.sawImage !== true) errors.push(`visual check required (${content.readiness.reasons.join(", ")}) but sawImage is not true`);
  if (result.answerKeyUsed) errors.push("answerKeyUsed=true but no verified answer key exists in ChemAtlas; answer keys must not be invented");
  const complete = check.status === "complete";
  const skills = new Set(taxonomy.skills.map(s => s.id));
  const knownParts = new Map(content.parts.map(p => [p.partId, p]));
  const seenParts = new Set();
  const conceptHashes = {};
  const parts = [];
  for (const raw of result.parts ?? []) {
    let known = knownParts.get(raw.partId);
    if (!known) {
      const parent = content.parts.find(p => p.cover && partCovered(raw.partId, p.cover));
      if (parent) { known = { partId: raw.partId, label: raw.label ?? raw.partId }; warnings.push(`part ${raw.partId} refines catalog part ${parent.label}`); flags.add("part-refined"); }
      else { errors.push(`part ${raw.partId} does not resolve to a catalog part (${content.parts.map(p => p.label).join(", ")})`); continue; }
    }
    if (seenParts.has(raw.partId)) { errors.push(`duplicate part ${raw.partId}`); continue; }
    seenParts.add(raw.partId);
    const part = { partId: raw.partId, label: raw.label ?? known.label, primary: [], supporting: [], contextual: [], actions: [], representations: [], skills: [] };
    const used = new Set();
    for (const role of ROLES) for (const a of raw[role] ?? []) {
      let id = a.conceptId;
      if (!resolver.concepts.has(id)) {
        const r = resolver.resolve(id ?? "");
        if (r) { warnings.push(`part ${raw.partId}: "${id}" normalized to ${r}`); id = r; } else { errors.push(`part ${raw.partId}: unknown concept "${id}"`); continue; }
      }
      if (used.has(id)) { errors.push(`part ${raw.partId}: concept ${id} assigned twice`); continue; }
      used.add(id);
      if (role !== "contextual" && !(typeof a.evidence === "string" && a.evidence.trim().length >= 12)) errors.push(`part ${raw.partId}: ${id} needs a specific evidence sentence`);
      const concept = resolver.concepts.get(id);
      if (concept.scope === "beyond-ap" && role !== "contextual") flags.add("beyond-ap-content");
      if (role !== "contextual") conceptHashes[id] = concept.hash;
      part[role].push({ conceptId: id, evidence: (a.evidence ?? "").trim() });
    }
    for (const x of raw.actions ?? []) ACTIONS.includes(x) ? part.actions.push(x) : errors.push(`part ${raw.partId}: unknown action ${x}`);
    for (const x of raw.representations ?? []) REPRESENTATIONS.includes(x) ? part.representations.push(x) : errors.push(`part ${raw.partId}: unknown representation ${x}`);
    for (const x of raw.skills ?? []) skills.has(x) ? part.skills.push(x) : errors.push(`part ${raw.partId}: unknown skill ${x}`);
    if (complete && !part.primary.length) errors.push(`part ${raw.partId}: no primary concept`);
    if (part.primary.length > 2) { warnings.push(`part ${raw.partId}: ${part.primary.length} primary concepts`); flags.add("many-primary"); }
    for (const [a, b] of excludeConflicts([...part.primary, ...part.supporting].map(x => x.conceptId), resolver.concepts)) { warnings.push(`part ${raw.partId}: ${a} with ${b}; ${a}'s exclude rule points to ${b}, check both are needed`); flags.add("exclude-rule-check"); }
    parts.push(part);
  }
  if (complete) for (const cp of content.parts) if (!seenParts.has(cp.partId) && !(cp.cover && [...seenParts].some(id => partCovered(id, cp.cover)))) errors.push(`catalog part ${cp.partId} (${cp.label}) was not classified`);
  const topics = result.officialTopics ?? {};
  for (const t of [topics.primary, ...(topics.additional ?? [])].filter(Boolean)) if (!topicIds.has(t)) errors.push(`unknown official topic ${t}`);
  // Legacy content outside the current CED has no honest topic; allow null only when every primary concept is beyond-AP.
  const onlyBeyond = parts.length > 0 && parts.every(p => p.primary.every(a => resolver.concepts.get(a.conceptId).scope === "beyond-ap"));
  if (complete && !topics.primary && !onlyBeyond) errors.push("officialTopics.primary required");
  if (result.needsAttention) flags.add("classifier-requested-review");
  if (content.readiness.reasons.includes("source-is-answer-or-scoring-page")) flags.add("source-not-clean-question-page");
  if (topics.primary && content.catalogTopics.primary && topics.primary !== content.catalogTopics.primary) flags.add("topic-differs-from-catalog");
  const reviewStatus = !complete ? "blocked" : flags.has("classifier-requested-review") || flags.has("many-primary") ? "needs_attention" : "machine_generated";
  const record = {
    questionId: content.questionId, type: content.type, contentHash: content.contentHash,
    taxonomyVersion: taxonomy.taxonomyVersion, taxonomyHash: taxonomy.taxonomyHash, conceptHashes, promptVersion, method, createdAt: now,
    contentStatus: check.status, diagramStatus: check.diagramStatus, cropIssue, sawImage: check.sawImage === true, contentNotes: check.notes ?? "",
    readiness: content.readiness, officialTopics: { primary: topics.primary ?? null, additional: topics.additional ?? [] },
    parts: complete ? parts : [], aggregate: complete ? aggregate(parts) : null,
    uncertainty: result.uncertainty ?? "", reviewStatus, flags: [...flags], validation: { warnings },
  };
  return { record: errors.length ? null : record, errors, warnings };
}

export function aggregate(parts) {
  const primary = [...new Set(parts.flatMap(p => p.primary.map(a => a.conceptId)))];
  const supporting = [...new Set(parts.flatMap(p => p.supporting.map(a => a.conceptId)))].filter(id => !primary.includes(id));
  const contextual = [...new Set(parts.flatMap(p => p.contextual.map(a => a.conceptId)))].filter(id => !primary.includes(id) && !supporting.includes(id));
  return { primary, supporting, contextual, actions: [...new Set(parts.flatMap(p => p.actions))], representations: [...new Set(parts.flatMap(p => p.representations))] };
}

export const emptyStore = () => ({ schemaVersion: 1, records: {} });

// Writes a new current record; the previous one moves to history. Human-verified records are only replaced with force.
export function upsertRecord(store, record, { force = false } = {}) {
  const entry = store.records[record.questionId] ?? { current: null, history: [] };
  const cur = entry.current;
  if (cur?.reviewStatus === "human_verified" && !force) return { written: false, reason: "human-verified record kept" };
  if (cur) entry.history.push({ event: "superseded", at: record.createdAt, record: cur });
  entry.current = record;
  store.records[record.questionId] = entry;
  return { written: true };
}

export function applyReview(store, questionId, { decision, reviewer, notes = "", parts, now = new Date().toISOString() }) {
  const entry = store.records[questionId];
  if (!entry?.current) throw new Error(`no classification for ${questionId}`);
  const cur = entry.current;
  const to = { approve: "human_verified", reject: "rejected", flag: "needs_attention", "machine-agree": "machine_reviewed" }[decision];
  if (decision === "edit") {
    if (!reviewer) throw new Error("edits need a reviewer");
    for (const p of parts) {
      if (!p.primary?.length) throw new Error(`${questionId} part ${p.partId}: an edit must keep at least one primary concept`);
      const ids = ["primary", "supporting", "contextual"].flatMap(r => (p[r] ?? []).map(a => a.conceptId));
      const dup = ids.find((id, i) => ids.indexOf(id) !== i);
      if (dup) throw new Error(`${questionId} part ${p.partId}: ${dup} is in more than one role`);
    }
    // Keep label/actions/representations from the machine record when the reviewer only changed tags.
    const prior = new Map(cur.parts.map(p => [p.partId, p]));
    parts = parts.map(p => ({ ...prior.get(p.partId), ...p, label: p.label ?? prior.get(p.partId)?.label ?? p.partId, actions: p.actions?.length ? p.actions : prior.get(p.partId)?.actions ?? [], representations: p.representations?.length ? p.representations : prior.get(p.partId)?.representations ?? [] }));
    const edited = { ...cur, parts, aggregate: aggregate(parts), method: { engine: "human-edit", reviewer, basedOn: cur.method }, createdAt: now, reviewStatus: "human_verified" };
    entry.history.push({ event: "edited", at: now, reviewer, notes, record: cur });
    entry.current = edited;
    return edited;
  }
  if (!to) throw new Error(`unknown decision ${decision}`);
  if (!canTransition(cur.reviewStatus, to)) throw new Error(`cannot move ${questionId} from ${cur.reviewStatus} to ${to}`);
  if (to === "human_verified" && !reviewer) throw new Error("human verification needs a reviewer name");
  entry.history.push({ event: "review", at: now, reviewer: reviewer ?? null, from: cur.reviewStatus, to, notes });
  entry.current = { ...cur, reviewStatus: to };
  return entry.current;
}

// Why a record no longer matches its question or taxonomy. Empty array = still valid.
export function staleness(record, content, taxonomy) {
  const reasons = [];
  if (content && record.contentHash !== content.contentHash) reasons.push("content-changed");
  if (taxonomy) {
    const byId = new Map(taxonomy.concepts.map(c => [c.id, c]));
    for (const [id, hash] of Object.entries(record.conceptHashes ?? {})) {
      if (!byId.has(id)) reasons.push(`concept-removed:${id}`);
      else if (byId.get(id).hash !== hash) reasons.push(`concept-changed:${id}`);
    }
  }
  return reasons;
}

// Records a reviewer's convention choices in research/concepts/conventions.json. Only a named human can decide one.
export function applyConventionDecisions(doc, choices, { reviewer, now = new Date().toISOString() }) {
  if (!reviewer) throw new Error("convention decisions need a reviewer name");
  const byId = new Map(doc.conventions.map(c => [c.id, c]));
  for (const { id, decision, notes = "" } of choices) {
    const c = byId.get(id);
    if (!c) throw new Error(`unknown convention ${id}`);
    if (!Object.hasOwn(c.options, decision)) throw new Error(`convention ${id}: unknown option ${decision}`);
    if (c.status === "decided") (c.history ??= []).push({ decision: c.decision, decidedBy: c.decidedBy, decidedAt: c.decidedAt, notes: c.notes ?? "" });
    Object.assign(c, { status: "decided", decision, decidedBy: reviewer, decidedAt: now, notes });
  }
  return doc;
}

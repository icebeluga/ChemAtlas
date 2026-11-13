/** @typedef {"desk" | "unit" | "library" | "builder" | "detail" | "practice" | "progress" | "review" | "banks" | "audit"} ChemAtlasView */
/** @typedef {{ view: ChemAtlasView; unit: string; topic: string; type: "MCQ" | "FRQ" | "Mixed"; query: string; questionId: string; sessionIds: string[]; step: number }} ChemAtlasLocation */

const views = new Set(["desk", "unit", "library", "builder", "detail", "practice", "progress", "review", "banks", "audit"]);

/**
 * Read ChemAtlas's shareable route and filter state from a location search string.
 * @param {string} search
 * @returns {ChemAtlasLocation}
 */
export function parseChemAtlasLocation(search) {
  const params = new URLSearchParams(search);
  const requestedView = params.get("view");
  const view = requestedView && views.has(requestedView) ? requestedView : "desk";
  const type = params.get("type");
  const unit = params.get("unit") || "";
  const topic = params.get("topic") || "";
  const step = Number(params.get("step"));
  const sessionIds = (params.get("session") || "").split(",").filter(Boolean).slice(0, 30);

  return {
    view,
    unit: /^u[1-9]$/.test(unit) ? unit : "all",
    topic: /^\d+\.\d+$/.test(topic) ? topic : "all",
    type: type === "MCQ" || type === "FRQ" ? type : "Mixed",
    query: params.get("q") || "",
    questionId: params.get("question") || "",
    sessionIds,
    step: Number.isInteger(step) && step >= 0 ? Math.min(step, 29) : 0,
  };
}

/**
 * Build the same-origin URL for a route transition or filter update.
 * @param {string} currentUrl
 * @param {ChemAtlasView} view
 * @param {{ unit?: string | null; topic?: string | null; type?: string | null; query?: string | null; questionId?: string | null; sessionIds?: string[] | null; step?: number | null }} [updates]
 */
export function buildChemAtlasUrl(currentUrl, view, updates = {}) {
  const url = new URL(currentUrl);
  const params = url.searchParams;

  if (view === "desk") params.delete("view");
  else params.set("view", view);

  if (view === "desk") {
    for (const key of ["unit", "topic", "type", "q", "question", "session", "step"]) params.delete(key);
  } else {
    const filterValues = { unit: updates.unit, topic: updates.topic, type: updates.type, q: updates.query };
    for (const [key, value] of Object.entries(filterValues)) {
      if (value === undefined) continue;
      const normalized = value === "all" || value === "Mixed" ? "" : value;
      if (normalized) params.set(key, normalized);
      else params.delete(key);
    }

    if (view === "detail" || view === "practice") {
      if (updates.questionId === null) params.delete("question");
      else if (updates.questionId !== undefined) params.set("question", updates.questionId);
    } else params.delete("question");

    if (view === "practice") {
      if (updates.sessionIds === null) params.delete("session");
      else if (updates.sessionIds !== undefined) {
        if (updates.sessionIds.length) params.set("session", updates.sessionIds.slice(0, 30).join(","));
        else params.delete("session");
      }
      if (updates.step === null) params.delete("step");
      else if (updates.step !== undefined && updates.step > 0) params.set("step", String(Math.min(updates.step, 29)));
      else if (updates.step !== undefined) params.delete("step");
    } else {
      params.delete("session");
      params.delete("step");
    }
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

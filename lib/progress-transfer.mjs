// Versioned, non-executable browser-progress transfer. Do not include personal
// PDF blobs from IndexedDB or the canonical catalog in a progress export.
export const PROGRESS_FORMAT = "chematlas-browser-progress";
export const PROGRESS_VERSION = 1;
const MAX_LENGTH = 2_000_000;
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validCount(n) {
  return Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000;
}
function normalize(snapshot) {
  if (!isRecord(snapshot)) throw new Error("Invalid Blueberry progress data.");
  const { progress, overrides, sessions } = snapshot;
  if (!isRecord(progress) || !isRecord(overrides) || !validCount(sessions)) {
    throw new Error("Invalid progress, topic assignments, or session count.");
  }
  if (Object.keys(progress).length > 20_000 || Object.keys(overrides).length > 20_000) {
    throw new Error("Progress file contains too many records.");
  }
  const safeProgress = Object.create(null);
  for (const [id, attempt] of Object.entries(progress)) {
    if (!id || id.length > 180 || !isRecord(attempt)
      || !validCount(attempt.attempts) || !validCount(attempt.wrong)
      || !validCount(attempt.correct) || typeof attempt.last !== "string"
      || attempt.last.length > 40 || !Array.isArray(attempt.history)
      || attempt.history.length > 20_000) {
      throw new Error("Progress file contains an invalid attempt record.");
    }
    const history = attempt.history.map((event) => {
      if (!isRecord(event) || typeof event.date !== "string" || event.date.length > 40
        || !["correct", "missed", "unsure"].includes(event.result)) {
        throw new Error("Progress file contains an invalid history event.");
      }
      return { date: event.date, result: event.result };
    });
    safeProgress[id] = {
      attempts: attempt.attempts, wrong: attempt.wrong,
      correct: attempt.correct, last: attempt.last, history,
    };
  }
  const safeOverrides = Object.create(null);
  for (const [id, topic] of Object.entries(overrides)) {
    if (!id || id.length > 180 || typeof topic !== "string" || !topic || topic.length > 100) {
      throw new Error("Progress file contains an invalid topic override.");
    }
    safeOverrides[id] = topic;
  }
  return { progress: safeProgress, overrides: safeOverrides, sessions };
}
export function serializeProgress(data) {
  const safe = normalize(data);
  const text = JSON.stringify({
    format: PROGRESS_FORMAT, version: PROGRESS_VERSION,
    exportedAt: new Date().toISOString(), ...safe,
  }, null, 2);
  if (text.length > MAX_LENGTH) throw new Error("Progress export exceeds the 2 MB limit.");
  return text;
}
export function parseProgress(text) {
  if (typeof text !== "string" || text.length > MAX_LENGTH) {
    throw new Error("Progress import rejected: file exceeds the 2 MB limit.");
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Progress import is not valid JSON."); }
  if (!isRecord(data) || data.format !== PROGRESS_FORMAT || data.version !== PROGRESS_VERSION) {
    throw new Error("Unsupported Blueberry progress export format or version.");
  }
  return normalize(data);
}

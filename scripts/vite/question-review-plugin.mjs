import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const statuses = new Set(["not_generated", "pending_review", "accepted", "rejected", "corrected_pending_review", "missing_source"]);

export function questionReviewDevApi() {
  return {
    name: "chematlas-question-review-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (process.env.NODE_ENV !== "development") return next();
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (!pathname.startsWith("/api/admin/question-review")) return next();
        void handleRequest(request, response, pathname).catch((error) => {
          console.error("Question image review API failed", error);
          if (!response.headersSent) response.writeHead(error.statusCode || 500, { "content-type": "application/json" });
          if (!response.writableEnded) response.end(JSON.stringify({ error: error.message || "The local review operation failed." }));
        });
      });
    },
  };
}

function projectPath(...parts) { return path.join(process.cwd(), ...parts); }
function manifestPath() { return process.env.CHEMATLAS_REVIEW_MANIFEST || projectPath("research", "question-image-review.json"); }
function imageRoot(...parts) { return path.join(process.env.CHEMATLAS_REVIEW_IMAGES || projectPath("research", "question-images"), ...parts); }
function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}
async function bodyJson(request, maxBytes = 36 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("Request body is too large."), { statusCode: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function readJson(file) { return JSON.parse(await readFile(file, "utf8")); }
async function readManifest() {
  try { const value = await readJson(manifestPath()); value.stimuli ||= {}; return value; }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { schemaVersion: 1, updatedAt: null, reviews: {}, stimuli: {} };
  }
}
async function getSources() {
  const [catalog, stimulusDoc] = await Promise.all([
    readJson(projectPath("public", "questions.json")),
    readJson(projectPath("research", "stimuli.json")),
  ]);
  return { catalog, questionIds: new Set(catalog.questions.map((question) => question.id)), stimuli: stimulusDoc.stimuli || {} };
}
async function saveManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  const filename = manifestPath();
  const temporary = `${filename}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, filename);
}
async function imageFilesExist(id, review, isStimulus) {
  if (!Array.isArray(review.imagePaths) || !review.imagePaths.length || typeof review.imageRevision !== "string") return false;
  const folder = isStimulus ? `_stimulus-${id}` : id;
  const prefix = `/api/admin/question-review/image/${folder}/`;
  for (const url of review.imagePaths) {
    if (typeof url !== "string" || !url.startsWith(prefix)) return false;
    const filename = url.slice(prefix.length);
    if (!/^[a-zA-Z0-9_-]+-segment-[1-9][0-9]*\.png$/.test(filename)) return false;
    const location = isStimulus
      ? imageRoot("_stimuli", id, filename)
      : imageRoot(id, filename);
    try { await readFile(location); } catch { return false; }
  }
  return true;
}
async function handleRequest(request, response, pathname) {
  const method = request.method || "GET";
  const imageMatch = pathname.match(/^\/api\/admin\/question-review\/image\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+\.png)$/);
  if (imageMatch && method === "GET") {
    const [, folder, filename] = imageMatch;
    const isStimulus = folder.startsWith("_stimulus-");
    const id = isStimulus ? folder.slice("_stimulus-".length) : folder;
    const sources = await getSources();
    if (isStimulus ? !Object.hasOwn(sources.stimuli, id) : !sources.questionIds.has(id)) return response.writeHead(404).end();
    const location = isStimulus
      ? imageRoot("_stimuli", id, filename)
      : imageRoot(id, filename);
    try {
      const bytes = await readFile(location);
      response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store", "content-length": bytes.length });
      return response.end(bytes);
    } catch { return response.writeHead(404).end(); }
  }
  if (pathname !== "/api/admin/question-review") return response.writeHead(404).end();
  if (method === "GET") {
    const [manifest, stimulusDoc] = await Promise.all([readManifest(), readJson(projectPath("research", "stimuli.json"))]);
    return sendJson(response, 200, { manifest, stimuli: stimulusDoc });
  }
  if (method !== "PUT" && method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
  const payload = await bodyJson(request);
  const key = payload.questionId || payload.stimulusId;
  if (typeof key !== "string" || !/^[a-zA-Z0-9_-]+$/.test(key) || (!!payload.questionId === !!payload.stimulusId)) return sendJson(response, 400, { error: "Invalid question or stimulus ID." });
  const sources = await getSources();
  if (payload.questionId && !sources.questionIds.has(key)) return sendJson(response, 404, { error: "Question ID is not in the current catalog." });
  if (payload.stimulusId && !Object.hasOwn(sources.stimuli, key)) return sendJson(response, 404, { error: "Stimulus ID is not in the source catalog." });

  if (method === "POST") {
    if (typeof payload.revision !== "string" || !/^data:image\/png;base64,/.test(payload.dataUrl || "")) return sendJson(response, 400, { error: "Invalid PNG payload." });
    const bytes = Buffer.from(payload.dataUrl.slice("data:image/png;base64,".length), "base64");
    if (bytes.length < 100 || bytes.length > 25 * 1024 * 1024) return sendJson(response, 413, { error: "PNG must be between 100 bytes and 25 MB." });
    const revision = payload.revision.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    const segment = Number.isInteger(payload.segment) && payload.segment >= 0 ? payload.segment : 0;
    const folder = payload.stimulusId ? `_stimulus-${key}` : key;
    const filename = `${revision}-segment-${segment + 1}.png`;
    const location = payload.stimulusId
      ? imageRoot("_stimuli", key, filename)
      : imageRoot(key, filename);
    await mkdir(path.dirname(location), { recursive: true });
    await writeFile(location, bytes);
    return sendJson(response, 200, { saved: true, path: `/api/admin/question-review/image/${folder}/${filename}`, bytes: bytes.length });
  }

  const review = payload.review;
  if (!review || typeof review.status !== "string" || !statuses.has(review.status)) return sendJson(response, 400, { error: "Invalid review status." });
  if (review.status === "accepted" && !(await imageFilesExist(key, review, !!payload.stimulusId))) return sendJson(response, 409, { error: "An accepted record must reference saved PNG files." });
  if (review.status === "rejected" && (!Array.isArray(review.rejectionReasons) || !review.rejectionReasons.length)) return sendJson(response, 400, { error: "A rejection reason is required." });
  const manifest = await readManifest();
  if (payload.questionId && review.status === "accepted") {
    const question = sources.catalog.questions.find((item) => item.id === key);
    for (const stimulusId of question.stimulusIds || []) {
      const stimulusReview = manifest.stimuli[stimulusId];
      if (!stimulusReview || stimulusReview.status !== "accepted" || !(await imageFilesExist(stimulusId, stimulusReview, true))) return sendJson(response, 409, { error: `Required shared stimulus ${stimulusId} is not accepted.` });
    }
  }
  if (payload.stimulusId) manifest.stimuli[key] = review;
  else manifest.reviews[key] = review;
  await saveManifest(manifest);
  return sendJson(response, 200, { saved: true, updatedAt: manifest.updatedAt });
}

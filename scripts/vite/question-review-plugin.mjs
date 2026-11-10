import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip, gunzipSync } from "node:zlib";

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
function tarHeader(filename, size) {
  const name = Buffer.from(filename, "utf8");
  if (!name.length || name.length > 100) throw new Error("Backup path is too long: " + filename);
  const header = Buffer.alloc(512);
  name.copy(header, 0);
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return header;
}
async function* tarEntry(filename, bytes) {
  yield tarHeader(filename, bytes.length);
  if (bytes.length) yield bytes;
  const padding = (512 - (bytes.length % 512)) % 512;
  if (padding) yield Buffer.alloc(padding);
}
async function listPngFiles(root, relative = "") {
  const folder = path.join(root, relative);
  let entries;
  try { entries = await readdir(folder, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) files.push(...await listPngFiles(root, child));
    else if (entry.isFile() && /^[a-zA-Z0-9_-]+-segment-[1-9][0-9]*\.png$/.test(entry.name)) files.push({ relative: child.split(path.sep).join("/"), absolute: path.join(root, child) });
  }
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}
async function* reviewBackupTar(manifest) {
  const imageFiles = await listPngFiles(imageRoot());
  const info = Buffer.from(JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), imageCount: imageFiles.length }, null, 2) + "\n");
  yield* tarEntry("backup-info.json", info);
  yield* tarEntry("question-image-review.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  for (const file of imageFiles) yield* tarEntry("question-images/" + file.relative, await readFile(file.absolute));
  yield Buffer.alloc(1024);
}
function parseTarGzip(bytes) {
  let tar;
  try { tar = gunzipSync(bytes, { maxOutputLength: 1024 * 1024 * 1024 }); }
  catch { throw Object.assign(new Error("Backup is not a valid or supported gzip archive."), { statusCode: 400 }); }
  const files = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    if (header.toString("ascii", 257, 263) !== "ustar\0") throw Object.assign(new Error("Backup contains an unsupported archive entry."), { statusCode: 400 });
    const name = header.toString("utf8", 0, 100).replace(/\0.*$/, "");
    const prefix = header.toString("utf8", 345, 500).replace(/\0.*$/, "");
    const filename = prefix ? prefix + "/" + name : name;
    const type = header[156];
    const sizeText = header.toString("ascii", 124, 136).replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    if (!name || (type !== 0 && type !== 0x30) || !Number.isSafeInteger(size) || size < 0) throw Object.assign(new Error("Backup contains an invalid archive entry."), { statusCode: 400 });
    const allowed = /^(backup-info\.json|question-image-review\.json|question-images\/(?:_stimuli\/[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)\/[a-zA-Z0-9_-]+-segment-[1-9][0-9]*\.png)$/;
    if (!allowed.test(filename)) throw Object.assign(new Error("Backup path is not allowed: " + filename), { statusCode: 400 });
    const start = offset + 512;
    if (start + size > tar.length || files.has(filename)) throw Object.assign(new Error("Backup has a truncated file or duplicate path."), { statusCode: 400 });
    files.set(filename, Buffer.from(tar.subarray(start, start + size)));
    offset = start + Math.ceil(size / 512) * 512;
  }
  if (!files.has("question-image-review.json") || !files.has("backup-info.json")) throw Object.assign(new Error("Backup is missing its review manifest or backup metadata."), { statusCode: 400 });
  return files;
}
async function rawBody(request, maxBytes = 512 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > maxBytes) throw Object.assign(new Error("Backup upload exceeds the 512 MB limit."), { statusCode: 413 }); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function imagePathToArchivePath(url, key, isStimulus) {
  const match = typeof url === "string" && url.match(/^\/api\/admin\/question-review\/image\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+-segment-[1-9][0-9]*\.png)$/);
  if (!match) return null;
  const [, folder, filename] = match;
  if (folder !== (isStimulus ? "_stimulus-" + key : key)) return null;
  return isStimulus ? "question-images/_stimuli/" + key + "/" + filename : "question-images/" + key + "/" + filename;
}
function validateReview(review, files, key, isStimulus) {
  if (!review || !statuses.has(review.status) || !Array.isArray(review.imagePaths) || !Array.isArray(review.rejectionReasons) || !Array.isArray(review.history) || typeof review.notes !== "string") throw Object.assign(new Error("Review record " + key + " has an invalid shape."), { statusCode: 400 });
  for (const imagePath of review.imagePaths) {
    const archivePath = imagePathToArchivePath(imagePath, key, isStimulus);
    const image = archivePath && files.get(archivePath);
    if (!image || image.length < 8 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Object.assign(new Error("Backup is missing a valid PNG for " + key + "."), { statusCode: 400 });
  }
  if (review.status === "rejected" && review.rejectionReasons.length === 0) throw Object.assign(new Error("Rejected record " + key + " is missing its reason."), { statusCode: 400 });
  if (review.status === "accepted" && (!review.imageRevision || !review.sourceRegionsRevision || !review.imagePaths.length)) throw Object.assign(new Error("Accepted record " + key + " is missing revision or image data."), { statusCode: 400 });
  if (review.cropOverrides !== undefined && (!Array.isArray(review.cropOverrides) || review.cropOverrides.some(region => !validRegion(region)))) throw Object.assign(new Error("Crop overrides for " + key + " are invalid."), { statusCode: 400 });
}
function validRegion(region) { return region && Number.isInteger(region.page) && region.page > 0 && Array.isArray(region.rect) && region.rect.length === 4 && region.rect.every(Number.isFinite) && region.rect[0] >= 0 && region.rect[1] >= 0 && region.rect[2] > region.rect[0] && region.rect[3] > region.rect[1] && region.rect[2] <= 1440 && region.rect[3] <= 2000; }
function currentQuestionSignature(question, review, stimuli, stimulusReviews = {}) {
  const regions = review.cropOverrides || question.sourceRegions || [];
  const value = JSON.stringify({ id: question.id, regions, stimuli: (question.stimulusIds || []).map(id => stimulusReviews[id]?.cropOverrides || stimuli[id]?.regions || []) });
  let hash = 2166136261; for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return "r" + (hash >>> 0).toString(16);
}
function currentStimulusSignature(id, stimulus, review = {}) {
  const value = JSON.stringify({ id, sourceDocument: stimulus.sourceDocument, regions: review.cropOverrides || stimulus.regions });
  let hash = 2166136261; for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return "r" + (hash >>> 0).toString(16);
}
async function imageFilesExist(id, review, isStimulus) {
  if (!Array.isArray(review.imagePaths) || !review.imagePaths.length || typeof review.imageRevision !== "string") return false;
  const folder = isStimulus ? `_stimulus-${id}` : id;
  const prefix = `/api/admin/question-review/image/${folder}/`;
  for (let index = 0; index < review.imagePaths.length; index++) {
    const url = review.imagePaths[index];
    if (typeof url !== "string" || !url.startsWith(prefix)) return false;
    const filename = url.slice(prefix.length);
    if (!/^[a-zA-Z0-9_-]+-segment-[1-9][0-9]*\.png$/.test(filename)) return false;
    const revision = review.imageRevision.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (filename !== revision + "-segment-" + (index + 1) + ".png") return false;
    const location = isStimulus
      ? imageRoot("_stimuli", id, filename)
      : imageRoot(id, filename);
    try {
      const bytes = await readFile(location);
      if (bytes.length < 100 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
    } catch { return false; }
  }
  return true;
}
async function handleRequest(request, response, pathname) {
  const method = request.method || "GET";
  const imageMatch = pathname.match(/^\/api\/admin\/question-review\/image\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+\.png)$/);
  if (imageMatch && (method === "GET" || method === "HEAD")) {
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
      return response.end(method === "HEAD" ? undefined : bytes);
    } catch { return response.writeHead(404).end(); }
  }
  if (pathname === "/api/admin/question-review/backup" && method === "GET") {
    const manifest = await readManifest();
    response.writeHead(200, { "content-type": "application/gzip", "content-disposition": 'attachment; filename="chematlas-question-image-review.tar.gz"', "cache-control": "no-store" });
    await pipeline(Readable.from(reviewBackupTar(manifest)), createGzip({ level: 6 }), response);
    return;
  }
  if (pathname === "/api/admin/question-review/backup/import" && method === "POST") {
    const archive = parseTarGzip(await rawBody(request));
    let imported;
    try { imported = JSON.parse(archive.get("question-image-review.json").toString("utf8")); }
    catch { return sendJson(response, 400, { error: "Backup manifest is not valid JSON." }); }
    if (!imported || imported.schemaVersion !== 1 || !imported.reviews || typeof imported.reviews !== "object" || Array.isArray(imported.reviews) || !imported.stimuli || typeof imported.stimuli !== "object" || Array.isArray(imported.stimuli)) return sendJson(response, 400, { error: "Backup manifest has an unsupported schema." });
    const sources = await getSources();
    for (const [id, review] of Object.entries(imported.reviews)) {
      if (!sources.questionIds.has(id)) return sendJson(response, 400, { error: "Backup contains an unknown question ID: " + id });
      validateReview(review, archive, id, false);
      if (review.imagePaths.length > 0 && review.imagePaths.length !== (review.cropOverrides || sources.catalog.questions.find(item => item.id === id).sourceRegions || []).length) return sendJson(response, 400, { error: "Backup has an incomplete question image segment list for " + id + "." });
    }
    for (const [id, review] of Object.entries(imported.stimuli)) {
      if (!Object.hasOwn(sources.stimuli, id)) return sendJson(response, 400, { error: "Backup contains an unknown shared-stimulus ID: " + id });
      validateReview(review, archive, id, true);
      if (review.imagePaths.length > 0 && review.imagePaths.length !== sources.stimuli[id].regions.length) return sendJson(response, 400, { error: "Backup has an incomplete shared-stimulus image segment list for " + id + "." });
    }
    for (const [id, review] of Object.entries(imported.stimuli)) {
      const expected = currentStimulusSignature(id, sources.stimuli[id], review);
      if (review.status === "accepted" && (review.imageRevision !== expected || review.sourceRegionsRevision !== expected)) imported.stimuli[id] = { ...review, status: "corrected_pending_review", reviewedAt: null, history: [...review.history, { revision: review.history.length + 1, at: new Date().toISOString(), status: "corrected_pending_review", regions: sources.stimuli[id].regions, note: "Restored crop metadata differs from the current source; prior approval was cleared." }] };
    }
    for (const [id, review] of Object.entries(imported.reviews)) {
      const question = sources.catalog.questions.find(item => item.id === id);
      const expected = currentQuestionSignature(question, review, sources.stimuli, imported.stimuli);
      if (review.status === "accepted" && (review.imageRevision !== expected || review.sourceRegionsRevision !== expected)) imported.reviews[id] = { ...review, status: "corrected_pending_review", reviewedAt: null, history: [...review.history, { revision: review.history.length + 1, at: new Date().toISOString(), status: "corrected_pending_review", regions: review.cropOverrides || question.sourceRegions || [], note: "Restored crop metadata differs from the current source; prior approval was cleared." }] };
    }
    const imageEntries = [...archive.entries()].filter(([name]) => name.startsWith("question-images/"));
    const staging = imageRoot(".restore-" + randomUUID());
    try {
      for (const [name, bytes] of imageEntries) {
        const relative = name.slice("question-images/".length);
        const target = imageRoot(...relative.split("/"));
        const existing = await readFile(target).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
        if (existing && !existing.equals(bytes)) return sendJson(response, 409, { error: "A different local image already exists at " + name + ". Export it or move it before restoring this backup." });
        const staged = path.join(staging, relative);
        await mkdir(path.dirname(staged), { recursive: true });
        await writeFile(staged, bytes, { flag: "wx" });
      }
      const manifest = await readManifest();
      const next = { ...manifest, reviews: { ...manifest.reviews, ...imported.reviews }, stimuli: { ...manifest.stimuli, ...imported.stimuli } };
      for (const [name] of imageEntries) {
        const relative = name.slice("question-images/".length);
        const staged = path.join(staging, relative);
        const target = imageRoot(...relative.split("/"));
        const existing = await readFile(target).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
        if (existing) continue;
        await mkdir(path.dirname(target), { recursive: true });
        await rename(staged, target);
      }
      await saveManifest(next);
      return sendJson(response, 200, { saved: true, updatedAt: next.updatedAt, importedQuestions: Object.keys(imported.reviews).length, importedStimuli: Object.keys(imported.stimuli).length, manifest: next });
    } finally { await rm(staging, { recursive: true, force: true }); }
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
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return sendJson(response, 400, { error: "Image data does not have a valid PNG signature." });
    const revision = payload.revision.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    const segment = Number.isInteger(payload.segment) && payload.segment >= 0 ? payload.segment : 0;
    const folder = payload.stimulusId ? `_stimulus-${key}` : key;
    const filename = `${revision}-segment-${segment + 1}.png`;
    const location = payload.stimulusId
      ? imageRoot("_stimuli", key, filename)
      : imageRoot(key, filename);
    await mkdir(path.dirname(location), { recursive: true });
    const existing = await readFile(location).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
    if (existing && !existing.equals(bytes)) {
      const manifest = await readManifest();
      const prior = payload.stimulusId ? manifest.stimuli[key] : manifest.reviews[key];
      const pathPrefix = "/api/admin/question-review/image/" + folder + "/";
      if (prior?.status === "accepted" && prior.imagePaths?.includes(pathPrefix + filename)) return sendJson(response, 409, { error: "This PNG revision is already approved and cannot be overwritten. Save a new crop revision first." });
    }
    if (!existing || !existing.equals(bytes)) await writeFile(location, bytes);
    return sendJson(response, 200, { saved: true, path: `/api/admin/question-review/image/${folder}/${filename}`, bytes: bytes.length });
  }

  const review = payload.review;
  if (!review || typeof review.status !== "string" || !statuses.has(review.status)) return sendJson(response, 400, { error: "Invalid review status." });
  if (!Array.isArray(review.imagePaths) || !Array.isArray(review.rejectionReasons) || !Array.isArray(review.history) || typeof review.notes !== "string") return sendJson(response, 400, { error: "Review record is incomplete or malformed." });
  if (review.cropOverrides !== undefined && (!Array.isArray(review.cropOverrides) || review.cropOverrides.some((region) => !validRegion(region)))) return sendJson(response, 400, { error: "Crop override contains an invalid source-page rectangle." });
  const manifest = await readManifest();
  if (review.status === "accepted") {
    const expected = payload.stimulusId ? currentStimulusSignature(key, sources.stimuli[key], review) : currentQuestionSignature(sources.catalog.questions.find(item => item.id === key), review, sources.stimuli, manifest.stimuli);
    if (review.imageRevision !== expected || review.sourceRegionsRevision !== expected) return sendJson(response, 409, { error: "The approved image revision does not match the current source crop." });
    const regionCount = payload.stimulusId ? sources.stimuli[key].regions.length : (review.cropOverrides || sources.catalog.questions.find(item => item.id === key).sourceRegions || []).length;
    if (!Array.isArray(review.imagePaths) || review.imagePaths.length !== regionCount || !(await imageFilesExist(key, review, !!payload.stimulusId))) return sendJson(response, 409, { error: "An accepted record must reference every saved PNG segment." });
  }
  if (review.status === "rejected") {
    const expected = payload.stimulusId ? currentStimulusSignature(key, sources.stimuli[key], review) : currentQuestionSignature(sources.catalog.questions.find(item => item.id === key), review, sources.stimuli, manifest.stimuli);
    if (review.imageRevision !== expected || review.sourceRegionsRevision !== expected || !(await imageFilesExist(key, review, !!payload.stimulusId))) return sendJson(response, 409, { error: "Save the current PNG revision before rejecting it." });
  }
  if (review.status === "rejected" && (!Array.isArray(review.rejectionReasons) || !review.rejectionReasons.length)) return sendJson(response, 400, { error: "A rejection reason is required." });
  if (payload.questionId && review.status === "accepted") {
    const question = sources.catalog.questions.find((item) => item.id === key);
    for (const stimulusId of question.stimulusIds || []) {
      const stimulusReview = manifest.stimuli[stimulusId];
      const stimulus = sources.stimuli[stimulusId];
      const expectedStimulusRevision = stimulus && currentStimulusSignature(stimulusId, stimulus, stimulusReview);
      if (!stimulusReview || stimulusReview.status !== "accepted" || stimulusReview.imageRevision !== expectedStimulusRevision || stimulusReview.sourceRegionsRevision !== expectedStimulusRevision || !(await imageFilesExist(stimulusId, stimulusReview, true))) return sendJson(response, 409, { error: `Required shared stimulus ${stimulusId} is not accepted at its current revision.` });
    }
  }
  const invalidatedQuestions = [];
  const invalidatedReviews = {};
  if (payload.stimulusId) {
    manifest.stimuli[key] = review;
    if (review.status !== "accepted") {
      for (const question of sources.catalog.questions.filter((item) => item.stimulusIds?.includes(key))) {
        const previous = manifest.reviews[question.id];
        if (previous?.status !== "accepted") continue;
        manifest.reviews[question.id] = { ...previous, status: "corrected_pending_review", reviewedAt: null, history: [...previous.history, { revision: previous.history.length + 1, at: new Date().toISOString(), status: "corrected_pending_review", regions: previous.cropOverrides || question.sourceRegions || [], note: `Approval cleared because required shared stimulus ${key} is no longer accepted.` }] };
        invalidatedQuestions.push(question.id);
        invalidatedReviews[question.id] = manifest.reviews[question.id];
      }
    }
  } else manifest.reviews[key] = review;
  await saveManifest(manifest);
  return sendJson(response, 200, { saved: true, updatedAt: manifest.updatedAt, invalidatedQuestions, invalidatedReviews });
}

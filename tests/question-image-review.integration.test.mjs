import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { Readable, Writable } from "node:stream";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { questionReviewDevApi } from "../scripts/vite/question-review-plugin.mjs";

process.env.NODE_ENV = "development";
let middleware;
let tempRoot;
const originals = { manifest: process.env.CHEMATLAS_REVIEW_MANIFEST, images: process.env.CHEMATLAS_REVIEW_IMAGES };
questionReviewDevApi().configureServer({ middlewares: { use(fn) { middleware = fn; } } });

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "chematlas-question-review-"));
  process.env.CHEMATLAS_REVIEW_MANIFEST = path.join(tempRoot, "manifest.json");
  process.env.CHEMATLAS_REVIEW_IMAGES = path.join(tempRoot, "images");
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
  if (originals.manifest === undefined) delete process.env.CHEMATLAS_REVIEW_MANIFEST; else process.env.CHEMATLAS_REVIEW_MANIFEST = originals.manifest;
  if (originals.images === undefined) delete process.env.CHEMATLAS_REVIEW_IMAGES; else process.env.CHEMATLAS_REVIEW_IMAGES = originals.images;
});

function pngFixture() {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = buffer => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (name, data) => { const tag = Buffer.from(name); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tag, data]))); return Buffer.concat([length, tag, data, crc]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(12, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 48 }, (_, i) => [30, 100, 70, 255][i % 4]))]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("tEXt", Buffer.from("purpose\0isolated-api-test-png")), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
const pngBytes = pngFixture();
const dataUrl = "data:image/png;base64," + pngBytes.toString("base64");
class TestResponse extends Writable {
  constructor() { super(); this.chunks = []; this.headers = {}; this.statusCode = 200; this.headersSent = false; }
  writeHead(status, headers = {}) { this.statusCode = status; Object.assign(this.headers, headers); this.headersSent = true; return this; }
  _write(chunk, encoding, callback) { this.chunks.push(Buffer.from(chunk)); callback(); }
  get body() { return Buffer.concat(this.chunks); }
}
async function call(url, method = "GET", body) {
  const requestBody = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const request = Readable.from(requestBody.length ? [requestBody] : []);
  request.url = url; request.method = method; request.headers = {};
  const response = new TestResponse();
  const finished = new Promise((resolve, reject) => { response.once("finish", resolve); response.once("error", reject); });
  middleware(request, response, () => { response.writeHead(404); response.end(); });
  await finished;
  const isJson = String(response.headers["content-type"] || "").includes("json");
  return { status: response.statusCode, headers: response.headers, body: isJson ? JSON.parse(response.body.toString("utf8")) : response.body };
}
async function catalog() { return JSON.parse(await readFile(new URL("../public/questions.json", import.meta.url), "utf8")); }
async function stimulusData() { return JSON.parse(await readFile(new URL("../research/stimuli.json", import.meta.url), "utf8")); }
function signature(question, regions, stimuli, stimulusReviews = {}) {
  const value = JSON.stringify({ id: question.id, regions, stimuli: (question.stimulusIds || []).map(id => stimulusReviews[id]?.cropOverrides || stimuli[id]?.regions || []) });
  let hash = 2166136261; for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return "r" + (hash >>> 0).toString(16);
}
function stimulusSignature(id, stimulus, review) {
  const value = JSON.stringify({ id, sourceDocument: stimulus.sourceDocument, regions: review?.cropOverrides || stimulus.regions });
  let hash = 2166136261; for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return "r" + (hash >>> 0).toString(16);
}
function review(status, revision, paths, extras = {}) {
  return { status, imageRevision: revision, sourceRegionsRevision: revision, imagePaths: paths, reviewedAt: status === "accepted" || status === "rejected" ? new Date().toISOString() : null, rejectionReasons: status === "rejected" ? ["Poor image quality"] : [], notes: "test", history: [], ...extras };
}
async function saveImage(owner, revision, segment = 0, imageData = dataUrl) {
  const result = await call("/api/admin/question-review", "POST", { ...owner, revision, segment, dataUrl: imageData });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.path;
}
async function saveRecord(owner, value) { return call("/api/admin/question-review", "PUT", { ...owner, review: value }); }

test("saved image revisions persist and crop changes invalidate an approval", async () => {
  const data = await catalog();
  const question = data.questions.find(item => item.type === "FRQ" && item.sourceRegions?.length);
  assert.ok(question);
  const regions = question.sourceRegions;
  const revision = signature(question, regions, {});
  const imagePath = await saveImage({ questionId: question.id }, revision);
  const pending = review("pending_review", revision, [imagePath]);
  assert.equal((await saveRecord({ questionId: question.id }, pending)).status, 200);
  const approved = review("accepted", revision, [imagePath]);
  assert.equal((await saveRecord({ questionId: question.id }, approved)).status, 200);
  let state = await call("/api/admin/question-review");
  assert.equal(state.body.manifest.reviews[question.id].status, "accepted");
  assert.deepEqual(state.body.approvedImages[question.id], [imagePath]);
  const image = await call(imagePath);
  assert.equal(image.status, 200);
  assert.deepEqual(image.body.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const changedRegions = regions.map(region => ({ ...region, rect: [...region.rect] }));
  changedRegions[0].rect[2] -= 1;
  const correctedRevision = signature(question, changedRegions, {});
  const correction = review("corrected_pending_review", correctedRevision, [], { cropOverrides: changedRegions, reviewedAt: null });
  assert.equal((await saveRecord({ questionId: question.id }, correction)).status, 200);
  const correctedImage = await saveImage({ questionId: question.id }, correctedRevision);
  assert.equal((await saveRecord({ questionId: question.id }, review("corrected_pending_review", correctedRevision, [correctedImage], { cropOverrides: changedRegions, reviewedAt: null }))).status, 200);
  state = await call("/api/admin/question-review");
  assert.equal(state.body.manifest.reviews[question.id].status, "corrected_pending_review");
  assert.equal(state.body.manifest.reviews[question.id].imageRevision, correctedRevision);
  assert.equal(state.body.approvedImages[question.id], undefined, "corrected images must disappear from the approved catalog until accepted again");
});

test("shared-stimulus MCQs cannot be accepted until each linked stimulus is accepted", async () => {
  const data = await catalog(); const stimulusDoc = await stimulusData();
  const question = data.questions.find(item => item.type === "MCQ" && item.stimulusIds?.length);
  assert.ok(question, "catalog should contain a linked shared-stimulus MCQ");
  const id = question.stimulusIds[0]; const stimulus = stimulusDoc.stimuli[id];
  assert.ok(stimulus);
  const qRevision = signature(question, question.sourceRegions, stimulusDoc.stimuli);
  const qImage = await saveImage({ questionId: question.id }, qRevision);
  assert.equal((await saveRecord({ questionId: question.id }, review("pending_review", qRevision, [qImage]))).status, 200);
  assert.equal((await saveRecord({ questionId: question.id }, review("accepted", qRevision, [qImage]))).status, 409);
  const sRevision = stimulusSignature(id, stimulus); const sImage = await saveImage({ stimulusId: id }, sRevision);
  assert.equal((await saveRecord({ stimulusId: id }, review("pending_review", sRevision, [sImage]))).status, 200);
  assert.equal((await saveRecord({ stimulusId: id }, review("accepted", sRevision, [sImage]))).status, 200);
  assert.equal((await saveRecord({ questionId: question.id }, review("accepted", qRevision, [qImage]))).status, 200);
  assert.deepEqual((await call("/api/admin/question-review")).body.approvedImages[question.id], [sImage, qImage], "the student catalog receives the approved stimulus before its dependent question image");
});

test("correcting a shared stimulus invalidates approvals of dependent MCQs", async () => {
  const data = await catalog(); const stimulusDoc = await stimulusData();
  const question = data.questions.find(item => item.type === "MCQ" && item.stimulusIds?.length);
  const id = question.stimulusIds[0]; const stimulus = stimulusDoc.stimuli[id];
  const qRevision = signature(question, question.sourceRegions, stimulusDoc.stimuli);
  const qImage = await saveImage({ questionId: question.id }, qRevision);
  await saveRecord({ questionId: question.id }, review("pending_review", qRevision, [qImage]));
  const sRevision = stimulusSignature(id, stimulus);
  const sImage = await saveImage({ stimulusId: id }, sRevision);
  await saveRecord({ stimulusId: id }, review("pending_review", sRevision, [sImage]));
  assert.equal((await saveRecord({ stimulusId: id }, review("accepted", sRevision, [sImage]))).status, 200);
  assert.equal((await saveRecord({ questionId: question.id }, review("accepted", qRevision, [qImage]))).status, 200);

  const editedRegions = stimulus.regions.map(region => ({ ...region, rect: [...region.rect] }));
  editedRegions[0].rect[2] -= 1;
  const corrected = { ...review("corrected_pending_review", null, [], { cropOverrides: editedRegions, sourceRegionsRevision: null }), imageRevision: null, sourceRegionsRevision: null, reviewedAt: null };
  const saved = await call("/api/admin/question-review", "PUT", { stimulusId: id, review: corrected });
  assert.equal(saved.status, 200);
  assert.ok(saved.body.invalidatedQuestions.includes(question.id));
  const state = await call("/api/admin/question-review");
  assert.equal(state.body.manifest.stimuli[id].status, "corrected_pending_review");
  assert.equal(state.body.manifest.reviews[question.id].status, "corrected_pending_review");
});

test("rejection reasons and catalog IDs are validated", async () => {
  const data = await catalog(); const question = data.questions.find(item => item.type === "MCQ" && !item.stimulusIds?.length);
  const revision = signature(question, question.sourceRegions, {}); const image = await saveImage({ questionId: question.id }, revision);
  const invalid = review("rejected", revision, [image], { rejectionReasons: [] });
  assert.equal((await saveRecord({ questionId: question.id }, invalid)).status, 400);
  assert.equal((await saveRecord({ questionId: "not-a-real-question" }, invalid)).status, 404);
  assert.equal((await saveRecord({ questionId: question.id }, review("rejected", revision, [image]))).status, 200);
});

test("invalid PNG bytes are rejected before they can be attached to a review record", async () => {
  const question = (await catalog()).questions.find(item => item.type === "MCQ" && item.sourceRegions?.length);
  const result = await call("/api/admin/question-review", "POST", { questionId: question.id, revision: "r-invalid", segment: 0, dataUrl: "data:image/png;base64," + Buffer.alloc(120, 7).toString("base64") });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /PNG signature/);
});

test("review endpoints do not run outside the Vite development environment", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const result = await call("/api/admin/question-review");
    assert.equal(result.status, 404);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test("review backup exports, restores manifest and PNGs, and refuses conflicting overwrites", async () => {
  const data = await catalog(); const question = data.questions.find(item => item.type === "MCQ" && !item.stimulusIds?.length);
  const revision = signature(question, question.sourceRegions, {}); const imagePath = await saveImage({ questionId: question.id }, revision);
  const accepted = review("accepted", revision, [imagePath]);
  assert.equal((await saveRecord({ questionId: question.id }, accepted)).status, 200);
  const backup = await call("/api/admin/question-review/backup");
  assert.equal(backup.status, 200); assert.match(backup.headers["content-type"], /gzip/);
  const secondRoot = await mkdtemp(path.join(tmpdir(), "chematlas-question-review-restore-"));
  const priorManifest = process.env.CHEMATLAS_REVIEW_MANIFEST; const priorImages = process.env.CHEMATLAS_REVIEW_IMAGES;
  try {
    process.env.CHEMATLAS_REVIEW_MANIFEST = path.join(secondRoot, "manifest.json"); process.env.CHEMATLAS_REVIEW_IMAGES = path.join(secondRoot, "images");
    const restored = await call("/api/admin/question-review/backup/import", "POST", backup.body);
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.importedQuestions, 1);
    const state = await call("/api/admin/question-review");
    assert.equal(state.body.manifest.reviews[question.id].status, "accepted");
    const restoredImage = await call(imagePath);
    assert.equal(restoredImage.status, 200); assert.deepEqual(restoredImage.body, pngBytes);
    const target = path.join(secondRoot, "images", question.id, path.basename(imagePath));
    await writeFile(target, Buffer.from("conflicting local asset"));
    assert.equal((await call("/api/admin/question-review/backup/import", "POST", backup.body)).status, 409);
    assert.equal((await call("/api/admin/question-review")).body.manifest.reviews[question.id].status, "accepted");
  } finally {
    if (priorManifest === undefined) delete process.env.CHEMATLAS_REVIEW_MANIFEST; else process.env.CHEMATLAS_REVIEW_MANIFEST = priorManifest;
    if (priorImages === undefined) delete process.env.CHEMATLAS_REVIEW_IMAGES; else process.env.CHEMATLAS_REVIEW_IMAGES = priorImages;
    await rm(secondRoot, { recursive: true, force: true });
  }
});

test("multi-page FRQs retain ordered page regions and source mappings", async () => {
  const data = await catalog();
  const multiPage = data.questions.filter(question => question.type === "FRQ" && new Set((question.sourceRegions || []).map(region => region.page)).size > 1);
  assert.ok(multiPage.length > 0);
  for (const question of multiPage) {
    const pages = question.sourceRegions.map(region => region.page);
    assert.deepEqual(pages, [...pages].sort((a, b) => a - b));
    for (const page of pages) assert.ok(data.sourceFiles.some(file => page >= file.from && page <= file.to));
  }
});

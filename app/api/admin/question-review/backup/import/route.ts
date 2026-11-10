/* eslint-disable @typescript-eslint/no-explicit-any -- Cloudflare bindings and imported JSON archives are validated at this route boundary. */
import { env } from "cloudflare:workers";
import { authenticateReviewRequest } from "@/lib/cloudflare-access.mjs";
import { createD1ReviewStore, createR2ImageStore, sha256Hex } from "@/lib/question-review-storage.mjs";
import { canonicalStimulusLinks as makeCanonicalStimulusLinks, verifyBackupImageManifest } from "@/lib/question-review-backup.mjs";
import stimulusDocument from "@/research/stimuli.json";
import questionCatalog from "@/public/questions.json";

export const runtime = "edge";
const MAX_IMPORT_BYTES = 48 * 1024 * 1024;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const cloudEnv = () => env as unknown as Record<string, any>;
function validRegion(region: any) {
  return !!region && Number.isInteger(region.page) && region.page > 0 && Array.isArray(region.rect) && region.rect.length === 4 && region.rect.every(Number.isFinite) && region.rect[0] >= 0 && region.rect[1] >= 0 && region.rect[2] > region.rect[0] && region.rect[3] > region.rect[1] && region.rect[2] <= 1440 && region.rect[3] <= 2000;
}
const canonicalStimulusLinks = makeCanonicalStimulusLinks((stimulusDocument as any).stimuli || {});
const canonicalQuestionIds = new Set((questionCatalog as any).questions.map((question: any) => question.id));
const canonicalStimulusIds = new Set(Object.keys((stimulusDocument as any).stimuli || {}));

async function readLimited(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > MAX_IMPORT_BYTES) throw Object.assign(new Error("Review backup import is limited to 48 MiB in the Worker. For larger archives, use the documented batch restore workflow."), { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("Backup archive is empty."), { status: 400 });
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > MAX_IMPORT_BYTES) { await reader.cancel(); throw Object.assign(new Error("Review backup import is limited to 48 MiB in the Worker."), { status: 413 }); }
    chunks.push(value);
  }
  const input = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.byteLength; }
  const decompressed = new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream("gzip")));
  const raw = new Uint8Array(await decompressed.arrayBuffer());
  if (raw.byteLength > MAX_IMPORT_BYTES) throw Object.assign(new Error("Decompressed review backup exceeds the 48 MiB Worker restore limit."), { status: 413 });
  return raw;
}

function parseTar(bytes: Uint8Array) {
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder(); let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    if (decoder.decode(header.subarray(257, 263)) !== "ustar\0") throw Object.assign(new Error("Unsupported or invalid tar entry."), { status: 400 });
    const name = decoder.decode(header.subarray(0, 100)).split("\0")[0];
    const prefix = decoder.decode(header.subarray(345, 500)).split("\0")[0];
    const filename = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(decoder.decode(header.subarray(124, 136)).split("\0")[0].trim() || "0", 8);
    if (!name || (header[156] !== 0 && header[156] !== 48) || !Number.isSafeInteger(size) || size < 0) throw Object.assign(new Error("Tar file metadata is invalid."), { status: 400 });
    const start = offset + 512, end = start + size;
    if (end > bytes.length || files.has(filename)) throw Object.assign(new Error("Tar is truncated or contains duplicate paths."), { status: 400 });
    if (!/^(backup-info\.json|question-image-review\.json|question-images\/(?:_stimuli\/[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)\/[a-zA-Z0-9_-]+-segment-[1-9][0-9]*\.png)$/.test(filename)) throw Object.assign(new Error("Backup contains a disallowed path."), { status: 400 });
    files.set(filename, bytes.slice(start, end));
    offset = start + Math.ceil(size / 512) * 512;
  }
  if (!files.has("backup-info.json") || !files.has("question-image-review.json")) throw Object.assign(new Error("Backup is missing its manifest."), { status: 400 });
  return files;
}

export async function POST(request: Request) {
  const auth = await authenticateReviewRequest(request, cloudEnv());
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let files: Map<string, Uint8Array>;
  try { files = parseTar(await readLimited(request)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Backup import failed." }, (error as any)?.status || 400); }
  let imported: any;
  try { imported = JSON.parse(new TextDecoder().decode(files.get("question-image-review.json"))); }
  catch { return json({ error: "Backup review manifest is not valid JSON." }, 400); }
  if (imported?.schemaVersion !== 1 || !imported.reviews || typeof imported.reviews !== "object" || Array.isArray(imported.reviews) || !imported.stimuli || typeof imported.stimuli !== "object" || Array.isArray(imported.stimuli)) return json({ error: "Backup manifest schema is unsupported." }, 400);
  let backupInfo: any;
  try { backupInfo = JSON.parse(new TextDecoder().decode(files.get("backup-info.json"))); }
  catch { return json({ error: "Backup metadata is invalid JSON." }, 400); }
  const formatVersion = backupInfo.formatVersion || backupInfo.schemaVersion || 1;
  if (![1, 2].includes(formatVersion)) return json({ error: "Backup format version is unsupported." }, 400);
  if (formatVersion === 2) {
    try { await verifyBackupImageManifest(backupInfo, files); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Backup image manifest is invalid." }, 400); }
  }
  const stimulusLinks = backupInfo.stimulusLinks || imported.stimulusLinks || {};
  if (!backupInfo.stimulusLinks && !imported.stimulusLinks && Object.values(imported.reviews).some((review: any) => review?.status === "accepted")) return json({ error: "This backup lacks question-to-stimulus mappings. Re-export it using the current local review API before restoring approvals." }, 400);
  if (!stimulusLinks || typeof stimulusLinks !== "object" || Array.isArray(stimulusLinks) || Object.entries(stimulusLinks).some(([questionId, ids]: [string, any]) => !/^[a-zA-Z0-9_-]{1,160}$/.test(questionId) || !Array.isArray(ids) || ids.some((id: unknown) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)))) return json({ error: "Backup shared-stimulus associations are invalid." }, 400);
  const normalizeLinks = (links: Record<string, string[]>) => JSON.stringify(Object.keys(links).sort().map((questionId) => [questionId, [...links[questionId]].sort()]));
  if (normalizeLinks(stimulusLinks) !== normalizeLinks(canonicalStimulusLinks)) return json({ error: "Backup shared-stimulus associations do not match the current source catalog." }, 400);
  const referenced = [...Object.entries(imported.reviews).map(([id, review]: [string, any]) => ["question", id, review] as const), ...Object.entries(imported.stimuli).map(([id, review]: [string, any]) => ["stimulus", id, review] as const)];
  const recordKeys = new Set(referenced.map(([entityType, entityId]) => `${entityType}|${entityId}`));
  if (formatVersion === 2) {
    if (!Array.isArray(backupInfo.reviewHistory) || !Array.isArray(backupInfo.cropRevisions) || !Array.isArray(backupInfo.recordTimestamps)) return json({ error: "Backup recovery metadata is incomplete." }, 400);
    for (const row of backupInfo.reviewHistory) {
      if (!row || !["question", "stimulus"].includes(row.entityType) || !recordKeys.has(`${row.entityType}|${row.entityId}`) || !Number.isInteger(row.revision) || row.revision < 1 || !row.event || typeof row.event !== "object" || typeof row.createdAt !== "string") return json({ error: "Backup review-history metadata is invalid." }, 400);
    }
    for (const row of backupInfo.cropRevisions) {
      if (!row || !["question", "stimulus"].includes(row.entityType) || !recordKeys.has(`${row.entityType}|${row.entityId}`) || typeof row.revision !== "string" || !Array.isArray(row.regions) || typeof row.createdAt !== "string" || row.regions.some((region: any) => !validRegion(region))) return json({ error: "Backup crop-revision metadata is invalid." }, 400);
    }
    for (const row of backupInfo.recordTimestamps) {
      if (!row || !["question", "stimulus"].includes(row.entityType) || !recordKeys.has(`${row.entityType}|${row.entityId}`) || typeof row.updatedAt !== "string") return json({ error: "Backup record timestamp metadata is invalid." }, 400);
    }
  }
  for (const [entityType, entityId, review] of referenced) {
    if (entityType === "question" ? !canonicalQuestionIds.has(entityId) : !canonicalStimulusIds.has(entityId)) return json({ error: `Backup record ${entityId} is not present in the current source catalog.` }, 400);
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(entityId) || !review || !["not_generated", "pending_review", "accepted", "rejected", "corrected_pending_review", "missing_source"].includes(review.status) || !Array.isArray(review.imagePaths) || !Array.isArray(review.rejectionReasons) || !Array.isArray(review.history) || typeof review.notes !== "string") return json({ error: `Review record ${entityId} is invalid.` }, 400);
    if (review.status === "rejected" && !review.rejectionReasons.length) return json({ error: `Rejected record ${entityId} has no reason.` }, 400);
    if (["accepted", "rejected"].includes(review.status) && (!review.imageRevision || review.imageRevision !== review.sourceRegionsRevision || !review.imagePaths.length)) return json({ error: `Reviewed record ${entityId} is missing its current image revision.` }, 400);
    if (review.cropOverrides !== undefined && (!Array.isArray(review.cropOverrides) || review.cropOverrides.some((region: any) => !region || !Number.isInteger(region.page) || region.page < 1 || !Array.isArray(region.rect) || region.rect.length !== 4 || !region.rect.every(Number.isFinite) || region.rect[0] < 0 || region.rect[1] < 0 || region.rect[2] <= region.rect[0] || region.rect[3] <= region.rect[1] || region.rect[2] > 1440 || region.rect[3] > 2000))) return json({ error: `Crop metadata for ${entityId} is invalid.` }, 400);
    for (const [segment, imagePath] of review.imagePaths.entries()) {
      if (typeof imagePath !== "string") return json({ error: `Image reference for ${entityId} is invalid.` }, 400);
      const filename = `${review.imageRevision}-segment-${segment + 1}.png`;
      const folder = entityType === "stimulus" ? `_stimulus-${entityId}` : entityId;
      const expectedPath = `/api/admin/question-review/image/${folder}/${filename}`;
      const archivePath = entityType === "stimulus" ? `question-images/_stimuli/${entityId}/${filename}` : `question-images/${entityId}/${filename}`;
      if (imagePath !== expectedPath || !files.has(archivePath)) return json({ error: `Backup is missing the current image segment for ${entityId}.` }, 400);
    }
  }
  const runtimeEnv = cloudEnv();
  if (!runtimeEnv.DB || !runtimeEnv.REVIEW_IMAGES) return json({ error: "Persistent D1 and R2 bindings are not configured." }, 503);
  const store = createD1ReviewStore(runtimeEnv.DB);
  const images = createR2ImageStore(runtimeEnv.REVIEW_IMAGES);
  const imageEntries: Array<{ entityType: "question" | "stimulus"; entityId: string; revision: string; segment: number; archivePath: string; byteLength: number; sha256: string; createdAt?: string; mimeType?: string }> = [];
  if (formatVersion === 2) {
    for (const entry of backupInfo.images) imageEntries.push({ ...entry, segment: entry.segment - 1 });
  } else {
    for (const [archivePath, bytes] of files) {
      if (!archivePath.startsWith("question-images/")) continue;
      if (bytes.byteLength < 100 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return json({ error: `Invalid PNG in ${archivePath}.` }, 400);
      const relative = archivePath.slice("question-images/".length).split("/");
      const isStimulus = relative[0] === "_stimuli";
      const entityId = relative[isStimulus ? 1 : 0]; const filename = relative.at(-1)!;
      const match = filename.match(/^([a-zA-Z0-9_-]+)-segment-([1-9][0-9]*)\.png$/);
      if (!entityId || !match) return json({ error: `Invalid image path in ${archivePath}.` }, 400);
      imageEntries.push({ entityType: isStimulus ? "stimulus" : "question", entityId, revision: match[1], segment: Number(match[2]) - 1, archivePath, byteLength: bytes.byteLength, sha256: await sha256Hex(bytes) });
    }
  }
  const listedImages = new Set(imageEntries.map((entry) => entry.archivePath));
  if (listedImages.size !== imageEntries.length || [...files.keys()].filter((name) => name.startsWith("question-images/")).some((name) => !listedImages.has(name))) return json({ error: "Backup archive contains image files that are not represented exactly once in its image manifest." }, 400);
  for (const entry of imageEntries) {
    const folder = entry.entityType === "stimulus" ? `_stimuli/${entry.entityId}` : entry.entityId;
    const expectedArchivePath = `question-images/${folder}/${entry.revision}-segment-${entry.segment + 1}.png`;
    if (entry.archivePath !== expectedArchivePath) return json({ error: `Backup image path is invalid: ${entry.archivePath}` }, 400);
    if (entry.entityType === "question" ? !canonicalQuestionIds.has(entry.entityId) : !canonicalStimulusIds.has(entry.entityId)) return json({ error: `Backup image ${entry.entityId} is not present in the current source catalog.` }, 400);
  }
  const existingObjects = await images.listAll(auth.user.id);
  const existingKeys = new Set(existingObjects.map((object: any) => object.key));
  const uploadedKeys: string[] = [];
  let databaseCommitted = false;
  try {
    const imageRows = [];
    for (const entry of imageEntries) {
      const bytes = files.get(entry.archivePath)!;
      const saved = await images.putImage({ ownerId: auth.user.id, entityType: entry.entityType, entityId: entry.entityId, revision: entry.revision, segment: entry.segment, bytes });
      if (!existingKeys.has(saved.key)) uploadedKeys.push(saved.key);
      imageRows.push({ entity_type: entry.entityType, entity_id: entry.entityId, revision: entry.revision, segment: entry.segment + 1, object_key: saved.key, byte_length: entry.byteLength, sha256: entry.sha256, mime_type: entry.mimeType || "image/png", created_at: entry.createdAt || backupInfo.exportedAt || new Date().toISOString() });
    }
    imported.stimulusLinks = stimulusLinks;
    const recovery = formatVersion === 2 ? {
      images: imageRows,
      reviewHistory: backupInfo.reviewHistory || [],
      cropRevisions: backupInfo.cropRevisions || [],
      recordTimestamps: backupInfo.recordTimestamps || [],
    } : {
      images: imageRows,
      reviewHistory: referenced.flatMap(([entityType, entityId, review]: any) => (review.history || []).map((event: any) => ({ entityType, entityId, revision: event.revision, event, createdAt: event.at }))),
      cropRevisions: referenced.flatMap(([entityType, entityId, review]: any) => Array.isArray(review.cropOverrides) ? [{ entityType, entityId, revision: review.sourceRegionsRevision || review.imageRevision || `crop-${review.history?.length || 0}`, regions: review.cropOverrides, notes: review.correctionNote || "" }] : []),
      recordTimestamps: [],
    };
    const manifest = await store.restoreSnapshot(auth.user.id, imported, recovery);
    databaseCommitted = true;
    let staleObjectsRetained = 0;
    if (formatVersion === 2) {
      const keep = new Set(imageRows.map((row) => row.object_key));
      const stale = existingObjects.filter((object: any) => !keep.has(object.key));
      const deleted = await Promise.allSettled(stale.map((object: any) => runtimeEnv.REVIEW_IMAGES.delete(object.key)));
      staleObjectsRetained = deleted.filter((result) => result.status === "rejected").length;
    }
    const imageStats = {
      totalSegments: imageRows.length,
      questionSegments: imageRows.filter((row) => row.entity_type === "question").length,
      stimulusSegments: imageRows.filter((row) => row.entity_type === "stimulus").length,
    };
    return json({ saved: true, manifest, importedQuestions: Object.keys(imported.reviews).length, importedStimuli: Object.keys(imported.stimuli).length, importedImages: imageRows.length, imageStats, staleObjectsRetained, updatedAt: manifest.updatedAt });
  } catch (error) {
    if (!databaseCommitted) await Promise.all(uploadedKeys.map((key) => runtimeEnv.REVIEW_IMAGES.delete(key).catch(() => undefined)));
    return json({ error: error instanceof Error ? error.message : "Backup could not be restored." }, 409);
  }
}

import { sha256Hex } from "./question-review-storage.mjs";

const ID = /^[a-zA-Z0-9_-]{1,160}$/;
const REVISION = /^[a-zA-Z0-9_-]{1,64}$/;

export function canonicalStimulusLinks(stimuli) {
  const links = {};
  for (const [stimulusId, stimulus] of Object.entries(stimuli || {})) {
    if (!ID.test(stimulusId)) throw new Error(`Invalid canonical stimulus ID: ${stimulusId}`);
    for (const questionId of stimulus?.questionIds || []) {
      if (!ID.test(questionId)) throw new Error(`Invalid canonical question ID: ${questionId}`);
      (links[questionId] ||= []).push(stimulusId);
    }
  }
  for (const ids of Object.values(links)) ids.sort();
  return Object.fromEntries(Object.entries(links).sort(([a], [b]) => a.localeCompare(b)));
}

export function buildImageManifest(objects, imageRows, ownerId) {
  const root = `owners/${ownerId}/question-images/`;
  const rows = new Map(imageRows.map((row) => [row.object_key || row.objectKey, row]));
  const seen = new Set();
  const result = objects.map((object) => {
    const key = object.key;
    const row = rows.get(key);
    if (!key?.startsWith(root) || !row) throw new Error(`R2 image is missing D1 checksum metadata: ${key || "(unknown key)"}`);
    if (seen.has(key)) throw new Error(`Duplicate R2 object listed in backup: ${key}`);
    seen.add(key);
    const relative = key.slice(root.length);
    const match = relative.match(/^(?:_stimuli\/([a-zA-Z0-9_-]+)|([a-zA-Z0-9_-]+))\/([a-zA-Z0-9_-]+)-segment-([1-9][0-9]*)\.png$/);
    const entityType = match?.[1] ? "stimulus" : "question";
    const entityId = match?.[1] || match?.[2];
    const revision = match?.[3];
    const segment = Number(match?.[4]);
    if (!match || !ID.test(entityId) || !REVISION.test(revision) || !Number.isSafeInteger(segment)) throw new Error(`R2 image key is invalid: ${relative}`);
    const byteLength = row.byte_length ?? row.byteLength;
    const sha256 = row.sha256;
    if (byteLength !== object.size || !Number.isSafeInteger(byteLength) || byteLength < 1 || !/^[a-f0-9]{64}$/i.test(sha256 || "")) throw new Error(`R2 object metadata does not match D1 image metadata: ${relative}`);
    const rowEntityType = row.entity_type || row.entityType;
    const rowEntityId = row.entity_id || row.entityId;
    const rowRevision = row.revision;
    const rowSegment = row.segment;
    if (rowEntityType !== entityType || rowEntityId !== entityId || rowRevision !== revision || rowSegment !== segment) throw new Error(`D1 image metadata points to a different image: ${relative}`);
    return { archivePath: `question-images/${relative}`, entityType, entityId, revision, segment, byteLength, sha256: sha256.toLowerCase(), mimeType: row.mime_type || row.mimeType || "image/png", createdAt: row.created_at || row.createdAt || null };
  }).sort((a, b) => a.archivePath.localeCompare(b.archivePath));
  if (seen.size !== rows.size) throw new Error("D1 image metadata includes objects that are missing from R2.");
  return result;
}

export async function verifyBackupImageManifest(backupInfo, files) {
  if (backupInfo?.formatVersion !== 2 || backupInfo?.format !== "chematlas-question-image-review" || !Array.isArray(backupInfo.images)) throw new Error("Version 2 backup image metadata is missing or invalid.");
  if (backupInfo.imageCount !== backupInfo.images.length) throw new Error("Backup image count does not match its image manifest.");
  if (backupInfo.totalImageBytes !== undefined && backupInfo.totalImageBytes !== backupInfo.images.reduce((total, image) => total + image.byteLength, 0)) throw new Error("Backup image byte total does not match its image manifest.");
  const listed = new Set();
  for (const item of backupInfo.images) {
    if (!item || !["question", "stimulus"].includes(item.entityType) || !ID.test(item.entityId || "") || !REVISION.test(item.revision || "") || !Number.isSafeInteger(item.segment) || item.segment < 1 || !Number.isSafeInteger(item.byteLength) || item.byteLength < 100 || !/^[a-f0-9]{64}$/i.test(item.sha256 || "") || (item.mimeType && item.mimeType !== "image/png")) throw new Error("Backup image metadata contains an invalid entry.");
    const folder = item.entityType === "stimulus" ? `_stimuli/${item.entityId}` : item.entityId;
    const expectedPath = `question-images/${folder}/${item.revision}-segment-${item.segment}.png`;
    if (item.archivePath !== expectedPath || listed.has(expectedPath)) throw new Error(`Backup image path is invalid or duplicated: ${item.archivePath || "(missing path)"}`);
    const bytes = files.get(expectedPath);
    if (!bytes) throw new Error(`Backup image is missing: ${expectedPath}`);
    if (bytes.byteLength !== item.byteLength || await sha256Hex(bytes) !== item.sha256.toLowerCase()) throw new Error(`Backup image checksum or size does not match: ${expectedPath}`);
    if (bytes.byteLength < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) throw new Error(`Backup image is not a PNG: ${expectedPath}`);
    listed.add(expectedPath);
  }
  const archivedImages = [...files.keys()].filter((name) => name.startsWith("question-images/"));
  if (archivedImages.length !== listed.size || archivedImages.some((name) => !listed.has(name))) throw new Error("Backup archive image files do not exactly match the image manifest.");
}

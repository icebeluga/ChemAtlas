import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const EMPTY_MANIFEST = () => ({ schemaVersion: 1, updatedAt: null, reviews: {}, stimuli: {} });
const encoder = new TextEncoder();
const hex = (buffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(bytes) {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

/** Local-only adapter used by the Vite development API. */
export function createFileReviewStore({ manifestPath, imageRoot }) {
  return {
    async readManifest() {
      try {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        manifest.reviews ||= {};
        manifest.stimuli ||= {};
        return manifest;
      } catch (error) {
        if (error?.code === "ENOENT") return EMPTY_MANIFEST();
        throw error;
      }
    },
    async saveManifest(manifest) {
      manifest.updatedAt = new Date().toISOString();
      await mkdir(path.dirname(manifestPath), { recursive: true });
      const temporary = `${manifestPath}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      await (await import("node:fs/promises")).rename(temporary, manifestPath);
      return manifest;
    },
    async putImage({ entityType, entityId, revision, segment, bytes }) {
      const folder = entityType === "stimulus" ? path.join(imageRoot, "_stimuli", entityId) : path.join(imageRoot, entityId);
      const filename = `${revision}-segment-${segment + 1}.png`;
      const target = path.join(folder, filename);
      await mkdir(folder, { recursive: true });
      try {
        const prior = await readFile(target);
        if (hex(await crypto.subtle.digest("SHA-256", prior)) !== await sha256Hex(bytes)) throw new Error("Image revision is immutable; save a new crop revision.");
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        await writeFile(target, bytes, { flag: "wx" });
      }
      return { key: target, path: `/api/admin/question-review/image/${entityType === "stimulus" ? `_stimulus-${entityId}` : entityId}/${filename}`, bytes: bytes.byteLength };
    },
    async getImage({ entityType, entityId, filename }) {
      const folder = entityType === "stimulus" ? path.join(imageRoot, "_stimuli", entityId) : path.join(imageRoot, entityId);
      try { return new Uint8Array(await readFile(path.join(folder, filename))); }
      catch (error) { if (error?.code === "ENOENT") return null; throw error; }
    },
    async imageExists({ entityType, entityId, filename }) {
      return (await this.getImage({ entityType, entityId, filename })) !== null;
    },
    async listImages({ entityType, entityId }) {
      const folder = entityType === "stimulus" ? path.join(imageRoot, "_stimuli", entityId) : path.join(imageRoot, entityId);
      try { return (await readdir(folder)).filter((name) => name.endsWith(".png")).sort(); }
      catch (error) { if (error?.code === "ENOENT") return []; throw error; }
    },
  };
}

/** D1 adapter. Review catalog data stays in questions.json; only reviewer state is persisted here. */
export function createD1ReviewStore(db) {
  if (!db) throw new Error("D1 binding is required.");
  return {
    async readManifest(ownerId) {
      const rows = await db.prepare("SELECT entity_type, entity_id, payload_json FROM review_records WHERE owner_id = ?").bind(ownerId).all();
      const manifest = EMPTY_MANIFEST();
      for (const row of rows.results || []) {
        const key = row.entity_type === "stimulus" ? "stimuli" : "reviews";
        manifest[key][row.entity_id] = JSON.parse(row.payload_json);
      }
      const links = await db.prepare("SELECT question_id, stimulus_id FROM stimulus_links WHERE owner_id = ? ORDER BY question_id, stimulus_id").bind(ownerId).all();
      manifest.stimulusLinks = {};
      for (const link of links.results || []) (manifest.stimulusLinks[link.question_id] ||= []).push(link.stimulus_id);
      const stamp = await db.prepare("SELECT MAX(updated_at) AS updated_at FROM review_records WHERE owner_id = ?").bind(ownerId).first();
      manifest.updatedAt = stamp?.updated_at || null;
      return manifest;
    },
    async saveRecord({ ownerId, entityType, entityId, review, cropRevision, linkedStimuli = [] }) {
      const now = new Date().toISOString();
      const prior = await db.prepare("SELECT payload_json FROM review_records WHERE owner_id = ? AND entity_type = ? AND entity_id = ?").bind(ownerId, entityType, entityId).first();
      const statements = [db.prepare(`INSERT INTO review_records(owner_id, entity_type, entity_id, status, payload_json, updated_at)
        VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, entity_type, entity_id) DO UPDATE SET status=excluded.status, payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
        .bind(ownerId, entityType, entityId, review.status, JSON.stringify(review), now)];
      const history = Array.isArray(review.history) ? review.history : [];
      const oldHistory = prior ? JSON.parse(prior.payload_json).history || [] : [];
      for (const event of history.slice(oldHistory.length)) {
        statements.push(db.prepare("INSERT INTO review_history(owner_id, entity_type, entity_id, revision, event_json, created_at) VALUES(?, ?, ?, ?, ?, ?)")
          .bind(ownerId, entityType, entityId, event.revision || oldHistory.length + 1, JSON.stringify(event), event.at || now));
      }
      if (cropRevision) statements.push(db.prepare(`INSERT OR IGNORE INTO crop_revisions(owner_id, entity_type, entity_id, revision, crop_json, created_by, created_at, notes)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(ownerId, entityType, entityId, cropRevision.revision, JSON.stringify(cropRevision.regions), ownerId, now, cropRevision.notes || ""));
      if (entityType === "question") {
        statements.push(db.prepare("DELETE FROM stimulus_links WHERE owner_id = ? AND question_id = ?").bind(ownerId, entityId));
        for (const stimulusId of linkedStimuli) statements.push(db.prepare("INSERT OR IGNORE INTO stimulus_links(owner_id, question_id, stimulus_id, created_at) VALUES(?, ?, ?, ?)").bind(ownerId, entityId, stimulusId, now));
      }
      await db.batch(statements);
      return now;
    },
    async recordImage({ ownerId, entityType, entityId, revision, segment, objectKey, byteLength, sha256 }) {
      const now = new Date().toISOString();
      await db.prepare(`INSERT INTO image_objects(owner_id, entity_type, entity_id, revision, segment, object_key, byte_length, sha256, mime_type, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'image/png', ?) ON CONFLICT(owner_id, entity_type, entity_id, revision, segment) DO NOTHING`)
        .bind(ownerId, entityType, entityId, revision, segment + 1, objectKey, byteLength, sha256, now).run();
      const saved = await db.prepare("SELECT object_key, byte_length, sha256 FROM image_objects WHERE owner_id = ? AND entity_type = ? AND entity_id = ? AND revision = ? AND segment = ?")
        .bind(ownerId, entityType, entityId, revision, segment + 1).first();
      if (!saved || saved.object_key !== objectKey || saved.sha256 !== sha256 || saved.byte_length !== byteLength) throw new Error("Image revision metadata conflicts with an existing object.");
      return saved;
    },
    async getStimulusLinks(ownerId, questionId) {
      const rows = await db.prepare("SELECT stimulus_id FROM stimulus_links WHERE owner_id = ? AND question_id = ? ORDER BY stimulus_id").bind(ownerId, questionId).all();
      return (rows.results || []).map((row) => row.stimulus_id);
    },
    async listStimulusLinks(ownerId) {
      const rows = await db.prepare("SELECT question_id, stimulus_id FROM stimulus_links WHERE owner_id = ? ORDER BY question_id, stimulus_id").bind(ownerId).all();
      return (rows.results || []).map((row) => ({ questionId: row.question_id, stimulusId: row.stimulus_id }));
    },
    async readRecoveryMetadata(ownerId) {
      const [images, reviewHistory, cropRevisions, recordTimestamps] = await Promise.all([
        db.prepare("SELECT entity_type, entity_id, revision, segment, object_key, byte_length, sha256, mime_type, created_at FROM image_objects WHERE owner_id = ? ORDER BY entity_type, entity_id, revision, segment").bind(ownerId).all(),
        db.prepare("SELECT entity_type, entity_id, revision, event_json, created_at FROM review_history WHERE owner_id = ? ORDER BY history_id").bind(ownerId).all(),
        db.prepare("SELECT entity_type, entity_id, revision, crop_json, created_at, notes FROM crop_revisions WHERE owner_id = ? ORDER BY entity_type, entity_id, created_at, revision").bind(ownerId).all(),
        db.prepare("SELECT entity_type, entity_id, updated_at FROM review_records WHERE owner_id = ? ORDER BY entity_type, entity_id").bind(ownerId).all(),
      ]);
      return {
        images: images.results || [],
        reviewHistory: (reviewHistory.results || []).map((row) => ({ entityType: row.entity_type, entityId: row.entity_id, revision: row.revision, event: JSON.parse(row.event_json), createdAt: row.created_at })),
        cropRevisions: (cropRevisions.results || []).map((row) => ({ entityType: row.entity_type, entityId: row.entity_id, revision: row.revision, regions: JSON.parse(row.crop_json), createdAt: row.created_at, notes: row.notes })),
        recordTimestamps: (recordTimestamps.results || []).map((row) => ({ entityType: row.entity_type, entityId: row.entity_id, updatedAt: row.updated_at })),
      };
    },
    async restoreSnapshot(ownerId, manifest, recovery = {}) {
      const now = new Date().toISOString();
      const timestamps = new Map((recovery.recordTimestamps || []).map((row) => [`${row.entityType}|${row.entityId}`, row.updatedAt]));
      const statements = [
        db.prepare("DELETE FROM review_records WHERE owner_id = ?").bind(ownerId),
        db.prepare("DELETE FROM stimulus_links WHERE owner_id = ?").bind(ownerId),
        db.prepare("DELETE FROM review_history WHERE owner_id = ?").bind(ownerId),
        db.prepare("DELETE FROM crop_revisions WHERE owner_id = ?").bind(ownerId),
        db.prepare("DELETE FROM image_objects WHERE owner_id = ?").bind(ownerId),
      ];
      for (const image of recovery.images || []) statements.push(db.prepare(`INSERT INTO image_objects(owner_id, entity_type, entity_id, revision, segment, object_key, byte_length, sha256, mime_type, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(ownerId, image.entity_type || image.entityType, image.entity_id || image.entityId, image.revision, image.segment, image.object_key || image.objectKey, image.byte_length ?? image.byteLength, image.sha256, image.mime_type || image.mimeType || "image/png", image.created_at || image.createdAt || now));
      const appendRecord = (entityType, id, review) => {
        statements.push(db.prepare("INSERT INTO review_records(owner_id, entity_type, entity_id, status, payload_json, updated_at) VALUES(?, ?, ?, ?, ?, ?)")
          .bind(ownerId, entityType, id, review.status, JSON.stringify(review), timestamps.get(`${entityType}|${id}`) || now));
      };
      for (const [id, review] of Object.entries(manifest.reviews || {})) appendRecord("question", id, review);
      for (const [id, review] of Object.entries(manifest.stimuli || {})) appendRecord("stimulus", id, review);
      for (const [questionId, ids] of Object.entries(manifest.stimulusLinks || {})) {
        if (!manifest.reviews?.[questionId]) continue;
        for (const stimulusId of ids) statements.push(db.prepare("INSERT INTO stimulus_links(owner_id, question_id, stimulus_id, created_at) VALUES(?, ?, ?, ?)").bind(ownerId, questionId, stimulusId, now));
      }
      for (const row of recovery.reviewHistory || []) statements.push(db.prepare("INSERT INTO review_history(owner_id, entity_type, entity_id, revision, event_json, created_at) VALUES(?, ?, ?, ?, ?, ?)")
        .bind(ownerId, row.entityType, row.entityId, row.revision, JSON.stringify(row.event), row.createdAt || now));
      for (const row of recovery.cropRevisions || []) statements.push(db.prepare("INSERT INTO crop_revisions(owner_id, entity_type, entity_id, revision, crop_json, created_by, created_at, notes) VALUES(?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(ownerId, row.entityType, row.entityId, row.revision, JSON.stringify(row.regions), ownerId, row.createdAt || now, row.notes || ""));
      if (statements.length > 75) throw new Error("This restore has more than 75 atomic D1 statements. Use a resumable batch restore before importing this archive.");
      await db.batch(statements);
      return this.readManifest(ownerId);
    },
    async saveManifest(ownerId, manifest) {
      const current = await this.readManifest(ownerId);
      const now = new Date().toISOString();
      const statements = [];
      const append = (entityType, id, review, linkedStimuli = []) => {
        const prior = (entityType === "question" ? current.reviews : current.stimuli)[id];
        statements.push(db.prepare(`INSERT INTO review_records(owner_id, entity_type, entity_id, status, payload_json, updated_at)
          VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, entity_type, entity_id) DO UPDATE SET status=excluded.status, payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
          .bind(ownerId, entityType, id, review.status, JSON.stringify(review), now));
        const oldHistory = prior?.history || [];
        for (const event of (review.history || []).slice(oldHistory.length)) statements.push(db.prepare("INSERT OR IGNORE INTO review_history(owner_id, entity_type, entity_id, revision, event_json, created_at) VALUES(?, ?, ?, ?, ?, ?)")
          .bind(ownerId, entityType, id, event.revision || oldHistory.length + 1, JSON.stringify(event), event.at || now));
        if (Array.isArray(review.cropOverrides)) statements.push(db.prepare(`INSERT OR IGNORE INTO crop_revisions(owner_id, entity_type, entity_id, revision, crop_json, created_by, created_at, notes)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(ownerId, entityType, id, review.sourceRegionsRevision || review.imageRevision || `crop-${review.history?.length || 0}`, JSON.stringify(review.cropOverrides), ownerId, now, review.correctionNote || ""));
        if (entityType === "question") {
          statements.push(db.prepare("DELETE FROM stimulus_links WHERE owner_id = ? AND question_id = ?").bind(ownerId, id));
          for (const stimulusId of linkedStimuli) statements.push(db.prepare("INSERT OR IGNORE INTO stimulus_links(owner_id, question_id, stimulus_id, created_at) VALUES(?, ?, ?, ?)").bind(ownerId, id, stimulusId, now));
        }
      };
      for (const [id, review] of Object.entries(manifest.reviews || {})) append("question", id, review, manifest.stimulusLinks?.[id] || []);
      for (const [id, review] of Object.entries(manifest.stimuli || {})) append("stimulus", id, review);
      for (let index = 0; index < statements.length; index += 75) await db.batch(statements.slice(index, index + 75));
      return this.readManifest(ownerId);
    },
  };
}

/** R2 adapter stores immutable PNG revisions outside the D1 database. */
export function createR2ImageStore(bucket) {
  if (!bucket) throw new Error("R2 bucket binding is required.");
  const objectKey = ({ ownerId, entityType, entityId, revision, segment }) =>
    `owners/${ownerId}/${entityType === "stimulus" ? "question-images/_stimuli" : "question-images"}/${entityId}/${revision}-segment-${segment + 1}.png`;
  return {
    async putImage(input) {
      const key = objectKey(input);
      const digest = await sha256Hex(input.bytes);
      const old = await bucket.head(key);
      if (old) {
        if (old.customMetadata?.sha256 !== digest) throw new Error("Image revision already exists with different bytes; create a new crop revision.");
      } else {
        await bucket.put(key, input.bytes, { httpMetadata: { contentType: "image/png", cacheControl: "private, no-store" }, customMetadata: { sha256: digest, entityType: input.entityType, entityId: input.entityId, revision: input.revision, segment: String(input.segment + 1) } });
      }
      const filename = `${input.revision}-segment-${input.segment + 1}.png`;
      return { key, path: `/api/admin/question-review/image/${input.entityType === "stimulus" ? `_stimulus-${input.entityId}` : input.entityId}/${filename}`, bytes: input.bytes.byteLength, sha256: digest };
    },
    async getImage(input) { const object = await bucket.get(objectKey(input)); return object ? new Uint8Array(await object.arrayBuffer()) : null; },
    async imageExists(input) { return !!(await bucket.head(objectKey(input))); },
    async getByKey(key) { return bucket.get(key); },
    async listImages({ ownerId, entityType, entityId }) {
      const prefix = `owners/${ownerId}/${entityType === "stimulus" ? "question-images/_stimuli" : "question-images"}/${entityId}/`;
      const names = [];
      let cursor;
      do {
        const page = await bucket.list({ prefix, cursor });
        names.push(...page.objects.map((object) => object.key.slice(prefix.length)));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return names.sort();
    },
    async listAll(ownerId) {
      const objects = [];
      let cursor;
      do {
        const page = await bucket.list({ prefix: `owners/${ownerId}/question-images/`, cursor });
        objects.push(...page.objects);
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return objects;
    },
  };
}

export function reviewImageUrl(entityType, entityId, filename) {
  const folder = entityType === "stimulus" ? `_stimulus-${entityId}` : entityId;
  return `/api/admin/question-review/image/${folder}/${filename}`;
}

export { encoder };

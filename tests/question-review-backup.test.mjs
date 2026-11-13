import test from "node:test";
import assert from "node:assert/strict";
import { buildImageManifest, canonicalStimulusLinks, verifyBackupImageManifest } from "../lib/question-review-backup.mjs";
import { sha256Hex } from "../lib/question-review-storage.mjs";

const png = Uint8Array.from([137,80,78,71,13,10,26,10,...Array.from({length:120},(_,index)=>index%251)]);

test("canonical stimulus links include every catalog association in deterministic order", () => {
  assert.deepEqual(canonicalStimulusLinks({
    stimB: { questionIds: ["q-2", "q-1"] },
    stimA: { questionIds: ["q-1"] },
  }), { "q-1": ["stimA", "stimB"], "q-2": ["stimB"] });
});

test("backup image manifest checks D1/R2 identity, byte size, and SHA-256", async () => {
  const ownerId = "owner-1";
  const key = `owners/${ownerId}/question-images/_stimuli/stim-1/r2-segment-1.png`;
  const sha256 = await sha256Hex(png);
  const imageManifest = buildImageManifest(
    [{ key, size: png.byteLength }],
    [{ entity_type: "stimulus", entity_id: "stim-1", revision: "r2", segment: 1, object_key: key, byte_length: png.byteLength, sha256, created_at: "2026-11-10T00:00:00.000Z" }],
    ownerId,
  );
  const info = { format: "chematlas-question-image-review", formatVersion: 2, imageCount: 1, images: imageManifest };
  await verifyBackupImageManifest(info, new Map([[imageManifest[0].archivePath, png]]));
  await assert.rejects(() => verifyBackupImageManifest(info, new Map([[imageManifest[0].archivePath, Uint8Array.from([...png, 0])]])), /checksum or size/);
  assert.equal(imageManifest[0].archivePath, "question-images/_stimuli/stim-1/r2-segment-1.png");
  assert.equal(imageManifest[0].createdAt, "2026-11-10T00:00:00.000Z");
});

test("backup exporter refuses orphaned R2 assets or metadata mismatches", () => {
  assert.throws(() => buildImageManifest([{ key: "owners/owner-1/question-images/q1/r1-segment-1.png", size: 120 }], [], "owner-1"), /missing D1 checksum metadata/);
});

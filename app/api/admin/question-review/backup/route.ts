/* eslint-disable @typescript-eslint/no-explicit-any -- Cloudflare bindings and imported JSON archives are validated at this route boundary. */
import { env } from "cloudflare:workers";
import { authenticateReviewRequest } from "@/lib/cloudflare-access.mjs";
import { buildImageManifest, canonicalStimulusLinks } from "@/lib/question-review-backup.mjs";
import { createD1ReviewStore, createR2ImageStore, sha256Hex } from "@/lib/question-review-storage.mjs";
import stimulusDocument from "@/research/stimuli.json";

export const runtime = "edge";
const encoder = new TextEncoder();
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const cloudEnv = () => env as unknown as Record<string, any>;

function makeTarHeader(filename: string, size: number) {
  const bytes = encoder.encode(filename);
  let name = bytes;
  let prefix = new Uint8Array();
  if (bytes.length > 100) {
    const decoded = filename.split("/");
    let split = -1;
    for (let index = decoded.length - 1; index > 0; index--) {
      const left = encoder.encode(decoded.slice(0, index).join("/"));
      const right = encoder.encode(decoded.slice(index).join("/"));
      if (left.length <= 155 && right.length <= 100) { split = index; break; }
    }
    if (split < 0) throw new Error(`Backup path is too long: ${filename}`);
    prefix = encoder.encode(decoded.slice(0, split).join("/"));
    name = encoder.encode(decoded.slice(split).join("/"));
  }
  const header = new Uint8Array(512);
  header.set(name, 0); header.set(encoder.encode("0000644\0"), 100); header.set(encoder.encode("0000000\0"), 108); header.set(encoder.encode("0000000\0"), 116);
  header.set(encoder.encode(size.toString(8).padStart(11, "0") + "\0"), 124); header.set(encoder.encode(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0"), 136);
  header.fill(0x20, 148, 156); header[156] = 0x30; header.set(encoder.encode("ustar\0"), 257); header.set(encoder.encode("00"), 263); header.set(prefix, 345);
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.set(encoder.encode(checksum.toString(8).padStart(6, "0") + "\0 "), 148);
  return header;
}

function tarBytes(filename: string, bytes: Uint8Array) {
  const padding = (512 - (bytes.byteLength % 512)) % 512;
  const result = new Uint8Array(512 + bytes.byteLength + padding);
  result.set(makeTarHeader(filename, bytes.byteLength)); result.set(bytes, 512);
  return result;
}

function readableBackup(manifest: any, objects: any[], bucket: any, ownerId: string, backupInfo: any) {
  const info = encoder.encode(JSON.stringify(backupInfo, null, 2) + "\n");
  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2) + "\n");
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(tarBytes("backup-info.json", info));
        controller.enqueue(tarBytes("question-image-review.json", manifestBytes));
        for (const objectInfo of objects) {
          const archivePath = objectInfo.key.replace(`owners/${ownerId}/`, "");
          const object = await bucket.get(objectInfo.key);
          if (!object) throw new Error(`R2 object disappeared during export: ${archivePath}`);
          const metadata = backupInfo.images.find((entry: any) => entry.archivePath === archivePath);
          const bytes = new Uint8Array(await object.arrayBuffer());
          if (!metadata || bytes.byteLength !== object.size || bytes.byteLength !== metadata.byteLength || await sha256Hex(bytes) !== metadata.sha256) throw new Error(`R2 image checksum or size does not match D1 metadata: ${archivePath}`);
          controller.enqueue(makeTarHeader(archivePath, bytes.byteLength));
          controller.enqueue(bytes);
          const padding = (512 - (bytes.byteLength % 512)) % 512;
          if (padding) controller.enqueue(new Uint8Array(padding));
        }
        controller.enqueue(new Uint8Array(1024));
        controller.close();
      } catch (error) { controller.error(error); }
    },
  });
  return stream.pipeThrough(new CompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
}

export async function GET(request: Request) {
  const auth = await authenticateReviewRequest(request, cloudEnv());
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  try {
    const runtimeEnv = cloudEnv();
    if (!runtimeEnv.DB || !runtimeEnv.REVIEW_IMAGES) return json({ error: "Persistent D1 and R2 bindings are not configured." }, 503);
    const store = createD1ReviewStore(runtimeEnv.DB);
    const manifest = await store.readManifest(auth.user.id);
    const objects = await createR2ImageStore(runtimeEnv.REVIEW_IMAGES).listAll(auth.user.id);
    const recovery = await store.readRecoveryMetadata(auth.user.id);
    const links = canonicalStimulusLinks((stimulusDocument as any).stimuli || {});
    manifest.stimulusLinks = links;
    const images = buildImageManifest(objects, recovery.images, auth.user.id);
    const backupInfo = {
      format: "chematlas-question-image-review",
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      imageCount: images.length,
      totalImageBytes: images.reduce((sum: number, image: { byteLength: number }) => sum + image.byteLength, 0),
      images,
      stimulusLinks: links,
      reviewHistory: recovery.reviewHistory,
      cropRevisions: recovery.cropRevisions,
      recordTimestamps: recovery.recordTimestamps,
    };
    return new Response(readableBackup(manifest, objects, runtimeEnv.REVIEW_IMAGES, auth.user.id, backupInfo), { headers: { "content-type": "application/gzip", "content-disposition": 'attachment; filename="chematlas-question-image-review.tar.gz"', "cache-control": "private, no-store" } });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Backup export failed." }, 503); }
}


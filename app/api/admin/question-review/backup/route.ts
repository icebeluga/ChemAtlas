/* eslint-disable @typescript-eslint/no-explicit-any -- Cloudflare bindings and imported JSON archives are validated at this route boundary. */
import { env } from "cloudflare:workers";
import { authenticateReviewRequest } from "@/lib/cloudflare-access.mjs";
import { createD1ReviewStore, createR2ImageStore } from "@/lib/question-review-storage.mjs";

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

function readableBackup(manifest: any, objects: any[], bucket: any, ownerId: string) {
  const info = encoder.encode(JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), imageCount: objects.length, stimulusLinks: manifest.stimulusLinks || {} }, null, 2) + "\n");
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
          const filename = archivePath;
          controller.enqueue(makeTarHeader(filename, object.size));
          const reader = object.body.getReader();
          let size = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) { size += value.byteLength; controller.enqueue(value); }
          }
          if (size !== object.size) throw new Error(`R2 image size changed during export: ${filename}`);
          const padding = (512 - (size % 512)) % 512;
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
    const manifest = await createD1ReviewStore(runtimeEnv.DB).readManifest(auth.user.id);
    const objects = await createR2ImageStore(runtimeEnv.REVIEW_IMAGES).listAll(auth.user.id);
    return new Response(readableBackup(manifest, objects, runtimeEnv.REVIEW_IMAGES, auth.user.id), { headers: { "content-type": "application/gzip", "content-disposition": 'attachment; filename="chematlas-question-image-review.tar.gz"', "cache-control": "private, no-store" } });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Backup export failed." }, 503); }
}


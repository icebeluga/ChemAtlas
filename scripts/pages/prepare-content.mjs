// Offline package only. No network, credentials, or upload code.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { contentFiles, stimulusFile } from "./content-manifest.mjs";

const release = process.argv[2];
if (!/^[a-zA-Z0-9_-]+$/.test(release ?? "")) throw new Error("Usage: pnpm content:prepare <release-id>");
const output = resolve("outputs", "supabase-content", release);
const manifest = { schema_version: 1, source_sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  bucket: "chematlas-content", prefix: `shared/releases/${release}`, files: [] };
for (const [input, name] of [...contentFiles.map(name => [`public/${name}`, name]), [stimulusFile, "stimuli.json"]]) {
  const bytes = await readFile(input);
  const path = resolve(output, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  manifest.files.push({ path: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile(resolve(output, "content-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared ${manifest.files.length} protected files under ${output}. Nothing uploaded.`);

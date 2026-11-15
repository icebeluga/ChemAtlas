import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
const output = await build({
  stdin: { contents: 'export * from "./lib/viewer-scale";', resolveDir: fileURLToPath(new URL("..", import.meta.url)) },
  bundle: true, format: "esm", platform: "node", write: false,
});
const { clampZoom, stepZoom, fitWidthScale, fitPageScale, resolveViewerScale, capRenderScale, MAX_RENDER_PIXELS } =
  await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);

const portrait = { width: 600, height: 800 };
const landscape = { width: 800, height: 600 };
const frame = { width: 400, height: 500 };

test("viewer zoom steps in quarters and clamps to 25%–400%", () => {
  assert.equal(clampZoom(0.1), 0.25);
  assert.equal(clampZoom(5), 4);
  assert.equal(stepZoom(0.25, -1), 0.25);
  assert.equal(stepZoom(4, 1), 4);
  assert.equal(stepZoom(1.2, 1), 1.5);
  assert.equal(stepZoom(2, -1), 1.75);
});

test("fit width and fit page use the portrait and landscape bounds", () => {
  assert.equal(fitWidthScale(frame.width, portrait.width), 2 / 3);
  assert.equal(fitWidthScale(frame.width, landscape.width), 0.5);
  assert.equal(fitWidthScale(3000, portrait.width), 2);
  assert.equal(fitPageScale(frame, portrait), 0.625);
  assert.equal(fitPageScale(frame, landscape), 0.5);
  assert.equal(resolveViewerScale("width", frame, portrait), 2 / 3);
  assert.equal(resolveViewerScale("page", frame, portrait), 0.625);
  assert.equal(resolveViewerScale(1, frame, portrait), 1);
});

test("canvas backing pixels stay under the cap, even after rounding up", () => {
  assert.equal(capRenderScale(portrait, 1, 2), 2);
  for (const page of [portrait, landscape, { width: 1800.3, height: 2900.7 }]) {
    const resolution = capRenderScale(page, 4, 3);
    assert.ok(resolution > 0 && resolution < 12);
    assert.ok(Math.ceil(page.width * resolution) * Math.ceil(page.height * resolution) <= MAX_RENDER_PIXELS);
  }
});

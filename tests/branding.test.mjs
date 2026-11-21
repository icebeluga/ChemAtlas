import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { brandingAssets } from "../lib/branding-assets.mjs";

test("Blueberry icons share a canonical SVG, correct raster sizes and three lossless ICO entries", async () => {
  const read = name => readFile(new URL(`../public/${name}`, import.meta.url));
  const svg = await read("blueberry.svg");
  assert.deepEqual(await read("favicon.svg"), svg);
  assert.match(svg.toString(), /viewBox="0 0 272 250"/);
  assert.deepEqual([...svg.toString().matchAll(/<circle [^>]*r="(\d+)"/g)].map(match => match[1]), ["68", "68"]);
  assert.doesNotMatch(svg.toString(), /<image|<filter|<linearGradient|<ellipse/);
  for (const [name, size] of [["favicon-16.png",16],["favicon-32.png",32],["favicon-48.png",48],
    ["favicon.png",32],["apple-touch-icon.png",180],["app-icon-192.png",192],["app-icon-512.png",512],
    ["app-icon-maskable-192.png",192],["app-icon-maskable-512.png",512]]) {
    const bytes = await read(name);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), size, name);
    assert.equal(bytes.readUInt32BE(20), size, name);
  }
  assert.deepEqual(await read("favicon.png"), await read("favicon-32.png"));
  const ico = await read("favicon.ico");
  assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16,32,48].entries()) {
    const entry = 6 + index * 16, offset = ico.readUInt32LE(entry + 12), length = ico.readUInt32LE(entry + 8);
    assert.equal(ico[entry], size); assert.equal(ico[entry + 1], size);
    assert.deepEqual(ico.subarray(offset, offset + length), await read(`favicon-${size}.png`));
  }
});

test("Blueberry manifest stays within the existing Pages base and adds icons without offline behavior", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/site.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.name, "Blueberry"); assert.equal(manifest.short_name, "Blueberry");
  assert.equal(manifest.display, "browser");
  const base = new URL("https://example.test/ChemAtlas/site.webmanifest");
  for (const field of ["start_url", "scope", "id"]) assert.equal(new URL(manifest[field], base).pathname, "/ChemAtlas/");
  assert.deepEqual(manifest.icons.map(icon => [icon.sizes, icon.purpose]), [["192x192","any"],["512x512","any"],["192x192","maskable"],["512x512","maskable"]]);
  for (const icon of manifest.icons) {
    assert.equal(icon.type, "image/png");
    assert.ok(new URL(icon.src, base).pathname.startsWith("/ChemAtlas/"));
    assert.ok(brandingAssets.some(asset => asset.name === icon.src.slice(2)));
  }
});

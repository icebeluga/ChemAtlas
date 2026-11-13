import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../app/atlas-tokens.css", import.meta.url), "utf8");
const tokens = new Map([...css.matchAll(/--ca-([\w-]+):\s*(#[\da-f]{6});/gi)].map(([, name, hex]) => [name, hex]));
const pairs = [
  ["text", "canvas"], ["text", "surface"], ["text", "surface-cool"],
  ["text-muted", "canvas"], ["text-muted", "surface"], ["text-muted", "surface-cool"],
  ["text-muted", "surface-warm"], ["text-muted", "purple-soft"],
  ["surface", "brand"], ["brand", "brand-soft"],
  ["blue", "blue-soft"], ["blue", "surface-cool"], ["blue", "surface"],
  ["purple", "purple-soft"], ["purple", "surface"], ["purple", "surface-cool"],
  ["teal", "teal-soft"], ["teal", "surface"], ["teal", "surface-warm"],
  ["amber", "amber-soft"], ["coral", "coral-soft"],
  ["control-border", "surface", 3], ["control-border", "canvas", 3],
  ["brand", "surface", 3], ["brand", "surface-cool", 3], ["brand", "canvas", 3],
];

function luminance(name) {
  const hex = tokens.get(name);
  assert(hex, `Missing color token ${name}`);
  const rgb = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255);
  const linear = rgb.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

for (const [foreground, background, minimum = 4.5] of pairs) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  const ratio = (light + 0.05) / (dark + 0.05);
  assert(ratio >= minimum, `${foreground} on ${background}: ${ratio.toFixed(2)} below ${minimum}`);
  console.log(`${foreground} on ${background}: ${ratio.toFixed(2)}:1`);
}

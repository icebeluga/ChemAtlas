import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../app/student-redesign.css", import.meta.url), "utf8");

function oklchToken(name) {
  const match = css.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+var\\(--h\\)\\)`));
  assert.ok(match, `Expected an OKLCH --${name} token using --h`);
  return [Number(match[1]), Number(match[2])];
}

// Convert OKLCH to linear sRGB and use the clipped sRGB fallback for WCAG contrast.
function luminance([lightness, chroma], hue) {
  const radians = hue * Math.PI / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const clip = channel => Math.max(0, Math.min(1, channel));
  return 0.2126 * clip(r) + 0.7152 * clip(g) + 0.0722 * clip(blue);
}

const tint = oklchToken("tint");
const deep = oklchToken("deep");
for (let unit = 1; unit <= 9; unit++) {
  test(`Unit ${unit} colour pairs meet WCAG AA text contrast`, t => {
    const match = css.match(new RegExp(`\\[data-u=u${unit}\\]\\s*\\{\\s*--h:\\s*([\\d.]+)`));
    assert.ok(match, `Expected a hue for unit ${unit}`);
    const hue = Number(match[1]);
    const tintLuminance = luminance(tint, hue);
    const deepLuminance = luminance(deep, hue);
    const pairs = [
      ["deep on tint", deepLuminance, tintLuminance],
      ["white on deep", 1, deepLuminance],
      ["deep on white", deepLuminance, 1],
    ];
    for (const [name, foreground, background] of pairs) {
      const ratio = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
      t.diagnostic(`${name} ${ratio.toFixed(2)}:1`);
      assert.ok(ratio >= 4.5, `${name} measures ${ratio.toFixed(2)}:1, below 4.5:1`);
    }
  });
}

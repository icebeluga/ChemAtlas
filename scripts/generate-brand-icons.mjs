// Run with: node scripts/generate-brand-icons.mjs
// Every raster and ICO entry is rendered from public/blueberry.svg, never redrawn.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const svg = await readFile(new URL("../public/blueberry.svg", import.meta.url), "utf8");
const root = new URL("../public/", import.meta.url);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const icons = [
    ["favicon-16.png", 16, false], ["favicon-32.png", 32, false], ["favicon-48.png", 48, false],
    ["apple-touch-icon.png", 180, true], ["app-icon-192.png", 192, true], ["app-icon-512.png", 512, true],
    ["app-icon-maskable-192.png", 192, true, .74], ["app-icon-maskable-512.png", 512, true, .74],
  ];
  const rendered = new Map();
  for (const [name, size, opaque, scale = opaque ? .84 : 1] of icons) {
    const png = await page.evaluate(async ({ svg, size, opaque, scale }) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (opaque) { ctx.fillStyle = "#f5f6fa"; ctx.fillRect(0, 0, size, size); }
      const width = size * scale, height = width * image.naturalHeight / image.naturalWidth;
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      return canvas.toDataURL("image/png").split(",")[1];
    }, { svg, size, opaque, scale });
    const bytes = Buffer.from(png, "base64"); rendered.set(size + ":" + opaque + ":" + scale, bytes);
    await writeFile(new URL(name, root), bytes);
  }
  await writeFile(new URL("favicon.svg", root), svg);
  await writeFile(new URL("favicon.png", root), rendered.get("32:false:1"));
  const sizes = [16, 32, 48], directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(1, 2); directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  const entries = sizes.map((size, index) => {
    const bytes = rendered.get(`${size}:false:1`), position = 6 + index * 16;
    directory[position] = directory[position + 1] = size;
    directory.writeUInt16LE(1, position + 4); directory.writeUInt16LE(32, position + 6);
    directory.writeUInt32LE(bytes.length, position + 8); directory.writeUInt32LE(offset, position + 12);
    offset += bytes.length; return bytes;
  });
  await writeFile(new URL("favicon.ico", root), Buffer.concat([directory, ...entries]));
  console.log("Generated SVG, PNG and 16/32/48 ICO icons from public/blueberry.svg.");
} finally { await browser.close(); }

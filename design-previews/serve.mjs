// Read-only static server for the design previews (local, git-excluded).
// Root is the repo so previews can read public/student-questions.json, the
// source PDFs and pdf.js without copying them.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".pdf": "application/pdf", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") { res.writeHead(302, { location: "/design-previews/index.html" }).end(); return; } // keep relative links working
  const file = normalize(join(root, path));
  // only the folders the previews need; nothing else in the repo is served
  const allowed = ["design-previews", "public", join("node_modules", "pdfjs-dist", "build")].some(dir => file.startsWith(join(root, dir)));
  try {
    if (!allowed || !statSync(file).isFile()) throw 0;
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end("Not found"); }
}).listen(5191, "127.0.0.1", () => console.log("design previews on http://127.0.0.1:5191"));

import { createServer } from "vite";
import { resolve } from "node:path";

const server = await createServer({
  configFile: resolve("vite.pages.config.ts"),
  server: { host: "127.0.0.1", port: 0, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  logLevel: "error",
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try { await server.close(); }
  catch { process.exit(1); }
  // This process owns only the fixture server and Vite's configuration-loader
  // workers. All HTTP assertions run in the parent, which checks this exit code.
  process.exit(0);
}
process.on("message", message => { if (message.type === "close") void close(); });
process.on("disconnect", () => { void close(); });
await server.listen();
process.send({ type: "ready", origin: `http://127.0.0.1:${server.httpServer.address().port}/ChemAtlas/` });

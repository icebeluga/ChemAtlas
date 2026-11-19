import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { validateSupabaseConfig } from "./lib/supabase-config.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicAssets = [
  { name: "favicon.svg", type: "image/svg+xml" },
  { name: "favicon.png", type: "image/png" },
  { name: "pdf.worker.min.mjs", type: "text/javascript" },
];
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, "VITE_"), ...process.env };
  validateSupabaseConfig(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!, env.VITE_CHEMATLAS_CONTENT_PREFIX!);
  return {
    root: `${root}pages`, envDir: root, base: "/ChemAtlas/", publicDir: false,
    resolve: { extensions: [".tsx", ".ts", ".mts", ".js", ".mjs", ".jsx", ".json"],
      alias: { "#student-content": `${root}lib/content-supabase.ts`, "@": root } },
    plugins: [react(), {
      name: "pages-public-asset-allowlist",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = (request.url ?? "").split("?")[0];
          const asset = publicAssets.find(({ name }) => pathname === `/ChemAtlas/${name}` || pathname === `/${name}`);
          if (!asset) return next();
          if (request.method !== "GET" && request.method !== "HEAD") {
            response.statusCode = 405;
            response.setHeader("Allow", "GET, HEAD");
            response.end();
            return;
          }
          response.setHeader("Content-Type", asset.type);
          response.setHeader("Cache-Control", "no-cache");
          response.end(request.method === "HEAD" ? undefined : readFileSync(`${root}public/${asset.name}`));
        });
      },
      generateBundle() {
        for (const { name } of publicAssets) {
          this.emitFile({ type: "asset", fileName: name, source: readFileSync(`${root}public/${name}`) });
        }
        this.emitFile({ type: "asset", fileName: ".nojekyll", source: "" });
        this.emitFile({ type: "asset", fileName: "404.html", source: "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Not found</title><h1>Page not found</h1><a href=\"/ChemAtlas/\">Return to ChemAtlas</a></html>" });
      },
    }, {
      name: "reject-private-pages-imports",
      moduleParsed(info) {
        const id = info.id.replaceAll("\\", "/");
        const localData = id.startsWith(root.replaceAll("\\", "/")) && !id.includes("/node_modules/") && /\.(?:json|pdf|csv|tsv|md)(?:\?|$)/.test(id);
        if (localData || /(?:\/research\/|\/public\/(?!pdf\.worker)|\/app\/(?:admin|api)\/|\/worker\/|\/db\/|\/content-worker\.)/.test(id)) {
          this.error(`Protected data or server module reached Pages: ${id}`);
        }
      },
    }],
    build: { outDir: `${root}dist-pages`, emptyOutDir: true, sourcemap: false,
      rollupOptions: { input: { index: `${root}pages/index.html`, builder: `${root}pages/practice-builder/index.html` } } },
  };
});

// Local UI development only.
// Serves the student app with vinext alone, outside the Worker request path.
// Authentication, response headers, and admin route handling require the Worker.
// Production builds use vite.config.ts (`pnpm run build`).
// Keep appDir in step with vite.config.ts.
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  if (command === "build") {
    throw new Error("vite.ui.config.ts is for local UI development only and cannot build. Use `pnpm run build`.");
  }
  return { plugins: [vinext({ appDir: "student" })] };
});

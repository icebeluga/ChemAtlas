import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Independent student deployment: no ChatGPT Sites runtime, sign-in mock,
// connector preview Worker, or development review API.
export default defineConfig({
  plugins: [
    vinext({ appDir: "student" }),
    cloudflare({
      configPath: "./wrangler.student.jsonc",
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
    }),
  ],
});

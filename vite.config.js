// vite.config.js
import { defineConfig } from "vite";
import { vitePlugin as remix } from "@remix-run/dev";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [
    // makes "~/*" from tsconfig work in both client and SSR
    tsconfigPaths(),
    remix(),
  ],
  resolve: {
    alias: {
      "~": path.resolve(process.cwd(), "app"),
    },
  },
  server: {
    hmr: { overlay: true },
  },
});

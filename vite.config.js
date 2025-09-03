import { defineConfig } from "vite";
import { vitePlugin as remix } from "@remix-run/dev"; // Remix v2 plugin
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [remix()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"), // lets you import "~/shopify.server"
    },
  },
});

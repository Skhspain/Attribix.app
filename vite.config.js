import path from "path";
import { defineConfig } from "vite";
import { vitePlugin as remix } from "@remix-run/dev"; // ✅ correct import

export default defineConfig({
  plugins: [remix()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
  },
});

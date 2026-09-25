import path from "path";
import { defineConfig } from "vitest/config";

// Separate from vite.config.js so tests don't load the Remix plugin.
export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "extensions/*/src/**/*.test.ts"],
  },
});

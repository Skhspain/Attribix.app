// vite.config.mjs
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { vitePlugin as remix } from "@remix-run/dev";

export default defineConfig({
  plugins: [
    remix(),
    tsconfigPaths(),
  ],
  ssr: {
    noExternal: [
      "@shopify/shopify-app-remix",
      "@shopify/shopify-api",
      "@shopify/polaris",
      "@shopify/app-bridge",
      "@shopify/app-bridge-react",
    ],
  },
});

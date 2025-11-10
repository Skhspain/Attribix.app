// remix.config.js
/** @type {import('@remix-run/dev').AppConfig} */
export default {
  ignoredRouteFiles: ["**/*.test.*", "**/*.spec.*"],
  serverBuildDirectory: "build/server",
  // serverModuleFormat: "esm" // (default with Vite)
};

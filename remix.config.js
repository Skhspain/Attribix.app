// remix.config.js
/** @type {import('@remix-run/dev').AppConfig} */
export default {
  ignoredRouteFiles: ["**/*.*(test|spec).*", "**/*.d.ts", "**/*.map"],
  serverModuleFormat: "esm",
  // We are using default file-based routing (no routes.ts/js file needed)
  future: {
    v3_fetcherPersist: true,
    v3_relativeSplatPath: true,
    v3_singleFetch: true,
    v3_throwAbortReason: true,
    v3_lazyRouteDiscovery: true,
  },
};

// Vite "?url" imports
declare module "*?url" {
  const url: string;
  export default url;
}

// Optional CSS modules
declare module "*.css" {
  const classes: Record<string, string>;
  export default classes;
}

// Node-style env for Remix builds
declare const process: {
  env: Record<string, string | undefined>;
};

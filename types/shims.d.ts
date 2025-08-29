/* File: types/shims.d.ts */
/// <reference types="react" />

// Map the root import to the server subpath for TS (doesn't affect runtime)
declare module "@shopify/shopify-app-remix" {
  export * from "@shopify/shopify-app-remix/server";
}

// Allow Polaris JSON with import attributes
declare module "@shopify/polaris/locales/*.json" {
  const value: Record<string, string>;
  export default value;
}

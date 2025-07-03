/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

interface ImportMetaEnv {
  readonly VITE_SHOPIFY_DOMAIN?: string;
  readonly VITE_STOREFRONT_API_TOKEN?: string;
  readonly FB_PIXEL_ID?: string;
  readonly FB_ACCESS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
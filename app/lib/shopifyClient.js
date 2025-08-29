import { createStorefrontApiClient } from '@shopify/storefront-api-client';

const storeDomain = process.env.VITE_SHOPIFY_DOMAIN;
const apiVersion = process.env.VITE_SHOPIFY_API_VERSION || '2025-07';
const publicAccessToken = process.env.VITE_SHOPIFY_STOREFRONT_TOKEN;

if (!storeDomain || !publicAccessToken) {
  console.error(
    'Missing Storefront API config. Check VITE_SHOPIFY_DOMAIN and VITE_SHOPIFY_STOREFRONT_TOKEN in your .env file.'
  );
}

export const client = createStorefrontApiClient({
  storeDomain,
  apiVersion,
  publicAccessToken,
});

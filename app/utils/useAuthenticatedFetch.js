// app/utils/useAuthenticatedFetch.js
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticatedFetch } from "@shopify/app-bridge-utils";

/**
 * Returns a fetch function that:
 * 1) Always hits your app’s origin (leading slash URLs).
 * 2) Automatically injects the Shopify session token.
 */
export function useAuthenticatedFetch() {
  const app = useAppBridge();
  return authenticatedFetch(app);
}
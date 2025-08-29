import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticatedFetch } from "@shopify/app-bridge-utils";

/**
 * Returns a fetch function that:
 * 1) Resolves URLs against your app’s origin.
 * 2) Injects the Shopify session token into headers.
 */
export function useAuthenticatedFetch() {
  const app = useAppBridge();
  return authenticatedFetch(app);
}

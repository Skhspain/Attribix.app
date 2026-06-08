// app/utils/useAuthenticatedFetch.ts
//
// App Bridge v4 (new embedded auth strategy) exposes window.shopify.idToken()
// to get the current session token. This replaces the old useAppBridge() +
// getSessionToken() pattern from App Bridge v3, which required a separate
// React Provider that @shopify/shopify-app-remix/react does not mount.

import { useCallback } from "react";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function useAuthenticatedFetch(): Fetcher {
  return useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const shopify = (window as any).shopify;

    async function getToken(): Promise<string | null> {
      try {
        return shopify?.idToken ? await shopify.idToken() : null;
      } catch {
        return null;
      }
    }

    const token = await getToken();
    const headers = new Headers(init.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");

    const response = await fetch(input, { ...init, headers });

    // If we got HTML back instead of JSON the session token likely expired.
    // Try once more with a freshly-fetched token.
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json") && !contentType.includes("xml")) {
      const freshToken = await getToken();
      if (freshToken && freshToken !== token) {
        headers.set("Authorization", `Bearer ${freshToken}`);
        return fetch(input, { ...init, headers });
      }
    }

    return response;
  }, []);
}

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
    let token: string | null = null;

    try {
      const shopify = (window as any).shopify;
      if (shopify?.idToken) {
        token = await shopify.idToken();
      }
    } catch {
      // Proceed without token — server will return 401 if needed.
    }

    const headers = new Headers(init.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");

    return fetch(input, { ...init, headers });
  }, []);
}

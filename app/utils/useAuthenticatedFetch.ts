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

    // Retry once with a fresh token when auth appears to have failed:
    //  • HTTP 401 — server now returns JSON 401 for AJAX auth failures
    //  • Non-JSON/XML content-type — the old HTML-redirect fallback
    const contentType = response.headers.get("content-type") ?? "";
    const authFailed =
      response.status === 401 ||
      (!contentType.includes("json") && !contentType.includes("xml"));

    if (authFailed) {
      const freshToken = await getToken();
      if (freshToken && freshToken !== token) {
        const retryHeaders = new Headers(init.headers || {});
        retryHeaders.set("Authorization", `Bearer ${freshToken}`);
        retryHeaders.set("Accept", "application/json");
        return fetch(input, { ...init, headers: retryHeaders });
      }
    }

    return response;
  }, []);
}

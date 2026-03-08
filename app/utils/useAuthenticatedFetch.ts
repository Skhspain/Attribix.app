// app/utils/useAuthenticatedFetch.ts
import { useCallback } from "react";

// IMPORTANT: @shopify/app-bridge-react is CommonJS in your runtime.
// Use default import so we don't rely on named exports.
import appBridgeReact from "@shopify/app-bridge-react";
import { getSessionToken } from "@shopify/app-bridge/utilities";

const { useAppBridge } = appBridgeReact as any;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function useAuthenticatedFetch(): Fetcher {
  // If App Bridge Provider isn't mounted (missing host, etc),
  // calling useAppBridge will throw. We want a controlled error instead of crashing the whole page.
  let app: any = null;
  try {
    app = useAppBridge();
  } catch (e) {
    // app stays null; we'll throw a readable error on first fetch call
  }

  return useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (!app) {
        throw new Error(
          "App Bridge not available (missing Provider context). This usually means the URL is missing ?host=... or the AppBridgeProvider returned children without mounting Provider."
        );
      }

      const token = await getSessionToken(app);

      const headers = new Headers(init.headers || {});
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("Accept", "application/json");

      return fetch(input, { ...init, headers });
    },
    [app]
  );
}

// app/utils/useAuthenticatedFetch.ts
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticatedFetch } from "@shopify/app-bridge-utils";
import { useCallback } from "react";

export function useAuthenticatedFetch() {
  const app = useAppBridge();

  return useCallback(
    async (uri: string, options: RequestInit = {}) => {
      const fetchFunction = authenticatedFetch(app);

      const headers = new Headers(options.headers || {});
      if (!headers.has("Content-Type") && options.body) {
        headers.set("Content-Type", "application/json");
      }

      return fetchFunction(uri, {
        ...options,
        headers,
      });
    },
    [app]
  );
}

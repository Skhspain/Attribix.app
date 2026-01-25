import React from "react";
import appBridgeReact from "@shopify/app-bridge-react";

const { Provider: AppBridgeProvider } = appBridgeReact;

export default function AppBridgeProviderWrapper({ children }) {
  if (typeof window === "undefined") return children;

  const params = new URLSearchParams(window.location.search);
  const host = params.get("host");

  // ✅ Runtime-safe (from root loader -> window.ENV)
  const apiKey = window.ENV?.SHOPIFY_API_KEY;

  if (!host || !apiKey) {
    console.error("App Bridge not initialized (missing host/apiKey)", {
      host,
      apiKeyPresent: !!apiKey,
      search: window.location.search,
    });
    return children;
  }

  return (
    <AppBridgeProvider
      config={{
        apiKey,
        host,
        forceRedirect: true,
      }}
    >
      {children}
    </AppBridgeProvider>
  );
}

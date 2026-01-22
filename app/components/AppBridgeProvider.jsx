// app/components/AppBridgeProvider.jsx
import React from "react";

// CommonJS-safe import for app-bridge-react
import appBridgeReact from "@shopify/app-bridge-react";
const { Provider: AppBridgeProvider } = appBridgeReact;

export default function AppBridgeProviderWrapper({ children }) {
  // Shopify embedded apps pass these as query params
  // host is REQUIRED for App Bridge
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );

  const host = params.get("host");

  // Your API key is exposed on client via Vite env (already in your secrets)
  const apiKey = import.meta.env.VITE_SHOPIFY_API_KEY;

  // During SSR we just render children; provider requires browser context anyway
  if (typeof window === "undefined") return children;

  // If host is missing, you’re not in embedded context. Render children to avoid crashing.
  if (!host || !apiKey) return children;

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

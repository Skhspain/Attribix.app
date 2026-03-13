// app/components/AppBridgeProvider.jsx
import React from "react";

/**
 * IMPORTANT
 *
 * This file now acts as a compatibility shim only.
 *
 * Why:
 * - The real embedded Shopify provider is already mounted in app/routes/app.jsx
 *   via @shopify/shopify-app-remix/react AppProvider.
 * - Mounting another App Bridge Provider here can create overlapping client
 *   contexts and unstable embedded behavior.
 * - We keep this component and prop shape intact so the surrounding app
 *   structure does not need to change again right now.
 *
 * Result:
 * - root.jsx can keep rendering <AppBridgeProvider apiKey={...}>...</AppBridgeProvider>
 * - but this component no longer mounts a second App Bridge context
 */
export default function AppBridgeProvider({ apiKey, children }) {
  void apiKey;
  return <>{children}</>;
}
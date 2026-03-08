// app/components/AppBridgeProvider.jsx
import React from "react";
import { useLocation } from "@remix-run/react";

// IMPORTANT: @shopify/app-bridge-react is CommonJS in your runtime.
// Use default import to avoid "Named export 'Provider' not found".
import appBridgeReact from "@shopify/app-bridge-react";
const { Provider } = appBridgeReact;

export default function AppBridgeProvider({ apiKey, children }) {
  const location = useLocation();

  // SSR-safe mount gate (Provider expects browser context)
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) return children;

  const params = new URLSearchParams(location.search);
  const host = params.get("host");

  // If someone opens the app outside Shopify embedded context,
  // host may be missing — avoid crashing the whole app.
  if (!apiKey || !host) return children;

  const config = {
    apiKey,
    host,
    forceRedirect: true,
  };

  return <Provider config={config}>{children}</Provider>;
}

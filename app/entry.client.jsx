// app/entry.client.jsx
import { RemixBrowser } from "@remix-run/react";
import { hydrateRoot } from "react-dom/client";
import React from "react";

// ✅ Polaris CSS must be loaded on the client (avoids the root.jsx rollup error)
import "@shopify/polaris/build/esm/styles.css";

hydrateRoot(document, <RemixBrowser />);

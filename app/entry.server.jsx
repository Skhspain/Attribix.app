// app/entry.server.jsx
import { PassThrough } from "node:stream";

import { RemixServer } from "@remix-run/react";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";

import * as shopifyServer from "./shopify.server";
import { startMetaSyncCron } from "./services/metaSync.server";
import { startGoogleSyncCron } from "./services/googleSync.server";

// Start background sync crons once on server boot
startMetaSyncCron();
startGoogleSyncCron();

const ABORT_DELAY = 5000;

function applyEmbeddedAppHeaders(request, responseHeaders) {
  // 1) Try Shopify helper if it exists in your project
  const candidate =
    shopifyServer.shopify ||
    shopifyServer.default ||
    shopifyServer.authenticate ||
    shopifyServer;

  const addDoc = candidate?.addDocumentResponseHeaders;
  if (typeof addDoc === "function") {
    try {
      addDoc(request, responseHeaders);
    } catch (e) {
      console.warn("[entry.server] addDocumentResponseHeaders failed:", e);
    }
  }

  // 2) Remove X-Frame-Options (will break embedding if set to DENY/SAMEORIGIN)
  try {
    if (responseHeaders.has("X-Frame-Options")) {
      responseHeaders.delete("X-Frame-Options");
    }
  } catch {
    // ignore
  }

  // 3) Ensure CSP allows Shopify admin to frame this app
  // Shopify admin is always https://admin.shopify.com
  // For embedded apps, also allow the shop domain.
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const shopOrigin = shop ? `https://${shop}` : "https://*.myshopify.com";

  const frameAncestors = `frame-ancestors https://admin.shopify.com ${shopOrigin} https://*.myshopify.com;`;

  // If CSP already exists, ensure it includes frame-ancestors.
  // If not, set a minimal CSP that at least sets frame-ancestors.
  const existingCsp = responseHeaders.get("Content-Security-Policy");
  if (!existingCsp) {
    responseHeaders.set("Content-Security-Policy", frameAncestors);
  } else if (!/frame-ancestors/i.test(existingCsp)) {
    responseHeaders.set("Content-Security-Policy", `${existingCsp}; ${frameAncestors}`);
  }
}

export default function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  remixContext
) {
  applyEmbeddedAppHeaders(request, responseHeaders);

  const ua = request.headers.get("user-agent") || "";
  if (isbot(ua)) {
    return handleBotRequest(
      request,
      responseStatusCode,
      responseHeaders,
      remixContext
    );
  }

  return handleBrowserRequest(
    request,
    responseStatusCode,
    responseHeaders,
    remixContext
  );
}

function handleBotRequest(request, status, headers, remixContext) {
  return new Promise((resolve, reject) => {
    let didError = false;

    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        onAllReady() {
          headers.set("Content-Type", "text/html");

          const body = new PassThrough();
          resolve(
            new Response(body, {
              status: didError ? 500 : status,
              headers,
            })
          );

          pipe(body);
        },
        onShellError(err) {
          reject(err);
        },
        onError(err) {
          didError = true;
          console.error("[entry.server] SSR error:", err);
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

function handleBrowserRequest(request, status, headers, remixContext) {
  return new Promise((resolve, reject) => {
    let didError = false;

    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        onShellReady() {
          headers.set("Content-Type", "text/html");

          const body = new PassThrough();
          resolve(
            new Response(body, {
              status: didError ? 500 : status,
              headers,
            })
          );

          pipe(body);
        },
        onShellError(err) {
          reject(err);
        },
        onError(err) {
          didError = true;
          console.error("[entry.server] SSR error:", err);
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

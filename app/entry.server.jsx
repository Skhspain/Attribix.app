// app/entry.server.jsx
import { PassThrough } from "node:stream";

import { RemixServer } from "@remix-run/react";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";

// IMPORTANT: we don't assume named exports here (your shopify.server.ts does not export `shopify`)
import * as shopifyServer from "./shopify.server";

const ABORT_DELAY = 5000;

function addShopifyDocumentHeaders(request, responseHeaders) {
  // Shopify Remix templates usually expose this on `shopify`,
  // but your project may export different shapes.
  const candidate =
    shopifyServer.shopify ||
    shopifyServer.default ||
    shopifyServer.authenticate ||
    shopifyServer;

  const fn = candidate?.addDocumentResponseHeaders;

  if (typeof fn === "function") {
    try {
      fn(request, responseHeaders);
    } catch (e) {
      console.warn("[entry.server] addDocumentResponseHeaders failed:", e);
    }
  } else {
    // Not fatal — but embedded apps may break on refresh without CSP/frame headers
    console.warn(
      "[entry.server] addDocumentResponseHeaders not found on shopify.server exports"
    );
  }
}

export default function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  remixContext
) {
  addShopifyDocumentHeaders(request, responseHeaders);

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

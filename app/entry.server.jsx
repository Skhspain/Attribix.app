// app/entry.server.jsx
import { PassThrough } from "node:stream";

import { RemixServer } from "@remix-run/react";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";

// IMPORTANT: this is what adds Shopify's CSP / embedded headers
import { shopify } from "./shopify.server";

const ABORT_DELAY = 5000;

export default function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  remixContext
) {
  // Add Shopify-required headers for embedded apps (CSP / frame-ancestors etc)
  try {
    shopify.addDocumentResponseHeaders(request, responseHeaders);
  } catch (e) {
    // Don't crash SSR if something unexpected happens
    console.warn("[entry.server] addDocumentResponseHeaders failed:", e);
  }

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

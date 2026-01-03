// app/server/_webhooks.shared.server.ts
import type { ActionFunctionArgs } from "@remix-run/node";

/**
 * Minimal webhook helpers.
 * Keep ALL webhook/server-only utilities OUTSIDE `app/routes`
 * so Vite never tries to include them in the client bundle.
 */

export async function readRawBody(request: Request) {
  const raw = await request.text();
  return raw;
}

/**
 * Optional: normalize a webhook response so we never "hard fail" Shopify webhooks.
 */
export function ok() {
  return new Response("ok", { status: 200 });
}

/**
 * Optional: if you want JSON ok instead:
 */
export function okJson() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Helper to safely handle a webhook action:
 * - never throw
 * - always return 200
 */
export async function safeWebhook(
  _args: ActionFunctionArgs,
  handler: () => Promise<void> | void
) {
  try {
    await handler();
    return okJson();
  } catch {
    // Never fail webhooks hard
    return okJson();
  }
}

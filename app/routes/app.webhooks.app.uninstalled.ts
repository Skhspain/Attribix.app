// app/routes/app.webhooks.app.uninstalled.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify from "~/shopify.server";

/**
 * Handles Shopify APP_UNINSTALLED webhook
 * URL: /app/webhooks/app/uninstalled
 *
 * Important:
 * - Must be an `action` (POST)
 * - Must return 200 quickly or Shopify will retry
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    // This verifies the webhook signature + parses the webhook
    const { topic, shop, payload } = await shopify.authenticate.webhook(request);

    // Shopify sends topic like "APP_UNINSTALLED" (or lower-case in some libs),
    // but regardless: if Shopify hit this endpoint, we can safely cleanup by `shop`.
    console.log("[WEBHOOK] Received", { topic, shop });

    // TODO (optional): Cleanup your DB for this shop:
    // - delete sessions for `shop`
    // - delete connections, pixels, tracked events, etc.
    // Keep it fast. If heavy, enqueue a job instead.

    return json({ ok: true });
  } catch (err: any) {
    // If verification fails, respond 401 so Shopify knows it was not accepted.
    console.error("[WEBHOOK] Verification failed:", err?.message ?? err);
    return new Response("Unauthorized", { status: 401 });
  }
}

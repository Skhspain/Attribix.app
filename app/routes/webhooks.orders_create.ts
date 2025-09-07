// app/routes/webhooks.orders_create.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify from "~/shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { topic, shop, payload } = await shopify.authenticate.webhook(request);
    // TODO: handle the order create payload here
    return json({ ok: true, topic, shop });
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

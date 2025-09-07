// app/routes/webhooks.gdpr.customers_data_request.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify from "~/shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    await shopify.authenticate.webhook(request);
    return json({ ok: true });
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getBaseUrl } from "~/utils/url.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const base = getBaseUrl(request);
  return json({ hint: "POST to this route to (re)register webhooks.", base, shop: session.shop });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const base = getBaseUrl(request);

  const topics: Array<{ topic: string; path: string }> = [
    { topic: "orders/create",    path: "/webhooks/orders_create" },
    { topic: "customers/create", path: "/webhooks/customers_create" },
  ];

  const results: Array<{ topic: string; ok: boolean; status?: number; error?: string }> = [];

  for (const t of topics) {
    try {
      const res = await admin.rest.resources.Webhook.create({
        session,
        webhook: { topic: t.topic, address: `${base}${t.path}`, format: "json" },
      });
      const status = (res as any)?.response?.code ?? 201;
      results.push({ topic: t.topic, ok: true, status });
    } catch (e: any) {
      const status = e?.response?.code ?? e?.status ?? 500;
      const already = status === 422; // duplicate webhook
      results.push({ topic: t.topic, ok: already, status, error: already ? undefined : (e?.message || "Failed") });
    }
  }
  return json({ base, results });
}

export default function RegisterWebhooks() { return null; }

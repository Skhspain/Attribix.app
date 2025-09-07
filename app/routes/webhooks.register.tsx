// app/routes/webhooks.register.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify from "~/shopify.server";

export async function loader({}: LoaderFunctionArgs) {
  return json({ ok: true, hint: "POST to this route to (re)register webhooks" });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await shopify.authenticate.admin(request);

  if (!session.accessToken) {
    throw new Response("Missing admin access token for shop", { status: 401 });
  }

  const origin = new URL(request.url).origin;

  const endpoints = [
    { topic: "APP_UNINSTALLED",         path: "/webhooks.app.uninstalled" },
    { topic: "APP_SCOPES_UPDATE",       path: "/webhooks.app.scopes_update" },
    { topic: "CUSTOMERS_DATA_REQUEST",  path: "/webhooks.gdpr.customers_data_request" },
    { topic: "CUSTOMERS_REDACT",        path: "/webhooks.gdpr.customers_redact" },
    { topic: "SHOP_REDACT",             path: "/webhooks.gdpr.shop_redact" },
    { topic: "ORDERS_CREATE",           path: "/webhooks.orders_create" },
  ] as const;

  const results: Array<{topic: string; status: number; ok: boolean; error?: string}> = [];

  for (const { topic, path } of endpoints) {
    const address = `${origin}${path}`;

    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("X-Shopify-Access-Token", session.accessToken); // guaranteed string now

    const res = await fetch(
      `https://${session.shop}/admin/api/2024-07/webhooks.json`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
      }
    );

    let error: string | undefined;
    if (!res.ok) {
      try {
        const body = await res.json();
        error = JSON.stringify(body);
      } catch {
        error = await res.text();
      }
    }

    results.push({ topic, status: res.status, ok: res.ok, error });
  }

  return json({ ok: results.every((r) => r.ok), results });
}

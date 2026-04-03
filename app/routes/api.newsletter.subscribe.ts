// app/routes/api.newsletter.subscribe.ts
// Public endpoint — called from storefront popup / post-purchase thank-you page.
// NEW FILE.

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { subscribeEmail } from "~/services/newsletter.server";

function corsHeaders(origin: string | null) {
  const allowed =
    origin &&
    (origin.endsWith(".myshopify.com") ||
      origin.endsWith(".shopify.com") ||
      origin.endsWith(".fly.dev"));

  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function loader({ request }: ActionFunctionArgs) {
  // Handle preflight
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const body = await request.json().catch(() => ({}));

    const shop = (body?.shop as string | undefined)?.trim();
    const email = (body?.email as string | undefined)?.trim();

    if (!shop || !email) {
      return json(
        { ok: false, error: "Missing shop or email" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const result = await subscribeEmail({
      shop,
      email,
      firstName: body?.firstName,
      lastName: body?.lastName,
      source: body?.source || "popup",
      utmSource: body?.utm_source,
      utmMedium: body?.utm_medium,
      utmCampaign: body?.utm_campaign,
      gclid: body?.gclid,
      fbclid: body?.fbclid,
    });

    return json(result, { headers: corsHeaders(origin) });
  } catch (err: any) {
    return json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}

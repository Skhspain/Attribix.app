// api/woo/connect — Auto-provision WooCommerce store connection
// Called from the WooCommerce plugin to register a shop and get an API key.
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";
import crypto from "crypto";

// OPTIONS for CORS
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  return json({ ok: true, endpoint: "POST to connect your WooCommerce store" }, { headers: corsHeaders() });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const body = await request.json().catch(() => ({}));
  const { shop, siteName, email, siteUrl } = body as {
    shop: string;       // domain e.g. "mystore.com"
    siteName?: string;  // WordPress site name
    email?: string;     // admin email
    siteUrl?: string;   // full URL
  };

  if (!shop) {
    return json({ ok: false, error: "Missing shop domain" }, { status: 400, headers: corsHeaders() });
  }

  const anyDb = db as any;

  // 1. Ensure TrackingSettings exists with a trackingKey
  let settings = await anyDb.trackingSettings?.findUnique?.({ where: { shop } });

  if (!settings) {
    const trackingKey = "atx_" + crypto.randomBytes(24).toString("hex");
    settings = await anyDb.trackingSettings?.create?.({
      data: {
        shop,
        trackingKey,
        trackingEnabled: true,
      },
    });
  } else if (!settings.trackingKey) {
    const trackingKey = "atx_" + crypto.randomBytes(24).toString("hex");
    settings = await anyDb.trackingSettings?.update?.({
      where: { shop },
      data: { trackingKey },
    });
  }

  // 2. Create an Org if none exists for this shop
  let orgStore = await db.orgStore.findUnique({ where: { shop } });
  let org;

  if (!orgStore) {
    org = await db.org.create({
      data: {
        name: siteName || shop,
        ownerEmail: email || `admin@${shop}`,
      },
    });
    orgStore = await db.orgStore.create({
      data: {
        orgId: org.id,
        shop,
        label: siteName || shop,
      },
    });
  } else {
    org = await db.org.findFirst({ where: { id: orgStore.orgId } });
  }

  return json({
    ok: true,
    accountId: org?.id || orgStore?.orgId || "",
    apiKey: settings?.trackingKey || "",
    shop,
    message: "Store connected successfully",
  }, { headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// api/woo/meta/select — Save selected ad account + pixel for WooCommerce shop
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  return json({ ok: true, endpoint: "POST with shop + adAccountId + pixelId" }, { headers: cors() });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  const body = await request.json().catch(() => ({}));
  const { shop, adAccountId, pixelId } = body as {
    shop: string;
    adAccountId?: string;
    pixelId?: string;
  };

  if (!shop) {
    return json({ ok: false, error: "Missing shop" }, { status: 400, headers: cors() });
  }

  const anyDb = db as any;

  // Save ad account selection
  if (adAccountId) {
    const existingConn = await db.metaConnection.findUnique({ where: { shop } });
    const accountChanged = existingConn?.adAccountId && existingConn.adAccountId !== adAccountId;

    await db.metaConnection.update({
      where: { shop },
      data: { adAccountId },
    });

    // If ad account changed, clear the old pixel (it belongs to a different account)
    if (accountChanged && !pixelId) {
      await anyDb.trackingSettings?.upsert?.({
        where: { shop },
        create: { shop, fbPixelId: null },
        update: { fbPixelId: null },
      });
    }
  }

  // Save pixel selection
  if (pixelId) {
    const conn = await db.metaConnection.findUnique({ where: { shop } });
    await anyDb.trackingSettings?.upsert?.({
      where: { shop },
      create: { shop, fbPixelId: pixelId, fbToken: conn?.accessToken || null },
      update: { fbPixelId: pixelId, fbToken: conn?.accessToken || null },
    });
  }

  return json({ ok: true }, { headers: cors() });
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

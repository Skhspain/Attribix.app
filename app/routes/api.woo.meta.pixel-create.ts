// api/woo/meta/pixel-create — Create a new Meta Pixel in the selected ad account
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { createMetaPixel } from "~/services/metaGraph.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  return json({ ok: true, endpoint: "POST with shop + name" }, { headers: cors() });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  const body = await request.json().catch(() => ({}));
  const { shop, name } = body as { shop: string; name?: string };

  if (!shop) {
    return json({ ok: false, error: "Missing shop" }, { status: 400, headers: cors() });
  }

  const conn = await db.metaConnection.findUnique({ where: { shop } });
  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Meta not connected" }, { status: 400, headers: cors() });
  }
  if (!conn.adAccountId) {
    return json({ ok: false, error: "No ad account selected" }, { status: 400, headers: cors() });
  }

  try {
    const pixel = await createMetaPixel({
      accessToken: conn.accessToken,
      adAccountId: conn.adAccountId,
      name: name || `${shop} Pixel`,
    });

    // Auto-save as active pixel
    const anyDb = db as any;
    await anyDb.trackingSettings?.upsert?.({
      where: { shop },
      create: { shop, fbPixelId: pixel.id, fbToken: conn.accessToken },
      update: { fbPixelId: pixel.id, fbToken: conn.accessToken },
    });

    return json({ ok: true, pixel }, { headers: cors() });
  } catch (e: any) {
    return json({ ok: false, error: e.message }, { status: 500, headers: cors() });
  }
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// api/woo/meta/pixels — List Meta pixels for a WooCommerce shop's ad account
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return json({ ok: false, error: "Missing shop" }, { status: 400, headers: cors() });
  }

  const conn = await db.metaConnection.findUnique({ where: { shop } });
  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Meta not connected", pixels: [] }, { headers: cors() });
  }

  if (!conn.adAccountId) {
    return json({ ok: false, error: "No ad account selected", pixels: [] }, { headers: cors() });
  }

  try {
    const pixelUrl = `https://graph.facebook.com/v20.0/${conn.adAccountId}/adspixels?fields=id,name,last_fired_time&access_token=${conn.accessToken}`;
    const res = await fetch(pixelUrl);
    const data = await res.json();
    const pixels = (data?.data || []).map((p: any) => ({
      id: String(p.id),
      name: p.name || "Unnamed Pixel",
      last_fired_time: p.last_fired_time || null,
    }));
    return json({ ok: true, pixels }, { headers: cors() });
  } catch (e: any) {
    return json({ ok: false, error: e.message, pixels: [] }, { headers: cors() });
  }
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// app/routes/api.meta.pixels.ts
// Fetches available Meta Pixels from the connected ad account
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const conn = await db.metaConnection.findUnique({ where: { shop } });
  if (!conn?.accessToken || !conn?.adAccountId) {
    return json({ ok: false, error: "Meta not connected or no ad account selected", pixels: [] });
  }

  try {
    // Fetch pixels from the ad account
    const actId = conn.adAccountId.startsWith("act_") ? conn.adAccountId : `act_${conn.adAccountId}`;
    console.log("[meta/pixels] fetching pixels for", actId);
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${actId}/adspixels?fields=id,name,is_unavailable&access_token=${conn.accessToken}`
    );
    const data = await res.json();
    console.log("[meta/pixels] response:", JSON.stringify(data).slice(0, 300));
    if (data.error) {
      return json({ ok: false, error: data.error.message, pixels: [] });
    }

    const pixels = (data.data || []).map((p: any) => ({
      id: p.id,
      name: p.name || p.id,
      unavailable: p.is_unavailable || false,
    }));

    return json({ ok: true, pixels });
  } catch (e: any) {
    return json({ ok: false, error: e.message, pixels: [] });
  }
}

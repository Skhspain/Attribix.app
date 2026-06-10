// app/routes/api.meta.pixels.ts
// Fetches available Meta Pixels for the connected ad account.
// Business-owned pixels are returned first to surface the store's own pixel
// at the top of any selection UI (avoids 3rd-party app pixels like PBA Pixel).
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { fetchAllPixels } from "~/services/metaGraph.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const conn = await db.metaConnection.findUnique({ where: { shop } });
  if (!conn?.accessToken || !conn?.adAccountId) {
    return json({ ok: false, error: "Meta not connected or no ad account selected", pixels: [] });
  }

  try {
    const pixels = await fetchAllPixels({
      accessToken: conn.accessToken,
      adAccountId: conn.adAccountId,
    });
    console.log(`[meta/pixels] found ${pixels.length} pixel(s) for ${shop}`);
    return json({ ok: true, pixels });
  } catch (e: any) {
    return json({ ok: false, error: e.message, pixels: [] });
  }
}

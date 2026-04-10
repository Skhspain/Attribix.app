// api/woo/status — Return integration status + auto-detected pixel for a shop
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

  const anyDb = db as any;

  const [metaConn, googleConn, tiktokConn, trackingSettings] = await Promise.all([
    anyDb.metaConnection?.findUnique?.({ where: { shop } }).catch(() => null),
    anyDb.googleConnection?.findUnique?.({ where: { shop } }).catch(() => null),
    anyDb.tikTokConnection?.findUnique?.({ where: { shop } }).catch(() => null),
    anyDb.trackingSettings?.findUnique?.({ where: { shop } }).catch(() => null),
  ]);

  const metaConnected = !!metaConn && metaConn.accessToken && metaConn.accessToken !== "__PENDING__";
  const googleConnected = !!googleConn && !!googleConn.accessToken;
  const tiktokConnected = !!tiktokConn && !!tiktokConn.accessToken && tiktokConn.accessToken !== "__PENDING__";

  // Auto-detect Meta Pixel if connected but not set
  let autoPixelId = trackingSettings?.fbPixelId || null;
  if (metaConnected && !autoPixelId && metaConn.adAccountId) {
    try {
      const pixelUrl = `https://graph.facebook.com/v20.0/${metaConn.adAccountId}/adspixels?fields=id,name&access_token=${metaConn.accessToken}`;
      const pixelRes = await fetch(pixelUrl);
      const pixelData = await pixelRes.json();
      if (pixelData?.data?.[0]?.id) {
        autoPixelId = pixelData.data[0].id;
        // Save it to tracking settings
        await anyDb.trackingSettings?.upsert?.({
          where: { shop },
          create: { shop, fbPixelId: autoPixelId },
          update: { fbPixelId: autoPixelId },
        });
      }
    } catch (e) {
      console.error("[woo-status] pixel auto-detect error:", e);
    }
  }

  return json({
    ok: true,
    shop,
    meta: {
      connected: metaConnected,
      adAccountId: metaConn?.adAccountId || null,
    },
    google: {
      connected: googleConnected,
      adCustomerId: googleConn?.adCustomerId || null,
    },
    tiktok: {
      connected: tiktokConnected,
      advertiserId: tiktokConn?.advertiserId || null,
    },
    pixels: {
      fbPixelId: autoPixelId,
      ga4Id: trackingSettings?.ga4Id || null,
    },
  }, { headers: cors() });
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

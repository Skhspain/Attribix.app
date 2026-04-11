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

  // Read pixel from tracking settings only — don't auto-detect/overwrite
  const autoPixelId = trackingSettings?.fbPixelId || null;

  const businessLoginActive = !!process.env.META_BUSINESS_LOGIN_CONFIG_ID;

  // Fetch connected asset details if Business Login is active
  let connectedAssets: any = null;
  if (metaConnected && businessLoginActive && metaConn?.accessToken) {
    try {
      const token = metaConn.accessToken;
      const [adAcct, pixel] = await Promise.all([
        metaConn.adAccountId
          ? fetch(`https://graph.facebook.com/v20.0/${metaConn.adAccountId}?fields=id,name,currency&access_token=${token}`).then(r => r.json()).catch(() => null)
          : null,
        trackingSettings?.fbPixelId
          ? fetch(`https://graph.facebook.com/v20.0/${trackingSettings.fbPixelId}?fields=id,name,last_fired_time&access_token=${token}`).then(r => r.json()).catch(() => null)
          : null,
      ]);
      connectedAssets = {
        adAccount: adAcct && !adAcct.error ? { id: adAcct.id, name: adAcct.name, currency: adAcct.currency } : null,
        pixel: pixel && !pixel.error ? { id: pixel.id, name: pixel.name, lastFired: pixel.last_fired_time } : null,
      };
    } catch (e) {
      console.error("[woo-status] assets fetch error:", e);
    }
  }

  return json({
    ok: true,
    shop,
    businessLoginActive,
    connectedAssets,
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

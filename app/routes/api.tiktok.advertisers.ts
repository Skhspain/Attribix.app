// api/tiktok/advertisers — List TikTok advertiser accounts
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { fetchTikTokAdvertisers } from "~/services/tikTokAds.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const conn = await anyDb.tikTokConnection?.findUnique?.({ where: { shop } });
  if (!conn || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "TikTok not connected", advertisers: [] });
  }

  try {
    const advertisers = await fetchTikTokAdvertisers(conn.accessToken);
    return json({ ok: true, advertisers, selectedId: conn.advertiserId });
  } catch (e: any) {
    console.error("[tiktok] advertiser list error:", e.message);
    return json({ ok: false, error: e.message, advertisers: [] });
  }
}

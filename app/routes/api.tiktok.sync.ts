// api/tiktok/sync — Manual TikTok ad data sync trigger
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { syncTikTokAds } from "~/services/tikTokSync.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const body = await request.json().catch(() => ({}));
  const days = Math.min(Math.max(parseInt((body as any).days) || 7, 1), 90);

  const result = await syncTikTokAds(shop, days);
  return json(result);
}

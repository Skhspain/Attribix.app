// api/tiktok/advertiser/select — Save selected TikTok advertiser
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const body = await request.json().catch(() => ({}));
  const { advertiserId } = body as { advertiserId: string };

  if (!advertiserId) {
    return json({ ok: false, error: "Missing advertiserId" }, { status: 400 });
  }

  await anyDb.tikTokConnection?.update?.({
    where: { shop },
    data: { advertiserId },
  });

  return json({ ok: true });
}

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { syncGoogleSpendDaily } from "~/services/googleAds.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const body = await request.json().catch(() => ({}));
  const days = Number(body?.days ?? 30);

  const result = await syncGoogleSpendDaily(shop, Number.isFinite(days) ? days : 30);
  return json({ ok: true, ...result });
}

export default function Route() {
  return null;
}

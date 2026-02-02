import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const body = await request.json().catch(() => null);
  const adCustomerId = String(body?.adCustomerId || "").replaceAll("-", "").trim();

  if (!adCustomerId) return json({ ok: false, error: "Missing adCustomerId" }, { status: 400 });

  await db.googleConnection.upsert({
    where: { shop },
    create: { shop, accessToken: "TEMP", adCustomerId }, // TEMP is never used; you will already have token row
    update: { adCustomerId },
  });

  return json({ ok: true, adCustomerId });
}

export default function Route() {
  return null;
}

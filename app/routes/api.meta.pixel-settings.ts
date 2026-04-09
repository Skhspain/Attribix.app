// app/routes/api.meta.pixel-settings.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const body = await request.json().catch(() => ({}));

  await db.trackingSettings.upsert({
    where: { shop },
    create: {
      shop,
      fbPixelId: body.fbPixelId || null,
      fbToken: body.fbToken || null,
    },
    update: {
      ...(body.fbPixelId !== undefined && { fbPixelId: body.fbPixelId || null }),
      ...(body.fbToken !== undefined && { fbToken: body.fbToken || null }),
    },
  });

  return json({ ok: true });
}

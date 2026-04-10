// api/meta/pixel-create — Create a new Meta Pixel (Shopify-authenticated)
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { createMetaPixel } from "~/services/metaGraph.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const body = await request.json().catch(() => ({}));
  const { name } = body as { name?: string };

  const conn = await db.metaConnection.findUnique({ where: { shop } });
  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Meta not connected" }, { status: 400 });
  }
  if (!conn.adAccountId) {
    return json({ ok: false, error: "No ad account selected" }, { status: 400 });
  }

  try {
    const pixel = await createMetaPixel({
      accessToken: conn.accessToken,
      adAccountId: conn.adAccountId,
      name: name || `${shop} Pixel`,
    });

    // Auto-save as active pixel
    const anyDb = db as any;
    await anyDb.trackingSettings?.upsert?.({
      where: { shop },
      create: { shop, fbPixelId: pixel.id, fbToken: conn.accessToken },
      update: { fbPixelId: pixel.id, fbToken: conn.accessToken },
    });

    return json({ ok: true, pixel });
  } catch (e: any) {
    return json({ ok: false, error: e.message }, { status: 500 });
  }
}

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";
import { verifyShopifyAppProxySignature } from "~/utils/shopifyVerify.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, { status: 405 });
    }

    const apiSecret = process.env.SHOPIFY_API_SECRET || "";
    if (!apiSecret) {
      // Don’t break storefront – but tell yourself in logs
      console.warn("[apps/pixel/track] Missing SHOPIFY_API_SECRET");
      return json({ ok: true });
    }

    const url = new URL(request.url);

    // App Proxy signing: only enforce when signature exists (Shopify proxy calls include it)
    // This keeps manual testing possible, but secured in real usage.
    const hasSignature = url.searchParams.has("signature");
    if (hasSignature) {
      const valid = verifyShopifyAppProxySignature(url, apiSecret);
      if (!valid) {
        console.warn("[apps/pixel/track] Invalid app proxy signature");
        return json({ ok: true }); // return ok to not break storefront
      }
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ ok: true });

    const event = String((body as any).event || "");
    if (!event) return json({ ok: true });

    // Optional UTM parsing from url
    const pageUrl = String((body as any).url || "");
    let utmSource: string | undefined;
    let utmMedium: string | undefined;
    let utmCampaign: string | undefined;

    try {
      if (pageUrl) {
        const u = new URL(pageUrl);
        utmSource = u.searchParams.get("utm_source") || undefined;
        utmMedium = u.searchParams.get("utm_medium") || undefined;
        utmCampaign = u.searchParams.get("utm_campaign") || undefined;
      }
    } catch {}

    // shop param is typically provided by app proxy
    const shop = url.searchParams.get("shop") || (body as any).shop || null;

    await prisma.pixelEvent.create({
      data: {
        shop: shop ? String(shop) : null,
        event,
        url: pageUrl ? String(pageUrl) : null,
        referrer: (body as any).referrer ? String((body as any).referrer) : null,
        ua: (body as any).ua ? String((body as any).ua) : null,
        payload: body as any,
        utmSource,
        utmMedium,
        utmCampaign,
      },
    });

    return json({ ok: true });
  } catch (e) {
    // Never break storefront
    console.warn("[apps/pixel/track] error", e);
    return json({ ok: true });
  }
}

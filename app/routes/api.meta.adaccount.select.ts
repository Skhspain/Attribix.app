// app/routes/api.meta.adaccount.select.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { fetchBestPixel } from "~/services/metaGraph.server";

function pickFirst(...vals: Array<string | null | undefined>) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

async function resolveShop(request: Request, authResult: any) {
  const sessionShop = authResult?.session?.shop;

  const url = new URL(request.url);
  const qsShop = url.searchParams.get("shop");

  const headerShop =
    request.headers.get("x-shopify-shop-domain") ||
    request.headers.get("X-Shopify-Shop-Domain");

  let bodyShop: string | null = null;
  try {
    const ct = request.headers.get("content-type") || "";
    if (
      ct.includes("multipart/form-data") ||
      ct.includes("application/x-www-form-urlencoded")
    ) {
      const form = await request.clone().formData();
      const v = form.get("shop");
      bodyShop = typeof v === "string" ? v : null;
    }
  } catch {
    // ignore
  }

  const shop = pickFirst(sessionShop, qsShop, bodyShop, headerShop);

  if (!shop) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error:
          "Missing shop. Auth session shop was null, and no shop was provided via query/form/header.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return shop;
}

export async function action({ request }: ActionFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const shop = await resolveShop(request, result);

  const form = await request.formData();
  const adAccountIdRaw = form.get("adAccountId");
  const adAccountId = typeof adAccountIdRaw === "string" ? adAccountIdRaw.trim() : "";

  if (!adAccountId) {
    return json({ ok: false, error: "Missing adAccountId" }, { status: 400 });
  }

  // If MetaConnection doesn't exist yet, Prisma requires accessToken on create.
  // We set a placeholder and let OAuth callback overwrite it later.
  const saved = await db.metaConnection.upsert({
    where: { shop },
    create: {
      shop,
      adAccountId,
      accessToken: "__PENDING__",
    },
    update: {
      adAccountId,
    },
    select: {
      shop: true,
      adAccountId: true,
      accessToken: true,
      expiresAt: true,
    },
  });

  // ── Auto-populate fbPixelId from the selected ad account ─────────────────
  // Every time the merchant picks (or changes) their ad account, fetch the
  // pixels attached to it and save the first one to trackingSettings.fbPixelId.
  // This keeps Settings → Tracking & Attribution in sync automatically so
  // the CAPI always sends to the correct pixel without any manual step.
  const accessToken = saved.accessToken && saved.accessToken !== "__PENDING__"
    ? saved.accessToken
    : null;

  if (accessToken) {
    try {
      // fetchBestPixel tries business-owned pixels first so we avoid picking
      // third-party app pixels (e.g. PBA Pixel) that share the ad account.
      const firstPixel = await fetchBestPixel({ accessToken, adAccountId });

      if (firstPixel?.id) {
        const anyDb = db as any;
        const existing = await anyDb.trackingSettings?.findUnique?.({
          where: { shop },
          select: { fbToken: true },
        }).catch(() => null);

        await anyDb.trackingSettings?.upsert?.({
          where: { shop },
          create: {
            shop,
            fbPixelId: firstPixel.id,
            // Only seed the token if nothing is set; merchant may have a
            // proper non-expiring CAPI token they generated in Events Manager.
            fbToken: accessToken,
          },
          update: {
            fbPixelId: firstPixel.id,
            // Update token only if empty — don't overwrite a manually-set CAPI token.
            ...(existing?.fbToken ? {} : { fbToken: accessToken }),
          },
        });

        console.log(`[meta/adaccount/select] auto-saved pixel ${firstPixel.id} (${firstPixel.name}) for ${shop}`);
      }
    } catch (pixelErr: any) {
      // Non-fatal — ad account was still saved, pixel sync just failed.
      console.error("[meta/adaccount/select] pixel auto-sync failed:", pixelErr?.message);
    }
  }

  return json({
    ok: true,
    shop: saved.shop,
    adAccountId: saved.adAccountId,
    hasAccessToken: Boolean(saved.accessToken && saved.accessToken !== "__PENDING__"),
    expiresAt: saved.expiresAt ? new Date(saved.expiresAt).toISOString() : null,
  });
}

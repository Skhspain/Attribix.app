// app/routes/api.meta.adaccount.select.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

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

  return json({
    ok: true,
    shop: saved.shop,
    adAccountId: saved.adAccountId,
    hasAccessToken: Boolean(saved.accessToken && saved.accessToken !== "__PENDING__"),
    expiresAt: saved.expiresAt ? new Date(saved.expiresAt).toISOString() : null,
  });
}

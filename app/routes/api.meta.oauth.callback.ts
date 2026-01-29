// app/routes/api.meta.oauth.callback.ts
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { exchangeMetaCodeForToken } from "~/services/metaGraph.server";

function ensureShopParam(urlPath: string, shop: string) {
  try {
    // If it's already absolute, keep it
    const u = new URL(urlPath, "https://example.local");
    if (!u.searchParams.get("shop")) u.searchParams.set("shop", shop);
    return u.pathname + u.search + u.hash;
  } catch {
    // If something odd happens, fall back safely
    return `/app/integrations/meta?shop=${encodeURIComponent(shop)}`;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  /**
   * IMPORTANT:
   * Meta redirects to this URL from outside the Shopify embedded context.
   * That means `authenticate.admin(request)` may return a Response (or fail)
   * because there is no embedded session/hmac params.
   *
   * We keep your existing behavior when it works, BUT we do not require it.
   */
  try {
    const result = await authenticate.admin(request);
    // If it returns a Response, we DO NOT return it here (because it can block OAuth completion).
    // This keeps the callback working even when Meta redirects outside embedded context.
    void result;
  } catch {
    // Ignore – we rely on `state.shop` to identify the shop.
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    throw new Response("Missing code/state", { status: 400 });
  }

  let decoded: { shop?: string; nonce?: string; returnTo?: string } | null = null;
  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    throw new Response("Invalid state", { status: 400 });
  }

  const shop = decoded?.shop;
  const returnToRaw = decoded?.returnTo || "/app/integrations/meta";
  if (!shop) throw new Response("Missing shop in state", { status: 400 });

  const appBaseUrl = process.env.SHOPIFY_APP_URL;
  if (!appBaseUrl) throw new Response("Missing SHOPIFY_APP_URL", { status: 500 });

  const redirectUri = `${appBaseUrl.replace(/\/$/, "")}/api/meta/oauth/callback`;

  const token = await exchangeMetaCodeForToken({
    code,
    redirectUri,
  });

  const expiresAt =
    typeof token.expires_in === "number"
      ? new Date(Date.now() + token.expires_in * 1000)
      : null;

  // Upsert connection for shop
  await db.metaConnection.upsert({
    where: { shop },
    create: {
      shop,
      accessToken: token.access_token,
      expiresAt: expiresAt ?? undefined,
      // adAccountId is selected later
    },
    update: {
      accessToken: token.access_token,
      expiresAt: expiresAt ?? undefined,
    },
  });

  // Ensure the redirect goes back into the embedded app with shop param
  const returnTo = ensureShopParam(returnToRaw, shop);
  return redirect(returnTo);
}

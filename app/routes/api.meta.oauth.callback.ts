// app/routes/api.meta.oauth.callback.ts
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { exchangeMetaCodeForToken } from "~/services/metaGraph.server";

function ensureEmbeddedParams(urlPath: string, shop: string, host?: string, embedded?: string) {
  try {
    const u = new URL(urlPath, "https://example.local");
    if (!u.searchParams.get("shop")) u.searchParams.set("shop", shop);
    if (host && !u.searchParams.get("host")) u.searchParams.set("host", host);
    if (embedded && !u.searchParams.get("embedded")) u.searchParams.set("embedded", embedded);
    return u.pathname + u.search + u.hash;
  } catch {
    const fallback = new URL("/app/integrations/meta", "https://example.local");
    fallback.searchParams.set("shop", shop);
    if (host) fallback.searchParams.set("host", host);
    if (embedded) fallback.searchParams.set("embedded", embedded);
    return fallback.pathname + fallback.search;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  /**
   * Meta redirects to this URL from outside the Shopify embedded context.
   * authenticate.admin may fail here; that's OK because we identify the shop from `state`.
   */
  try {
    const result = await authenticate.admin(request);
    void result;
  } catch {
    // ignore
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    throw new Response("Missing code/state", { status: 400 });
  }

  let decoded:
    | { shop?: string; nonce?: string; returnTo?: string; host?: string; embedded?: string }
    | null = null;

  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    throw new Response("Invalid state", { status: 400 });
  }

  const shop = decoded?.shop;
  const returnToRaw = decoded?.returnTo || "/app/integrations/meta";
  const host = decoded?.host || "";
  const embedded = decoded?.embedded || "1";

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

  await db.metaConnection.upsert({
    where: { shop },
    create: {
      shop,
      accessToken: token.access_token,
      expiresAt: expiresAt ?? undefined,
    },
    update: {
      accessToken: token.access_token,
      expiresAt: expiresAt ?? undefined,
    },
  });

  const returnTo = ensureEmbeddedParams(returnToRaw, shop, host, embedded);
  return redirect(returnTo);
}

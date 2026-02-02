import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";
import { exchangeGoogleCodeForToken } from "~/services/googleOAuth.server";

function ensureEmbeddedParams(urlPath: string, shop: string, host?: string, embedded?: string) {
  const fallback = new URL("/app/integrations/google", "https://example.local");
  fallback.searchParams.set("shop", shop);
  if (host) fallback.searchParams.set("host", host);
  if (embedded) fallback.searchParams.set("embedded", embedded);

  try {
    const u = new URL(urlPath, "https://example.local");
    if (!u.searchParams.get("shop")) u.searchParams.set("shop", shop);
    if (host && !u.searchParams.get("host")) u.searchParams.set("host", host);
    if (embedded && !u.searchParams.get("embedded")) u.searchParams.set("embedded", embedded);
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback.pathname + fallback.search;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) throw new Response("Missing code/state", { status: 400 });

  let decoded:
    | { shop?: string; returnTo?: string; host?: string; embedded?: string; nonce?: string }
    | null = null;

  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    throw new Response("Invalid state", { status: 400 });
  }

  const shop = decoded?.shop;
  const returnToRaw = decoded?.returnTo || "/app/integrations/google";
  const host = decoded?.host || "";
  const embedded = decoded?.embedded || "1";

  if (!shop) throw new Response("Missing shop in state", { status: 400 });

  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI;
  if (!redirectUri) throw new Response("Missing GOOGLE_ADS_REDIRECT_URI", { status: 500 });

  const token = await exchangeGoogleCodeForToken({ code, redirectUri });

  const expiresAt =
    typeof token.expires_in === "number"
      ? new Date(Date.now() + token.expires_in * 1000)
      : null;

  await db.googleConnection.upsert({
    where: { shop },
    create: {
      shop,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? undefined,
      expiresAt: expiresAt ?? undefined,
      scope: token.scope ?? undefined, // ✅ NOTE: scope (singular)
    },
    update: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? undefined,
      expiresAt: expiresAt ?? undefined,
      scope: token.scope ?? undefined, // ✅ NOTE: scope (singular)
    },
  });

  // ✅ Ensure the returnTo we send back to Shopify has shop/host/embedded
  const returnTo = ensureEmbeddedParams(returnToRaw, shop, host, embedded);

  // ✅ CRITICAL: /auth must receive host for embedded Shopify apps
  const authUrl = new URL("/auth", url.origin);
  authUrl.searchParams.set("shop", shop);
  if (host) authUrl.searchParams.set("host", host);
  authUrl.searchParams.set("returnTo", returnTo);

  return redirect(authUrl.toString());
}

export default function GoogleCallback() {
  return null;
}

import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";
import { exchangeGoogleCodeForToken } from "~/services/googleOAuth.server";
import { authenticate } from "~/shopify.server";

function ensureEmbeddedParams(
  urlPath: string,
  shop: string,
  host?: string,
  embedded?: string
) {
  try {
    const u = new URL(urlPath, "https://example.local");
    if (!u.searchParams.get("shop")) u.searchParams.set("shop", shop);
    if (host && !u.searchParams.get("host")) u.searchParams.set("host", host);
    if (embedded && !u.searchParams.get("embedded")) u.searchParams.set("embedded", embedded);
    return u.pathname + u.search + u.hash;
  } catch {
    const fallback = new URL("/app/integrations/google", "https://example.local");
    fallback.searchParams.set("shop", shop);
    if (host) fallback.searchParams.set("host", host);
    if (embedded) fallback.searchParams.set("embedded", embedded);
    return fallback.pathname + fallback.search;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Callback happens outside embedded context; authenticate.admin may fail.
  try {
    const result = await authenticate.admin(request);
    void result;
  } catch {
    // ignore
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) throw new Response(`Google OAuth error: ${error}`, { status: 400 });
  if (!code || !state) throw new Response("Missing code/state", { status: 400 });

  let decoded:
    | { shop?: string; nonce?: string; returnTo?: string; host?: string; embedded?: string }
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

  const appBaseUrl = process.env.SHOPIFY_APP_URL;
  if (!appBaseUrl) throw new Response("Missing SHOPIFY_APP_URL", { status: 500 });

  const redirectUri = `${appBaseUrl.replace(/\/$/, "")}/api/google/oauth/callback`;

  const token = await exchangeGoogleCodeForToken({ code, redirectUri });

  // token may include refresh_token only on first consent
  const expiresAt =
    typeof token.expires_in === "number"
      ? new Date(Date.now() + token.expires_in * 1000)
      : null;

  await db.googleConnection.upsert({
    where: { shop },
    create: {
      shop,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: expiresAt ?? undefined,
    },
    update: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? undefined, // don't overwrite if missing
      expiresAt: expiresAt ?? undefined,
    },
  });

  const returnTo = ensureEmbeddedParams(returnToRaw, shop, host, embedded);

  // Re-enter embedded app by going through /auth (Shopify session bootstrap)
  return redirect(
    `/auth?shop=${shop}&returnTo=${encodeURIComponent(returnTo)}`
  );
}

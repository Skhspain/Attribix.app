// app/routes/api.meta.oauth.start.ts
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

/**
 * Starts Meta OAuth.
 *
 * IMPORTANT:
 * Shopify embedded auth can redirect to /auth/login when this endpoint is opened
 * top-level (outside the embedded iframe). That results in a blank/white page.
 *
 * So we do NOT require authenticate.admin() to succeed here.
 * We try it (best-case), but fall back to `shop` query param.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Prefer shop from the authenticated session when available
  let shop: string | null = null;
  try {
    const result = await authenticate.admin(request);
    if (!(result instanceof Response)) {
      shop = result.session.shop;
    }
  } catch {
    // Ignore – we'll fall back to query param below
  }

  // Fallback: shop query param (needed when top-level navigation drops embedded params/cookies)
  if (!shop) {
    shop = url.searchParams.get("shop");
  }

  if (!shop) {
    throw new Response("Missing shop (need ?shop=...)", { status: 400 });
  }

  const appBaseUrl = process.env.SHOPIFY_APP_URL;
  if (!appBaseUrl) throw new Response("Missing SHOPIFY_APP_URL", { status: 500 });

  const redirectUri = `${appBaseUrl.replace(/\/$/, "")}/api/meta/oauth/callback`;

  const clientId = process.env.META_APP_ID;
  if (!clientId) throw new Response("Missing META_APP_ID", { status: 500 });

  const returnTo = url.searchParams.get("returnTo") || "/app/integrations/meta";

  const stateObj = {
    shop,
    nonce: crypto.randomUUID(),
    returnTo,
  };

  const state = Buffer.from(JSON.stringify(stateObj), "utf8").toString("base64url");

  const fbAuth = new URL("https://www.facebook.com/v20.0/dialog/oauth");
  fbAuth.searchParams.set("client_id", clientId);
  fbAuth.searchParams.set("redirect_uri", redirectUri);
  fbAuth.searchParams.set("state", state);
  fbAuth.searchParams.set(
    "scope",
    ["ads_management", "ads_read", "business_management"].join(",")
  );
  fbAuth.searchParams.set("response_type", "code");

  return redirect(fbAuth.toString());
}

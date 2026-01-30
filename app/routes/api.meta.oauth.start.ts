// app/routes/api.meta.oauth.start.ts
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

/**
 * Starts Meta OAuth.
 *
 * IMPORTANT:
 * This endpoint must work in a TOP-LEVEL navigation (outside the embedded Shopify iframe).
 * In that context, `authenticate.admin(request)` often returns a Response that redirects to /auth/login.
 * We must NOT return that redirect, otherwise you get the white /auth/login page.
 *
 * So:
 * - We *try* authenticate.admin (nice when it works)
 * - But we do NOT require it
 * - We accept `shop` from query params
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Try admin auth if available, but DO NOT return its redirect Response.
  let authedShop: string | null = null;
  try {
    const result = await authenticate.admin(request);
    if (!(result instanceof Response)) {
      authedShop = result.session.shop || null;
    }
  } catch {
    // ignore
  }

  const shop = authedShop || url.searchParams.get("shop");
  if (!shop) {
    throw new Response("Missing shop (pass ?shop=...)", { status: 400 });
  }

  const appBaseUrl = process.env.SHOPIFY_APP_URL;
  if (!appBaseUrl) throw new Response("Missing SHOPIFY_APP_URL", { status: 500 });

  const clientId = process.env.META_APP_ID;
  if (!clientId) throw new Response("Missing META_APP_ID", { status: 500 });

  const redirectUri = `${appBaseUrl.replace(/\/$/, "")}/api/meta/oauth/callback`;

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

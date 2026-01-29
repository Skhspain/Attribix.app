// app/routes/api.meta.oauth.start.ts
import { redirect, json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

/**
 * Starts Meta OAuth.
 * IMPORTANT: In embedded apps, redirects inside the iframe can show a white page.
 * So:
 *  - If request wants JSON (fetcher), return { url } so the client can do TOP-LEVEL redirect.
 *  - Otherwise, do a normal server redirect (works in non-embedded contexts).
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { session } = result;
  const shop = session.shop;

  if (!shop) {
    throw new Response("Missing shop in session", { status: 400 });
  }

  const url = new URL(request.url);

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
  fbAuth.searchParams.set("scope", ["ads_management", "ads_read", "business_management"].join(","));
  fbAuth.searchParams.set("response_type", "code");

  const authUrl = fbAuth.toString();

  // If this is called by a fetcher / wants JSON, return the URL for a top-level redirect client-side.
  const accept = request.headers.get("accept") || "";
  const wantsJson = accept.includes("application/json");

  if (wantsJson) {
    return json({ ok: true, url: authUrl });
  }

  // Fallback: normal redirect
  return redirect(authUrl);
}

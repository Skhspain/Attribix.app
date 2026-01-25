// app/routes/api.meta.oauth.start.ts
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { redirectDocument } from "@remix-run/node";

/**
 * Starts Meta OAuth.
 * IMPORTANT: must be a top-level navigation (not a fetcher) to avoid iframe blocking.
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
  fbAuth.searchParams.set(
    "scope",
    ["ads_management", "ads_read", "business_management"].join(",")
  );
  fbAuth.searchParams.set("response_type", "code");

  return redirect(fbAuth.toString());
}

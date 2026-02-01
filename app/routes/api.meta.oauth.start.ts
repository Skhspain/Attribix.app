// app/routes/api.meta.oauth.start.ts
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

function base64UrlEncode(obj: any) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // These come from the embedded Shopify URL when you're inside Admin
  let shop = url.searchParams.get("shop") || "";
  let host = url.searchParams.get("host") || "";
  let embedded = url.searchParams.get("embedded") || "1";

  // If we are in embedded context, authenticate.admin will work and we can fill missing shop.
  // IMPORTANT: Do NOT let this redirect us to /auth/login.
  try {
    const { session } = await authenticate.admin(request);
    if (!shop) shop = session.shop;
  } catch (err) {
    // ignore — we still continue if we have shop in query params
    console.log("[meta.oauth.start] authenticate.admin failed (continuing)");
  }

  if (!shop) {
    return new Response("Missing shop", { status: 400 });
  }

  const returnTo = url.searchParams.get("returnTo") || "/app/integrations/meta";

  const appBaseUrl = process.env.SHOPIFY_APP_URL;
  if (!appBaseUrl) throw new Response("Missing SHOPIFY_APP_URL", { status: 500 });

  const redirectUri = `${appBaseUrl.replace(/\/$/, "")}/api/meta/oauth/callback`;

  const clientId = process.env.META_APP_ID;
  if (!clientId) throw new Response("Missing META_APP_ID", { status: 500 });

  // Put EVERYTHING we need to get back into Shopify embedded context in the state
  const state = base64UrlEncode({
    shop,
    nonce: crypto.randomUUID(),
    returnTo,
    host,
    embedded,
  });

  const scope = ["ads_read", "business_management"].join(",");

  const metaAuthUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  metaAuthUrl.searchParams.set("client_id", clientId);
  metaAuthUrl.searchParams.set("redirect_uri", redirectUri);
  metaAuthUrl.searchParams.set("state", state);
  metaAuthUrl.searchParams.set("response_type", "code");
  metaAuthUrl.searchParams.set("scope", scope);

  console.log("[meta.oauth.start] shop=", shop);
  console.log("[meta.oauth.start] host=", host);
  console.log("[meta.oauth.start] embedded=", embedded);
  console.log("[meta.oauth.start] redirectUri=", redirectUri);

  return redirect(metaAuthUrl.toString());
}

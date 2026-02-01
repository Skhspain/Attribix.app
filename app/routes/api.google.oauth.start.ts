import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Best-effort Shopify auth (same pattern as your Meta start)
  try {
    await authenticate.admin(request);
  } catch {
    // continue anyway
  }

  const url = new URL(request.url);

  const shop = url.searchParams.get("shop") || "";
  const host = url.searchParams.get("host") || "";
  const embedded = url.searchParams.get("embedded") || "1";
  const returnTo = url.searchParams.get("returnTo") || "/app/integrations/google";

  if (!shop) throw new Response("Missing shop", { status: 400 });

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI;
  const scopes =
    process.env.GOOGLE_ADS_SCOPES || "https://www.googleapis.com/auth/adwords";

  if (!clientId) throw new Response("Missing GOOGLE_ADS_CLIENT_ID", { status: 500 });
  if (!redirectUri) throw new Response("Missing GOOGLE_ADS_REDIRECT_URI", { status: 500 });

  const state = base64UrlEncode(
    JSON.stringify({
      shop,
      host,
      embedded,
      returnTo,
      nonce: crypto.randomUUID(),
    })
  );

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", scopes);
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent");
  googleAuthUrl.searchParams.set("include_granted_scopes", "true");
  googleAuthUrl.searchParams.set("state", state);

  return redirect(googleAuthUrl.toString());
}

export default function GoogleOAuthStartRoute() {
  return null;
}

import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function getHostFromReferer(request: Request): string {
  const ref = request.headers.get("referer");
  if (!ref) return "";
  try {
    const u = new URL(ref);
    return u.searchParams.get("host") || "";
  } catch {
    return "";
  }
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
  let host = url.searchParams.get("host") || "";
  const embedded = url.searchParams.get("embedded") || "1";
  const returnTo = url.searchParams.get("returnTo") || "/app/integrations/google";

  // ✅ Fallback: Shopify often includes host in the Referer
  if (!host) host = getHostFromReferer(request);

  if (!shop) throw new Response("Missing shop", { status: 400 });

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI;
  const scopes =
    process.env.GOOGLE_ADS_SCOPES || "https://www.googleapis.com/auth/adwords";

  if (!clientId) throw new Response("Missing GOOGLE_ADS_CLIENT_ID", { status: 500 });
  if (!redirectUri) throw new Response("Missing GOOGLE_ADS_REDIRECT_URI", { status: 500 });

  const nonce = crypto.randomUUID();

  const state = base64UrlEncode(
    JSON.stringify({
      shop,
      host,
      embedded,
      returnTo,
      nonce,
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

  // Store nonce in a short-lived cookie so the callback can verify it (CSRF protection)
  const response = redirect(googleAuthUrl.toString());
  response.headers.set(
    "Set-Cookie",
    `google_oauth_nonce=${nonce}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );
  return response;
}

export default function GoogleOAuthStartRoute() {
  return null;
}

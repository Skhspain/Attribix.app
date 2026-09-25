// app/routes/auth.google.callback.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { exchangeGoogleCodeForToken } from "~/services/googleOAuth.server";
import db from "~/db.server";

function errorPage(msg: string) {
  return new Response(
    `<!DOCTYPE html><html><head><title>Error</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;">
    <h1>❌ Google connection failed</h1><p>${msg}</p><p>Close this window and try again from Shopify.</p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

function base64UrlDecode(input: string) {
  // Node supports "base64url" directly
  return Buffer.from(input, "base64url").toString("utf8");
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  const stateRaw = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI;
  if (!redirectUri) return errorPage("Missing GOOGLE_ADS_REDIRECT_URI");
  if (!stateRaw || !code) return errorPage("Missing state or code");

  let state: any;
  try {
    const decoded = base64UrlDecode(stateRaw);
    state = JSON.parse(decoded);
  } catch {
    return errorPage("Invalid state");
  }

  const shop = state?.shop;
  if (!shop) return errorPage("Missing shop in state");

  try {
    const token = await exchangeGoogleCodeForToken({ code, redirectUri });

    // Google's consent screen lets users untick individual scopes. Without the
    // Ads scope every Ads API call fails with ACCESS_TOKEN_SCOPE_INSUFFICIENT,
    // so refuse to save a connection that can't actually read ad accounts.
    if (token.scope && !token.scope.includes("https://www.googleapis.com/auth/adwords")) {
      console.warn("[google-oauth] adwords scope not granted", { shop, scope: token.scope });
      return errorPage(
        "Google Ads access was not granted. Please connect again and make sure the checkbox for " +
          "<b>“See, edit, create and delete your Google Ads accounts and data”</b> is ticked on Google's consent screen."
      );
    }

    const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000);

    await db.googleConnection.upsert({
      where: { shop },
      create: {
        shop,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt,
        adCustomerId: null,
      },
      update: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? undefined,
        expiresAt,
      },
    });

    const isWooCommerce = state?.platform === "woocommerce" || !shop.includes(".myshopify.com");

    // Send the merchant back to the embedded page they started from (e.g. the
    // Google integration page, where they pick an ad account) — not admin home.
    const returnTo =
      typeof state?.returnTo === "string" && state.returnTo.startsWith("/app")
        ? state.returnTo
        : "/app/integrations/google";
    const storeHandle = shop.replace(".myshopify.com", "");
    const appHandle = process.env.SHOPIFY_APP_HANDLE || "attribix-app";
    const shopifyReturnUrl = `https://admin.shopify.com/store/${storeHandle}/apps/${appHandle}${returnTo}`;

    const successHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>Google Connected</title>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f6f6f7; }
      .card { background: white; border-radius: 8px; padding: 40px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.1); max-width: 400px; }
      .icon { font-size: 48px; margin-bottom: 16px; }
      h1 { font-size: 20px; margin: 0 0 8px; color: #202223; }
      p { color: #6d7175; margin: 0 0 24px; font-size: 14px; }
      a { display:inline-block;background:#008060;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:500;font-size:15px; }
      a:hover { background:#006e52; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">✅</div>
      <h1>Google Ads connected!</h1>
      <p>${isWooCommerce ? "You can close this window and refresh your WordPress admin." : "Taking you back to Attribix…"}</p>
      <a href="${isWooCommerce ? "#" : shopifyReturnUrl}" ${isWooCommerce ? `onclick="window.close(); return false;"` : ""}>${isWooCommerce ? "Close this window" : "Back to Attribix"}</a>
    </div>
    ${isWooCommerce ? "" : `<script>setTimeout(function(){window.location.href=${JSON.stringify(shopifyReturnUrl)};},1000);</script>`}
  </body>
</html>`;

    return new Response(successHtml, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  } catch (e: any) {
    const errorHtml = `<!DOCTYPE html>
<html>
  <head><title>Connection Failed</title><meta charset="utf-8" /></head>
  <body style="font-family:sans-serif;text-align:center;padding:40px;">
    <h1>❌ Google connection failed</h1>
    <p>${String(e?.message ?? e)}</p>
    <p>You can close this window and try again from Shopify.</p>
  </body>
</html>`;
    return new Response(errorHtml, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }
}

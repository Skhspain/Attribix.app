// app/routes/api.meta.oauth.callback.ts
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { exchangeMetaCodeForToken } from "~/services/metaGraph.server";

function ensureEmbeddedParams(urlPath: string, shop: string, host?: string, embedded?: string) {
  try {
    const u = new URL(urlPath, "https://example.local");
    if (!u.searchParams.get("shop")) u.searchParams.set("shop", shop);
    if (host && !u.searchParams.get("host")) u.searchParams.set("host", host);
    if (embedded && !u.searchParams.get("embedded")) u.searchParams.set("embedded", embedded);
    return u.pathname + u.search + u.hash;
  } catch {
    const fallback = new URL("/app/integrations/meta", "https://example.local");
    fallback.searchParams.set("shop", shop);
    if (host) fallback.searchParams.set("host", host);
    if (embedded) fallback.searchParams.set("embedded", embedded);
    return fallback.pathname + fallback.search;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  /**
   * Meta redirects to this URL from outside the Shopify embedded context.
   * authenticate.admin may fail here; that's OK because we identify the shop from `state`.
   */
  try {
    const result = await authenticate.admin(request);
    void result;
  } catch {
    // ignore
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    throw new Response("Missing code/state", { status: 400 });
  }

  let decoded:
    | { shop?: string; nonce?: string; returnTo?: string; host?: string; embedded?: string }
    | null = null;

  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    throw new Response("Invalid state", { status: 400 });
  }

  const shop = decoded?.shop;
  const returnToRaw = decoded?.returnTo || "/app/integrations/meta";
  const host = decoded?.host || "";
  const embedded = decoded?.embedded || "1";

  if (!shop) throw new Response("Missing shop in state", { status: 400 });

  const redirectUri = process.env.META_REDIRECT_URI || `${(process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "")}/api/meta/oauth/callback`;

  const token = await exchangeMetaCodeForToken({
    code,
    redirectUri,
  });

  const expiresAt =
    typeof token.expires_in === "number"
      ? new Date(Date.now() + token.expires_in * 1000)
      : null;

  await db.metaConnection.upsert({
    where: { shop },
    create: {
      shop,
      accessToken: token.access_token,
      expiresAt: expiresAt ?? undefined,
    },
    update: {
      accessToken: token.access_token,
      expiresAt: expiresAt ?? undefined,
    },
  });

  // Auto-select first ad account ONLY if none is saved yet (don't overwrite user's choice)
  try {
    const currentConn = await db.metaConnection.findUnique({ where: { shop } });
    const hasSavedAccount = !!currentConn?.adAccountId;

    if (hasSavedAccount) {
      // User already picked an account — don't overwrite it on reconnect
      console.log(`[meta-oauth] keeping existing adAccountId: ${currentConn.adAccountId}`);
    } else {
      const { fetchUserAdAccounts } = await import("~/services/metaGraph.server");
      const accounts = await fetchUserAdAccounts({ accessToken: token.access_token });
      const firstAccount = accounts?.data?.[0];
      if (firstAccount?.id) {
      await db.metaConnection.update({
        where: { shop },
        data: { adAccountId: String(firstAccount.id) },
      });

      // Auto-detect and save first pixel
      try {
        const pixelUrl = `https://graph.facebook.com/v20.0/${firstAccount.id}/adspixels?fields=id,name&access_token=${token.access_token}`;
        const pixelRes = await fetch(pixelUrl);
        const pixelData = await pixelRes.json();
        if (pixelData?.data?.[0]?.id) {
          const anyDb = db as any;
          await anyDb.trackingSettings?.upsert?.({
            where: { shop },
            create: { shop, fbPixelId: pixelData.data[0].id, fbToken: token.access_token },
            update: { fbPixelId: pixelData.data[0].id, fbToken: token.access_token },
          });
        }
      } catch (e) {
        console.error("[meta-oauth] pixel auto-detect failed:", e);
      }
      }
    }
  } catch (e) {
    console.error("[meta-oauth] ad account auto-select failed:", e);
  }

  const platform = (decoded as any)?.platform || "";
  const isWooCommerce = platform === "woocommerce" || !shop.includes(".myshopify.com");

  const title = "Meta connected!";
  const subtitle = isWooCommerce
    ? "Your Meta account has been linked to Attribix.<br>You can close this window and refresh your WordPress admin."
    : `Your Meta account has been linked to Attribix.<br>Redirecting you to Shopify in a moment…`;
  const buttonText = isWooCommerce ? "Close this window" : "Return to Shopify Admin";
  const buttonHref = isWooCommerce ? "#" : `https://${shop}/admin`;
  const buttonOnClick = isWooCommerce ? "window.close(); return false;" : "";
  const autoRedirect = isWooCommerce ? "" : `<meta http-equiv="refresh" content="3;url=https://${shop}/admin" />`;

  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title} – Attribix</title>
  ${autoRedirect}
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#f6f6f7;display:flex;align-items:center;justify-content:center;
         min-height:100vh}
    .card{background:#fff;border-radius:12px;padding:40px 48px;text-align:center;
          box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:420px;width:90%}
    .icon{font-size:48px;margin-bottom:16px}
    h1{font-size:22px;font-weight:600;color:#1a1a1a;margin-bottom:8px}
    p{color:#6d7175;font-size:15px;line-height:1.5;margin-bottom:24px}
    a{display:inline-block;background:#008060;color:#fff;text-decoration:none;
      padding:12px 28px;border-radius:8px;font-weight:500;font-size:15px}
    a:hover{background:#006e52}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    <a href="${buttonHref}" ${buttonOnClick ? `onclick="${buttonOnClick}"` : ""}>${buttonText}</a>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
  
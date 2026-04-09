// api/tiktok/oauth/callback — Exchange TikTok auth code for token
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { exchangeTikTokCodeForToken } from "~/services/tikTokAds.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const result = await authenticate.admin(request);
    void result;
  } catch {}

  const url = new URL(request.url);
  const authCode = url.searchParams.get("auth_code");
  const state = url.searchParams.get("state");

  if (!authCode || !state) {
    throw new Response("Missing auth_code/state", { status: 400 });
  }

  let decoded: { shop?: string; host?: string; embedded?: string; returnTo?: string; platform?: string } | null = null;
  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    throw new Response("Invalid state", { status: 400 });
  }

  const shop = decoded?.shop;
  if (!shop) throw new Response("Missing shop in state", { status: 400 });

  const tokenResult = await exchangeTikTokCodeForToken(authCode);

  const anyDb = db as any;
  await anyDb.tikTokConnection?.upsert?.({
    where: { shop },
    create: {
      shop,
      accessToken: tokenResult.access_token,
      advertiserId: tokenResult.advertiser_ids.length === 1 ? tokenResult.advertiser_ids[0] : null,
    },
    update: {
      accessToken: tokenResult.access_token,
      advertiserId: tokenResult.advertiser_ids.length === 1 ? tokenResult.advertiser_ids[0] : undefined,
    },
  });

  const platform = decoded?.platform || "";
  const isWoo = platform === "woocommerce" || !shop.includes(".myshopify.com");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>TikTok connected – Attribix</title>
  ${isWoo ? "" : `<meta http-equiv="refresh" content="3;url=https://${shop}/admin" />`}
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f7;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#fff;border-radius:12px;padding:40px 48px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:420px;width:90%}
    .icon{font-size:48px;margin-bottom:16px}
    h1{font-size:22px;font-weight:600;color:#1a1a1a;margin-bottom:8px}
    p{color:#6d7175;font-size:15px;line-height:1.5;margin-bottom:24px}
    a{display:inline-block;background:#008060;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:500;font-size:15px}
    a:hover{background:#006e52}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>TikTok connected!</h1>
    <p>${isWoo ? "Your TikTok Ads account has been linked to Attribix.<br>You can close this window and refresh your WordPress admin." : "Your TikTok Ads account has been linked to Attribix.<br>Redirecting you to Shopify in a moment…"}</p>
    <a href="${isWoo ? "#" : `https://${shop}/admin`}" ${isWoo ? `onclick="window.close(); return false;"` : ""}>${isWoo ? "Close this window" : "Return to Shopify Admin"}</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

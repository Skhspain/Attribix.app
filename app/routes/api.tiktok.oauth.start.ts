// api/tiktok/oauth/start — Initiate TikTok OAuth flow
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  const shopFromQuery = url.searchParams.get("shop") || "";
  const host = url.searchParams.get("host") || "";
  const embedded = url.searchParams.get("embedded") || "1";
  const returnTo = url.searchParams.get("returnTo") || "/app/integrations/tiktok";

  let shop = shopFromQuery;
  try {
    const result = await authenticate.admin(request);
    if (!(result instanceof Response)) {
      shop = result.session.shop;
    }
  } catch {}

  if (!shop) {
    return redirect(
      `${returnTo}?tiktokError=${encodeURIComponent("Missing shop")}&host=${encodeURIComponent(host)}&embedded=${encodeURIComponent(embedded)}`
    );
  }

  // Ensure connection record exists
  const anyDb = db as any;
  await anyDb.tikTokConnection?.upsert?.({
    where: { shop },
    update: {},
    create: { shop, accessToken: "__PENDING__" },
  });

  const TIKTOK_APP_ID = mustEnv("TIKTOK_APP_ID");
  const TIKTOK_REDIRECT_URI = mustEnv("TIKTOK_REDIRECT_URI");

  const platform = url.searchParams.get("platform") || "shopify";

  const state = Buffer.from(
    JSON.stringify({ shop, host, embedded, returnTo, platform }),
    "utf8"
  ).toString("base64url");

  const authUrl = new URL("https://business-api.tiktok.com/portal/auth");
  authUrl.searchParams.set("app_id", TIKTOK_APP_ID);
  authUrl.searchParams.set("redirect_uri", TIKTOK_REDIRECT_URI);
  authUrl.searchParams.set("state", state);

  return redirect(authUrl.toString());
}

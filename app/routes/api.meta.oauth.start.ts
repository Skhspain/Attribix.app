// app/routes/api.meta.oauth.start.ts
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
  const returnTo = url.searchParams.get("returnTo") || "/app/integrations/meta";

  // Try to get shop from session (preferred), but don't fail hard.
  let shop = shopFromQuery;

  try {
    const result = await authenticate.admin(request);
    if (!(result instanceof Response)) {
      shop = result.session.shop;
    }
  } catch {
    // ok: we can proceed with ?shop=...
  }

  if (!shop) {
    return redirect(
      `${returnTo}?metaError=${encodeURIComponent("Missing shop")}&host=${encodeURIComponent(
        host
      )}&embedded=${encodeURIComponent(embedded)}`
    );
  }

  // Ensure record exists (Prisma requires accessToken on create)
  await db.metaConnection.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      accessToken: "__PENDING__",
      // keep existing fields optional; don't set expiresAt unless you have it
    },
  });

  const META_APP_ID = mustEnv("META_APP_ID");
  const META_REDIRECT_URI = mustEnv("META_REDIRECT_URI");

  const platform = url.searchParams.get("platform") || "shopify";

  const state = Buffer.from(
    JSON.stringify({ shop, host, embedded, returnTo, platform }),
    "utf8"
  ).toString("base64url");

  // If a Business Login config ID is set, use the modern Business Login flow
  // (unified picker for ad accounts, pixels, pages, etc. with "Create new" option)
  const BUSINESS_LOGIN_CONFIG_ID = process.env.META_BUSINESS_LOGIN_CONFIG_ID;

  if (BUSINESS_LOGIN_CONFIG_ID) {
    const authUrl = new URL("https://www.facebook.com/v20.0/dialog/oauth");
    authUrl.searchParams.set("client_id", META_APP_ID);
    authUrl.searchParams.set("redirect_uri", META_REDIRECT_URI);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("config_id", BUSINESS_LOGIN_CONFIG_ID);
    authUrl.searchParams.set("response_type", "code");
    return redirect(authUrl.toString());
  }

  // Fallback: legacy OAuth flow with manual scopes
  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", META_APP_ID);
  authUrl.searchParams.set("redirect_uri", META_REDIRECT_URI);
  authUrl.searchParams.set("state", state);

  authUrl.searchParams.set(
    "scope",
    [
      "ads_read",
      "ads_management",
      "business_management",
      "leads_retrieval",
      "pages_show_list",
      "pages_manage_ads",
    ].join(",")
  );

  return redirect(authUrl.toString());
}

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

  const state = Buffer.from(
    JSON.stringify({ shop, host, embedded, returnTo }),
    "utf8"
  ).toString("base64url");

  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", META_APP_ID);
  authUrl.searchParams.set("redirect_uri", META_REDIRECT_URI);
  authUrl.searchParams.set("state", state);

  // Adjust scopes to what you actually use
  authUrl.searchParams.set(
    "scope",
    [
      "ads_read",
      "ads_management",
      "business_management",
      // add/remove as needed
    ].join(",")
  );

  return redirect(authUrl.toString());
}

// app/routes/api.google.sync-spend.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { syncGoogleSpendDaily } from "~/services/googleAds.server";
import { getValidGoogleToken } from "~/services/tokenRefresh.server";

export async function action({ request }: ActionFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const shop = result.session.shop;

  const conn = await db.googleConnection.findUnique({ where: { shop } }).catch(() => null);

  if (!conn?.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Google is not connected (missing access token)" }, { status: 400 });
  }

  if (!conn.adCustomerId) {
    return json({ ok: false, error: "No selected Google Ads customer ID (adCustomerId is null)" }, { status: 400 });
  }

  // Auto-refresh expired token
  const tokenResult = await getValidGoogleToken(shop);
  if (!tokenResult.ok) {
    return json({ ok: false, error: tokenResult.reason }, { status: 401 });
  }

  try {
    const out = await syncGoogleSpendDaily({
      shop,
      accessToken: tokenResult.accessToken,
      customerId: conn.adCustomerId,
    });

    return json({ ok: true, result: out });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Sync failed" }, { status: 500 });
  }
}

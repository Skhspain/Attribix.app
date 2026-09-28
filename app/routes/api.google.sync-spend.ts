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
    return json({ ok: false, error: "No Google Ads account selected. Go to Integrations → Google and complete the setup by selecting your ad account." }, { status: 400 });
  }

  // Record the attempt and its outcome like the hourly sync does, so the
  // status shown in the app (Setup, Overview, Integrations) stays current.
  const anyDb = db as any;
  await anyDb.googleConnection.update({ where: { shop }, data: { lastSyncAttemptAt: new Date() } }).catch(() => null);

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

    await anyDb.googleConnection.update({ where: { shop }, data: { lastSyncedAt: new Date(), lastSyncError: null } }).catch(() => null);
    return json({ ok: true, result: out });
  } catch (e: any) {
    const { describeGoogleError } = await import("~/services/googleSync.server");
    const reason = describeGoogleError(e);
    await anyDb.googleConnection.update({ where: { shop }, data: { lastSyncError: reason } }).catch(() => null);
    return json({ ok: false, error: reason }, { status: 500 });
  }
}

// app/routes/api.google.ads.customers.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { listAccessibleCustomers } from "~/services/googleAds.server";
import { getValidGoogleToken } from "~/services/tokenRefresh.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const shop = result.session.shop;

  const conn = await db.googleConnection.findUnique({ where: { shop } });

  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json(
      { ok: false, error: "Google not connected", customers: [] },
      { status: 401 }
    );
  }

  // Get a valid (auto-refreshed) access token
  const tokenResult = await getValidGoogleToken(shop);
  if (!tokenResult.ok) {
    return json(
      { ok: false, error: tokenResult.reason, customers: [] },
      { status: 401 }
    );
  }

  try {
    const customers = await listAccessibleCustomers({
      accessToken: tokenResult.accessToken,
    });

    return json({
      ok: true,
      customers,
      customersLoaded: customers.length,
      appOrigin: process.env.SHOPIFY_APP_URL ?? null,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: e?.message ?? String(e),
        customers: [],
        customersLoaded: 0,
        appOrigin: process.env.SHOPIFY_APP_URL ?? null,
      },
      { status: 502 }
    );
  }
}

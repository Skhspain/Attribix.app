// app/routes/api.meta.adaccounts.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { fetchUserAdAccounts } from "~/services/metaGraph.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const shop = result.session.shop;

  const conn = await db.metaConnection.findUnique({ where: { shop } });
  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Meta not connected" }, { status: 400 });
  }

  const res = await fetchUserAdAccounts({ accessToken: conn.accessToken });

  // Normalize to a small shape for the UI
  const accounts = (res?.data || []).map((a: any) => ({
    id: String(a.id), // usually "act_123"
    name: a.name ? String(a.name) : String(a.id),
    account_id: a.account_id ? String(a.account_id) : null,
    currency: a.currency ? String(a.currency) : null,
    timezone_name: a.timezone_name ? String(a.timezone_name) : null,
  }));

  return json({ ok: true, accounts });
}

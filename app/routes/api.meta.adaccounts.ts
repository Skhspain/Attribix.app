// app/routes/api.meta.adaccounts.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { fetchUserAdAccounts } from "~/services/metaGraph.server";

export async function loader({ request }: LoaderFunctionArgs) {
  console.log("[META][adaccounts] HIT", request.method, new URL(request.url).pathname);

  const authHeader = request.headers.get("authorization") || "";
  console.log("[META][adaccounts] auth header present:", !!authHeader, "len:", authHeader.length);

  const result = await authenticate.admin(request);
  if (result instanceof Response) {
    console.log("[META][adaccounts] authenticate.admin returned Response (redirect/401)");
    return result;
  }

  const shop = result.session.shop;
  console.log("[META][adaccounts] shop:", shop);

  const conn = await db.metaConnection.findUnique({ where: { shop } });
  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    console.log("[META][adaccounts] no meta connection/token for shop");
    return json({ ok: false, error: "Meta not connected" }, { status: 400 });
  }

  console.log("[META][adaccounts] token preview:", String(conn.accessToken).slice(0, 12) + "...");

  const res = await fetchUserAdAccounts({ accessToken: conn.accessToken });

  const accounts = (res?.data || []).map((a: any) => ({
    id: String(a.id),
    name: a.name ? String(a.name) : String(a.id),
    account_id: a.account_id ? String(a.account_id) : null,
    currency: a.currency ? String(a.currency) : null,
    timezone_name: a.timezone_name ? String(a.timezone_name) : null,
  }));

  console.log("[META][adaccounts] returning accounts:", accounts.length);

  return json({ ok: true, accounts });
}

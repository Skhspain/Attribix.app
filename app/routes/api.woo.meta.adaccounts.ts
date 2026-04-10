// api/woo/meta/adaccounts — List Meta ad accounts for a WooCommerce shop
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { fetchUserAdAccounts } from "~/services/metaGraph.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return json({ ok: false, error: "Missing shop" }, { status: 400, headers: cors() });
  }

  const conn = await db.metaConnection.findUnique({ where: { shop } });
  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Meta not connected", accounts: [] }, { headers: cors() });
  }

  try {
    const res = await fetchUserAdAccounts({ accessToken: conn.accessToken });
    const accounts = (res?.data || []).map((a: any) => ({
      id: String(a.id),
      name: a.name ? String(a.name) : String(a.id),
      account_id: a.account_id ? String(a.account_id) : null,
      currency: a.currency ? String(a.currency) : null,
    }));
    return json({ ok: true, accounts, selectedId: conn.adAccountId }, { headers: cors() });
  } catch (e: any) {
    return json({ ok: false, error: e.message, accounts: [] }, { headers: cors() });
  }
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

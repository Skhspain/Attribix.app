import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

function extractCustomerId(resourceName: string) {
  // "customers/1234567890" -> "1234567890"
  const parts = resourceName.split("/");
  return parts[1] || resourceName;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || result.session.shop;

  const conn = await db.googleConnection.findUnique({ where: { shop } });
  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Google is not connected." }, { status: 401 });
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return json({ ok: false, error: "Missing GOOGLE_ADS_DEVELOPER_TOKEN on server." }, { status: 500 });
  }

  try {
    const resp = await fetch("https://googleads.googleapis.com/v16/customers:listAccessibleCustomers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return json(
        { ok: false, error: `Google Ads API error (${resp.status}). ${text}` },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as { resourceNames?: string[] };

    const customers = (data.resourceNames || []).map((rn) => {
      const id = extractCustomerId(rn);
      return { id, name: "" }; // name optional; you can enrich later
    });

    return json({ ok: true, customers });
  } catch (err: any) {
    return json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

function extractCustomerId(resourceName) {
  // "customers/1234567890" -> "1234567890"
  const parts = String(resourceName || "").split("/");
  return parts[1] || resourceName;
}

export async function loader({ request }) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || result.session.shop;

  const conn = await db.googleConnection
    .findUnique({ where: { shop } })
    .catch(() => null);

  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Google is not connected." }, { status: 401 });
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return json(
      { ok: false, error: "Missing GOOGLE_ADS_DEVELOPER_TOKEN on server." },
      { status: 500 }
    );
  }

  try {
    // NOTE: keep v16 here to match your earlier working example.
    const resp = await fetch(
      "https://googleads.googleapis.com/v16/customers:listAccessibleCustomers",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return json(
        { ok: false, error: `Google Ads API error (${resp.status}). ${text}` },
        { status: 502 }
      );
    }

    const data = await resp.json().catch(() => ({}));

    const resourceNames = Array.isArray(data?.resourceNames) ? data.resourceNames : [];
    const customers = resourceNames.map((rn) => {
      const id = extractCustomerId(rn);
      return { id, name: "" };
    });

    return json({ ok: true, customers });
  } catch (err) {
    return json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}

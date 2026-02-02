import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

function dateRangeLast30Days() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);

  const toYMD = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toYMD(start), end: toYMD(end) };
}

function parseYMDToDate(ymd: string) {
  // store as DateTime at midnight UTC
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function action({ request }: ActionFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const form = await request.formData();
  const shop = String(form.get("shop") || result.session.shop);
  const customerId = String(form.get("customerId") || "").trim();
  const range = String(form.get("range") || "last_30_days");

  if (!customerId) {
    return json({ ok: false, error: "Missing customerId" }, { status: 400 });
  }

  const conn = await db.googleConnection.findUnique({ where: { shop } });
  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Google is not connected." }, { status: 401 });
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return json({ ok: false, error: "Missing GOOGLE_ADS_DEVELOPER_TOKEN on server." }, { status: 500 });
  }

  const { start, end } = dateRangeLast30Days();

  // GAQL: campaign spend per day (cost_micros)
  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      metrics.cost_micros
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `.trim();

  try {
    const url = `https://googleads.googleapis.com/v16/customers/${customerId}/googleAds:searchStream`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return json(
        { ok: false, error: `Google Ads API error (${resp.status}). ${text}` },
        { status: 502 }
      );
    }

    // searchStream returns an array of "batches"
    const batches = (await resp.json()) as any[];

    let rows = 0;
    let created = 0;

    for (const batch of batches) {
      const results = batch?.results || [];
      for (const r of results) {
        const ymd = r?.segments?.date;
        const campaignName = r?.campaign?.name || null;
        const costMicros = Number(r?.metrics?.costMicros || 0);

        if (!ymd) continue;

        const spend = costMicros / 1_000_000;
        const date = parseYMDToDate(ymd);

        rows += 1;

        // Simple insert (no unique constraints exist on AdSpendDaily)
        // If you want "replace", we can delete existing google rows in range first.
        await db.adSpendDaily.create({
          data: {
            date,
            platform: "google",
            campaign: campaignName ?? undefined,
            spend,
          },
        });

        created += 1;
      }
    }

    return json({
      ok: true,
      range,
      customerId,
      start,
      end,
      rows,
      created,
    });
  } catch (err: any) {
    return json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

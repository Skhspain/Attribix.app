// app/routes/api.google.ads.sync-spend.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { authenticate } from "~/shopify.server";
import { googleAdsSearchStream } from "~/services/googleAds.server";

function parseGoogleDateToUtcMidnight(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map((v) => Number(v));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0));
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Body might be empty, depending on how you call it from UI
  const body = await request.json().catch(() => ({}));

  // ✅ Try body first
  let customerId: string | undefined =
    body?.customerId || body?.customer_id || body?.selectedCustomerId;

  // ✅ Fallback: use saved selection from DB
  if (!customerId) {
    const conn = await db.googleConnection.findUnique({ where: { shop } });
    customerId = conn?.adCustomerId ?? undefined;
  }

  if (!customerId) {
    return json(
      {
        ok: false,
        error:
          "Missing customerId. Save selection first (or send { customerId } in the request).",
      },
      { status: 400 }
    );
  }

  const conn = await db.googleConnection.findUnique({ where: { shop } });
  if (!conn?.accessToken) {
    return json(
      { ok: false, error: "Google not connected for this shop" },
      { status: 400 }
    );
  }

  // ✅ Daily spend totals last 30 days
  const query = `
    SELECT
      segments.date,
      metrics.cost_micros
    FROM customer
    WHERE segments.date DURING LAST_30_DAYS
  `.trim();

  try {
    const chunks = await googleAdsSearchStream({
      accessToken: conn.accessToken,
      customerId,
      query,
    });

    const rows: Array<{ date: string; costMicros: number }> = [];
    for (const chunk of chunks) {
      const results = Array.isArray(chunk?.results) ? chunk.results : [];
      for (const r of results) {
        const date = r?.segments?.date;
        const costMicros = Number(r?.metrics?.costMicros ?? 0);
        if (date) rows.push({ date, costMicros });
      }
    }

    const totalsByDate = new Map<string, number>();
    for (const r of rows) {
      totalsByDate.set(r.date, (totalsByDate.get(r.date) ?? 0) + r.costMicros);
    }

    const items = Array.from(totalsByDate.entries()).map(([dateStr, micros]) => {
      const spend = micros / 1_000_000;
      return {
        date: parseGoogleDateToUtcMidnight(dateStr),
        platform: "google",
        campaign: null,
        adset: null,
        ad: null,
        spend,
      };
    });

    if (items.length > 0) {
      const times = items.map((i) => i.date.getTime());
      const minDate = new Date(Math.min(...times));
      const maxDate = new Date(Math.max(...times));

      await db.adSpendDaily.deleteMany({
        where: {
          platform: "google",
          campaign: null,
          adset: null,
          ad: null,
          date: { gte: minDate, lte: maxDate },
        },
      });

      await db.adSpendDaily.createMany({ data: items });
    }

    // ✅ ensure connection has the latest chosen ID
    await db.googleConnection.update({
      where: { shop },
      data: { adCustomerId: customerId },
    });

    return json({
      ok: true,
      customerId,
      insertedDays: items.length,
    });
  } catch (err: any) {
    return json(
      {
        ok: false,
        error: err?.message ? String(err.message) : "Failed to sync spend",
      },
      { status: 500 }
    );
  }
}

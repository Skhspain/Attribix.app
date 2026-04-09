// app/services/touchpoints.server.ts
// Multi-touch attribution engine.
//
// Responsibilities:
//  1. upsertTouchpoint()  — called by api.track whenever a session has UTM/click data
//  2. buildJourneyCredits() — called by webhooks.orders_create to distribute revenue
//                             across all 4 models and store PurchaseTouchpoint rows

import db from "~/db.server";

// ─── Channel detection ────────────────────────────────────────────────────────

export function channelOf(data: {
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  referrer?: string | null;
}): string {
  if (data.fbclid) return "Meta Ads";
  if (data.gclid)  return "Google Ads";
  if (data.ttclid) return "TikTok Ads";
  if (data.msclkid) return "Microsoft Ads";

  const src = (data.utmSource || "").toLowerCase();
  const med = (data.utmMedium  || "").toLowerCase();

  if (src.includes("email") || src.includes("newsletter") || med === "email") return "Email";
  if (src.includes("facebook") || src.includes("instagram") || src.includes("meta")) {
    return med === "cpc" || med === "paid" ? "Meta Ads" : "Organic Social";
  }
  if (src.includes("google") || src.includes("adwords")) {
    return med === "cpc" || med === "paid" ? "Google Ads" : "Organic Search";
  }
  if (src.includes("tiktok")) return med === "cpc" || med === "paid" ? "TikTok Ads" : "Organic Social";
  if (src.includes("bing") || src.includes("microsoft")) return "Microsoft Ads";
  if (src.includes("organic") || med === "organic") return "Organic Search";
  if (src.includes("social") || med === "social") return "Organic Social";
  if (src) return src; // unknown utm source

  // Referrer-based fallback
  const ref = (data.referrer || "").toLowerCase();
  if (ref.includes("google.")) return "Organic Search";
  if (ref.includes("bing.") || ref.includes("yahoo.")) return "Organic Search";
  if (ref.includes("facebook.") || ref.includes("instagram.")) return "Organic Social";
  if (ref.includes("t.co") || ref.includes("twitter.")) return "Organic Social";

  return "Direct / Unknown";
}

function hasAttribution(data: {
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  utmSource?: string | null;
}): boolean {
  return !!(data.fbclid || data.gclid || data.ttclid || data.msclkid || data.utmSource);
}

// ─── 1. Upsert touchpoint ─────────────────────────────────────────────────────
// Called from api.track on every page-view/session that has attribution data.
// Uses shop+visitorId+sessionId as the unique key so one session = one touchpoint.

export async function upsertTouchpoint(input: {
  shop: string;
  visitorId: string;
  sessionId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  referrer?: string | null;
  landingPage?: string | null;
}): Promise<void> {
  if (!hasAttribution(input)) return; // Nothing to attribute — skip

  const channel = channelOf(input);
  const anyDb = db as any;

  // Use visitorId alone as key if no sessionId (shouldn't happen but safe fallback)
  const sessionKey = input.sessionId || `nosession_${input.visitorId}`;

  try {
    await anyDb.touchpoint?.upsert?.({
      where: {
        shop_visitorId_sessionId: {
          shop: input.shop,
          visitorId: input.visitorId,
          sessionId: sessionKey,
        },
      },
      create: {
        shop: input.shop,
        visitorId: input.visitorId,
        sessionId: sessionKey,
        channel,
        utmSource:   input.utmSource   ?? null,
        utmMedium:   input.utmMedium   ?? null,
        utmCampaign: input.utmCampaign ?? null,
        fbclid:      input.fbclid      ?? null,
        gclid:       input.gclid       ?? null,
        ttclid:      input.ttclid      ?? null,
        msclkid:     input.msclkid     ?? null,
        referrer:    input.referrer    ?? null,
        landingPage: input.landingPage ?? null,
        touchedAt:   new Date(),
      },
      update: {
        // Update click IDs if a better one comes in later in the same session
        fbclid:      input.fbclid      ?? undefined,
        gclid:       input.gclid       ?? undefined,
        ttclid:      input.ttclid      ?? undefined,
        msclkid:     input.msclkid     ?? undefined,
        utmSource:   input.utmSource   ?? undefined,
        utmMedium:   input.utmMedium   ?? undefined,
        utmCampaign: input.utmCampaign ?? undefined,
        channel,
        landingPage: input.landingPage ?? undefined,
      },
    });
  } catch (e: any) {
    // Non-fatal — log and continue
    console.error("[touchpoints] upsertTouchpoint error:", e?.message);
  }
}

// ─── 2. Credit models ─────────────────────────────────────────────────────────

function computeCredits(
  touchpoints: Array<{ touchedAt: Date }>,
  purchaseTime: Date
): Array<{ firstTouch: number; lastTouch: number; linear: number; timeDecay: number }> {
  const n = touchpoints.length;
  if (n === 0) return [];

  // Linear: equal share
  const linearShare = 1 / n;

  // Time-decay: half-life = 7 days, more weight closer to purchase
  const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
  const purchaseMs = purchaseTime.getTime();
  const rawDecay = touchpoints.map(tp => {
    const diffMs = purchaseMs - tp.touchedAt.getTime();
    return Math.pow(2, -diffMs / HALF_LIFE_MS); // 2^(-age/halflife)
  });
  const decaySum = rawDecay.reduce((s, w) => s + w, 0);

  return touchpoints.map((_, i) => ({
    firstTouch: i === 0 ? 1 : 0,
    lastTouch:  i === n - 1 ? 1 : 0,
    linear:     linearShare,
    timeDecay:  decaySum > 0 ? rawDecay[i] / decaySum : linearShare,
  }));
}

// ─── 3. Build journey credits for an order ────────────────────────────────────
// Called from webhooks.orders_create after the Purchase record is saved.
// Looks up the visitor's touchpoint history and creates PurchaseTouchpoint rows.

export async function buildJourneyCredits(input: {
  shop: string;
  orderId: string;
  visitorId?: string | null;
  revenue: number;
  currency: string;
  purchaseTime: Date;
  // Fallback attribution from the order itself (if no journey found)
  fallback?: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    fbclid?: string | null;
    gclid?: string | null;
    ttclid?: string | null;
    msclkid?: string | null;
  };
}): Promise<void> {
  const anyDb = db as any;
  const ATTRIBUTION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90-day window
  const windowStart = new Date(input.purchaseTime.getTime() - ATTRIBUTION_WINDOW_MS);

  // Delete any previously stored touchpoints for this order (idempotent)
  await anyDb.purchaseTouchpoint?.deleteMany?.({ where: { orderId: input.orderId } }).catch(() => null);

  let touchpoints: any[] = [];

  // ── Look up full journey via visitorId ──
  if (input.visitorId) {
    touchpoints = await anyDb.touchpoint?.findMany?.({
      where: {
        shop:      input.shop,
        visitorId: input.visitorId,
        touchedAt: { gte: windowStart, lte: input.purchaseTime },
      },
      orderBy: { touchedAt: "asc" },
    }).catch(() => []) ?? [];
  }

  // ── Fallback: single touchpoint from the order's own UTM/click data ──
  if (touchpoints.length === 0 && input.fallback && hasAttribution(input.fallback)) {
    touchpoints = [{
      id:          null,
      channel:     channelOf(input.fallback),
      utmSource:   input.fallback.utmSource,
      utmMedium:   input.fallback.utmMedium,
      utmCampaign: input.fallback.utmCampaign,
      fbclid:      input.fallback.fbclid,
      gclid:       input.fallback.gclid,
      touchedAt:   new Date(input.purchaseTime.getTime() - 60_000), // 1 min before
    }];
  }

  // No attribution data at all — store single Direct row
  if (touchpoints.length === 0) {
    touchpoints = [{
      id: null, channel: "Direct / Unknown",
      utmSource: null, utmMedium: null, utmCampaign: null,
      fbclid: null, gclid: null,
      touchedAt: new Date(input.purchaseTime.getTime() - 60_000),
    }];
  }

  const credits = computeCredits(touchpoints, input.purchaseTime);
  const n = touchpoints.length;

  const rows = touchpoints.map((tp: any, i: number) => ({
    shop:         input.shop,
    orderId:      input.orderId,
    visitorId:    input.visitorId ?? null,
    touchpointId: tp.id ?? null,
    position:     i + 1,
    totalSteps:   n,
    channel:      tp.channel,
    utmSource:    tp.utmSource   ?? null,
    utmMedium:    tp.utmMedium   ?? null,
    utmCampaign:  tp.utmCampaign ?? null,
    fbclid:       tp.fbclid      ?? null,
    gclid:        tp.gclid       ?? null,
    revenue:      input.revenue,
    currency:     input.currency,
    creditFirstTouch: credits[i].firstTouch,
    creditLastTouch:  credits[i].lastTouch,
    creditLinear:     credits[i].linear,
    creditTimeDecay:  credits[i].timeDecay,
    touchedAt:    tp.touchedAt ?? null,
  }));

  try {
    await anyDb.purchaseTouchpoint?.createMany?.({ data: rows });
    console.log(`[touchpoints] journey for order ${input.orderId}: ${n} touchpoint(s)`);
  } catch (e: any) {
    console.error("[touchpoints] buildJourneyCredits error:", e?.message);
  }
}

// app/services/touchpoints.server.ts
// Multi-touch attribution engine.
//
// Responsibilities:
//  1. upsertTouchpoint()  — called by api.track for every tracked session
//  2. buildJourneyCredits() — called by webhooks.orders_create to distribute revenue
//                             across all 4 models and store PurchaseTouchpoint rows

import db from "~/db.server";

// ─── Channel detection ────────────────────────────────────────────────────────

export const NOT_TRACKED_CHANNEL = "Not tracked";

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
  // Google uses "ppc", Meta often "paid_social"; all of these are paid clicks.
  const paid = ["cpc", "ppc", "paid", "paid_social", "paidsocial", "paid-social", "cpm", "display"].includes(med);

  if (src.includes("email") || src.includes("newsletter") || med === "email") return "Email";
  if (src.includes("facebook") || src.includes("instagram") || src.includes("meta")) {
    return paid ? "Meta Ads" : "Organic Social";
  }
  if (src.includes("adwords")) return "Google Ads";
  if (src.includes("google")) return paid ? "Google Ads" : "Organic Search";
  if (src.includes("tiktok")) return paid ? "TikTok Ads" : "Organic Social";
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

  // A visit we saw, with no campaign or referrer: a real direct visit.
  return "Direct";
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
// Called from api.track for every tracked event. Every visit is a touchpoint,
// with or without campaign data: an organic or direct visit is part of the
// journey too, and leaving it out made those buyers' orders look unseen.
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
  touchedAt?: Date; // replayed history; defaults to now
}): Promise<void> {
  const attributed = hasAttribution(input);
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
        touchedAt:   input.touchedAt   ?? new Date(),
      },
      // Later pages in a session have the shop itself as referrer; they must
      // not turn the session's source into "Direct". Only campaign data
      // arriving later in the same session updates it.
      update: attributed
        ? {
            fbclid:      input.fbclid      ?? undefined,
            gclid:       input.gclid       ?? undefined,
            ttclid:      input.ttclid      ?? undefined,
            msclkid:     input.msclkid     ?? undefined,
            utmSource:   input.utmSource   ?? undefined,
            utmMedium:   input.utmMedium   ?? undefined,
            utmCampaign: input.utmCampaign ?? undefined,
            channel,
            landingPage: input.landingPage ?? undefined,
          }
        : {},
    });
  } catch (e: any) {
    // Non-fatal — log and continue
    console.error("[touchpoints] upsertTouchpoint error:", e?.message);
  }
}

// ─── 1b. One touchpoint per visit ─────────────────────────────────────────────
// The theme embed and the web pixel each keep their own session id, so one
// visit can be stored twice. Sessions that start within VISIT_GAP_MS of the
// previous one are the same visit; campaign data beats a bare referrer.

const VISIT_GAP_MS = 30 * 60 * 1000;

export function mergeVisits<T extends {
  touchedAt: Date;
  channel?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  utmSource?: string | null;
}>(touchpoints: T[]): T[] {
  const sorted = [...touchpoints].sort((a, b) => a.touchedAt.getTime() - b.touchedAt.getTime());
  const visits: Array<{ start: number; last: number; tp: T }> = [];
  for (const tp of sorted) {
    const t = tp.touchedAt.getTime();
    const cur = visits[visits.length - 1];
    if (cur && t - cur.last < VISIT_GAP_MS) {
      cur.last = t;
      if (!hasAttribution(cur.tp) && hasAttribution(tp)) {
        // Keep the visit's start time so the journey order doesn't change.
        cur.tp = { ...tp, touchedAt: cur.tp.touchedAt };
      }
    } else {
      visits.push({ start: t, last: t, tp });
    }
  }
  return visits.map((v) => v.tp);
}

// An order's own data (landing URL, Shopify's referring site) can still say
// where the buyer came from when we never saw the visit. A referrer only
// counts if it names a known source; anything else is not evidence.
function orderLevelChannel(fallback: {
  utmSource?: string | null;
  utmMedium?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  referrer?: string | null;
}): string | null {
  if (hasAttribution(fallback)) return channelOf(fallback);
  if (!fallback.referrer) return null;
  const ch = channelOf({ referrer: fallback.referrer });
  return ch === "Direct" ? null : ch;
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
    referrer?: string | null; // Shopify's referring_site for the order
  };
}): Promise<void> {
  const anyDb = db as any;
  const ATTRIBUTION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90-day window
  const windowStart = new Date(input.purchaseTime.getTime() - ATTRIBUTION_WINDOW_MS);

  let touchpoints: any[] = [];

  // ── Look up full journey via visitorId ──
  if (input.visitorId) {
    const visits = await anyDb.touchpoint?.findMany?.({
      where: {
        shop:      input.shop,
        visitorId: input.visitorId,
        touchedAt: { gte: windowStart, lte: input.purchaseTime },
      },
      orderBy: { touchedAt: "asc" },
    }).catch(() => []) ?? [];
    touchpoints = mergeVisits(visits);
  }

  // ── Fallback: single touchpoint from the order's own UTM/click/referrer data ──
  const orderChannel = input.fallback ? orderLevelChannel(input.fallback) : null;
  if (touchpoints.length === 0 && orderChannel) {
    touchpoints = [{
      id:          null,
      channel:     orderChannel,
      utmSource:   input.fallback!.utmSource,
      utmMedium:   input.fallback!.utmMedium,
      utmCampaign: input.fallback!.utmCampaign,
      fbclid:      input.fallback!.fbclid,
      gclid:       input.fallback!.gclid,
      touchedAt:   new Date(input.purchaseTime.getTime() - 60_000), // 1 min before
    }];
  }

  // We saw this buyer at checkout but no earlier page views under that visitor
  // id (the checkout pixel and the storefront can keep separate ids). The
  // visit was still seen and had no campaign, so it's direct — not unknown.
  let seenAtCheckoutOnly = false;
  if (touchpoints.length === 0 && input.visitorId) {
    seenAtCheckoutOnly = true;
    touchpoints = [{
      id:          null,
      channel:     input.fallback?.referrer ? channelOf({ referrer: input.fallback.referrer }) : "Direct",
      utmSource:   null, utmMedium: null, utmCampaign: null,
      fbclid:      null, gclid: null,
      touchedAt:   new Date(input.purchaseTime.getTime() - 60_000),
    }];
  }

  // The webhook and the thank-you page both build the journey, in either
  // order. A build must not replace a better one: anything beats unknown, and
  // a visitor's journey beats an order-level guess.
  const existing: Array<{ visitorId: string | null; channel: string }> = await anyDb.purchaseTouchpoint
    ?.findMany?.({ where: { orderId: input.orderId }, select: { visitorId: true, channel: true } })
    .catch(() => []) ?? [];
  const existingCaptured = existing.some((r) => r.channel !== NOT_TRACKED_CHANNEL);
  const existingVisitorId = existing.find((r) => r.visitorId)?.visitorId ?? null;
  if (existing.length > 0) {
    if (touchpoints.length === 0) return;
    if (!input.visitorId && existingVisitorId && existingCaptured) return;
    // A bare "seen at checkout" step mustn't replace a journey with a source.
    if (seenAtCheckoutOnly && existingCaptured) return;
  }

  // No visit history and no attribution on the order: we don't know where the
  // buyer came from (often a declined cookie banner). That's not "direct".
  if (touchpoints.length === 0) {
    touchpoints = [{
      id: null, channel: NOT_TRACKED_CHANNEL,
      utmSource: null, utmMedium: null, utmCampaign: null,
      fbclid: null, gclid: null,
      touchedAt: new Date(input.purchaseTime.getTime() - 60_000),
    }];
  }

  // Replace any previously stored touchpoints for this order (idempotent)
  await anyDb.purchaseTouchpoint?.deleteMany?.({ where: { orderId: input.orderId } }).catch(() => null);

  const credits = computeCredits(touchpoints, input.purchaseTime);
  const n = touchpoints.length;

  const rows = touchpoints.map((tp: any, i: number) => ({
    shop:         input.shop,
    orderId:      input.orderId,
    visitorId:    input.visitorId ?? existingVisitorId,
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

function clickIdsInUrls(...urls: Array<string | null | undefined>) {
  const ids: Record<"fbclid" | "gclid" | "ttclid" | "msclkid", string | null> =
    { fbclid: null, gclid: null, ttclid: null, msclkid: null };
  for (const url of urls) {
    if (!url) continue;
    try {
      const params = new URL(url).searchParams;
      for (const k of Object.keys(ids) as Array<keyof typeof ids>) ids[k] ??= params.get(k) || null;
    } catch {}
  }
  return ids;
}

// ─── 4. Rebuild journeys from tracked history ─────────────────────────────────
// Visits used to be stored as touchpoints only when they carried campaign data,
// so organic and direct buyers ended up "Not tracked". Their page views are in
// TrackedEvent; replay them into touchpoints and rebuild each order's journey.

export async function rebuildJourneys(shop: string, since: Date): Promise<{ orders: number; captured: number }> {
  const anyDb = db as any;
  const purchases: any[] = await anyDb.purchase.findMany({
    where: { shop, createdAt: { gte: since } },
    select: {
      orderId: true, visitorId: true, totalValue: true, currency: true, createdAt: true,
      utmSource: true, utmMedium: true, utmCampaign: true,
      fbclid: true, gclid: true, ttclid: true, msclkid: true, referrer: true,
    },
  });

  const historyStart = new Date(since.getTime() - 90 * 24 * 60 * 60 * 1000);
  const replayed = new Set<string>();
  let captured = 0;

  for (const p of purchases) {
    if (p.visitorId && !replayed.has(p.visitorId)) {
      replayed.add(p.visitorId);
      const events: any[] = await anyDb.trackedEvent.findMany({
        where: { shop, visitorId: p.visitorId, createdAt: { gte: historyStart }, sessionId: { not: null } },
        orderBy: { createdAt: "asc" },
        select: {
          sessionId: true, url: true, referrer: true, createdAt: true,
          utmSource: true, utmMedium: true, utmCampaign: true,
          fbclid: true, gclid: true, ttclid: true, msclkid: true,
        },
      });
      const sessions = new Map<string, any[]>();
      for (const e of events) {
        if (!sessions.has(e.sessionId)) sessions.set(e.sessionId, []);
        sessions.get(e.sessionId)!.push(e);
      }
      for (const [sessionId, evs] of sessions) {
        const first = evs[0];
        // Stored click ids may be the theme embed's cookie copies; only ids in
        // the page or referrer URL show this visit came from an ad.
        const withFreshIds = evs.map((e) => ({ ...e, ...clickIdsInUrls(e.url, e.referrer) }));
        const att: any = withFreshIds.find((e) => hasAttribution(e)) ?? {};
        await upsertTouchpoint({
          shop,
          visitorId: p.visitorId,
          sessionId,
          utmSource: att.utmSource ?? null,
          utmMedium: att.utmMedium ?? null,
          utmCampaign: att.utmCampaign ?? null,
          fbclid: att.fbclid ?? null,
          gclid: att.gclid ?? null,
          ttclid: att.ttclid ?? null,
          msclkid: att.msclkid ?? null,
          referrer: first.referrer ?? null,
          landingPage: first.url ?? null,
          touchedAt: first.createdAt,
        });
      }
    }

    await buildJourneyCredits({
      shop,
      orderId: p.orderId,
      visitorId: p.visitorId,
      revenue: Number(p.totalValue ?? 0),
      currency: p.currency ?? "USD",
      purchaseTime: new Date(p.createdAt),
      fallback: {
        utmSource: p.utmSource, utmMedium: p.utmMedium, utmCampaign: p.utmCampaign,
        fbclid: p.fbclid, gclid: p.gclid, ttclid: p.ttclid, msclkid: p.msclkid,
        referrer: p.referrer,
      },
    });
    const rows = await anyDb.purchaseTouchpoint.findMany({ where: { orderId: p.orderId }, select: { channel: true } });
    if (rows.some((r: any) => r.channel !== NOT_TRACKED_CHANNEL)) captured++;
  }

  return { orders: purchases.length, captured };
}

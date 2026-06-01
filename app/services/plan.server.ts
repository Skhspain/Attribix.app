// app/services/plan.server.ts
// Central plan management — limits, plan detection, quota checks.

import db from "~/db.server";

// ─── Plan limits ─────────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  // "smallest-plan" in Shopify Partner Dashboard = entry-level "$39/month" plan
  starter: {
    ordersPerMonth:      300,
    emailSendsPerMonth:  500,
    reviewsPerMonth:     50,
    leadsPerMonth:       25,
    historyDays:         30,
    subscribers:         500,
  },
  growth: {
    ordersPerMonth:      2500,
    emailSendsPerMonth:  20_000,
    reviewsPerMonth:     -1,   // unlimited
    leadsPerMonth:       -1,
    historyDays:         90,
    subscribers:         5000,
  },
  pro: {
    ordersPerMonth:      -1,
    emailSendsPerMonth:  -1,
    reviewsPerMonth:     -1,
    leadsPerMonth:       -1,
    historyDays:         365,
    subscribers:         -1,
  },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;

// ─── In-memory plan cache (single Fly.io instance) ───────────────────────────

const cache = new Map<string, { plan: PlanId; exp: number }>();
const TTL = 5 * 60 * 1000; // 5 minutes

export function setCachedPlan(shop: string, plan: PlanId) {
  cache.set(shop, { plan, exp: Date.now() + TTL });
}

/** Evict a shop from the plan cache — call after returning from billing so the
 *  next request re-fetches the now-active subscription from Shopify. */
export function clearCachedPlan(shop: string) {
  cache.delete(shop);
}

function getCached(shop: string): PlanId | null {
  const hit = cache.get(shop);
  if (hit && hit.exp > Date.now()) return hit.plan;
  cache.delete(shop);
  return null;
}

// ─── Manual plan overrides (for dev stores billed outside Shopify) ───────────
//
// Set a Fly.io secret named  MANUAL_PLAN_<shop-with-dots-and-hyphens-as-underscores>
// to "starter", "growth", or "pro" to grant a specific plan without going through
// Shopify managed pricing.
//
// Example:  MANUAL_PLAN_annamariemonster_myshopify_com=growth
//
// To revoke access: delete the secret (flyctl secrets unset MANUAL_PLAN_...).
// The in-memory cache will expire within 5 minutes.
function getManualPlanOverride(shop: string): PlanId | null {
  const key = "MANUAL_PLAN_" + shop.replace(/[\.\-]/g, "_");
  const val = process.env[key] ?? process.env[key.toUpperCase()];
  if (val === "starter" || val === "growth" || val === "pro") return val;
  return null;
}

// ─── Plan resolution ─────────────────────────────────────────────────────────

/** Persist the resolved plan to the DB so webhooks can look it up later. */
async function persistPlanToDb(shop: string, plan: PlanId) {
  try {
    const anyDb = db as any;
    await anyDb.shopPlan?.upsert?.({
      where: { shop },
      create: { shop, plan },
      update: { plan },
    });
  } catch {
    // Non-fatal — in-memory cache still works
  }
}

/** Look up the persisted plan from DB (used by webhooks without admin access). */
async function getPersistedPlan(shop: string): Promise<PlanId | null> {
  try {
    const anyDb = db as any;
    const row = await anyDb.shopPlan?.findUnique?.({ where: { shop } });
    if (!row) return null;
    if (row.plan === "starter" || row.plan === "growth" || row.plan === "pro") return row.plan as PlanId;
    return null;
  } catch {
    return null;
  }
}

/** Resolve plan from Shopify's active subscription (requires admin API). */
export async function getShopPlan(shop: string, admin?: any): Promise<PlanId> {
  const cached = getCached(shop);
  if (cached) return cached;

  // Check for a manual override (dev stores, partner clients billed outside Shopify)
  const manual = getManualPlanOverride(shop);
  if (manual) {
    console.log(`[plan] ${shop} → ${manual} (manual override)`);
    setCachedPlan(shop, manual);
    persistPlanToDb(shop, manual); // keep DB in sync so webhooks see the right plan
    return manual;
  }

  if (!admin) {
    // Webhook path — no admin API. Use DB-persisted plan as fallback.
    const persisted = await getPersistedPlan(shop);
    if (persisted) {
      console.log(`[plan] ${shop} → ${persisted} (db fallback)`);
      setCachedPlan(shop, persisted);
      return persisted;
    }
    console.log(`[plan] ${shop} → starter (no admin, no db record)`);
    return "starter"; // safe default when plan is unknown
  }

  try {
    const res = await admin.graphql(`
      query { appInstallation { activeSubscriptions { name status } } }
    `);
    const data = await res.json();
    const subs: { name: string; status?: string }[] = data?.data?.appInstallation?.activeSubscriptions ?? [];

    console.log(`[plan] ${shop} activeSubscriptions=${JSON.stringify(subs)}`);

    if (subs.length === 0) {
      console.log(`[plan] ${shop} → none (no active subscriptions)`);
      // Don't cache "none" — plan may be confirmed moments later on return from billing
      return "none" as any;
    }

    const name = (subs[0].name ?? "").toLowerCase();
    let plan: PlanId =
      name.includes("pro")                          ? "pro" :
      name.includes("growth")                       ? "growth" :
      name.includes("attribix") || name.includes("client") ? "growth" : // agency/partner plans
      "starter"; // covers "smallest-plan", "new store", or any other entry-level name

    console.log(`[plan] ${shop} → ${plan} (subscription name="${subs[0].name}")`);
    setCachedPlan(shop, plan);
    persistPlanToDb(shop, plan); // fire-and-forget
    return plan;
  } catch (err: any) {
    console.error(`[plan] ${shop} getShopPlan error: ${err?.message ?? err}`);
    return "starter";
  }
}

export function getPlanLimits(plan: PlanId) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;
}

// ─── Start-of-month helper ────────────────────────────────────────────────────

export function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ─── Quota checks ─────────────────────────────────────────────────────────────

export async function checkLeadsQuota(shop: string, plan: PlanId) {
  const limit = getPlanLimits(plan).leadsPerMonth;
  if (limit === -1) return { allowed: true, used: 0, limit };

  const anyDb = db as any;
  const used: number = await anyDb.lead?.count?.({
    where: { shop, createdAt: { gte: startOfMonth() } },
  }).catch(() => 0) ?? 0;

  return { allowed: used < limit, used, limit };
}

export async function checkReviewsQuota(shop: string, plan: PlanId) {
  const limit = getPlanLimits(plan).reviewsPerMonth;
  if (limit === -1) return { allowed: true, used: 0, limit };

  const anyDb = db as any;
  const used: number = await anyDb.review?.count?.({
    where: { shop, createdAt: { gte: startOfMonth() } },
  }).catch(() => 0) ?? 0;

  return { allowed: used < limit, used, limit };
}

export async function checkNewsletterSendsQuota(shop: string, plan: PlanId, recipientCount: number) {
  const limit = getPlanLimits(plan).emailSendsPerMonth;
  if (limit === -1) return { allowed: true, used: 0, limit };

  const anyDb = db as any;
  // Sum recipientCount from campaigns sent this month
  const campaigns: { recipientCount: number | null }[] = await anyDb.newsletterCampaign?.findMany?.({
    where: { shop, status: "sent", sentAt: { gte: startOfMonth() } },
    select: { recipientCount: true },
  }).catch(() => []) ?? [];

  const used = campaigns.reduce((sum, c) => sum + (c.recipientCount ?? 0), 0);
  return { allowed: used + recipientCount <= limit, used, limit };
}

export async function checkSubscribersQuota(shop: string, plan: PlanId) {
  const limit = getPlanLimits(plan).subscribers;
  if (limit === -1) return { allowed: true, used: 0, limit };

  const anyDb = db as any;
  const used: number = await anyDb.newsletterSubscriber?.count?.({
    where: { shop, status: "subscribed" },
  }).catch(() => 0) ?? 0;

  return { allowed: used < limit, used, limit };
}

export async function checkOrdersQuota(shop: string, plan: PlanId) {
  const limit = getPlanLimits(plan).ordersPerMonth;
  if (limit === -1) return { allowed: true, used: 0, limit };

  const anyDb = db as any;
  const used: number = await anyDb.purchase?.count?.({
    where: { shop, createdAt: { gte: startOfMonth() } },
  }).catch(() => 0) ?? 0;

  return { allowed: used < limit, used, limit };
}

/** Returns the date cutoff for analytics queries based on the plan's history window. */
export function getHistoryCutoff(plan: PlanId): Date {
  const days = getPlanLimits(plan).historyDays;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

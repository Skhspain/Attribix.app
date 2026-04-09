// app/services/plan.server.ts
// Central plan management — limits, plan detection, quota checks.

import db from "~/db.server";

// ─── Plan limits ─────────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
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

function getCached(shop: string): PlanId | null {
  const hit = cache.get(shop);
  if (hit && hit.exp > Date.now()) return hit.plan;
  cache.delete(shop);
  return null;
}

// ─── Plan resolution ─────────────────────────────────────────────────────────

/** Resolve plan from Shopify's active subscription (requires admin API). */
export async function getShopPlan(shop: string, admin?: any): Promise<PlanId> {
  const cached = getCached(shop);
  if (cached) return cached;

  if (!admin) return "starter"; // safe default when no API access (webhooks etc.)

  try {
    const res = await admin.graphql(`
      query { appInstallation { activeSubscriptions { name } } }
    `);
    const data = await res.json();
    const subs: { name: string }[] = data?.data?.appInstallation?.activeSubscriptions ?? [];

    let plan: PlanId = "starter";
    if (subs.length > 0) {
      const name = (subs[0].name ?? "").toLowerCase();
      if (name.includes("pro"))    plan = "pro";
      else if (name.includes("growth")) plan = "growth";
      else plan = "starter";
    }

    setCachedPlan(shop, plan);
    return plan;
  } catch {
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

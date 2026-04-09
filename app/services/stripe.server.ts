// app/services/stripe.server.ts
// Stripe API helpers — uses a merchant's restricted API key to fetch revenue data.

const STRIPE_API = "https://api.stripe.com/v1";

function stripeHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

async function stripeGet(apiKey: string, path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${STRIPE_API}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: stripeHeaders(apiKey) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.error?.message ?? `Stripe API error ${res.status}`);
  }
  return res.json() as Promise<any>;
}

/** Verify the key works and return account name. */
export async function verifyStripeKey(apiKey: string): Promise<{ valid: boolean; name?: string; currency?: string; error?: string }> {
  try {
    const account = await stripeGet(apiKey, "/account");
    return {
      valid: true,
      name: account.settings?.dashboard?.display_name || account.business_profile?.name || account.id,
      currency: account.default_currency?.toUpperCase() ?? "USD",
    };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}

/** Fetch all pages of a Stripe list endpoint. */
async function fetchAll(apiKey: string, path: string, params: Record<string, string> = {}): Promise<any[]> {
  const all: any[] = [];
  let startingAfter: string | null = null;

  do {
    const p: Record<string, string> = { limit: "100", ...params };
    if (startingAfter) p.starting_after = startingAfter;

    const page = await stripeGet(apiKey, path, p);
    all.push(...(page.data ?? []));
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  } while (all.length < 2000);

  return all;
}

export interface StripeSummary {
  totalRevenue: number;          // cents
  mrr: number;                   // cents
  activeSubscriptions: number;
  chargesCount: number;
  currency: string;
  recentCharges: StripeCharge[];
  subscriptions: StripeSubscription[];
  revenueByDay: { date: string; revenue: number }[];
}

export interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customerEmail: string | null;
  customerName: string | null;
  description: string | null;
  createdAt: number; // unix timestamp
}

export interface StripeSubscription {
  id: string;
  status: string;
  customerEmail: string | null;
  planName: string | null;
  amount: number;
  currency: string;
  interval: string;
  currentPeriodEnd: number;
}

export async function fetchStripeSummary(apiKey: string, historyCutoff: Date): Promise<StripeSummary> {
  const since = Math.floor(historyCutoff.getTime() / 1000).toString();

  // Fetch charges and subscriptions in parallel
  const [charges, subscriptions] = await Promise.all([
    fetchAll(apiKey, "/charges", { created: since, expand: ["data.customer"] }).catch(() => [] as any[]),
    fetchAll(apiKey, "/subscriptions", { status: "active", expand: ["data.customer", "data.items.data.price"] }).catch(() => [] as any[]),
  ]);

  // Process charges
  const successfulCharges = charges.filter((c: any) => c.status === "succeeded" && !c.refunded);
  const totalRevenue = successfulCharges.reduce((sum: number, c: any) => sum + (c.amount ?? 0), 0);
  const currency = successfulCharges[0]?.currency?.toUpperCase() ?? "USD";

  const recentCharges: StripeCharge[] = successfulCharges.slice(0, 50).map((c: any) => ({
    id: c.id,
    amount: c.amount,
    currency: c.currency?.toUpperCase() ?? "USD",
    status: c.status,
    customerEmail: c.customer?.email ?? c.receipt_email ?? null,
    customerName: c.customer?.name ?? c.billing_details?.name ?? null,
    description: c.description ?? null,
    createdAt: c.created,
  }));

  // Revenue by day
  const byDay: Record<string, number> = {};
  for (const c of successfulCharges) {
    const day = new Date(c.created * 1000).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + c.amount;
  }
  const revenueByDay = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));

  // Process subscriptions
  const mrr = subscriptions.reduce((sum: number, s: any) => {
    const item = s.items?.data?.[0];
    const price = item?.price;
    if (!price) return sum;
    const amount = price.unit_amount ?? 0;
    return sum + (price.recurring?.interval === "year" ? Math.round(amount / 12) : amount);
  }, 0);

  const stripeSubscriptions: StripeSubscription[] = subscriptions.slice(0, 50).map((s: any) => ({
    id: s.id,
    status: s.status,
    customerEmail: s.customer?.email ?? null,
    planName: s.items?.data?.[0]?.price?.nickname ?? s.items?.data?.[0]?.price?.id ?? null,
    amount: s.items?.data?.[0]?.price?.unit_amount ?? 0,
    currency: s.items?.data?.[0]?.price?.currency?.toUpperCase() ?? "USD",
    interval: s.items?.data?.[0]?.price?.recurring?.interval ?? "month",
    currentPeriodEnd: s.current_period_end,
  }));

  return {
    totalRevenue,
    mrr,
    activeSubscriptions: subscriptions.length,
    chargesCount: successfulCharges.length,
    currency,
    recentCharges,
    subscriptions: stripeSubscriptions,
    revenueByDay,
  };
}

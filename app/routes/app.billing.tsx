// app/routes/app.billing.tsx
// Pricing & billing page — shows plans, current subscription, upgrade/downgrade.
// Uses Shopify's App Subscription billing API.

import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useEffect } from "react";
import { authenticate } from "~/shopify.server";
import { setCachedPlan, type PlanId } from "~/services/plan.server";
import {
  Page, Card, BlockStack, InlineStack, Text, Button, Badge, Divider, Banner,
} from "@shopify/polaris";

const APP_URL = process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev";

// ─── Plan definitions ─────────────────────────────────────────────────────────

export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 39,
    description: "For new stores getting started with attribution.",
    color: "#6b7280",
    features: [
      "300 orders tracked / month",
      "500 newsletter sends / month",
      "50 reviews / month",
      "25 leads / month",
      "SEO audit — unlimited",
      "Meta & Google Ads data",
      "30 days analytics history",
      "UTM builder",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 79,
    description: "For growing stores that want full channel visibility.",
    color: "#008060",
    highlight: true,
    features: [
      "2,500 orders tracked / month",
      "5,000 subscribers — 20k sends",
      "Unlimited reviews & leads",
      "SEO audit — unlimited",
      "90 days analytics history",
      "Social calendar & analytics",
      "Product feed — Google & Meta",
      "Signup widget builder",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 149,
    description: "For high-volume stores that need full history and unlimited everything.",
    color: "#7c3aed",
    features: [
      "Unlimited orders tracked",
      "Unlimited subscribers & sends",
      "Unlimited reviews & leads",
      "365 days analytics history",
      "Visitor flow analysis",
      "Product feed — Google & Meta",
      "Social calendar & analytics",
      "Priority support",
    ],
  },
];

// ─── Loader — check current subscription ─────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  let currentPlan: string | null = null;
  let subscriptionId: string | null = null;
  let trialDaysRemaining: number | null = null;
  let status: string = "none";

  try {
    const res = await admin.graphql(`
      query {
        appInstallation {
          activeSubscriptions {
            id
            name
            status
            trialDays
            createdAt
            currentPeriodEnd
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price { amount currencyCode }
                    interval
                  }
                }
              }
            }
          }
        }
      }
    `);
    const body = await res.json();
    const subs = body?.data?.appInstallation?.activeSubscriptions ?? [];
    if (subs.length > 0) {
      const sub = subs[0];
      subscriptionId = sub.id;
      status = sub.status;
      // Match by name
      const matched = PLANS.find(p => sub.name?.toLowerCase().includes(p.id));
      currentPlan = matched?.id ?? sub.name;
      if (matched) setCachedPlan(shop, matched.id as PlanId);

      if (sub.trialDays && sub.createdAt) {
        const created = new Date(sub.createdAt).getTime();
        const trialEnd = created + sub.trialDays * 86400000;
        trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - Date.now()) / 86400000));
      }
    }
  } catch (e) {
    console.error("[billing] loader error:", e);
  }

  return json({ currentPlan, subscriptionId, status, trialDaysRemaining, shop });
}

// ─── Action — create subscription ────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json().catch(() => ({}));
  const planId = body?.planId as string;
  const intent = body?.intent as string;

  const plan = PLANS.find(p => p.id === planId);
  if (!plan) return json({ error: "Invalid plan" }, { status: 400 });

  if (intent === "subscribe") {
    const returnUrl = `${APP_URL}/app/billing?shop=${session.shop}`;

    const res = await admin.graphql(`
      mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean!, $trialDays: Int) {
        appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test, trialDays: $trialDays) {
          appSubscription { id status }
          confirmationUrl
          userErrors { field message }
        }
      }
    `, {
      variables: {
        name: `Attribix ${plan.name}`,
        returnUrl,
        test: process.env.SHOPIFY_BILLING_TEST === "true",
        trialDays: 7,
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              price: { amount: plan.price, currencyCode: "USD" },
              interval: "EVERY_30_DAYS",
            },
          },
        }],
      },
    });

    const gql = await res.json();
    const result = gql?.data?.appSubscriptionCreate;
    const errors = result?.userErrors ?? [];

    if (errors.length > 0) {
      return new Response(JSON.stringify({ error: errors[0].message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const confirmationUrl = result?.confirmationUrl;
    if (confirmationUrl) {
      return json({ confirmationUrl });
    }

    return json({ error: "Failed to create subscription" }, { status: 500 });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { currentPlan, status, trialDaysRemaining } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();

  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    const confirmationUrl = (fetcher.data as any)?.confirmationUrl;
    if (!confirmationUrl) return;
    // Break out of the embedded iframe to Shopify's charge-approval page.
    // Using _top is App Bridge-compatible and works when third-party cookies are blocked.
    window.open(confirmationUrl, "_top");
  }, [fetcher.data]);

  function handleSubscribe(planId: string) {
    fetcher.submit({ intent: "subscribe", planId }, { method: "post", encType: "application/json" });
  }

  const activePlan = PLANS.find(p => p.id === currentPlan);

  return (
    <Page
      title="Plans & Billing"
      subtitle="Choose the plan that fits your store"
    >
      <BlockStack gap="600">

        {/* Current plan banner */}
        {activePlan && (
          <Banner tone="success">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  Current plan: {activePlan.name} — ${activePlan.price}/month
                </Text>
                {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {trialDaysRemaining} trial days remaining
                  </Text>
                )}
              </BlockStack>
              <Badge tone="success">{status === "ACTIVE" ? "Active" : status}</Badge>
            </InlineStack>
          </Banner>
        )}

        {fetcher.data?.error && (
          <Banner tone="critical">
            <Text as="p">{fetcher.data.error}</Text>
          </Banner>
        )}

        {/* Plan cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          alignItems: "stretch",
        }}>
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isHighlight = plan.highlight && !currentPlan;

            return (
              <div
                key={plan.id}
                style={{
                  border: isCurrent
                    ? `2px solid ${plan.color}`
                    : isHighlight
                      ? `2px solid ${plan.color}`
                      : "1.5px solid #e1e3e5",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#fff",
                  boxShadow: isHighlight ? `0 4px 24px ${plan.color}22` : "none",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Plan header */}
                <div style={{
                  background: isCurrent || isHighlight ? plan.color : "#f9fafb",
                  padding: "20px 20px 16px",
                }}>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text
                      as="h2"
                      variant="headingMd"
                      fontWeight="bold"
                    >
                      <span style={{ color: isCurrent || isHighlight ? "#fff" : "#111827" }}>
                        {plan.name}
                      </span>
                    </Text>
                    {isCurrent && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.25)",
                        color: "#fff", borderRadius: 20, padding: "3px 10px",
                      }}>
                        Current
                      </span>
                    )}
                    {isHighlight && !isCurrent && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.25)",
                        color: "#fff", borderRadius: 20, padding: "3px 10px",
                      }}>
                        Most popular
                      </span>
                    )}
                  </InlineStack>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: isCurrent || isHighlight ? "#fff" : "#111827" }}>
                      ${plan.price}
                    </span>
                    <span style={{ fontSize: 13, color: isCurrent || isHighlight ? "rgba(255,255,255,0.75)" : "#6b7280", marginLeft: 4 }}>
                      /month
                    </span>
                  </div>
                  <Text as="p" variant="bodySm">
                    <span style={{ color: isCurrent || isHighlight ? "rgba(255,255,255,0.8)" : "#6b7280" }}>
                      {plan.description}
                    </span>
                  </Text>
                </div>

                {/* Features */}
                <div style={{ padding: "16px 20px", flex: 1 }}>
                  <BlockStack gap="200">
                    {plan.features.map((f) => (
                      <InlineStack key={f} gap="200" blockAlign="center">
                        <span style={{ color: plan.color, fontSize: 14, flexShrink: 0 }}>✓</span>
                        <Text as="p" variant="bodySm">{f}</Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </div>

                {/* CTA */}
                <div style={{ padding: "0 20px 20px" }}>
                  {isCurrent ? (
                    <div style={{
                      textAlign: "center", padding: "10px", background: "#f0fdf4",
                      borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#008060",
                    }}>
                      ✓ Your current plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={isLoading}
                      style={{
                        width: "100%",
                        background: plan.color,
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "11px",
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: isLoading ? "wait" : "pointer",
                        opacity: isLoading ? 0.7 : 1,
                        transition: "opacity 0.15s",
                      }}
                    >
                      {isLoading && fetcher.formData?.get?.("planId") === plan.id
                        ? "Redirecting…"
                        : currentPlan
                          ? (PLANS.findIndex(p => p.id === plan.id) > PLANS.findIndex(p => p.id === currentPlan) ? "Upgrade" : "Downgrade")
                          : "Start free trial"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ / notes */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">Billing notes</Text>
            <Divider />
            <BlockStack gap="200">
              {[
                ["Free trial", "All plans include a 7-day free trial. Cancel any time and you won't be charged."],
                ["Billing", "Billed monthly through your Shopify account. Charges appear on your Shopify invoice."],
                ["Upgrades", "Upgrading takes effect immediately. You're charged the prorated difference."],
                ["Downgrades", "Downgrades take effect at the end of your current billing period."],
                ["Cancellation", "Cancel any time from your Shopify admin under Apps & sales channels."],
              ].map(([title, desc]) => (
                <InlineStack key={title} gap="200" blockAlign="start">
                  <span style={{ color: "#008060", flexShrink: 0 }}>•</span>
                  <Text as="p" variant="bodySm">
                    <strong>{title}:</strong> {desc}
                  </Text>
                </InlineStack>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}

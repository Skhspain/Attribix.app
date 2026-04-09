// app/routes/app.newsletter._index.tsx
// Newsletter compact overview — 4 stat cards, mini sparkline, quick-action cards.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Grid,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Divider,
  Badge,
  Box,
} from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalSubscribers,
    newSubscribers30d,
    unsubscribed30d,
    recentCampaigns,
    recentSubs,
    sentCampaigns,
  ] = await Promise.all([
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } }),
    db.newsletterSubscriber.count({
      where: { shop, status: "subscribed", createdAt: { gte: thirtyDaysAgo } },
    }),
    db.newsletterSubscriber.count({
      where: { shop, status: "unsubscribed", unsubscribedAt: { gte: thirtyDaysAgo } },
    }),
    anyDb.newsletterCampaign
      ?.findMany?.({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          status: true,
          sentAt: true,
          recipientCount: true,
          deliveredCount: true,
          openCount: true,
          clickCount: true,
        },
      })
      .catch(() => []) ?? [],
    db.newsletterSubscriber.findMany({
      where: { shop, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    anyDb.newsletterCampaign
      ?.findMany?.({
        where: { shop, status: "sent" },
        select: {
          openCount: true,
          clickCount: true,
          deliveredCount: true,
          recipientCount: true,
        },
      })
      .catch(() => []) ?? [],
  ]);

  // Monthly send usage
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const settings = await anyDb.newsletterSettings?.findUnique?.({ where: { shop } }).catch(() => null);
  const monthlyEmailLimit: number = settings?.monthlyEmailLimit ?? 2500;
  const monthlyCampaigns = await anyDb.newsletterCampaign?.findMany?.({
    where: { shop, status: "sent", sentAt: { gte: monthStart, lt: monthEnd } },
    select: { recipientCount: true },
  }).catch(() => []) ?? [];
  const emailsSentThisMonth: number = monthlyCampaigns.reduce(
    (sum: number, c: { recipientCount: number }) => sum + (c.recipientCount ?? 0), 0
  );

  // Source breakdown
  const sources = await db.newsletterSubscriber.groupBy({
    by: ["source"],
    where: { shop, status: "subscribed" },
    _count: { source: true },
    orderBy: { _count: { source: "desc" } },
  });

  // Build 30-day growth buckets
  const dailyGrowth = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const count = recentSubs.filter(
      (s: { createdAt: Date; status: string }) =>
        s.createdAt.toISOString().slice(0, 10) === dateStr
    ).length;
    return { date: dateStr, count };
  });

  // Compute average open/click rates from sent campaigns
  const totalCampaignsSent = sentCampaigns.length;
  let avgOpenRate = 0;
  let avgClickRate = 0;
  let avgDeliveryRate = 0;

  if (totalCampaignsSent > 0) {
    const totals = sentCampaigns.reduce(
      (
        acc: { opens: number; clicks: number; delivered: number; recipients: number },
        c: { openCount: number | null; clickCount: number | null; deliveredCount: number | null; recipientCount: number | null }
      ) => ({
        opens: acc.opens + (c.openCount ?? 0),
        clicks: acc.clicks + (c.clickCount ?? 0),
        delivered: acc.delivered + (c.deliveredCount ?? 0),
        recipients: acc.recipients + (c.recipientCount ?? 0),
      }),
      { opens: 0, clicks: 0, delivered: 0, recipients: 0 }
    );

    if (totals.delivered > 0) {
      avgOpenRate = Math.round((totals.opens / totals.delivered) * 100);
      avgClickRate = Math.round((totals.clicks / totals.delivered) * 100);
    }
    if (totals.recipients > 0) {
      avgDeliveryRate = Math.round((totals.delivered / totals.recipients) * 100);
    }
  }

  const netGrowth30d = newSubscribers30d - unsubscribed30d;

  return json({
    totalSubscribers,
    newSubscribers30d,
    unsubscribed30d,
    netGrowth30d,
    avgOpenRate,
    avgClickRate,
    avgDeliveryRate,
    recentCampaigns,
    sources,
    dailyGrowth,
    totalCampaignsSent,
    emailsSentThisMonth,
    monthlyEmailLimit,
  });
}

function statusBadge(status: string) {
  const map: Record<string, "success" | "info" | "warning" | "critical" | "new"> = {
    sent: "success",
    sending: "info",
    scheduled: "warning",
    draft: "new",
    failed: "critical",
  };
  return <Badge tone={map[status] ?? "new"}>{status}</Badge>;
}

export default function NewsletterOverview() {
  const {
    totalSubscribers,
    newSubscribers30d,
    avgOpenRate,
    avgClickRate,
    recentCampaigns,
    sources,
    dailyGrowth,
    totalCampaignsSent,
    emailsSentThisMonth,
    monthlyEmailLimit,
  } = useLoaderData<typeof loader>();

  const usagePct = Math.min(100, Math.round((emailsSentThisMonth / monthlyEmailLimit) * 100));
  const usageColor = emailsSentThisMonth >= monthlyEmailLimit ? "#dc2626" : emailsSentThisMonth >= monthlyEmailLimit * 0.8 ? "#f59e0b" : "#10b981";

  const totalSourceCount = sources.reduce((sum: number, s: any) => sum + s._count.source, 0);
  const maxDailyCount = Math.max(...dailyGrowth.map((d) => d.count), 1);
  const startDate = dailyGrowth[0]?.date ?? "";
  const endDate = dailyGrowth[dailyGrowth.length - 1]?.date ?? "";

  // Last 3 campaigns for quick-actions card
  const last3Campaigns = recentCampaigns.slice(0, 3);

  return (
    <BlockStack gap="500">
        {/* ── REVENUE MESSAGE ── */}
        {totalSubscribers === 0 || avgOpenRate === 0 ? (
          <div style={{
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
            borderRadius: 12, padding: "24px 28px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap",
          }}>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd" tone="text-inverse">You're missing revenue from email</Text>
              <Text as="p" variant="bodySm" tone="text-inverse">
                Email is generating 0% of your revenue. Most stores generate 20–30% from email.
              </Text>
            </BlockStack>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/app/newsletter/campaigns/new" style={{
                display: "inline-block", padding: "10px 20px", borderRadius: 8,
                background: "#008060", color: "#fff", fontWeight: 700, fontSize: 14,
                textDecoration: "none", fontFamily: "inherit",
              }}>Promote your best product →</a>
              <a href="/app/newsletter/subscribers" style={{
                display: "inline-block", padding: "10px 20px", borderRadius: 8,
                background: "rgba(255,255,255,0.15)", color: "#fff", fontWeight: 600, fontSize: 14,
                textDecoration: "none", fontFamily: "inherit", border: "1px solid rgba(255,255,255,0.3)",
              }}>Recover abandoned carts →</a>
            </div>
          </div>
        ) : (
          <div style={{
            background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 12, padding: "16px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          }}>
            <BlockStack gap="050">
              <Text as="p" variant="bodyMd" fontWeight="semibold">Email is working — keep it growing</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {avgOpenRate > 0 ? `${avgOpenRate}% average open rate. ` : ""}Send consistently to maximise revenue.
              </Text>
            </BlockStack>
            <Button url="/app/newsletter/campaigns/new" variant="primary">Send a newsletter →</Button>
          </div>
        )}

      {/* Section A — 4 stat cards in 2x2 grid */}
      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Total subscribers</Text>
              <Text as="p" variant="headingXl">{totalSubscribers.toLocaleString()}</Text>
            </BlockStack>
          </Card>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">New last 30 days</Text>
              <Text as="p" variant="headingXl" tone="success">+{newSubscribers30d.toLocaleString()}</Text>
            </BlockStack>
          </Card>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Avg open rate</Text>
              <Text as="p" variant="headingXl">
                {totalCampaignsSent > 0 ? `${avgOpenRate}%` : "—"}
              </Text>
            </BlockStack>
          </Card>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Avg click rate</Text>
              <Text as="p" variant="headingXl">
                {totalCampaignsSent > 0 ? `${avgClickRate}%` : "—"}
              </Text>
            </BlockStack>
          </Card>
        </Grid.Cell>
      </Grid>

      {/* Monthly send usage counter */}
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="h2" variant="headingSm">Emails sent this month</Text>
              <Text as="p" variant="bodySm" tone="subdued">Resets on the 1st of each month</Text>
            </BlockStack>
            <div style={{ textAlign: "right" }}>
              <Text as="p" variant="headingLg" fontWeight="bold">
                <span style={{ color: usageColor }}>{emailsSentThisMonth.toLocaleString()}</span>
                <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 14 }}> / {monthlyEmailLimit.toLocaleString()}</span>
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {(monthlyEmailLimit - emailsSentThisMonth).toLocaleString()} remaining
              </Text>
            </div>
          </InlineStack>
          <div style={{ background: "#f3f4f6", borderRadius: 99, height: 10, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${usagePct}%`,
              background: usageColor,
              borderRadius: 99,
              transition: "width 0.4s ease",
            }} />
          </div>
          {emailsSentThisMonth >= monthlyEmailLimit && (
            <Text as="p" variant="bodySm" tone="critical">
              Monthly limit reached. Campaigns will be blocked until next month or your plan is upgraded.
            </Text>
          )}
          {emailsSentThisMonth >= monthlyEmailLimit * 0.8 && emailsSentThisMonth < monthlyEmailLimit && (
            <Text as="p" variant="bodySm" tone="caution">
              You're using {usagePct}% of your monthly send limit.
            </Text>
          )}
        </BlockStack>
      </Card>

      {/* Section B — Mini sparkline card */}
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingSm">Subscriber growth — last 30 days</Text>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 48 }}>
            {dailyGrowth.map(({ date, count }) => (
              <div
                key={date}
                title={`${date}: ${count}`}
                style={{
                  flex: 1,
                  height:
                    maxDailyCount > 0
                      ? `${Math.max(4, Math.round((count / maxDailyCount) * 48))}px`
                      : "4px",
                  background: count > 0 ? "#008060" : "#e5e7eb",
                  borderRadius: "2px 2px 0 0",
                }}
              />
            ))}
          </div>
          <InlineStack align="space-between">
            <Text as="p" variant="bodySm" tone="subdued">{startDate}</Text>
            <Text as="p" variant="bodySm" tone="subdued">{endDate}</Text>
          </InlineStack>
          <Button variant="plain" url="/app/newsletter/analytics">View full newsletter analytics →</Button>
        </BlockStack>
      </Card>

      {/* Section C — Quick actions: Recent campaigns + Subscriber sources */}
      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingSm">Recent campaigns</Text>
                <Button variant="plain" url="/app/newsletter/campaigns">View all →</Button>
              </InlineStack>
              {last3Campaigns.length === 0 ? (
                <Text as="p" tone="subdued">No campaigns yet.</Text>
              ) : (
                <BlockStack gap="200">
                  {last3Campaigns.map((c: any) => (
                    <div key={c.id}>
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodySm" fontWeight="semibold">{c.name}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {c.sentAt
                              ? new Date(c.sentAt).toLocaleDateString()
                              : "Draft"}
                          </Text>
                        </BlockStack>
                        {statusBadge(c.status)}
                      </InlineStack>
                      <Divider />
                    </div>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Subscriber sources</Text>
              {sources.length === 0 ? (
                <Text as="p" tone="subdued">No subscribers yet.</Text>
              ) : (
                <BlockStack gap="200">
                  {sources.map((s: any) => {
                    const pct =
                      totalSourceCount > 0
                        ? Math.round((s._count.source / totalSourceCount) * 100)
                        : 0;
                    return (
                      <BlockStack key={s.source ?? "unknown"} gap="100">
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodySm">{s.source ?? "Unknown"}</Text>
                          <Text as="p" variant="bodySm" fontWeight="semibold">
                            {s._count.source} ({pct}%)
                          </Text>
                        </InlineStack>
                        <div style={{ background: "#e5e7eb", borderRadius: 4, height: 6 }}>
                          <div
                            style={{
                              background: "#008060",
                              borderRadius: 4,
                              height: 6,
                              width: `${pct}%`,
                            }}
                          />
                        </div>
                      </BlockStack>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Grid.Cell>
      </Grid>

      {/* Section D — Signup form teaser */}
      <Card>
        <InlineStack align="space-between" blockAlign="center" wrap={false}>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">Grow your list with a signup form</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Choose from 10 ready-made widget designs — popups, inline forms, slide-ins, and banners.
              Scan your store to auto-match the style, then copy the embed code.
            </Text>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {["Popup", "Inline", "Slide-in", "Banner"].map((type) => (
                <span key={type} style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "#374151",
                  background: "#f3f4f6", padding: "3px 10px", borderRadius: 4,
                }}>
                  {type}
                </span>
              ))}
            </div>
          </BlockStack>
          <div style={{ flexShrink: 0, marginLeft: 24 }}>
            <Button variant="primary" url="/app/newsletter/widget">
              Browse signup forms
            </Button>
          </div>
        </InlineStack>
      </Card>
    </BlockStack>
  );
}

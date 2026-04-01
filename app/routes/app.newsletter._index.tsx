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
  } = useLoaderData<typeof loader>();

  const totalSourceCount = sources.reduce((sum: number, s: any) => sum + s._count.source, 0);
  const maxDailyCount = Math.max(...dailyGrowth.map((d) => d.count), 1);
  const startDate = dailyGrowth[0]?.date ?? "";
  const endDate = dailyGrowth[dailyGrowth.length - 1]?.date ?? "";

  // Last 3 campaigns for quick-actions card
  const last3Campaigns = recentCampaigns.slice(0, 3);

  return (
    <BlockStack gap="500">
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

      {/* Getting started */}
      {totalSubscribers === 0 && (
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">Getting started</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Add the subscribe snippet to your storefront to start collecting emails. Use the
              endpoint below from your theme or a Shopify pixel:
            </Text>
            <Box background="bg-surface-secondary" borderRadius="200" padding="300">
              <Text as="p" variant="bodySm">
                <code>POST /api/newsletter/subscribe</code> with{" "}
                <code>{"{ shop, email, source, utm_source, utm_campaign }"}</code>
              </Text>
            </Box>
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}

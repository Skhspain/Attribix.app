// app/routes/app.newsletter.analytics.tsx
// Newsletter analytics deep-dive — 90-day growth chart, campaign performance table, source breakdown.

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
  Badge,
  DataTable,
  Divider,
} from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const now = new Date();
  const days90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [allSubs, sentCampaigns, allCampaigns, sources] = await Promise.all([
    // All subscribers in last 90 days for growth chart
    db.newsletterSubscriber.findMany({
      where: { shop, createdAt: { gte: days90Ago } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    // All sent campaigns for performance table
    anyDb.newsletterCampaign?.findMany?.({
      where: { shop, status: "sent" },
      select: { id: true, name: true, subject: true, sentAt: true, recipientCount: true, deliveredCount: true, openCount: true, clickCount: true, unsubCount: true },
      orderBy: { sentAt: "desc" },
    }).catch(() => []) ?? [],
    // All campaigns for counts
    anyDb.newsletterCampaign?.findMany?.({
      where: { shop },
      select: { id: true, status: true, createdAt: true },
    }).catch(() => []) ?? [],
    // Source breakdown
    db.newsletterSubscriber.groupBy({
      by: ["source"],
      where: { shop, status: "subscribed" },
      _count: { source: true },
      orderBy: { _count: { source: "desc" } },
    }),
  ]);

  // Total counts
  const totalSubscribers = await db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } });
  const totalUnsubscribed = await db.newsletterSubscriber.count({ where: { shop, status: "unsubscribed" } });
  const newLast30d = await db.newsletterSubscriber.count({ where: { shop, status: "subscribed", createdAt: { gte: days30Ago } } });
  const unsubLast30d = await db.newsletterSubscriber.count({ where: { shop, status: "unsubscribed", unsubscribedAt: { gte: days30Ago } } });

  // Build 90-day daily growth array
  const dailyGrowth90 = Array.from({ length: 90 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (89 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const newCount = allSubs.filter(s => s.createdAt.toISOString().slice(0, 10) === dateStr).length;
    return { date: dateStr, count: newCount };
  });

  // Aggregate campaign stats
  const campaignStats = sentCampaigns.map((c: any) => {
    const delivered = c.deliveredCount ?? 0;
    const recipients = c.recipientCount ?? 0;
    const opens = c.openCount ?? 0;
    const clicks = c.clickCount ?? 0;
    const unsubs = c.unsubCount ?? 0;
    return {
      id: c.id,
      name: c.name,
      subject: c.subject,
      sentAt: c.sentAt,
      recipients,
      delivered,
      openRate: delivered > 0 ? Math.round((opens / delivered) * 100) : 0,
      clickRate: delivered > 0 ? Math.round((clicks / delivered) * 100) : 0,
      deliveryRate: recipients > 0 ? Math.round((delivered / recipients) * 100) : 0,
      unsubRate: delivered > 0 ? Math.round((unsubs / delivered) * 100) : 0,
    };
  });

  // Overall averages
  const totals = campaignStats.reduce((acc: any, c: any) => ({
    opens: acc.opens + c.openRate,
    clicks: acc.clicks + c.clickRate,
    delivery: acc.delivery + c.deliveryRate,
  }), { opens: 0, clicks: 0, delivery: 0 });

  const n = campaignStats.length || 1;
  const avgOpenRate = Math.round(totals.opens / n);
  const avgClickRate = Math.round(totals.clicks / n);
  const avgDeliveryRate = Math.round(totals.delivery / n);

  return json({
    totalSubscribers,
    totalUnsubscribed,
    newLast30d,
    unsubLast30d,
    netGrowth30d: newLast30d - unsubLast30d,
    dailyGrowth90,
    campaignStats,
    sources,
    avgOpenRate,
    avgClickRate,
    avgDeliveryRate,
    totalSent: sentCampaigns.length,
    totalDrafts: allCampaigns.filter((c: any) => c.status === "draft").length,
  });
}

const rateCell = (rate: number) => (
  <span style={{ color: rate >= 20 ? "#008060" : rate >= 10 ? "#b54708" : "#d72c0d", fontWeight: 600 }}>
    {rate}%
  </span>
);

export default function NewsletterAnalytics() {
  const {
    totalSubscribers,
    totalUnsubscribed,
    newLast30d,
    unsubLast30d,
    netGrowth30d,
    dailyGrowth90,
    campaignStats,
    sources,
    avgOpenRate,
    avgClickRate,
    avgDeliveryRate,
    totalSent,
    totalDrafts,
  } = useLoaderData<typeof loader>();

  const totalAll = totalSubscribers + totalUnsubscribed;
  const listHealth = totalAll > 0 ? Math.round((totalSubscribers / totalAll) * 100) : 0;

  const maxDailyCount = Math.max(...dailyGrowth90.map((d) => d.count), 1);
  const startDate = dailyGrowth90[0]?.date ?? "";
  const endDate = dailyGrowth90[dailyGrowth90.length - 1]?.date ?? "";

  const totalSourceCount = sources.reduce((sum: number, s: any) => sum + s._count.source, 0);

  const tableRows = campaignStats.map((c: any) => [
    c.name,
    c.sentAt ? new Date(c.sentAt).toLocaleDateString() : "—",
    c.recipients.toLocaleString(),
    rateCell(c.openRate),
    rateCell(c.clickRate),
    <span style={{ fontWeight: 500 }}>{c.deliveryRate}%</span>,
  ]);

  return (
    <BlockStack gap="500">
      {/* Section 1: Headline KPIs — 4 cards */}
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
              <Text as="p" variant="bodySm" tone="subdued">Total unsubscribed</Text>
              <Text as="p" variant="headingXl" tone="critical">{totalUnsubscribed.toLocaleString()}</Text>
            </BlockStack>
          </Card>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">List health</Text>
              <Text as="p" variant="headingXl" tone={listHealth >= 90 ? "success" : listHealth >= 70 ? undefined : "critical"}>
                {totalAll > 0 ? `${listHealth}%` : "—"}
              </Text>
            </BlockStack>
          </Card>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Campaigns sent</Text>
              <Text as="p" variant="headingXl">{totalSent.toLocaleString()}</Text>
            </BlockStack>
          </Card>
        </Grid.Cell>
      </Grid>

      {/* Section 2: 90-day subscriber growth chart */}
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingSm">Subscriber growth — last 90 days</Text>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
            {dailyGrowth90.map(({ date, count }) => (
              <div
                key={date}
                title={`${date}: ${count}`}
                style={{
                  flex: 1,
                  height:
                    maxDailyCount > 0
                      ? `${Math.max(4, Math.round((count / maxDailyCount) * 80))}px`
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
          <Divider />
          <InlineStack gap="500">
            <BlockStack gap="050">
              <Text as="p" variant="bodySm" tone="subdued">New subscribers (30d)</Text>
              <Text as="p" variant="bodyMd" tone="success" fontWeight="semibold">+{newLast30d.toLocaleString()}</Text>
            </BlockStack>
            <BlockStack gap="050">
              <Text as="p" variant="bodySm" tone="subdued">Unsubscribed (30d)</Text>
              <Text as="p" variant="bodyMd" tone="critical" fontWeight="semibold">-{unsubLast30d.toLocaleString()}</Text>
            </BlockStack>
            <BlockStack gap="050">
              <Text as="p" variant="bodySm" tone="subdued">Net growth (30d)</Text>
              <Text
                as="p"
                variant="bodyMd"
                tone={netGrowth30d >= 0 ? "success" : "critical"}
                fontWeight="semibold"
              >
                {netGrowth30d >= 0 ? "+" : ""}{netGrowth30d.toLocaleString()}
              </Text>
            </BlockStack>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* Section 3: Campaign performance */}
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingSm">Campaign performance</Text>

          {campaignStats.length === 0 ? (
            <Text as="p" tone="subdued">No sent campaigns yet.</Text>
          ) : (
            <BlockStack gap="400">
              {/* Avg stat boxes */}
              <InlineStack gap="500">
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">Avg open rate</Text>
                  <Text as="p" variant="headingMd" fontWeight="semibold">
                    <span style={{ color: avgOpenRate >= 20 ? "#008060" : avgOpenRate >= 10 ? "#b54708" : "#d72c0d" }}>
                      {avgOpenRate}%
                    </span>
                  </Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">Avg click rate</Text>
                  <Text as="p" variant="headingMd" fontWeight="semibold">
                    <span style={{ color: avgClickRate >= 20 ? "#008060" : avgClickRate >= 10 ? "#b54708" : "#d72c0d" }}>
                      {avgClickRate}%
                    </span>
                  </Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">Avg delivery rate</Text>
                  <Text as="p" variant="headingMd" fontWeight="semibold">{avgDeliveryRate}%</Text>
                </BlockStack>
              </InlineStack>

              <DataTable
                columnContentTypes={["text", "text", "numeric", "text", "text", "text"]}
                headings={["Campaign", "Sent date", "Recipients", "Open rate", "Click rate", "Delivery rate"]}
                rows={tableRows}
              />
            </BlockStack>
          )}
        </BlockStack>
      </Card>

      {/* Section 4: Source breakdown (full) */}
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingSm">Where subscribers come from</Text>
          {sources.length === 0 ? (
            <Text as="p" tone="subdued">No subscriber data yet.</Text>
          ) : (
            <BlockStack gap="300">
              {sources.map((s: any) => {
                const pct =
                  totalSourceCount > 0
                    ? Math.round((s._count.source / totalSourceCount) * 100)
                    : 0;
                return (
                  <BlockStack key={s.source ?? "unknown"} gap="100">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">{s.source ?? "Unknown"}</Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {s._count.source.toLocaleString()} ({pct}%)
                      </Text>
                    </InlineStack>
                    <div style={{ background: "#e5e7eb", borderRadius: 4, height: 8 }}>
                      <div
                        style={{
                          background: "#008060",
                          borderRadius: 4,
                          height: 8,
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
    </BlockStack>
  );
}

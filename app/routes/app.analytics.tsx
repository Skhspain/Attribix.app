// app/routes/app.analytics.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  DataTable,
  Badge,
  Box,
} from "@shopify/polaris";
import db from "../db.server";

type SourceRow = { source: string; events: number };

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function parseDateParam(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatDay(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function money(v: number) {
  const rounded = Math.round((v + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const anyDb = db as any; // keep your pattern

  const url = new URL(request.url);
  const toParam = parseDateParam(url.searchParams.get("to"));
  const fromParam = parseDateParam(url.searchParams.get("from"));

  const today = new Date();
  const to = endOfDay(toParam ?? today);
  const fromDefault = new Date(to);
  fromDefault.setDate(fromDefault.getDate() - 6); // last 7 days inclusive
  const from = startOfDay(fromParam ?? fromDefault);

  const whereCreatedAt = { createdAt: { gte: from, lte: to } };

  const [events, orders, revenueAgg, spendAgg, latestEvents] = await Promise.all([
    anyDb.trackedEvent?.count?.({ where: whereCreatedAt }).catch(() => 0),
    anyDb.purchase?.count?.({ where: whereCreatedAt }).catch(() => 0),

    // ✅ Fix: schema.postgres.prisma uses totalValue (not total)
    anyDb.purchase
      ?.aggregate?.({ where: whereCreatedAt, _sum: { totalValue: true } })
      .catch(() => ({ _sum: { totalValue: 0 } })),

    // AdSpendDaily has "date" field, not createdAt
    anyDb.adSpendDaily
      ?.aggregate?.({ where: { date: { gte: from, lte: to } }, _sum: { spend: true } })
      .catch(() => ({ _sum: { spend: 0 } })),

    anyDb.trackedEvent
      ?.findMany?.({
        where: whereCreatedAt,
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          createdAt: true,
          eventName: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
        },
      })
      .catch(() => []),
  ]);

  // Top sources
  const sourceEvents = await anyDb.trackedEvent
    ?.findMany?.({
      where: whereCreatedAt,
      select: { utmSource: true },
      take: 5000,
    })
    .catch(() => []);

  const counts = new Map<string, number>();
  for (const e of sourceEvents ?? []) {
    const key = (e?.utmSource ?? "Direct / Unknown").trim?.() || "Direct / Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const topSources: SourceRow[] = [...counts.entries()]
    .map(([source, events]) => ({ source, events }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 10);

  return json({
    range: { from: formatDay(from), to: formatDay(to) },
    kpis: {
      events: events ?? 0,
      orders: orders ?? 0,
      revenue: revenueAgg?._sum?.totalValue ?? 0,
      spend: spendAgg?._sum?.spend ?? 0,
    },
    topSources,
    latestEvents: latestEvents ?? [],
  });
}

function KpiCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone?: "success" | "warning" | "critical" | "info";
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingSm">
            {title}
          </Text>
          {tone ? <Badge tone={tone}>{tone}</Badge> : null}
        </InlineStack>
        <Text as="p" variant="heading2xl">
          {value}
        </Text>
      </BlockStack>
    </Card>
  );
}

export default function AppAnalytics() {
  const data = useLoaderData<typeof loader>();
  const [sp] = useSearchParams();

  const from = sp.get("from") ?? data.range.from;
  const to = sp.get("to") ?? data.range.to;

  const topSourcesRows = (data.topSources ?? []).map((r) => [r.source, r.events]);

  const latestRows = (data.latestEvents ?? []).map((e: any) => [
    e?.createdAt ? new Date(e.createdAt).toLocaleString() : "—",
    e?.eventName ?? "—",
    e?.utmSource ?? "—",
    e?.utmMedium ?? "—",
    e?.utmCampaign ?? "—",
  ]);

  return (
    <Page
      title="Analytics"
      subtitle={`Showing ${data.range.from} → ${data.range.to}`}
      primaryAction={{ content: "Last 7 days (refresh)", url: "/app/analytics" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Date range
                </Text>
                <Text as="p" tone="subdued">
                  Use <code>?from=YYYY-MM-DD&to=YYYY-MM-DD</code>. Current:{" "}
                  <strong>
                    {from} → {to}
                  </strong>
                </Text>
              </BlockStack>
            </Card>

            <Layout>
              <Layout.Section variant="oneThird">
                <KpiCard title="Tracked events" value={String(data.kpis.events)} tone="info" />
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <KpiCard title="Orders" value={String(data.kpis.orders)} />
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <KpiCard title="Revenue" value={money(data.kpis.revenue)} tone="success" />
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <KpiCard title="Ad spend" value={money(data.kpis.spend)} tone="warning" />
              </Layout.Section>
            </Layout>

            <Layout>
              <Layout.Section>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Top sources (utm_source)
                    </Text>
                    {topSourcesRows.length ? (
                      <DataTable
                        columnContentTypes={["text", "numeric"]}
                        headings={["Source", "Events"]}
                        rows={topSourcesRows}
                      />
                    ) : (
                      <Box paddingBlockStart="200">
                        <Text as="p" tone="subdued">
                          No events in this range yet.
                        </Text>
                      </Box>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Latest events
                    </Text>
                    {latestRows.length ? (
                      <DataTable
                        columnContentTypes={["text", "text", "text", "text", "text"]}
                        headings={["Time", "Event", "Source", "Medium", "Campaign"]}
                        rows={latestRows}
                      />
                    ) : (
                      <Box paddingBlockStart="200">
                        <Text as="p" tone="subdued">
                          No events in this range yet.
                        </Text>
                      </Box>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

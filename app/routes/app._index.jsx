// app/routes/app._index.jsx
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useMemo, useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Badge,
  DataTable,
  Box,
} from "@shopify/polaris";

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(n) {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d;
}

function formatRelativeTime(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function money(v) {
  const rounded = Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function loader() {
  const { db } = await import("~/db.server");

  // Windows
  const since24h = hoursAgo(24);
  const from7d = startOfDay(daysAgo(6)); // last 7 days inclusive
  const toToday = endOfDay(new Date());

  // EVENTS (24h)
  const [events24h, latestEvent, sources24h] = await Promise.all([
    db.trackedEvent
      .count({ where: { createdAt: { gte: since24h } } })
      .catch(() => 0),

    db.trackedEvent
      .findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, eventName: true, utmSource: true },
      })
      .catch(() => null),

    db.trackedEvent
      .findMany({
        where: { createdAt: { gte: since24h } },
        select: { utmSource: true },
        take: 5000,
      })
      .catch(() => []),
  ]);

  // TOP SOURCES (24h)
  const counts = new Map();
  for (const e of sources24h || []) {
    const k = (e.utmSource || "Direct / Unknown").trim() || "Direct / Unknown";
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const topSources24h = [...counts.entries()]
    .map(([source, events]) => ({ source, events }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 8);

  // ORDERS + REVENUE (7d)
  const [orders7d, revenueAgg] = await Promise.all([
    db.purchase
      .count({ where: { createdAt: { gte: from7d, lte: toToday } } })
      .catch(() => 0),

    db.purchase
      .aggregate({
        where: { createdAt: { gte: from7d, lte: toToday } },
        _sum: { totalValue: true }, // ✅ correct field in schema.postgres.prisma
      })
      .catch(() => ({ _sum: { totalValue: 0 } })),
  ]);

  const revenue7d = revenueAgg?._sum?.totalValue ?? 0;

  // SPEND (7d) - AdSpendDaily uses date
  const spendAgg = await db.adSpendDaily
    .aggregate({
      where: { date: { gte: from7d, lte: toToday } },
      _sum: { spend: true },
    })
    .catch(() => ({ _sum: { spend: 0 } }));

  const spend7d = spendAgg?._sum?.spend ?? 0;

  return json({
    kpis: {
      events24h,
      latestEventAt: latestEvent?.createdAt
        ? latestEvent.createdAt.toISOString()
        : null,
      latestEventName: latestEvent?.eventName || null,
      latestUtmSource: latestEvent?.utmSource || null,

      orders7d,
      revenue7d,
      spend7d,
    },
    topSources24h,
  });
}

function KpiCard({ title, value, meta, tone }) {
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
        {meta ? (
          <Text as="p" tone="subdued">
            {meta}
          </Text>
        ) : null}
      </BlockStack>
    </Card>
  );
}

export default function AppIndex() {
  const data = useLoaderData();
  const fetcher = useFetcher();

  const [accountID, setAccountID] = useState("1");
  const connecting = fetcher.state !== "idle";
  const result = fetcher.data;

  function connectPixel() {
    fetcher.submit(
      { accountID },
      { method: "post", action: "/api/web-pixel/ensure" }
    );
  }

  const topSourceRows = useMemo(() => {
    return (data.topSources24h || []).map((r) => [r.source, r.events]);
  }, [data.topSources24h]);

  const eventsTone = data.kpis?.events24h > 0 ? "success" : "warning";

  return (
    <Page
      title="Home"
      subtitle="Mini dashboard + quick actions"
      primaryAction={{ content: "View Analytics", url: "/app/analytics" }}
      secondaryActions={[
        { content: "Tracking Settings", url: "/app/settings" },
        { content: "Exports", url: "/app/additional" },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* KPIs */}
            <Layout>
              <Layout.Section variant="oneThird">
                <KpiCard
                  title="Events (24h)"
                  value={String(data.kpis?.events24h ?? 0)}
                  meta={`Last event: ${formatRelativeTime(data.kpis?.latestEventAt)}`}
                  tone={eventsTone}
                />
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <KpiCard
                  title="Orders (7d)"
                  value={String(data.kpis?.orders7d ?? 0)}
                  meta="Based on Purchase rows"
                />
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <KpiCard
                  title="Revenue (7d)"
                  value={money(data.kpis?.revenue7d ?? 0)}
                  meta="Sum of Purchase.totalValue"
                  tone="success"
                />
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <KpiCard
                  title="Ad spend (7d)"
                  value={money(data.kpis?.spend7d ?? 0)}
                  meta="Sum of AdSpendDaily.spend"
                  tone="warning"
                />
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <KpiCard
                  title="Latest event"
                  value={data.kpis?.latestEventName || "—"}
                  meta={`Source: ${data.kpis?.latestUtmSource || "—"}`}
                />
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Quick links
                    </Text>
                    <BlockStack gap="200">
                      <Button url="/app/analytics" variant="primary">
                        Analytics dashboard
                      </Button>
                      <Button url="/app/settings">Tracking settings</Button>
                      <Button url="/app/pixel">Pixel page</Button>
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>

            {/* Connect Pixel (kept same behavior) */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Connect Web Pixel
                  </Text>
                  <Badge tone="info">/api/web-pixel/ensure</Badge>
                </InlineStack>

                <Text as="p" tone="subdued">
                  This keeps your existing flow and only posts <code>accountID</code>.
                </Text>

                <InlineStack gap="300" blockAlign="end">
                  <div style={{ width: 280 }}>
                    <TextField
                      label="Account ID"
                      value={accountID}
                      onChange={setAccountID}
                      autoComplete="off"
                      helpText="Used as pixel settings payload."
                    />
                  </div>

                  <Button
                    onClick={connectPixel}
                    disabled={connecting}
                    variant="primary"
                  >
                    {connecting ? "Connecting…" : "Connect pixel"}
                  </Button>
                </InlineStack>

                {result ? (
                  <Box paddingBlockStart="200">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h3" variant="headingSm">
                          Result
                        </Text>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(result, null, 2)}
                        </pre>
                      </BlockStack>
                    </Card>
                  </Box>
                ) : null}
              </BlockStack>
            </Card>

            {/* Top sources */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Top sources (last 24h)
                </Text>

                {topSourceRows.length ? (
                  <DataTable
                    columnContentTypes={["text", "numeric"]}
                    headings={["Source", "Events"]}
                    rows={topSourceRows}
                  />
                ) : (
                  <Text as="p" tone="subdued">
                    No events found in the last 24 hours.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

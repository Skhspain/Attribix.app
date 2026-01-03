// app/routes/app.reports.tsx
import * as React from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";

import {
  Page,
  Layout,
  Card,
  Text,
  DataTable,
  InlineStack,
  InlineGrid,
  Box,
  BlockStack,
  Select,
  Button,
  Badge,
} from "@shopify/polaris";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import shopify from "~/shopify.server";
import prisma from "~/db.server";

// -----------------------------
// Types
// -----------------------------
type LoaderEvent = {
  id: string;
  createdAt: string;
  eventName: string;
  url: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  value: number | null;
  currency: string | null;
};

type DailyStat = {
  date: string; // YYYY-MM-DD
  totalValue: number;
  events: number;
};

type LoaderData = {
  shop: string;
  totalEvents: number;
  totalValue: number;
  avgValue: number;
  currency: string | null;
  range: string;
  filterSource: string;
  filterMedium: string;
  sources: string[];
  mediums: string[];
  dailyStats: DailyStat[];
  events: LoaderEvent[];
};

// -----------------------------
// Loader
// -----------------------------
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? "30d";
  const filterSource = url.searchParams.get("source") ?? "";
  const filterMedium = url.searchParams.get("medium") ?? "";

  // Date range
  let fromDate: Date | undefined;
  const now = new Date();

  if (range === "7d") {
    fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 7);
  } else if (range === "30d") {
    fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 30);
  } else if (range === "90d") {
    fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 90);
  }

  const where: any = { shop };
  if (fromDate) {
    where.createdAt = { gte: fromDate };
  }
  if (filterSource) {
    where.utmSource = filterSource;
  }
  if (filterMedium) {
    where.utmMedium = filterMedium;
  }

  // Events for metrics + table
  const events = await prisma.trackedEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const totalEvents = events.length;

  const totalValue = events.reduce(
    (sum: number, e: any) =>
      sum + (typeof e.value === "number" ? e.value : 0),
    0
  );

  const avgValue = totalEvents > 0 ? totalValue / totalEvents : 0;

  const currency: string | null =
    events.find((e: any) => e.currency != null)?.currency ?? null;

  // Daily stats for chart
  const dailyMap = new Map<string, DailyStat>();

  for (const e of events as any[]) {
    const createdAt: Date =
      e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt);
    const key = createdAt.toISOString().slice(0, 10); // YYYY-MM-DD

    const current: DailyStat =
      dailyMap.get(key) ?? { date: key, totalValue: 0, events: 0 };

    current.totalValue += typeof e.value === "number" ? e.value : 0;
    current.events += 1;
    dailyMap.set(key, current);
  }

  const dailyStats: DailyStat[] = Array.from(dailyMap.values()).sort(
    (a: DailyStat, b: DailyStat) => a.date.localeCompare(b.date)
  );

  // Distinct sources/mediums for dropdowns
  const allForFilters = await prisma.trackedEvent.findMany({
    where: { shop },
    select: { utmSource: true, utmMedium: true },
  });

  const sourceSet = new Set<string>();
  const mediumSet = new Set<string>();

  for (const e of allForFilters) {
    if (e.utmSource) sourceSet.add(e.utmSource);
    if (e.utmMedium) mediumSet.add(e.utmMedium);
  }

  const sources: string[] = Array.from(sourceSet).sort();
  const mediums: string[] = Array.from(mediumSet).sort();

  const serialisedEvents: LoaderEvent[] = (events as any[]).map(
    (e: any): LoaderEvent => ({
      id: e.id,
      createdAt: (
        e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt)
      ).toISOString(),
      eventName: e.eventName,
      url: e.url ?? null,
      utmSource: e.utmSource ?? null,
      utmMedium: e.utmMedium ?? null,
      utmCampaign: e.utmCampaign ?? null,
      value: typeof e.value === "number" ? e.value : null,
      currency: e.currency ?? null,
    })
  );

  return json<LoaderData>({
    shop,
    totalEvents,
    totalValue,
    avgValue,
    currency,
    range,
    filterSource,
    filterMedium,
    sources,
    mediums,
    dailyStats,
    events: serialisedEvents,
  });
}

// -----------------------------
// Component
// -----------------------------
export default function ReportsPage() {
  const {
    shop,
    totalEvents,
    totalValue,
    avgValue,
    currency,
    range,
    filterSource,
    filterMedium,
    sources,
    mediums,
    dailyStats,
    events,
  } = useLoaderData<typeof loader>();

  const hasEvents = events.length > 0;

  const numberFormatter = React.useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  );

  const valueLabel = hasEvents
    ? `${numberFormatter.format(totalValue)}${currency ? ` ${currency}` : ""}`
    : "No values yet";

  const avgLabel = hasEvents
    ? `${numberFormatter.format(avgValue)}${currency ? ` ${currency}` : ""}`
    : "–";

  const rows = events.map((e: LoaderEvent) => [
    new Date(e.createdAt).toLocaleString(),
    e.eventName,
    e.utmSource ?? "–",
    e.utmMedium ?? "–",
    e.utmCampaign ?? "–",
    e.value != null
      ? `${numberFormatter.format(e.value)}${
          currency ? ` ${currency}` : ""
        }`
      : "–",
  ]);

  const rangeOptions = [
    { label: "Last 7 days", value: "7d" },
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
    { label: "All time", value: "all" },
  ];

  const sourceOptions = [
    { label: "All sources", value: "" },
    ...sources.map((s: string) => ({ label: s, value: s })),
  ];

  const mediumOptions = [
    { label: "All mediums", value: "" },
    ...mediums.map((m: string) => ({ label: m, value: m })),
  ];

  return (
    <Page
      title="Reports"
      subtitle={`Event tracking & value for ${shop}`}
      primaryAction={
        hasEvents
          ? undefined
          : {
              content: "Send a test event",
              url: "/app/debug",
            }
      }
    >
      <Layout>
        {/* FILTERS + KPI SUMMARY */}
        <Layout.Section>
          <Box maxWidth="readable" width="100%" paddingBlockEnd="400">
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              {/* Filters card */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        Filters
                      </Text>
                      <Badge>Beta</Badge>
                    </InlineStack>

                    <Form method="get">
                      <BlockStack gap="300">
                        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="200">
                          <Select
                            label="Date range"
                            name="range"
                            options={rangeOptions}
                            value={range}
                            onChange={() => {}}
                          />
                          <Select
                            label="UTM source"
                            name="source"
                            options={sourceOptions}
                            value={filterSource}
                            onChange={() => {}}
                          />
                          <Select
                            label="UTM medium"
                            name="medium"
                            options={mediumOptions}
                            value={filterMedium}
                            onChange={() => {}}
                          />
                        </InlineGrid>

                        <InlineStack gap="200">
                          <Button submit variant="primary">
                            Apply filters
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Form>
                  </BlockStack>
                </Box>
              </Card>

              {/* KPI summary card */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Overview
                    </Text>

                    <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                      <BlockStack gap="100">
                        <Text tone="subdued" as="p">
                          Tracked events
                        </Text>
                        <Text as="p" variant="headingLg">
                          {totalEvents}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="100">
                        <Text tone="subdued" as="p">
                          Total value
                        </Text>
                        <Text as="p" variant="headingLg">
                          {valueLabel}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="100">
                        <Text tone="subdued" as="p">
                          Avg. value / event
                        </Text>
                        <Text as="p" variant="headingLg">
                          {avgLabel}
                        </Text>
                      </BlockStack>
                    </InlineGrid>
                  </BlockStack>
                </Box>
              </Card>
            </InlineGrid>
          </Box>
        </Layout.Section>

        {/* VALUE OVER TIME */}
        <Layout.Section>
          <Box maxWidth="readable" width="100%" paddingBlockEnd="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Value over time
                  </Text>
                  <Text as="p" tone="subdued">
                    Daily sum of tracked event values for the selected range.
                  </Text>

                  {dailyStats.length ? (
                    <Box minHeight="260px">
                      <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={dailyStats}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="totalValue"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  ) : (
                    <Box paddingBlockStart="200">
                      <Text as="p" tone="subdued">
                        No data yet for this range. Try sending a test event
                        from the Debug page.
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Box>
        </Layout.Section>

        {/* LATEST EVENTS */}
        <Layout.Section>
          <Box maxWidth="readable" width="100%">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Latest tracked events
                  </Text>

                  {hasEvents ? (
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                      ]}
                      headings={[
                        "Time",
                        "Event",
                        "Source",
                        "Medium",
                        "Campaign",
                        "Value",
                      ]}
                      rows={rows}
                    />
                  ) : (
                    <Text as="p" tone="subdued">
                      No events stored yet — send a test event from the Debug
                      page to see data here.
                    </Text>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

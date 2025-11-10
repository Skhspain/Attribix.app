import React from "react";
import { json } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  TextField,
  InlineStack,
  Button,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import db from "~/utils/db.server";
import {
  normalizeCampaign,
  startOfDay,
  endOfDay,
  groupEventsByDate,
} from "~/utils/report-utils";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const campaign = url.searchParams.get("utm_campaign") || undefined;
  const utmSource = url.searchParams.get("utm_source") || undefined;
  const eventName = url.searchParams.get("eventName") || undefined;
  let startStr = url.searchParams.get("start");
  let endStr = url.searchParams.get("end");

  const endDate = endStr ? new Date(endStr) : new Date();
  const startDate = startStr
    ? new Date(startStr)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const where = {
    ...(campaign ? { utmCampaign: campaign } : {}),
    ...(utmSource ? { utmSource } : {}),
    ...(eventName ? { eventName } : {}),
    createdAt: {
      gte: startOfDay(startDate),
      lte: endOfDay(endDate),
    },
  };

  const grouped = await db.TrackedEvent.groupBy({
    by: ["utmCampaign"],
    where,
    _sum: { value: true },
    _count: { _all: true },
  });

  const reports = grouped
    .map((g) => ({
      utmCampaign: normalizeCampaign(g.utmCampaign),
      totalRevenue: g._sum.value || 0,
      eventCount: g._count._all,
      roas: g._count._all ? (g._sum.value || 0) / g._count._all : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const events = await db.TrackedEvent.findMany({
    where,
    select: { createdAt: true, value: true },
  });

  const revenueSeries = groupEventsByDate(events);

  return json({
    reports,
    revenueSeries,
    filters: {
      utmCampaign: campaign || "",
      utmSource: utmSource || "",
      eventName: eventName || "",
      start: startOfDay(startDate).toISOString().slice(0, 10),
      end: endOfDay(endDate).toISOString().slice(0, 10),
    },
  });
};

export default function Reports() {
  const { reports, revenueSeries, filters } = useLoaderData();

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  const [sortIndex, setSortIndex] = React.useState(2);
  const [sortDirection, setSortDirection] = React.useState("descending");

  const sortedReports = React.useMemo(() => {
    const data = [...reports];
    const key =
      sortIndex === 1
        ? "eventCount"
        : sortIndex === 2
        ? "totalRevenue"
        : "utmCampaign";
    data.sort((a, b) => {
      if (key === "utmCampaign") {
        return sortDirection === "ascending"
          ? a[key].localeCompare(b[key])
          : b[key].localeCompare(a[key]);
      }
      return sortDirection === "ascending" ? a[key] - b[key] : b[key] - a[key];
    });
    return data;
  }, [reports, sortIndex, sortDirection]);

  const rows = sortedReports.map((r) => [
    r.utmCampaign,
    r.eventCount,
    <Text as="span">{currencyFormatter.format(r.totalRevenue)}</Text>,
  ]);

  const totalEvents = reports.reduce((acc, r) => acc + r.eventCount, 0);
  const totalRevenue = reports.reduce((acc, r) => acc + r.totalRevenue, 0);

  const chartData = sortedReports.map((r) => ({
    name: r.utmCampaign,
    value: r.totalRevenue,
  }));

  return (
    <Page>
      <TitleBar title="Reports" />
      <Layout>
        <Layout.Section>
          <Card padding="400">
            <Form method="get">
              <InlineStack gap="400" wrap={false} align="start">
                <TextField
                  label="utm_campaign"
                  name="utm_campaign"
                  autoComplete="off"
                  defaultValue={filters.utmCampaign}
                />
                <TextField
                  label="utm_source"
                  name="utm_source"
                  autoComplete="off"
                  defaultValue={filters.utmSource}
                />
                <TextField
                  label="Event"
                  name="eventName"
                  autoComplete="off"
                  defaultValue={filters.eventName}
                />
                <TextField
                  label="Start"
                  name="start"
                  type="date"
                  defaultValue={filters.start}
                />
                <TextField
                  label="End"
                  name="end"
                  type="date"
                  defaultValue={filters.end}
                />
                <Button submit primary>
                  Filter
                </Button>
              </InlineStack>
            </Form>
          </Card>

          <Card padding="400" title="Campaign Performance">
            <DataTable
              columnContentTypes={["text", "numeric", "numeric"]}
              headings={["Campaign", "Events", "Revenue"]}
              rows={rows}
              totals={[
                "",
                totalEvents,
                <Text as="span" fontWeight="medium">
                  {currencyFormatter.format(totalRevenue)}
                </Text>,
              ]}
              showTotalsInFooter
              sortable={[true, true, true]}
              initialSortDirection="descending"
              initialSortColumnIndex={2}
              sortColumnIndex={sortIndex}
              sortDirection={sortDirection}
              onSort={(index, direction) => {
                setSortIndex(index);
                setSortDirection(direction);
              }}
            />
          </Card>

          <Card padding="400" title="Revenue by Campaign">
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#008060" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card padding="400" title="Revenue Over Time">
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={revenueSeries}
                  margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#008060" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
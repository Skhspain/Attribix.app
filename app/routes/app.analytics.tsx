// app/routes/app.analytics.tsx
import type { MetaFunction } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  Text,
  InlineStack,
  BlockStack,
  Badge,
  DataTable,
} from "@shopify/polaris";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";

export const meta: MetaFunction = () => {
  return [
    { title: "Attribix – Analytics" },
    { name: "description", content: "Blended performance and attribution overview." },
  ];
};

// ---------- MOCK DATA (until Attribixweb is wired up) ----------

// Revenue & ROAS over time (e.g. last 14 days)
const revenueRoasTrend = [
  { label: "Day 1", revenue: 4200, roas: 3.1 },
  { label: "Day 2", revenue: 3800, roas: 2.7 },
  { label: "Day 3", revenue: 5100, roas: 3.4 },
  { label: "Day 4", revenue: 4600, roas: 3.0 },
  { label: "Day 5", revenue: 6100, roas: 3.9 },
  { label: "Day 6", revenue: 5700, roas: 3.3 },
  { label: "Day 7", revenue: 6900, roas: 4.1 },
  { label: "Day 8", revenue: 6400, roas: 3.6 },
  { label: "Day 9", revenue: 7200, roas: 4.2 },
  { label: "Day 10", revenue: 6800, roas: 3.8 },
  { label: "Day 11", revenue: 7500, roas: 4.0 },
  { label: "Day 12", revenue: 8100, roas: 4.3 },
  { label: "Day 13", revenue: 7900, roas: 4.1 },
  { label: "Day 14", revenue: 8600, roas: 4.5 },
];

// Channel breakdown – matches the vibe of Attribixweb analytics
const channelPerformance = [
  { channel: "Meta Ads", revenue: 22000, roas: 3.8, spend: 5800, share: 46 },
  { channel: "Google Ads", revenue: 14500, roas: 3.1, spend: 4700, share: 30 },
  { channel: "TikTok Ads", revenue: 7400, roas: 2.6, spend: 2800, share: 15 },
  { channel: "Email / Klaviyo", revenue: 4200, roas: 0, spend: 0, share: 9 },
];

// Top products table
const topProductsRows: (string | number)[][] = [
  ["Ultra Soft Hoodie", "Meta Ads", 72, "€8,640", "34%"],
  ["Everyday Tee Pack", "Google Ads", 55, "€5,170", "21%"],
  ["Performance Socks", "TikTok Ads", 38, "€3,040", "12%"],
  ["Winter Bundle", "Meta Ads", 29, "€4,120", "16%"],
  ["Gift Card (Digital)", "Email / Klaviyo", 24, "€1,080", "17%"],
];

// Attribution breakdown table (touchpoints)
const attributionRows: (string | number)[][] = [
  ["Meta → Direct", "Single touch", "€12,300", "41%", "3.9"],
  ["Meta → Email", "Multi-touch", "€6,480", "22%", "4.1"],
  ["Google → Direct", "Single touch", "€5,950", "20%", "3.2"],
  ["TikTok → Meta", "Multi-touch", "€2,140", "7%", "2.7"],
  ["Organic → Direct", "Single touch", "€1,880", "6%", "—"],
];

// Summary metrics for the top KPI cards
const summaryMetrics = {
  trackedRevenue: "€42,120",
  blendedRoas: "3.6x",
  attributedOrders: "218",
  trackingQuality: "97%",
};

export default function AnalyticsPage() {
  return (
    <Page
      title="Analytics overview"
      subtitle="Blended performance and attribution across all your channels."
    >
      <Layout>
        {/* ---------- TOP KPI SUMMARY ---------- */}
        <Layout.Section>
          <InlineStack gap="400" wrap>
            {/* Tracked revenue */}
            <Card>
              <BlockStack gap="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Tracked revenue (last 30 days)
                  </Text>
                  <Text as="h2" variant="headingLg">
                    {summaryMetrics.trackedRevenue}
                  </Text>
                </BlockStack>
                <InlineStack gap="200" align="center">
                  <Badge tone="success">+18% vs prev. 30 days</Badge>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Blended, post-iOS tracking
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Blended ROAS */}
            <Card>
              <BlockStack gap="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Blended ROAS
                  </Text>
                  <Text as="h2" variant="headingLg">
                    {summaryMetrics.blendedRoas}
                  </Text>
                </BlockStack>
                <InlineStack gap="200" align="center">
                  <Badge tone="success">Healthy</Badge>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Spend vs. tracked revenue
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Attributed orders */}
            <Card>
              <BlockStack gap="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Attributed orders
                  </Text>
                  <Text as="h2" variant="headingLg">
                    {summaryMetrics.attributedOrders}
                  </Text>
                </BlockStack>
                <InlineStack gap="200" align="center">
                  <Badge tone="info">Multi-touch & single-touch</Badge>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Orders Attribix can confidently match
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Tracking quality */}
            <Card>
              <BlockStack gap="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Tracking quality score
                  </Text>
                  <Text as="h2" variant="headingLg">
                    {summaryMetrics.trackingQuality}
                  </Text>
                </BlockStack>
                <InlineStack gap="200" align="center">
                  <Badge tone="success">Server-side enabled</Badge>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Based on event match rate & signal loss
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </InlineStack>
        </Layout.Section>

        {/* ---------- MAIN CHART: REVENUE + ROAS ---------- */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Revenue & ROAS (last 14 days)
              </Text>
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <LineChart data={revenueRoasTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      tickFormatter={(v) => `€${(v as number) / 1000}k`}
                    />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === "revenue") {
                          return [`€${Number(value).toLocaleString()}`, "Revenue"];
                        }
                        if (name === "roas") {
                          return [`${value}x`, "ROAS"];
                        }
                        return [value as string | number, name as string];
                      }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="roas"
                      name="ROAS"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ---------- SIDE CHART: CHANNEL PERFORMANCE ---------- */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Channel performance (last 30 days)
              </Text>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={channelPerformance} barCategoryGap={32}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="channel" />
                    <YAxis tickFormatter={(v) => `€${(v as number) / 1000}k`} />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === "revenue") {
                          return [`€${Number(value).toLocaleString()}`, "Revenue"];
                        }
                        if (name === "spend") {
                          return [`€${Number(value).toLocaleString()}`, "Spend"];
                        }
                        if (name === "roas") {
                          return [`${value}x`, "ROAS"];
                        }
                        return [value as string | number, name as string];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" />
                    <Bar dataKey="spend" name="Ad spend" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Text as="p" variant="bodySm" tone="subdued">
                ROAS & revenue are based on Attribix tracked purchases, not platform estimates.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ---------- TABLE: TOP PRODUCTS ---------- */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Top products by attributed revenue
              </Text>
              <DataTable
                columnContentTypes={["text", "text", "numeric", "numeric", "numeric"]}
                headings={[
                  "Product",
                  "Primary channel",
                  "Orders",
                  "Attributed revenue",
                  "Share of revenue",
                ]}
                rows={topProductsRows}
                increasedTableDensity
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ---------- TABLE: ATTRIBUTION BREAKDOWN ---------- */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Attribution breakdown (paths & touchpoints)
              </Text>
              <DataTable
                columnContentTypes={["text", "text", "numeric", "numeric", "numeric"]}
                headings={[
                  "Path",
                  "Attribution model",
                  "Revenue",
                  "Share",
                  "Avg. ROAS",
                ]}
                rows={attributionRows}
                increasedTableDensity
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

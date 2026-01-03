// app/routes/app.ads.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

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

import {
  getMetaAdOverview,
  type MetaAdOverview,
} from "~/services/adStats.server";

// -----------------------------
// Loader
// -----------------------------
type LoaderData = {
  overview: MetaAdOverview;
  rangeDays: number;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const parsed = Number(daysParam ?? "30");
  const rangeDays =
    Number.isFinite(parsed) && parsed > 0 && parsed <= 365 ? parsed : 30;

  const overview = await getMetaAdOverview(rangeDays);
  return json<LoaderData>({ overview, rangeDays });
}

// -----------------------------
// Helpers
// -----------------------------
const LOCALE = "en-US";

function nf2(n: number) {
  return n.toLocaleString(LOCALE, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function money2(n: number) {
  return n.toLocaleString(LOCALE, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatRoas(roas: number | null): string {
  if (roas == null || !Number.isFinite(roas)) return "—";
  return `${nf2(roas)}x`;
}

function roasTone(roas: number | null): "success" | "critical" | "info" {
  if (roas == null || !Number.isFinite(roas)) return "info";
  if (roas >= 3) return "success";
  if (roas < 1) return "critical";
  return "info";
}

// -----------------------------
// Component
// -----------------------------
export default function AppAdsPage() {
  const { overview, rangeDays } = useLoaderData<typeof loader>();

  const { totals, daily, campaigns } = overview;

  return (
    <Page
      title="Meta ads performance"
      subtitle={`Based on Meta Insights for the last ${rangeDays} days`}
    >
      <Layout>
        {/* KPI summary */}
        <Layout.Section>
          <Box paddingBlockStart="400" paddingBlockEnd="200">
            <BlockStack gap="300">
              <InlineStack gap="400" wrap align="start">
                <Card>
                  <Box padding="400">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">
                        Spend
                      </Text>
                      <Text as="p" variant="bodyLg">
                        {money2(totals.spend)}
                      </Text>
                    </BlockStack>
                  </Box>
                </Card>

                <Card>
                  <Box padding="400">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">
                        Revenue (Meta-reported)
                      </Text>
                      <Text as="p" variant="bodyLg">
                        {money2(totals.revenue)}
                      </Text>
                    </BlockStack>
                  </Box>
                </Card>

                <Card>
                  <Box padding="400">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">
                        ROAS
                      </Text>
                      <InlineStack gap="200" align="start">
                        <Badge tone={roasTone(totals.roas)}>
                          {formatRoas(totals.roas)}
                        </Badge>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                </Card>

                <Card>
                  <Box padding="400">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">
                        Conversions
                      </Text>
                      <Text as="p" variant="bodyLg">
                        {totals.conversions.toLocaleString(LOCALE)}
                      </Text>
                    </BlockStack>
                  </Box>
                </Card>
              </InlineStack>
            </BlockStack>
          </Box>
        </Layout.Section>

        {/* Daily trend (simple table for now) */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Daily performance
                </Text>

                {daily.length === 0 ? (
                  <Text as="p" variant="bodyMd">
                    No Meta data found in the selected period.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric", "numeric"]}
                    headings={["Date", "Spend", "Revenue", "Conversions"]}
                    rows={daily.map((d) => [
                      d.date,
                      money2(d.spend),
                      money2(d.revenue),
                      d.conversions.toLocaleString(LOCALE),
                    ])}
                  />
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Campaign breakdown */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Campaign performance
                </Text>

                {campaigns.length === 0 ? (
                  <Text as="p" variant="bodyMd">
                    No campaigns found for this period.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "numeric",
                      "numeric",
                      "numeric",
                      "numeric",
                      "numeric",
                    ]}
                    headings={[
                      "Campaign ID",
                      "Spend",
                      "Revenue",
                      "ROAS",
                      "Clicks",
                      "Impressions",
                    ]}
                    rows={campaigns.map((c) => [
                      c.campaignId,
                      money2(c.totalSpend),
                      money2(c.totalRevenue),
                      <Badge tone={roasTone(c.roas)} key={c.campaignId}>
                        {formatRoas(c.roas)}
                      </Badge>,
                      c.clicks.toLocaleString(LOCALE),
                      c.impressions.toLocaleString(LOCALE),
                    ])}
                  />
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

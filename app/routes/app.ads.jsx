// app/routes/app.ads.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  DataTable,
  Select,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import React from "react";

function formatCurrency(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDayKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function loader({ request }) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { session } = result;
  const shop = session.shop;

  const conn = await db.metaConnection.findUnique({ where: { shop } }).catch(() => null);
  const connected = !!(conn && conn.accessToken && conn.accessToken !== "__PENDING__");

  // last 7 days
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - 6);

  const rows = connected
    ? await db.metaCampaignDailyInsight.findMany({
        where: { shop, date: { gte: since, lte: until } },
        orderBy: [{ date: "desc" }],
      })
    : [];

  // NEW: pull aggregated daily spend rows stored in AdSpendDaily (platform="meta", campaign/adset/ad null)
  const spendRows = connected
    ? await db.adSpendDaily.findMany({
        where: {
          platform: "meta",
          campaign: null,
          adset: null,
          ad: null,
          date: { gte: since, lte: until },
        },
        orderBy: [{ date: "desc" }],
      })
    : [];

  // Aggregate quick KPIs from campaign rows (purchases/value)
  const totals = rows.reduce(
    (acc, r) => {
      acc.purchases += Number(r.purchases || 0);
      acc.purchaseValue += Number(r.purchaseValue || 0);
      return acc;
    },
    { spend: 0, purchases: 0, purchaseValue: 0 }
  );

  // Use AdSpendDaily aggregate for spend KPI when available.
  // If missing (no sync yet), fall back to summing campaign spend.
  const spendTotalFromDaily = spendRows.reduce((sum, r) => sum + Number(r.spend || 0), 0);
  const spendTotalFromCampaigns = rows.reduce((sum, r) => sum + Number(r.spend || 0), 0);
  totals.spend = spendRows.length ? spendTotalFromDaily : spendTotalFromCampaigns;

  // Group by campaign (sum last 7 days)
  const byCampaign = new Map();
  for (const r of rows) {
    const id = String(r.campaignId);
    const cur = byCampaign.get(id) || {
      campaignId: id,
      campaignName: r.campaignName || id,
      spend: 0,
      purchases: 0,
      purchaseValue: 0,
    };
    cur.spend += Number(r.spend || 0);
    cur.purchases += Number(r.purchases || 0);
    cur.purchaseValue += Number(r.purchaseValue || 0);
    byCampaign.set(id, cur);
  }

  const campaigns = Array.from(byCampaign.values()).sort((a, b) => b.spend - a.spend);

  return json({
    connected,
    adAccountId: conn?.adAccountId || null,
    totals,
    campaigns,
  });
}

export default function AdsDashboard() {
  const data = useLoaderData();
  const sync = useFetcher();

  // Keep existing behavior but make Select actually change days
  const [daysState, setDaysState] = React.useState("7");

  const syncing = sync.state !== "idle";

  const tableRows = (data.campaigns || []).slice(0, 15).map((c) => {
    const roas = c.spend > 0 ? c.purchaseValue / c.spend : 0;
    return [
      c.campaignName,
      formatCurrency(c.spend),
      String(c.purchases),
      formatCurrency(c.purchaseValue),
      roas ? roas.toFixed(2) : "—",
    ];
  });

  return (
    <Page
      title="Meta ads dashboard"
      subtitle="Campaign-level spend and purchase value from Ads Manager (stored in your DB)"
      primaryAction={
        <Button url="/app/integrations/meta" variant="secondary">
          Meta integration
        </Button>
      }
    >
      <Layout>
        {!data.connected ? (
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Meta is not connected
                </Text>
                <Text as="p" tone="subdued">
                  Connect Meta first, then return here to sync and view Ads Manager insights.
                </Text>
                <Button url="/app/integrations/meta" variant="primary">
                  Connect Meta
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        ) : (
          <>
            <Layout.Section>
              <BlockStack gap="400">
                <Card>
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">
                        Status
                      </Text>
                      <Text as="p" tone="subdued">
                        Connected {data.adAccountId ? `(${data.adAccountId})` : ""}
                      </Text>
                    </BlockStack>
                    <Badge tone="success">Connected</Badge>
                  </InlineStack>
                </Card>

                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        Sync insights
                      </Text>

                      <sync.Form method="post" action="/api/meta/sync">
                        <InlineStack gap="200" blockAlign="center">
                          <Select
                            label=""
                            labelHidden
                            name="days"
                            value={String(daysState)}
                            options={[
                              { label: "Last 7 days", value: "7" },
                              { label: "Last 14 days", value: "14" },
                              { label: "Last 30 days", value: "30" },
                            ]}
                            disabled={syncing}
                            onChange={(v) => setDaysState(String(v))}
                          />
                          <Button submit variant="primary" disabled={syncing}>
                            {syncing ? "Syncing…" : "Sync now"}
                          </Button>
                        </InlineStack>
                      </sync.Form>
                    </InlineStack>

                    {sync.data?.ok === false ? (
                      <Text as="p" tone="critical">
                        Sync error: {sync.data.error}
                      </Text>
                    ) : null}
                    {sync.data?.ok ? (
                      <Text as="p" tone="success">
                        Synced {sync.data.rows} rows (days: {sync.data.days})
                      </Text>
                    ) : null}
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>

            <Layout.Section>
              <Layout>
                <Layout.Section variant="oneThird">
                  <Card>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">
                        Spend (7d)
                      </Text>
                      <Text as="p" variant="headingLg">
                        {formatCurrency(data.totals?.spend)}
                      </Text>
                    </BlockStack>
                  </Card>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  <Card>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">
                        Purchases (7d)
                      </Text>
                      <Text as="p" variant="headingLg">
                        {String(data.totals?.purchases ?? 0)}
                      </Text>
                    </BlockStack>
                  </Card>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  <Card>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">
                        Purchase value (7d)
                      </Text>
                      <Text as="p" variant="headingLg">
                        {formatCurrency(data.totals?.purchaseValue)}
                      </Text>
                    </BlockStack>
                  </Card>
                </Layout.Section>
              </Layout>
            </Layout.Section>

            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Top campaigns (last 7 days)
                    </Text>
                    <Button url="/app/analytics" variant="secondary">
                      Tracking analytics
                    </Button>
                  </InlineStack>

                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric"]}
                    headings={["Campaign", "Spend", "Purchases", "Value", "ROAS"]}
                    rows={tableRows.length ? tableRows : [["—", "—", "—", "—", "—"]]}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          </>
        )}
      </Layout>
    </Page>
  );
}

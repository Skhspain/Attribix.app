// app/routes/app.ads.jsx
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

function money(v) {
  const rounded = Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function loader({ request }) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { session } = result;
  const shop = session.shop;

  const conn = await db.metaConnection.findUnique({ where: { shop } }).catch(() => null);

  const from = new Date();
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);

  const rows = await db.metaCampaignDailyInsight
    .findMany({
      where: { shop, date: { gte: from } },
      orderBy: [{ date: "desc" }, { spend: "desc" }],
      take: 50,
      select: {
        date: true,
        campaignName: true,
        spend: true,
        purchases: true,
        purchaseValue: true,
      },
    })
    .catch(() => []);

  const spend7d = rows.reduce((a, r) => a + Number(r.spend || 0), 0);
  const purchases7d = rows.reduce((a, r) => a + Number(r.purchases || 0), 0);
  const value7d = rows.reduce((a, r) => a + Number(r.purchaseValue || 0), 0);
  const roas = spend7d > 0 ? value7d / spend7d : 0;

  return json({
    connected: !!(conn && conn.accessToken && conn.accessToken !== "__PENDING__"),
    adAccountId: conn?.adAccountId || null,
    kpis: { spend7d, purchases7d, value7d, roas },
    rows,
  });
}

export default function AppAds() {
  const data = useLoaderData();
  const syncer = useFetcher();
  const syncing = syncer.state !== "idle";

  const tableRows = (data.rows || []).map((r) => [
    new Date(r.date).toLocaleDateString(),
    r.campaignName || "—",
    money(r.spend),
    String(r.purchases ?? 0),
    money(r.purchaseValue ?? 0),
  ]);

  return (
    <Page
      title="Meta Ads"
      subtitle="Stored insights from Ads Manager (sync → DB → fast dashboard)"
      primaryAction={
        data.connected
          ? {
              content: syncing ? "Syncing…" : "Sync last 7 days",
              onAction: () =>
                syncer.submit({ days: "7" }, { method: "post", action: "/api/meta/sync" }),
              disabled: syncing,
            }
          : {
              content: "Connect Meta",
              url: "/app/integrations/meta",
            }
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Connection
                  </Text>
                  <Text as="p" tone="subdued">
                    {data.connected ? "Connected" : "Not connected"}
                  </Text>
                </BlockStack>
                <Badge tone={data.connected ? "success" : "warning"}>
                  {data.connected ? `Ad account: ${data.adAccountId || "—"}` : "Needs connect"}
                </Badge>
              </InlineStack>
            </Card>

            <Layout>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Spend (7d)
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {money(data.kpis.spend7d)}
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Purchases (Meta)
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {String(data.kpis.purchases7d)}
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Purchase value (Meta)
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {money(data.kpis.value7d)}
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      ROAS
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {money(data.kpis.roas)}
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Campaigns (recent rows)
                  </Text>

                  {data.connected ? (
                    <Button
                      onClick={() =>
                        syncer.submit({ days: "7" }, { method: "post", action: "/api/meta/sync" })
                      }
                      disabled={syncing}
                      variant="primary"
                    >
                      {syncing ? "Syncing…" : "Sync"}
                    </Button>
                  ) : (
                    <Button url="/app/integrations/meta" variant="primary">
                      Connect Meta
                    </Button>
                  )}
                </InlineStack>

                <DataTable
                  columnContentTypes={["text", "text", "numeric", "numeric", "numeric"]}
                  headings={["Date", "Campaign", "Spend", "Purchases", "Value"]}
                  rows={tableRows}
                />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// app/routes/app.settings.general.jsx
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  BlockStack, Button, Card, Divider, InlineStack,
  Page, Text, Banner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { SettingsNav } from "~/components/SettingsNav";
import db from "~/db.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await db.trackingSettings.findUnique({ where: { shop } }).catch(() => null);
  const { getReportingCurrency } = await import("~/services/reportingCurrency.server");

  return json({
    shop,
    // Edited on "Tracking & Attribution" only; shown here for reference.
    // Defaults match the database defaults (7 days, last touch).
    attributionWindow: settings?.attributionWindowDays ?? 7,
    attributionModel: settings?.attributionModel ?? "last_touch",
    storeCurrency: await getReportingCurrency(shop, admin),
  });
}

const MODEL_LABELS = {
  last_touch: "Last touch",
  first_touch: "First touch",
  linear: "Linear (equal split)",
  time_decay: "Time decay",
};

export default function GeneralSettings() {
  const data = useLoaderData();
  const backfillFetcher = useFetcher();

  return (
    <Page fullWidth>
      <div className="ax-settings-layout">
        <SettingsNav />
        <div style={{ flex: 1, minWidth: 0 }}>
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl">General</Text>
            <Text as="p" variant="bodySm" tone="subdued">Store-wide settings and data imports.</Text>
          </BlockStack>

          <div style={{ marginTop: 24 }}>
            <BlockStack gap="500">

              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Attribution</Text>
                    <Button url="/app/settings">Change on Tracking &amp; Attribution</Button>
                  </InlineStack>
                  <Text as="p">
                    {`${MODEL_LABELS[data.attributionModel] ?? data.attributionModel} · ${data.attributionWindow}-day window`}
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Currency</Text>
                  <Text as="p">{`Reports are shown in ${data.storeCurrency}, your Shopify store currency.`}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Order values come from Shopify in this currency and aren't converted. Ad spend from ad accounts in other currencies is converted into it at the current exchange rate.
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">Historical order backfill</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Import the last 90 days of Shopify orders into Attribix so attribution data covers orders placed before the app was installed.
                    </Text>
                  </BlockStack>

                  <Divider />

                  {backfillFetcher.data?.ok && (
                    <Banner tone="success">
                      Backfill complete — {backfillFetcher.data.created} orders imported, {backfillFetcher.data.skipped} already tracked.
                    </Banner>
                  )}
                  {backfillFetcher.data?.error && (
                    <Banner tone="critical">{backfillFetcher.data.error}</Banner>
                  )}

                  <backfillFetcher.Form method="post" action="/api/backfill-orders">
                    <Button
                      submit
                      loading={backfillFetcher.state !== "idle"}
                      disabled={backfillFetcher.state !== "idle"}
                    >
                      {backfillFetcher.state !== "idle" ? "Importing…" : "Run backfill"}
                    </Button>
                  </backfillFetcher.Form>
                </BlockStack>
              </Card>

            </BlockStack>
          </div>
        </div>
      </div>
    </Page>
  );
}

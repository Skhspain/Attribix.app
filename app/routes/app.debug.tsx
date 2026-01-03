// app/routes/app.debug.tsx
import * as React from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Box,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import {
  getShopSettings,
  type ShopSettingsValues,
} from "~/utils/shop-settings.server";
import TrackingWidget from "~/components/TrackingWidget";

type EventRow = {
  id: string;
  eventName: string;
  url: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  value: number | null;
  currency: string | null;
  timestamp: string;
};

type LoaderData = {
  shopDomain: string;
  settings: ShopSettingsValues;
  events: EventRow[];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const settings = await getShopSettings(shopDomain);

  // IMPORTANT: use the TrackedEvent table and the `shop` field
  const eventsRaw = await prisma.trackedEvent.findMany({
    where: { shop: shopDomain },
    orderBy: { timestamp: "desc" },
    take: 20,
  });

  const events: EventRow[] = eventsRaw.map((e: any): EventRow => ({
    id: e.id,
    eventName: e.eventName,
    url: e.url ?? null,
    utmSource: e.utmSource ?? null,
    utmMedium: e.utmMedium ?? null,
    utmCampaign: e.utmCampaign ?? null,
    value: e.value ?? null,
    currency: e.currency ?? null,
    timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : String(e.timestamp),
  }));

  return json<LoaderData>({ shopDomain, settings, events });
}

export default function AppDebugPage() {
  const { shopDomain, settings, events } = useLoaderData<LoaderData>();

  const metaPixelText = settings.metaPixelId
    ? `Meta Pixel: ${settings.metaPixelId}`
    : "Meta Pixel: not set";

  const serverSideText = settings.enableServerSide
    ? "Server-side: enabled"
    : "Server-side: disabled";

  return (
    <Page
      title="Debug – Shop settings & events"
      subtitle={`${shopDomain} · This page is ready`}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Current ShopSettings
                </Text>
                <InlineStack gap="200" wrap>
                  <Badge tone={settings.metaPixelId ? "success" : "attention"}>
                    {metaPixelText}
                  </Badge>
                  <Badge
                    tone={settings.enableServerSide ? "success" : "critical"}
                  >
                    {serverSideText}
                  </Badge>
                  {settings.debugMode && <Badge tone="warning">Debug ON</Badge>}
                </InlineStack>

                <Box paddingBlockStart="200">
                  <Text as="p" tone="subdued">
                    serverEndpoint:{" "}
                    {settings.serverEndpoint || "(default /api/track)"}
                  </Text>
                  <Text as="p" tone="subdued">
                    GA4: {settings.ga4MeasurementId || "not set"}
                  </Text>
                  <Text as="p" tone="subdued">
                    Google Ads ID: {settings.googleAdsId || "not set"}
                  </Text>
                  <Text as="p" tone="subdued">
                    Google Conversion ID:{" "}
                    {settings.googleAdsConversionId || "not set"}
                  </Text>
                </Box>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <TrackingWidget shopDomain={shopDomain} />
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Latest tracked events
                </Text>

                {events.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No events yet. Use the test button above or trigger events
                    from your storefront.
                  </Text>
                ) : (
                  <BlockStack gap="200">
                    {events.map((e: EventRow) => (
                      <Box
                        key={e.id}
                        paddingBlock="200"
                        borderBlockEndWidth="025"
                      >
                        <InlineStack gap="200" align="space-between">
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd">
                              {e.eventName}
                            </Text>
                            <Text as="span" tone="subdued">
                              {e.url || "(no url)"}
                            </Text>
                            <Text as="span" tone="subdued">
                              {[
                                e.utmSource && `utm_source=${e.utmSource}`,
                                e.utmMedium && `utm_medium=${e.utmMedium}`,
                                e.utmCampaign &&
                                  `utm_campaign=${e.utmCampaign}`,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "no utm tags"}
                            </Text>
                          </BlockStack>

                          <BlockStack gap="050" align="end">
                            {e.value != null && (
                              <Text as="span" variant="bodyMd">
                                {e.value.toFixed(2)} {e.currency || ""}
                              </Text>
                            )}
                            <Text as="span" tone="subdued">
                              {new Date(e.timestamp).toLocaleString()}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

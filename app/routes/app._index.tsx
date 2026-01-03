// app/routes/app._index.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Box,
  BlockStack,
  Text,
  InlineStack,
  Button,
  Layout,
  Card,
} from "@shopify/polaris";

type LoaderData = {
  trackingEnabled: boolean;
  lastEvent: string | null;
  host: string;
  shop: string;
};

/**
 * Simple loader – no DB.
 * Reads `host` and `shop` from the URL and passes them to the UI
 * so we can keep them on internal links.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const host = url.searchParams.get("host") ?? "";
  const shop = url.searchParams.get("shop") ?? "";

  return json<LoaderData>({
    trackingEnabled: true,
    lastEvent: null,
    host,
    shop,
  });
}

export default function AppIndex() {
  const { trackingEnabled, lastEvent, host, shop } =
    useLoaderData<typeof loader>();

  const navigate = useNavigate();

  // Helper to build URLs that preserve host + shop
  const buildUrl = (
    path: string,
    extraParams?: Record<string, string | number>
  ) => {
    const params = new URLSearchParams();
    if (host) params.set("host", host);
    if (shop) params.set("shop", shop);

    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, String(value));
      }
    }

    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };

  const handleOpenSettings = () => {
    navigate(buildUrl("/app/settings"));
  };

  const handleViewReports = () => {
    navigate(buildUrl("/app/reports"));
  };

  const handleOpenMetaAds = () => {
    navigate(buildUrl("/app/ads", { days: 30 }));
  };

  return (
    <Page
      title="Attribix overview"
      subtitle="See how your tracking and Meta ads are performing."
    >
      <Layout>
        {/* Intro / hero */}
        <Layout.Section>
          <Box paddingBlockEnd="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Welcome to Attribix 👋
              </Text>
              <Text as="p" variant="bodyMd">
                This is your Attribix home. Jump to Meta Ads performance,
                tracking status, reports and settings from here.
              </Text>
              <InlineStack gap="200">
                <Button variant="primary" onClick={handleOpenMetaAds}>
                  View Meta Ads report
                </Button>
                <Button onClick={handleViewReports}>Open reports</Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </Layout.Section>

        {/* Cards row */}
        <Layout.Section>
          <InlineStack gap="400" wrap>
            {/* Meta Ads card */}
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Meta Ads performance
                  </Text>
                  <Text as="p" variant="bodySm">
                    See spend, revenue, ROAS and conversions from your
                    connected Meta ad account for the last 30 days.
                  </Text>
                  <InlineStack>
                    <Button variant="primary" onClick={handleOpenMetaAds}>
                      Open Meta report
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Box>
            </Card>

            {/* Tracking status card */}
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Tracking status
                  </Text>

                  <InlineStack gap="200" align="start">
                    <Text
                      as="span"
                      tone={trackingEnabled ? "success" : "critical"}
                    >
                      {trackingEnabled ? "Enabled" : "Disabled"}
                    </Text>

                    <Button onClick={handleOpenSettings} variant="primary">
                      Open settings
                    </Button>

                    <Button onClick={handleViewReports}>View reports</Button>
                  </InlineStack>

                  <Text as="p" tone="subdued" variant="bodySm">
                    Last event: {lastEvent ?? "—"}
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

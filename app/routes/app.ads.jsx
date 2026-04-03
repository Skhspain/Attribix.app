// app/routes/app.ads.jsx  (Integrations hub)
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Box,
  Icon,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { session } = result;
  const shop = session.shop;

  const [metaConn, googleConn] = await Promise.all([
    db.metaConnection.findUnique({ where: { shop } }).catch(() => null),
    db.googleConnection.findUnique({ where: { shop } }).catch(() => null),
  ]);

  const metaConnected = !!(
    metaConn &&
    metaConn.accessToken &&
    metaConn.accessToken !== "__PENDING__"
  );
  const googleConnected = !!(
    googleConn &&
    googleConn.accessToken &&
    googleConn.accessToken !== "__PENDING__"
  );

  return json({
    meta: {
      connected: metaConnected,
      adAccountId: metaConn?.adAccountId || null,
    },
    google: {
      connected: googleConnected,
      adCustomerId: googleConn?.adCustomerId || null,
      developerTokenConfigured: !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    },
  });
}

export default function IntegrationsHub() {
  const { meta, google } = useLoaderData();

  return (
    <Page
      title="Integrations"
      subtitle="Connect your ad platforms to sync spend data and enable server-side conversions."
    >
      <Layout>
        {/* Meta */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Meta (Facebook &amp; Instagram)
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Sync campaign spend · Server-side Conversions API
                  </Text>
                </BlockStack>
                {meta.connected ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="warning">Not connected</Badge>
                )}
              </InlineStack>

              {meta.connected ? (
                <BlockStack gap="100">
                  <Text as="p" tone="subdued" variant="bodySm">
                    Ad account:{" "}
                    <Text as="span" fontWeight="semibold">
                      {meta.adAccountId || "—"}
                    </Text>
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Purchase events are automatically sent via CAPI on every order.
                  </Text>
                </BlockStack>
              ) : (
                <Text as="p" tone="subdued" variant="bodySm">
                  Connect your Meta account to pull campaign insights and enable
                  server-side conversion reporting.
                </Text>
              )}

              <InlineStack gap="200">
                <Button url="/app/integrations/meta" variant="primary">
                  {meta.connected ? "Manage Meta" : "Connect Meta"}
                </Button>
                {meta.connected && (
                  <Button url="/app/integrations/meta" variant="secondary">
                    View campaigns
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Google */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Google Ads
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Sync ad spend · Offline Conversion import
                  </Text>
                </BlockStack>
                {google.connected ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="warning">Not connected</Badge>
                )}
              </InlineStack>

              {google.connected ? (
                <BlockStack gap="100">
                  <Text as="p" tone="subdued" variant="bodySm">
                    Ad account:{" "}
                    <Text as="span" fontWeight="semibold">
                      {google.adCustomerId || "—"}
                    </Text>
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Google click conversions are uploaded automatically when a{" "}
                    <Text as="span" fontWeight="semibold">gclid</Text> is
                    present on the order.
                  </Text>
                </BlockStack>
              ) : (
                <BlockStack gap="100">
                  <Text as="p" tone="subdued" variant="bodySm">
                    Connect your Google Ads account to sync daily spend and
                    upload offline conversions for attributed orders.
                  </Text>
                  {!google.developerTokenConfigured && (
                    <Text as="p" tone="critical" variant="bodySm">
                      Developer token not configured — contact support.
                    </Text>
                  )}
                </BlockStack>
              )}

              <InlineStack gap="200">
                <Button url="/app/integrations/google" variant="primary">
                  {google.connected ? "Manage Google Ads" : "Connect Google Ads"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Help section */}
        <Layout.Section>
          <Card background="bg-surface-secondary">
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                How integrations work
              </Text>
              <BlockStack gap="100">
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="semibold">Ad spend sync</Text> — Daily spend is
                  pulled from Meta and Google and stored in your database. This powers the ROAS
                  numbers on your Attribution dashboard.
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="semibold">Server-side conversions</Text> — When an
                  order is attributed to a Meta or Google click, a conversion event is sent directly
                  from your server, bypassing ad blockers and iOS privacy restrictions.
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="semibold">Attribution</Text> — Manage attribution
                  model (first-touch / last-touch) and window days in{" "}
                  <Button url="/app/settings" variant="plain">Settings</Button>.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

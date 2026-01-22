// app/routes/app.integrations.meta.jsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Badge,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { session } = result;
  const shop = session.shop;

  const conn = await db.metaConnection.findUnique({ where: { shop } }).catch(() => null);

  const connected = !!(conn && conn.accessToken && conn.accessToken !== "__PENDING__");

  return json({
    connected,
    adAccountId: conn?.adAccountId || null,
    expiresAt: conn?.expiresAt ? conn.expiresAt.toISOString() : null,
  });
}

export default function MetaIntegration() {
  const data = useLoaderData();

  return (
    <Page
      title="Meta integration"
      subtitle="Connect your Meta Ads account to pull Ads Manager metrics"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Status
                  </Text>
                  <Text as="p" tone="subdued">
                    {data.connected ? "Meta is connected." : "Meta is not connected yet."}
                  </Text>
                  {data.expiresAt ? (
                    <Text as="p" tone="subdued">
                      Token expires: {new Date(data.expiresAt).toLocaleString()}
                    </Text>
                  ) : null}
                </BlockStack>

                <Badge tone={data.connected ? "success" : "warning"}>
                  {data.connected ? `Ad account: ${data.adAccountId || "—"}` : "Not connected"}
                </Badge>
              </InlineStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Connect
                </Text>
                <Text as="p" tone="subdued">
                  This opens Meta OAuth and stores a token for your shop.
                </Text>
                <Button url="/api/meta/oauth/start" variant="primary">
                  {data.connected ? "Reconnect Meta" : "Connect Meta"}
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

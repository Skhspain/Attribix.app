import React from "react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  Banner,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const shop = result.session.shop;

  const conn = await db.googleConnection
    .findUnique({ where: { shop } })
    .catch(() => null);

  const connected = !!(conn && conn.accessToken && conn.accessToken !== "__PENDING__");
  const expiresAt = conn?.expiresAt ? new Date(conn.expiresAt).toISOString() : null;

  return json({
    ok: true,
    connected,
    expiresAt,
    shop,
  });
}

export default function GoogleIntegrationsPage() {
  const data = useLoaderData();

  function startGoogleOAuthTopLevel() {
    const returnTo = "/app/integrations/google";

    const startUrl = `/api/google/oauth/start?shop=${encodeURIComponent(
      data.shop
    )}&returnTo=${encodeURIComponent(returnTo)}`;

    // ✅ MUST be top-level navigation (escape iframe)
    const topWindow = window.top ?? window;
    topWindow.location.href = startUrl;
  }

  return (
    <Page title="Google Ads">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Banner tone="info" title="Google OAuth must open in a new top-level navigation">
                <Text as="p">
                  This button forces a top-level redirect (outside Shopify iframe), which is required for Google OAuth.
                </Text>
              </Banner>

              <Text as="p">
                Connect your Google account to pull Google Ads campaigns, spend and performance data into Attribix.
              </Text>

              <InlineStack gap="200">
                <Button variant="primary" onClick={startGoogleOAuthTopLevel}>
                  {data.connected ? "Reconnect Google (top-level)" : "Connect Google (top-level)"}
                </Button>

                {data.connected ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="warning">Not connected</Badge>
                )}
              </InlineStack>

              <BlockStack gap="100">
                <Text as="p" tone="subdued">Shop: {data.shop}</Text>
                <Text as="p" tone="subdued">Token expiry: {data.expiresAt ?? "—"}</Text>
              </BlockStack>

              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(
                  {
                    shop: data.shop,
                    connected: data.connected,
                    expiresAt: data.expiresAt,
                  },
                  null,
                  2
                )}
              </pre>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

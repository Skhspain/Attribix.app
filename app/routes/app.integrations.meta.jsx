import React from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
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
  Select,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const embedded = url.searchParams.get("embedded") || "1";

  // ✅ IMPORTANT: this is your Fly origin when the app is served from Fly
  const appOrigin = url.origin;

  const shop = result.session.shop;

  const conn = await db.metaConnection.findUnique({ where: { shop } }).catch(() => null);

  const connected = !!(conn && conn.accessToken && conn.accessToken !== "__PENDING__");
  const adAccountId = conn?.adAccountId || null;
  const expiresAt = conn?.expiresAt ? new Date(conn.expiresAt).toISOString() : null;

  return json({
    ok: true,
    connected,
    adAccountId,
    expiresAt,
    shop,
    host,
    embedded,
    appOrigin, // ✅ added
  });
}

export default function MetaIntegrationsPage() {
  const data = useLoaderData();

  // ✅ Minimal + SSR-safe:
  // Always build absolute URLs using the server-provided appOrigin (Fly),
  // never window.* (avoids “Application error” SSR crashes).
  const apiUrl = React.useCallback(
    (path) => new URL(path, data.appOrigin).toString(),
    [data.appOrigin]
  );

  const accountsFetcher = useFetcher();
  const saveFetcher = useFetcher();

  const accounts = accountsFetcher.data?.accounts || [];
  const [selected, setSelected] = React.useState(data.adAccountId || "");

  const options = [
    { label: "Select an ad account…", value: "" },
    ...accounts.map((a) => ({
      label: a.name ? `${a.name} (${a.id})` : a.id,
      value: a.id,
    })),
  ];

  const connected = !!data.connected;

  function startMetaOAuthTopLevel() {
    const returnTo = "/app/integrations/meta";

    const startUrl =
      apiUrl(`/api/meta/oauth/start?shop=${encodeURIComponent(data.shop)}`) +
      `&host=${encodeURIComponent(data.host || "")}` +
      `&embedded=${encodeURIComponent(data.embedded || "1")}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;

    try {
      window.top.location.href = startUrl;
    } catch {
      window.location.href = startUrl;
    }
  }

  return (
    <Page title="Meta">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Banner tone="info" title="Debug mode enabled">
                <Text as="p">
                  Use “Connect Meta (top-level)”. This must navigate to Facebook, not /auth/login,
                  and not use fetcher/POST.
                </Text>
              </Banner>

              <Text as="p">
                Connect your Meta account to sync campaigns and enable Meta-related features.
              </Text>

              <InlineStack gap="200">
                <Button variant="primary" onClick={startMetaOAuthTopLevel}>
                  {connected ? "Reconnect Meta (top-level)" : "Connect Meta (top-level)"}
                </Button>
              </InlineStack>

              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(
                  {
                    shop: data.shop,
                    host: data.host,
                    embedded: data.embedded,
                    connected: data.connected,
                    expiresAt: data.expiresAt,
                    appOrigin: data.appOrigin,
                  },
                  null,
                  2
                )}
              </pre>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Connection status
                </Text>

                {connected ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="warning">Not connected</Badge>
                )}
              </InlineStack>

              <BlockStack gap="100">
                <Text as="p" tone="subdued">Shop: {data.shop}</Text>
                <Text as="p" tone="subdued">Host: {data.host ? data.host : "—"}</Text>
                <Text as="p" tone="subdued">Embedded: {data.embedded ? data.embedded : "—"}</Text>
                <Text as="p" tone="subdued">Token expiry: {data.expiresAt ? data.expiresAt : "—"}</Text>
                <Text as="p" tone="subdued">
                  Selected ad account: {data.adAccountId ? data.adAccountId : "—"}
                </Text>
              </BlockStack>

              {connected ? (
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Button
                      onClick={() => accountsFetcher.load(apiUrl("/api/meta/adaccounts"))}
                      loading={accountsFetcher.state !== "idle"}
                    >
                      Fetch ad accounts
                    </Button>
                  </InlineStack>

                  <Select
                    label="Ad account"
                    options={options}
                    value={selected}
                    onChange={(v) => setSelected(v)}
                    helpText="Attribix needs an ad account (act_...) to pull campaign insights."
                  />

                  <saveFetcher.Form method="post" action={apiUrl("/api/meta/adaccount/select")}>
                    <input type="hidden" name="adAccountId" value={selected} />
                    <InlineStack gap="200" blockAlign="center">
                      <Button
                        submit
                        variant="primary"
                        disabled={!selected || saveFetcher.state !== "idle"}
                        loading={saveFetcher.state !== "idle"}
                      >
                        Save ad account
                      </Button>
                    </InlineStack>
                  </saveFetcher.Form>
                </BlockStack>
              ) : (
                <Banner tone="warning" title="Meta not connected">
                  <Text as="p">
                    Click “Connect Meta (top-level)”, complete the OAuth flow, then come back here
                    to select an ad account.
                  </Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

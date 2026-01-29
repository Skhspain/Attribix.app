// app/routes/app.integrations.meta.jsx
import React from "react";
import { redirect, json } from "@remix-run/node";
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

/**
 * Meta integration page.
 * Diagnostics included:
 * - A client-side click logger (proves UI receives clicks)
 * - A fetcher POST button (proves POST hits Remix without relying on <form>)
 *
 * NEW:
 * - Shows Meta connection status
 * - Fetches ad accounts and lets you select + save adAccountId
 */

export async function loader({ request }) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

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
  });
}

export async function action({ request }) {
  console.log("[app.integrations.meta] ACTION HIT", new Date().toISOString());

  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  // IMPORTANT: include shop in redirect (helps embedded routing / state)
  const shop = result.session.shop;

  return redirect(
    `/api/meta/oauth/start?returnTo=${encodeURIComponent("/app/integrations/meta")}&shop=${encodeURIComponent(
      shop
    )}`
  );
}

export default function MetaIntegrationsPage() {
  const data = useLoaderData();

  // Your existing fetcher (kept)
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";

  // NEW: Fetch ad accounts
  const accountsFetcher = useFetcher();
  const saveFetcher = useFetcher();

  const accounts = accountsFetcher.data?.accounts || [];
  const [selected, setSelected] = React.useState(data.adAccountId || "");

  // Keep select in sync if loader data changes (e.g. after saving)
  React.useEffect(() => {
    if (data?.adAccountId && data.adAccountId !== selected) {
      setSelected(data.adAccountId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.adAccountId]);

  // Build Select options
  const options = [
    { label: "Select an ad account…", value: "" },
    ...accounts.map((a) => ({
      label: a.name ? `${a.name} (${a.id})` : a.id,
      value: a.id,
    })),
  ];

  const connected = !!data.connected;
  const hasAdAccount = !!data.adAccountId;

  return (
    <Page title="Meta">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              {/* Keep your debug block exactly (not removed) */}
              <Banner tone="info" title="Debug mode enabled">
                <Text as="p">
                  1) If you click and the timestamp updates, clicks are reaching the browser. 2) If you click “POST via
                  fetcher” and you see ACTION HIT in Fly logs, POSTs reach Remix.
                </Text>
              </Banner>

              <Text as="p">Connect your Meta account to sync campaigns and enable Meta-related features.</Text>

              {/* Client-side click proof */}
              <Button
                onClick={() => {
                  console.log("[app.integrations.meta] CLIENT CLICK", new Date().toISOString());
                  alert("CLIENT CLICK OK: " + new Date().toISOString());
                }}
              >
                Test click (client)
              </Button>

              {/* Server POST proof without relying on <form> submit */}
              <fetcher.Form method="post">
                <Button submit variant="primary" loading={busy} disabled={busy}>
                  POST via fetcher (server)
                </Button>
              </fetcher.Form>

              {/* Your original method (keep it too) */}
              <form method="post">
                <Button submit variant="secondary">
                  Connect Meta (form submit)
                </Button>
              </form>

              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify({ fetcherState: fetcher.state, fetcherData: fetcher.data }, null, 2)}
              </pre>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* NEW: Connection status + account selection */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Connection status
                </Text>

                {connected ? <Badge tone="success">Connected</Badge> : <Badge tone="warning">Not connected</Badge>}
              </InlineStack>

              <BlockStack gap="100">
                <Text as="p" tone="subdued">
                  Shop: {data.shop}
                </Text>
                <Text as="p" tone="subdued">
                  Token expiry: {data.expiresAt ? data.expiresAt : "—"}
                </Text>
                <Text as="p" tone="subdued">
                  Selected ad account: {data.adAccountId ? data.adAccountId : "—"}
                </Text>
              </BlockStack>

              {!connected ? (
                <Banner tone="warning" title="Meta not connected">
                  <Text as="p">
                    Click “Connect Meta” above, complete the OAuth flow, then come back here to select an ad account.
                  </Text>
                </Banner>
              ) : null}

              {connected ? (
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Button
                      onClick={() => accountsFetcher.load("/api/meta/adaccounts")}
                      loading={accountsFetcher.state !== "idle"}
                    >
                      Fetch ad accounts
                    </Button>

                    {accountsFetcher.data?.ok === false ? (
                      <Text as="p" tone="critical">
                        {accountsFetcher.data.error}
                      </Text>
                    ) : null}
                  </InlineStack>

                  <Select
                    label="Ad account"
                    options={options}
                    value={selected}
                    onChange={(v) => setSelected(v)}
                    helpText="Attribix needs an ad account (act_...) to pull campaign insights."
                  />

                  <saveFetcher.Form method="post" action="/api/meta/adaccount/select">
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

                      {saveFetcher.data?.ok ? (
                        <Text as="p" tone="success">
                          Saved: {saveFetcher.data.adAccountId}
                        </Text>
                      ) : null}

                      {saveFetcher.data?.ok === false ? (
                        <Text as="p" tone="critical">
                          {saveFetcher.data.error}
                        </Text>
                      ) : null}
                    </InlineStack>
                  </saveFetcher.Form>

                  {connected && (hasAdAccount || !!selected) ? (
                    <Banner tone="success" title="Ready to sync">
                      <Text as="p">
                        You can now go to <strong>Meta ads dashboard</strong> and run “Sync now”.
                      </Text>
                    </Banner>
                  ) : null}
                </BlockStack>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

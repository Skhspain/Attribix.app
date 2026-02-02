import React, { useMemo, useState, useEffect } from "react";
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
  Divider,
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

  // Saved ad account (customer) selection (optional)
  const adCustomerId = conn?.adCustomerId ?? null;

  // Don't leak token value — only indicate presence
  const developerTokenConfigured = !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  return json({
    ok: true,
    connected,
    expiresAt,
    shop,
    adCustomerId,
    developerTokenConfigured,
  });
}

export default function GoogleIntegrationsPage() {
  const data = useLoaderData();

  const customersFetcher = useFetcher();
  const saveCustomerFetcher = useFetcher();
  const syncSpendFetcher = useFetcher();

  const [selectedCustomerId, setSelectedCustomerId] = useState(data.adCustomerId ?? "");

  // Keep selection in sync if loader returns a different saved value (rare but safe)
  useEffect(() => {
    if ((data.adCustomerId ?? "") !== selectedCustomerId) {
      setSelectedCustomerId(data.adCustomerId ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.adCustomerId]);

  function startGoogleOAuthTopLevel() {
    const returnTo = "/app/integrations/google";

    const startUrl = `/api/google/oauth/start?shop=${encodeURIComponent(
      data.shop
    )}&returnTo=${encodeURIComponent(returnTo)}`;

    // MUST be top-level navigation (escape iframe)
    const topWindow = window.top ?? window;
    topWindow.location.href = startUrl;
  }

  const customers = customersFetcher.data?.customers ?? [];

  const customerOptions = useMemo(() => {
    const opts = customers.map((c) => ({
      label: c.name ? `${c.name} (${c.id})` : c.id,
      value: c.id,
    }));

    return [{ label: "Select an ad account…", value: "" }, ...opts];
  }, [customers]);

  // Build URL once so debug is clear + consistent
  const customersUrl = useMemo(() => {
    return `/api/google/ads/customers?shop=${encodeURIComponent(data.shop)}`;
  }, [data.shop]);

  function loadAdAccounts() {
    // In embedded contexts, fetcher.load() can behave weirdly.
    // fetcher.submit() forces a proper request.
    const form = new FormData();
    form.set("shop", data.shop);

    customersFetcher.submit(form, {
      method: "get",
      action: "/api/google/ads/customers",
    });
  }

  function saveSelectedAccount() {
    if (!selectedCustomerId) return;

    const form = new FormData();
    form.set("shop", data.shop);
    form.set("customerId", selectedCustomerId);

    saveCustomerFetcher.submit(form, {
      method: "post",
      action: "/api/google/ads/customer",
    });
  }

  function syncSpendLast30Days() {
    if (!selectedCustomerId) return;

    const form = new FormData();
    form.set("shop", data.shop);
    form.set("customerId", selectedCustomerId);
    form.set("range", "last_30_days");

    syncSpendFetcher.submit(form, {
      method: "post",
      action: "/api/google/ads/sync-spend",
    });
  }

  const isLoadingCustomers = customersFetcher.state !== "idle";
  const isSavingCustomer = saveCustomerFetcher.state !== "idle";
  const isSyncingSpend = syncSpendFetcher.state !== "idle";

  const saveOk = saveCustomerFetcher.data?.ok;
  const syncOk = syncSpendFetcher.data?.ok;

  const customersError = customersFetcher.data?.error;
  const saveError = saveCustomerFetcher.data?.error;
  const syncError = syncSpendFetcher.data?.error;

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

              <InlineStack gap="200" blockAlign="center">
                <Button variant="primary" onClick={startGoogleOAuthTopLevel}>
                  {data.connected ? "Reconnect Google (top-level)" : "Connect Google (top-level)"}
                </Button>

                {data.connected ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="warning">Not connected</Badge>
                )}

                {data.developerTokenConfigured ? (
                  <Badge tone="success">Developer token: OK</Badge>
                ) : (
                  <Badge tone="critical">Developer token: Missing</Badge>
                )}
              </InlineStack>

              <BlockStack gap="100">
                <Text as="p" tone="subdued">Shop: {data.shop}</Text>
                <Text as="p" tone="subdued">Token expiry: {data.expiresAt ?? "—"}</Text>
                <Text as="p" tone="subdued">Selected ad account: {data.adCustomerId ?? "—"}</Text>
              </BlockStack>

              <Divider />

              {/* Step 2/3: Pick account + Sync spend */}
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">
                  Step 2: Load & pick ad account (customer)
                </Text>

                <Text as="p" tone="subdued">
                  Step 1 is connecting Google (OAuth). After that, you load accounts and choose which one to sync.
                  Syncing spend is step 3.
                </Text>

                {!data.connected ? (
                  <Banner tone="warning" title="Step 1 required: connect Google first">
                    <Text as="p">You must connect Google OAuth before loading ad accounts.</Text>
                  </Banner>
                ) : !data.developerTokenConfigured ? (
                  <Banner tone="critical" title="Developer token missing">
                    <Text as="p">
                      You need a Google Ads Developer Token set on the server (Fly secret) before spend sync can work.
                    </Text>
                  </Banner>
                ) : null}

                {/* Debug banner (helps you verify request URL + state) */}
                <Banner tone="info" title="Debug (Load ad accounts)">
                  <BlockStack gap="100">
                    <Text as="p">Fetcher state: {customersFetcher.state}</Text>
                    <Text as="p">URL (expected): {customersUrl}</Text>
                    <Text as="p" tone="subdued">
                      If you click “Load ad accounts”, you should see an XHR/fetch request to the URL above.
                      If it still hangs, we check the route file next.
                    </Text>
                  </BlockStack>
                </Banner>

                <InlineStack gap="200" blockAlign="end" wrap>
                  <Button
                    onClick={loadAdAccounts}
                    disabled={!data.connected || !data.developerTokenConfigured || isLoadingCustomers}
                  >
                    {isLoadingCustomers ? "Loading ad accounts..." : "Load ad accounts"}
                  </Button>

                  <div style={{ minWidth: 420 }}>
                    <Select
                      label="Ad account (customer)"
                      options={customerOptions}
                      value={selectedCustomerId}
                      onChange={setSelectedCustomerId}
                      disabled={!data.connected || !data.developerTokenConfigured || customers.length === 0}
                    />
                  </div>

                  <Button
                    variant="primary"
                    onClick={saveSelectedAccount}
                    disabled={!selectedCustomerId || isSavingCustomer}
                  >
                    {isSavingCustomer ? "Saving..." : "Save selection"}
                  </Button>

                  <Button
                    onClick={syncSpendLast30Days}
                    disabled={!selectedCustomerId || isSyncingSpend}
                  >
                    {isSyncingSpend ? "Syncing..." : "Sync spend (last 30 days)"}
                  </Button>
                </InlineStack>

                {saveOk ? (
                  <Banner tone="success" title="Saved">
                    <Text as="p">Ad account saved. Next: Sync spend.</Text>
                  </Banner>
                ) : null}

                {syncOk ? (
                  <Banner tone="success" title="Sync started">
                    <Text as="p">Spend sync triggered successfully.</Text>
                  </Banner>
                ) : null}

                {customersError ? (
                  <Banner tone="critical" title="Failed to load ad accounts">
                    <Text as="p">{String(customersError)}</Text>
                  </Banner>
                ) : null}

                {saveError ? (
                  <Banner tone="critical" title="Failed to save selection">
                    <Text as="p">{String(saveError)}</Text>
                  </Banner>
                ) : null}

                {syncError ? (
                  <Banner tone="critical" title="Failed to sync spend">
                    <Text as="p">{String(syncError)}</Text>
                  </Banner>
                ) : null}
              </BlockStack>

              <Divider />

              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(
                  {
                    shop: data.shop,
                    connected: data.connected,
                    expiresAt: data.expiresAt,
                    adCustomerId: data.adCustomerId,
                    developerTokenConfigured: data.developerTokenConfigured,
                    customersLoaded: customers.length,
                    selectedCustomerId,
                    customersFetcher: customersFetcher.state,
                    saveCustomerFetcher: saveCustomerFetcher.state,
                    syncSpendFetcher: syncSpendFetcher.state,
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

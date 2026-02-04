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

  // IMPORTANT:
  // In Shopify Admin, the browser origin is admin.shopify.com.
  // If we use absolute paths like "/api/...", requests go to Shopify (and 404).
  // Build URLs under the embedded app base:
  //   /store/<store>/apps/<app-handle>
  const appBase =
    typeof window !== "undefined" ? window.location.pathname.split("/app/")[0] || "" : "";
  const withAppBase = (path) => `${appBase}${path.startsWith("/") ? path : `/${path}`}`;

  const customersFetcher = useFetcher();
  const saveCustomerFetcher = useFetcher();
  const syncSpendFetcher = useFetcher();

  const [selectedCustomerId, setSelectedCustomerId] = useState(data.adCustomerId ?? "");

  // Keep selection in sync if loader returns a different saved value
  useEffect(() => {
    const saved = data.adCustomerId ?? "";
    if (saved !== selectedCustomerId) setSelectedCustomerId(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.adCustomerId]);

  function startGoogleOAuthTopLevel() {
    const returnTo = "/app/integrations/google";

    const startUrl = withAppBase(
      `/api/google/oauth/start?shop=${encodeURIComponent(data.shop)}&returnTo=${encodeURIComponent(
        returnTo
      )}`
    );

    // ✅ MUST be top-level navigation (escape iframe)
    const topWindow = window.top ?? window;
    topWindow.location.href = startUrl;
  }

  // IMPORTANT: only trust customers if ok === true
  const customers = customersFetcher.data?.ok ? customersFetcher.data.customers ?? [] : [];
  const customersError =
    customersFetcher.data?.ok === false ? customersFetcher.data?.error : null;

  const customerOptions = useMemo(() => {
    const opts = customers.map((c) => ({
      label: c.name ? `${c.name} (${c.id})` : c.id,
      value: c.id,
    }));
    return [{ label: "Select an ad account…", value: "" }, ...opts];
  }, [customers]);

  // Make URL explicit for debugging
  const customersUrl = useMemo(() => {
    return withAppBase(`/api/google/ads/customers?shop=${encodeURIComponent(data.shop)}`);
  }, [data.shop]);

  function loadAdAccounts() {
    if (!data.connected) return;
    if (!data.developerTokenConfigured) return;

    console.log("[Google Ads] CLICK: Load ad accounts");
    console.log("[Google Ads] customersUrl =", customersUrl);

    // fetcher.load makes a GET request to this URL
    customersFetcher.load(customersUrl);
  }

  function saveSelectedAccount() {
    if (!selectedCustomerId) return;

    const form = new FormData();
    form.set("shop", data.shop);
    form.set("customerId", selectedCustomerId);

    saveCustomerFetcher.submit(form, {
      method: "post",
      action: withAppBase("/api/google/ads/customer"),
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
      action: withAppBase("/api/google/ads/sync-spend"),
    });
  }

  const isLoadingCustomers = customersFetcher.state !== "idle";
  const isSavingCustomer = saveCustomerFetcher.state !== "idle";
  const isSyncingSpend = syncSpendFetcher.state !== "idle";

  const saveOk = saveCustomerFetcher.data?.ok;
  const syncOk = syncSpendFetcher.data?.ok;

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

                {/* Debug banner */}
                <Banner tone="info" title="Debug (Load ad accounts)">
                  <BlockStack gap="100">
                    <Text as="p">Fetcher state: {customersFetcher.state}</Text>
                    <Text as="p">URL (expected): {customersUrl}</Text>
                    <Text as="p" tone="subdued">
                      After clicking “Load ad accounts”, you MUST see a request to the URL above in Network (Fetch/XHR).
                      If you see nothing, the click handler didn’t run (check Console).
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

                {customersError ? (
                  <Banner tone="critical" title="Failed to load ad accounts">
                    <Text as="p">{String(customersError)}</Text>
                  </Banner>
                ) : null}

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
                    customersFetcherData: customersFetcher.data ?? null,
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

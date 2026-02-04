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

  const url = new URL(request.url);
  const appOrigin = url.origin; // ✅ added

  const shop = result.session.shop;

  const conn = await db.googleConnection.findUnique({ where: { shop } }).catch(() => null);

  const connected = !!(conn && conn.accessToken && conn.accessToken !== "__PENDING__");
  const expiresAt = conn?.expiresAt ? new Date(conn.expiresAt).toISOString() : null;
  const adCustomerId = conn?.adCustomerId ?? null;
  const developerTokenConfigured = !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  return json({
    ok: true,
    connected,
    expiresAt,
    shop,
    adCustomerId,
    developerTokenConfigured,
    appOrigin, // ✅ added
  });
}

export default function GoogleIntegrationsPage() {
  const data = useLoaderData();

  // ✅ SSR-safe absolute URL builder (no window usage)
  const apiUrl = React.useCallback(
    (path) => new URL(path, data.appOrigin).toString(),
    [data.appOrigin]
  );

  const customersFetcher = useFetcher();
  const saveCustomerFetcher = useFetcher();
  const syncSpendFetcher = useFetcher();

  const [selectedCustomerId, setSelectedCustomerId] = useState(data.adCustomerId ?? "");

  useEffect(() => {
    const saved = data.adCustomerId ?? "";
    if (saved !== selectedCustomerId) setSelectedCustomerId(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.adCustomerId]);

  function startGoogleOAuthTopLevel() {
    const returnTo = "/app/integrations/google";
    const startUrl = apiUrl(
      `/api/google/oauth/start?shop=${encodeURIComponent(data.shop)}&returnTo=${encodeURIComponent(
        returnTo
      )}`
    );

    const topWindow = window.top ?? window;
    topWindow.location.href = startUrl;
  }

  const customers = customersFetcher.data?.ok ? customersFetcher.data.customers ?? [] : [];
  const customersError = customersFetcher.data?.ok === false ? customersFetcher.data?.error : null;

  const customerOptions = useMemo(() => {
    const opts = customers.map((c) => ({
      label: c.name ? `${c.name} (${c.id})` : c.id,
      value: c.id,
    }));
    return [{ label: "Select an ad account…", value: "" }, ...opts];
  }, [customers]);

  // ✅ IMPORTANT: this used to cause “Application error” when it referenced window in SSR
  const customersUrl = useMemo(() => {
    return apiUrl(`/api/google/ads/customers?shop=${encodeURIComponent(data.shop)}`);
  }, [data.shop, apiUrl]);

  function loadAdAccounts() {
    if (!data.connected) return;
    if (!data.developerTokenConfigured) return;

    customersFetcher.load(customersUrl);
  }

  function saveSelectedAccount() {
    if (!selectedCustomerId) return;

    const form = new FormData();
    form.set("shop", data.shop);
    form.set("customerId", selectedCustomerId);

    saveCustomerFetcher.submit(form, {
      method: "post",
      action: apiUrl("/api/google/ads/customer"),
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
      action: apiUrl("/api/google/ads/sync-spend"),
    });
  }

  const isLoadingCustomers = customersFetcher.state !== "idle";
  const isSavingCustomer = saveCustomerFetcher.state !== "idle";
  const isSyncingSpend = syncSpendFetcher.state !== "idle";

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

              <InlineStack gap="200" blockAlign="center">
                <Button variant="primary" onClick={startGoogleOAuthTopLevel}>
                  {data.connected ? "Reconnect Google (top-level)" : "Connect Google (top-level)"}
                </Button>

                {data.connected ? <Badge tone="success">Connected</Badge> : <Badge tone="warning">Not connected</Badge>}

                {data.developerTokenConfigured ? (
                  <Badge tone="success">Developer token: OK</Badge>
                ) : (
                  <Badge tone="critical">Developer token: Missing</Badge>
                )}
              </InlineStack>

              <Divider />

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

              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(
                  {
                    appOrigin: data.appOrigin,
                    customersUrl,
                    customersFetcher: customersFetcher.state,
                    customersLoaded: customers.length,
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

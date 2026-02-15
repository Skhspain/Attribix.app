// app/routes/app.integrations.google.jsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
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
  Select,
  Divider,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";

function isResponseLike(x) {
  return (
    x &&
    typeof x === "object" &&
    typeof x.status === "number" &&
    x.headers &&
    typeof x.headers.get === "function"
  );
}

export async function loader({ request }) {
  const result = await authenticate.admin(request);

  // ✅ Embedded refresh fix (robust)
  if (isResponseLike(result)) {
    const location = result.headers.get("Location") || result.headers.get("location") || "";

    if (location.startsWith("/auth")) {
      return new Response(null, {
        status: 401,
        headers: {
          "X-Shopify-API-Request-Failure-Reauthorize": "1",
          "X-Shopify-API-Request-Failure-Reauthorize-Url": location,
        },
      });
    }

    return result;
  }

  const url = new URL(request.url);
  const appOrigin = url.origin;

  const shop = result.session.shop;

  const conn = await db.googleConnection.findUnique({ where: { shop } }).catch(() => null);

  const connected = !!(conn && conn.accessToken && conn.accessToken !== "__PENDING__");
  const expiresAt = conn?.expiresAt ? new Date(conn.expiresAt).toISOString() : null;
  const adCustomerId = conn?.adCustomerId ?? "";
  const developerTokenConfigured = !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  return json({
    shop,
    appOrigin,
    connected,
    expiresAt,
    adCustomerId,
    developerTokenConfigured,
  });
}

function GoogleIntegrationsInner({ data }) {
  const authFetch = useAuthenticatedFetch();
  const apiUrl = useCallback((path) => new URL(path, data.appOrigin).toString(), [data.appOrigin]);

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState(data.adCustomerId || "");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveOk, setSaveOk] = useState(false);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [syncOk, setSyncOk] = useState(false);

  useEffect(() => {
    const saved = data.adCustomerId || "";
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

  async function loadAdAccounts() {
    if (!data.connected) return;
    if (!data.developerTokenConfigured) return;

    try {
      setSaveOk(false);
      setSyncOk(false);
      setCustomersError(null);
      setCustomersLoading(true);

      const url = `/api/google/ads/customers?shop=${encodeURIComponent(data.shop)}`;
      const res = await authFetch(url, { method: "GET" });

      const text = await res.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {}

      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}: ${text.slice(0, 220)}`);
      }

      const list = Array.isArray(payload?.customers) ? payload.customers : [];
      setCustomers(list);

      if (!Array.isArray(payload?.customers)) {
        throw new Error("No customers returned (unexpected response).");
      }
    } catch (e) {
      setCustomers([]);
      setCustomersError(String(e?.message || e));
    } finally {
      setCustomersLoading(false);
    }
  }

  async function saveSelectedAccount() {
    if (!selectedCustomerId) return;

    try {
      setSaveOk(false);
      setSaveError(null);
      setSaveLoading(true);

      const form = new FormData();
      form.set("shop", data.shop);
      form.set("customerId", selectedCustomerId);

      const res = await authFetch("/api/google/ads/customer", {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {}

      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}: ${text.slice(0, 220)}`);
      }

      setSaveOk(true);
    } catch (e) {
      setSaveOk(false);
      setSaveError(String(e?.message || e));
    } finally {
      setSaveLoading(false);
    }
  }

  async function syncSpendLast30Days() {
    if (!selectedCustomerId) return;

    try {
      setSyncOk(false);
      setSyncError(null);
      setSyncLoading(true);

      const form = new FormData();
      form.set("shop", data.shop);
      form.set("customerId", selectedCustomerId);
      form.set("range", "last_30_days");

      const res = await authFetch("/api/google/ads/sync-spend", {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {}

      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}: ${text.slice(0, 220)}`);
      }

      setSyncOk(true);
    } catch (e) {
      setSyncOk(false);
      setSyncError(String(e?.message || e));
    } finally {
      setSyncLoading(false);
    }
  }

  const customerOptions = useMemo(() => {
    const opts = customers.map((c) => ({
      label: c.name ? `${c.name} (${c.id})` : c.id,
      value: c.id,
    }));
    return [{ label: "Select an ad accountâ€¦", value: "" }, ...opts];
  }, [customers]);

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
                <Text as="p" tone="subdued">Token expiry: {data.expiresAt ?? "â€”"}</Text>
                <Text as="p" tone="subdued">Selected ad account: {data.adCustomerId || "â€”"}</Text>
              </BlockStack>

              <Divider />

              {!data.connected ? (
                <Banner tone="warning" title="Step 1 required: connect Google first">
                  <Text as="p">You must connect Google OAuth before loading ad accounts.</Text>
                </Banner>
              ) : !data.developerTokenConfigured ? (
                <Banner tone="critical" title="Developer token missing">
                  <Text as="p">
                    You need a Google Ads Developer Token set on the server (Fly secret) before this works.
                  </Text>
                </Banner>
              ) : null}

              <InlineStack gap="200" blockAlign="end" wrap>
                <Button
                  onClick={loadAdAccounts}
                  disabled={!data.connected || !data.developerTokenConfigured}
                  loading={customersLoading}
                >
                  {customersLoading ? "Loading ad accounts..." : "Load ad accounts"}
                </Button>

                <div style={{ minWidth: 420 }}>
                  <Select
                    label="Ad account (customer)"
                    options={customerOptions}
                    value={selectedCustomerId}
                    onChange={setSelectedCustomerId}
                    disabled={customers.length === 0}
                  />
                </div>

                <Button
                  variant="primary"
                  onClick={saveSelectedAccount}
                  disabled={!selectedCustomerId || saveLoading}
                  loading={saveLoading}
                >
                  Save selection
                </Button>

                <Button
                  onClick={syncSpendLast30Days}
                  disabled={!selectedCustomerId || syncLoading}
                  loading={syncLoading}
                >
                  Sync spend (last 30 days)
                </Button>
              </InlineStack>

              {customersError ? (
                <Banner tone="critical" title="Failed to load ad accounts">
                  <Text as="p">{customersError}</Text>
                </Banner>
              ) : null}

              {saveOk ? (
                <Banner tone="success" title="Saved">
                  <Text as="p">Ad account saved.</Text>
                </Banner>
              ) : null}

              {saveError ? (
                <Banner tone="critical" title="Failed to save selection">
                  <Text as="p">{saveError}</Text>
                </Banner>
              ) : null}

              {syncOk ? (
                <Banner tone="success" title="Sync started">
                  <Text as="p">Spend sync triggered.</Text>
                </Banner>
              ) : null}

              {syncError ? (
                <Banner tone="critical" title="Failed to sync spend">
                  <Text as="p">{syncError}</Text>
                </Banner>
              ) : null}

              <Divider />

              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify({ appOrigin: data.appOrigin, customersLoaded: customers.length }, null, 2)}
              </pre>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default function GoogleIntegrationsPage() {
  const data = useLoaderData();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Page title="Google Ads">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="p">Loadingâ€¦</Text>
                <Spinner />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return <GoogleIntegrationsInner data={data} />;
}

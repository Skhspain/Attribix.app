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

function getAppOrigin(request) {
  const url = new URL(request.url);

  const proto =
    request.headers.get("x-forwarded-proto") ||
    request.headers.get("fly-forwarded-proto") ||
    url.protocol.replace(":", "") ||
    "https";

  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.host;

  return `${proto}://${host}`;
}

export async function loader({ request }) {
  const result = await authenticate.admin(request);

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

  const shop = result.session.shop;
  const appOrigin = getAppOrigin(request);

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

  function startGoogleOAuth() {
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
        throw new Error("No customers returned — unexpected response.");
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
    return [{ label: "Select an ad account…", value: "" }, ...opts];
  }, [customers]);

  return (
    <Page
      title="Google Ads"
      subtitle="Connect Google Ads to sync daily spend and upload offline conversions."
      backAction={{ content: "Integrations", url: "/app/ads" }}
    >
      <Layout>
        {/* Connection card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Connection
                </Text>
                <InlineStack gap="200" blockAlign="center">
                  {data.developerTokenConfigured ? (
                    <Badge tone="success">Developer token: OK</Badge>
                  ) : (
                    <Badge tone="critical">Developer token: missing</Badge>
                  )}
                  {data.connected ? (
                    <Badge tone="success">Connected</Badge>
                  ) : (
                    <Badge tone="warning">Not connected</Badge>
                  )}
                </InlineStack>
              </InlineStack>

              {!data.connected && (
                <Text as="p" tone="subdued">
                  Click "Connect Google Ads" to complete OAuth. You'll be redirected to Google and
                  then returned here automatically.
                </Text>
              )}

              {data.connected && data.expiresAt && (
                <Text as="p" tone="subdued" variant="bodySm">
                  Token expires: {new Date(data.expiresAt).toLocaleDateString()}
                </Text>
              )}

              {!data.developerTokenConfigured && (
                <Banner tone="critical" title="Developer token not configured">
                  <Text as="p">
                    A Google Ads Developer Token must be set as a Fly secret
                    (GOOGLE_ADS_DEVELOPER_TOKEN) before ad account loading and spend sync will work.
                  </Text>
                </Banner>
              )}

              <InlineStack gap="200">
                <Button variant="primary" onClick={startGoogleOAuth}>
                  {data.connected ? "Reconnect Google Ads" : "Connect Google Ads"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Ad account selection */}
        {data.connected && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Ad account
                </Text>

                {data.adCustomerId && (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Current selection:{" "}
                    <Text as="span" fontWeight="semibold">
                      {data.adCustomerId}
                    </Text>
                  </Text>
                )}

                <Divider />

                <InlineStack gap="200" blockAlign="end" wrap>
                  <Button
                    onClick={loadAdAccounts}
                    disabled={!data.developerTokenConfigured}
                    loading={customersLoading}
                  >
                    {customersLoading ? "Loading…" : "Refresh ad accounts"}
                  </Button>

                  <div style={{ minWidth: 360 }}>
                    <Select
                      label="Ad account"
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
                    Save
                  </Button>

                </InlineStack>

                <Banner tone="info">
                  <Text as="p">
                    ✓ Ad data syncs automatically every 24 hours. To sync manually or view campaign performance, go to{" "}
                    <a href="/app/google-ads">Google Ads →</a>
                  </Text>
                </Banner>

                {customersError && (
                  <Banner tone="critical" title="Failed to load ad accounts">
                    <Text as="p">{customersError}</Text>
                  </Banner>
                )}

                {saveOk && (
                  <Banner tone="success" title="Saved">
                    <Text as="p">Ad account saved.</Text>
                  </Banner>
                )}

                {saveError && (
                  <Banner tone="critical" title="Failed to save">
                    <Text as="p">{saveError}</Text>
                  </Banner>
                )}

                {syncOk && (
                  <Banner tone="success" title="Sync complete">
                    <Text as="p">Spend data synced for the last 30 days.</Text>
                  </Banner>
                )}

                {syncError && (
                  <Banner tone="critical" title="Sync failed">
                    <Text as="p">{syncError}</Text>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Not connected info */}
        {!data.connected && (
          <Layout.Section>
            <Banner tone="info" title="How it works">
              <Text as="p">
                After connecting, Attribix will pull daily spend from Google Ads and report ROAS on
                your Attribution dashboard. When an order is attributed to a Google click (gclid),
                an offline conversion is automatically uploaded to Google Ads — improving your
                Smart Bidding signals without relying on browser pixels.
              </Text>
            </Banner>
          </Layout.Section>
        )}
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
              <BlockStack gap="300" inlineAlign="center">
                <Spinner />
                <Text as="p" tone="subdued">Loading…</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return <GoogleIntegrationsInner data={data} />;
}

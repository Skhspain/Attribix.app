// app/routes/app.integrations.meta.jsx
import React, { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
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

  const url = new URL(request.url);
  const shop = result.session.shop;
  const host = url.searchParams.get("host") || "";
  const embedded = url.searchParams.get("embedded") || "1";
  const appOrigin = getAppOrigin(request);

  const conn = await db.metaConnection
    .findUnique({ where: { shop } })
    .catch(() => null);

  const connected = !!(conn && conn.accessToken && conn.accessToken !== "__PENDING__");
  const adAccountId = conn?.adAccountId || "";
  const expiresAt = conn?.expiresAt ? new Date(conn.expiresAt).toISOString() : null;

  return json({
    shop,
    host,
    embedded,
    appOrigin,
    connected,
    adAccountId,
    expiresAt,
  });
}

// ─── Inner component (only rendered client-side after mount) ─────────────────

function MetaIntegrationsInner({ data }) {
  const authFetch = useAuthenticatedFetch();
  const revalidator = useRevalidator();

  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState(null);

  const [selected, setSelected] = useState(data.adAccountId || "");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveOk, setSaveOk] = useState(false);

  const [syncDays, setSyncDays] = useState("30");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [syncOk, setSyncOk] = useState(null);

  const connected = !!data.connected;

  async function fetchAdAccounts() {
    try {
      setSaveOk(false);
      setAccountsError(null);
      setAccountsLoading(true);

      const res = await authFetch("/api/meta/adaccounts", { method: "GET" });

      const text = await res.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch {}

      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}: ${text.slice(0, 160)}`);
      }

      if (!payload?.accounts || !Array.isArray(payload.accounts)) {
        throw new Error("No accounts returned — unexpected response.");
      }

      setAccounts(payload.accounts);
    } catch (e) {
      setAccounts([]);
      setAccountsError(String(e?.message || e));
    } finally {
      setAccountsLoading(false);
    }
  }

  // Auto-fetch accounts on load when connected
  useEffect(() => {
    if (connected) fetchAdAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  async function saveAdAccount() {
    if (!selected) return;

    try {
      setSaveOk(false);
      setSaveError(null);
      setSaveLoading(true);

      const form = new FormData();
      form.set("adAccountId", selected);
      form.set("shop", data.shop);

      const res = await authFetch("/api/meta/adaccount/select", {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch {}

      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}: ${text.slice(0, 160)}`);
      }

      setSaveOk(true);
      revalidator.revalidate();
    } catch (e) {
      setSaveOk(false);
      setSaveError(String(e?.message || e));
    } finally {
      setSaveLoading(false);
    }
  }

  async function syncSpend() {
    try {
      setSyncOk(null);
      setSyncError(null);
      setSyncLoading(true);

      const form = new FormData();
      form.set("days", syncDays);

      const res = await authFetch("/api/meta/sync", { method: "POST", body: form });

      const text = await res.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch {}

      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      setSyncOk({ rows: payload.rows, days: payload.days });
    } catch (e) {
      setSyncError(String(e?.message || e));
    } finally {
      setSyncLoading(false);
    }
  }

  function startMetaOAuth() {
    const returnTo = "/app/integrations/meta";
    const base = data.appOrigin || window.location.origin;

    const startUrl =
      `${base}/api/meta/oauth/start?shop=${encodeURIComponent(data.shop)}` +
      `&host=${encodeURIComponent(data.host || "")}` +
      `&embedded=${encodeURIComponent(data.embedded || "1")}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;

    try {
      window.top.location.href = startUrl;
    } catch {
      window.location.href = startUrl;
    }
  }

  const hasSelectedInAccounts = !!selected && accounts.some((a) => a?.id === selected);

  const options = [
    { label: "Select an ad account…", value: "" },
    ...(!selected || hasSelectedInAccounts
      ? []
      : [{ label: `Saved: ${selected}`, value: selected }]),
    ...accounts.map((a) => ({
      label: a.name ? `${a.name} (${a.id})` : a.id,
      value: a.id,
    })),
  ];

  return (
    <Page
      title="Meta"
      subtitle="Connect Facebook & Instagram Ads to sync campaign spend and enable server-side conversions."
      backAction={{ content: "Integrations", url: "/app/ads" }}
    >
      <Layout>
        {/* Connection card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Connection</Text>
                {connected ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="warning">Not connected</Badge>
                )}
              </InlineStack>

              {!connected && (
                <Text as="p" tone="subdued">
                  Click "Connect Meta" to complete OAuth with Facebook. You'll be redirected back
                  here automatically.
                </Text>
              )}

              {connected && data.expiresAt && (
                <Text as="p" tone="subdued" variant="bodySm">
                  Token expires: {new Date(data.expiresAt).toLocaleDateString()}
                </Text>
              )}

              <InlineStack gap="200">
                <Button variant="primary" onClick={startMetaOAuth}>
                  {connected ? "Reconnect Meta" : "Connect Meta"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Ad account selection */}
        {connected && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Ad account</Text>

                <Text as="p" tone="subdued" variant="bodySm">
                  Attribix needs an ad account (<code>act_…</code>) to pull campaign insights and
                  match attribution data.
                </Text>

                {data.adAccountId && (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Current selection:{" "}
                    <Text as="span" fontWeight="semibold">{data.adAccountId}</Text>
                  </Text>
                )}

                <Divider />

                <InlineStack gap="200" blockAlign="center">
                  <Button onClick={fetchAdAccounts} loading={accountsLoading}>
                    Refresh ad accounts
                  </Button>
                </InlineStack>

                {accountsError && (
                  <Banner tone="critical" title="Failed to load ad accounts">
                    <Text as="p">{accountsError}</Text>
                  </Banner>
                )}

                <Select
                  label="Select ad account"
                  options={options}
                  value={selected}
                  onChange={setSelected}
                />

                <InlineStack gap="200" blockAlign="center">
                  <Button
                    variant="primary"
                    onClick={saveAdAccount}
                    disabled={!selected || saveLoading}
                    loading={saveLoading}
                  >
                    Save
                  </Button>
                </InlineStack>

                {saveOk && (
                  <Banner tone="success" title="Saved">
                    <Text as="p">Ad account saved successfully.</Text>
                  </Banner>
                )}

                {saveError && (
                  <Banner tone="critical" title="Failed to save">
                    <Text as="p">{saveError}</Text>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Spend sync */}
        {connected && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Sync ad spend</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Pull campaign-level spend, purchases, and purchase value from Meta Ads Manager
                  into your database. Run this manually or it will sync automatically each day.
                </Text>

                <Divider />

                <InlineStack gap="200" blockAlign="end">
                  <div style={{ minWidth: 180 }}>
                    <Select
                      label="Date range"
                      options={[
                        { label: "Last 7 days", value: "7" },
                        { label: "Last 14 days", value: "14" },
                        { label: "Last 30 days", value: "30" },
                        { label: "Last 90 days", value: "90" },
                      ]}
                      value={syncDays}
                      onChange={setSyncDays}
                    />
                  </div>
                  <Button
                    variant="primary"
                    onClick={syncSpend}
                    loading={syncLoading}
                    disabled={!data.adAccountId}
                  >
                    Sync now
                  </Button>
                </InlineStack>

                {syncOk && (
                  <Banner tone="success" title="Sync complete">
                    <Text as="p">
                      Synced {syncOk.rows} campaign day-rows for the last {syncOk.days} days.
                    </Text>
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
        {!connected && (
          <Layout.Section>
            <Banner tone="info" title="How it works">
              <Text as="p">
                After connecting, Attribix will pull campaign-level spend daily and report ROAS on
                your Attribution dashboard. Server-side conversion events will also be sent to Meta
                for every attributed order, improving tracking accuracy on iOS and ad-blocked
                browsers.
              </Text>
            </Banner>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}

// ─── Page wrapper with SSR-safe mount guard ───────────────────────────────────

export default function MetaIntegrationsPage() {
  const data = useLoaderData();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Page title="Meta">
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

  return <MetaIntegrationsInner data={data} />;
}

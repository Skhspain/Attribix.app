// app/routes/app.integrations.tiktok.jsx
import React, { useState, useEffect } from "react";
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

function getAppOrigin(request) {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || request.headers.get("fly-forwarded-proto") || url.protocol.replace(":", "") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export async function loader({ request }) {
  const result = await authenticate.admin(request);
  if (result && typeof result === "object" && typeof result.status === "number") {
    return result;
  }

  const { session } = result;
  const shop = session.shop;
  const anyDb = db;
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const embedded = url.searchParams.get("embedded") || "1";
  const appOrigin = getAppOrigin(request);

  const conn = await anyDb.tikTokConnection?.findUnique?.({ where: { shop } });
  const connected = !!conn && conn.accessToken !== "__PENDING__";

  return json({
    shop,
    host,
    embedded,
    appOrigin,
    connected,
    advertiserId: conn?.advertiserId || null,
    lastSyncedAt: conn?.lastSyncedAt ? new Date(conn.lastSyncedAt).toLocaleString() : null,
  });
}

export default function TikTokIntegrationPage() {
  const { shop, host, embedded, appOrigin, connected, advertiserId, lastSyncedAt } = useLoaderData();
  const authFetch = useAuthenticatedFetch();

  const [advertisers, setAdvertisers] = useState([]);
  const [selectedAdvertiser, setSelectedAdvertiser] = useState(advertiserId || "");
  const [loadingAdvertisers, setLoadingAdvertisers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncDays, setSyncDays] = useState("7");
  const [error, setError] = useState(null);

  // Load advertisers when connected
  useEffect(() => {
    if (!connected) return;
    setLoadingAdvertisers(true);
    authFetch("/api/tiktok/advertisers")
      .then((r) => r.json())
      .then((data) => {
        setAdvertisers(data.advertisers || []);
        if (data.selectedId) setSelectedAdvertiser(data.selectedId);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingAdvertisers(false));
  }, [connected]);

  async function saveAdvertiser() {
    if (!selectedAdvertiser) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/tiktok/advertiser/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advertiserId: selectedAdvertiser }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await authFetch("/api/tiktok/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: parseInt(syncDays) }),
      });
      const data = await res.json();
      setSyncResult(data);
    } catch (e) {
      setSyncResult({ ok: false, error: e.message });
    }
    setSyncing(false);
  }

  const oauthUrl = `https://attribix.app/api/tiktok/oauth/start?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}&embedded=${encodeURIComponent(embedded)}`;

  return (
    <Page title="TikTok Ads Integration" backAction={{ content: "Integrations", url: "/app/integrations/meta" }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {error && <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>}

            {/* Connection Card */}
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="300" blockAlign="center">
                  <span style={{ fontSize: 28 }}>🎵</span>
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingMd">TikTok Ads</Text>
                      <Badge tone={connected ? "success" : "attention"}>{connected ? "Connected" : "Not connected"}</Badge>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Connect your TikTok Ads Manager to view campaign performance, spend, and conversions.
                    </Text>
                  </BlockStack>
                </InlineStack>

                <Divider />

                {connected ? (
                  <BlockStack gap="300">
                    <Banner tone="success">TikTok Ads is connected.{lastSyncedAt ? ` Last synced: ${lastSyncedAt}` : ""}</Banner>
                    <Button onClick={() => window.open(oauthUrl, "_blank", "width=600,height=700")}>
                      Reconnect TikTok
                    </Button>
                  </BlockStack>
                ) : (
                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd">
                      Click the button below to connect your TikTok Ads Manager account.
                    </Text>
                    <Button variant="primary" onClick={() => window.open(oauthUrl, "_blank", "width=600,height=700")}>
                      Connect TikTok
                    </Button>
                    {!process.env.TIKTOK_APP_ID && (
                      <Banner tone="warning">
                        TikTok App ID is not configured. Add TIKTOK_APP_ID, TIKTOK_APP_SECRET, and TIKTOK_REDIRECT_URI to your environment variables.
                      </Banner>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Advertiser Selection */}
            {connected && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Advertiser Account</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Select the TikTok advertiser account to sync data from.
                  </Text>

                  {loadingAdvertisers ? (
                    <InlineStack gap="200" blockAlign="center">
                      <Spinner size="small" />
                      <Text as="p" variant="bodySm">Loading advertiser accounts…</Text>
                    </InlineStack>
                  ) : advertisers.length > 0 ? (
                    <BlockStack gap="300">
                      <Select
                        label="Advertiser"
                        options={[
                          { label: "Select an advertiser…", value: "" },
                          ...advertisers.map((a) => ({
                            label: `${a.advertiser_name} (${a.advertiser_id}) — ${a.currency}`,
                            value: a.advertiser_id,
                          })),
                        ]}
                        value={selectedAdvertiser}
                        onChange={setSelectedAdvertiser}
                      />
                      <Button variant="primary" onClick={saveAdvertiser} loading={saving} disabled={!selectedAdvertiser}>
                        Save Advertiser
                      </Button>
                    </BlockStack>
                  ) : (
                    <Banner tone="warning">
                      No advertiser accounts found. Ensure your TikTok app has the required permissions.
                    </Banner>
                  )}
                </BlockStack>
              </Card>
            )}

            {/* Sync */}
            {connected && advertiserId && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Sync Ad Data</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Pull campaign and ad performance data from TikTok.
                  </Text>
                  <InlineStack gap="300" blockAlign="end">
                    <div style={{ minWidth: 120 }}>
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
                    <div style={{ paddingTop: 20 }}>
                      <Button variant="primary" onClick={triggerSync} loading={syncing}>
                        Sync Now
                      </Button>
                    </div>
                  </InlineStack>

                  {syncResult && syncResult.ok && (
                    <Banner tone="success">
                      Synced {syncResult.campaigns} campaign rows and {syncResult.ads} ad rows.
                    </Banner>
                  )}
                  {syncResult && !syncResult.ok && (
                    <Banner tone="critical">{syncResult.error}</Banner>
                  )}
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

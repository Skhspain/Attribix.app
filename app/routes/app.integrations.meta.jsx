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

  const [conn, trackingSettings] = await Promise.all([
    db.metaConnection.findUnique({ where: { shop } }).catch(() => null),
    db.trackingSettings.findUnique({ where: { shop } }).catch(() => null),
  ]);

  const connected = !!(conn && conn.accessToken && conn.accessToken !== "__PENDING__");
  const adAccountId = conn?.adAccountId || "";
  const businessLoginActive = !!process.env.META_BUSINESS_LOGIN_CONFIG_ID;
  const expiresAt = businessLoginActive ? null : (conn?.expiresAt ? new Date(conn.expiresAt).toISOString() : null);

  // If Business Login is active and connected, fetch connected assets summary
  let connectedAssets = null;
  if (connected && businessLoginActive && conn?.accessToken) {
    try {
      const token = conn.accessToken;
      const [adAcct, pixel] = await Promise.all([
        adAccountId
          ? fetch(`https://graph.facebook.com/v20.0/${adAccountId}?fields=id,name,currency&access_token=${token}`).then(r => r.json()).catch(() => null)
          : null,
        trackingSettings?.fbPixelId
          ? fetch(`https://graph.facebook.com/v20.0/${trackingSettings.fbPixelId}?fields=id,name,last_fired_time&access_token=${token}`).then(r => r.json()).catch(() => null)
          : null,
      ]);
      connectedAssets = {
        adAccount: adAcct && !adAcct.error ? { id: adAcct.id, name: adAcct.name, currency: adAcct.currency } : null,
        pixel: pixel && !pixel.error ? { id: pixel.id, name: pixel.name, lastFired: pixel.last_fired_time } : null,
      };
    } catch (e) {
      console.error("[meta] failed to fetch connected assets:", e);
    }
  }

  return json({
    shop,
    host,
    embedded,
    appOrigin,
    connected,
    adAccountId,
    expiresAt,
    businessLoginActive,
    connectedAssets,
    fbPixelId: trackingSettings?.fbPixelId || "",
    fbToken: trackingSettings?.fbToken || "",
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

  const [pixelId, setPixelId] = useState(data.fbPixelId || "");
  const [capiToken, setCapiToken] = useState(data.fbToken || "");
  const [pixelSaving, setPixelSaving] = useState(false);
  const [pixelSaved, setPixelSaved] = useState(false);
  const [availablePixels, setAvailablePixels] = useState([]);
  const [pixelsLoading, setPixelsLoading] = useState(false);
  const [pixelInputMode, setPixelInputMode] = useState("auto"); // "auto" or "manual"
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function savePixelSettings() {
    setPixelSaving(true);
    setPixelSaved(false);
    try {
      await authFetch("/api/meta/pixel-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fbPixelId: pixelId, fbToken: capiToken }),
      });
      setPixelSaved(true);
      setTimeout(() => setPixelSaved(false), 3000);
    } catch (e) { console.error(e); }
    setPixelSaving(false);
  }

  const connected = !!data.connected;

  // Auto-fetch pixels from Meta
  useEffect(() => {
    if (!connected || !data.adAccountId) return;
    setPixelsLoading(true);
    authFetch("/api/meta/pixels")
      .then(function(r) { return r.json(); })
      .then(function(result) {
        if (result.ok && result.pixels && result.pixels.length > 0) {
          setAvailablePixels(result.pixels);
          if (!pixelId && result.pixels[0]) setPixelId(result.pixels[0].id);
        }
      })
      .catch(function(e) { console.error(e); })
      .finally(function() { setPixelsLoading(false); });
  }, [connected, data.adAccountId]);

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

      setSyncOk({ campaignRows: payload.campaignRows, adRows: payload.adRows, days: payload.days });
    } catch (e) {
      setSyncError(String(e?.message || e));
    } finally {
      setSyncLoading(false);
    }
  }

  function startMetaOAuth() {
    const returnTo = "/app/integrations/meta";
    const base = "https://attribix.app";

    const startUrl =
      `${base}/api/meta/oauth/start?shop=${encodeURIComponent(data.shop)}` +
      `&host=${encodeURIComponent(data.host || "")}` +
      `&embedded=${encodeURIComponent(data.embedded || "1")}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;

    // Open in popup to avoid Chrome's lookalike domain warning
    const w = 600, h = 700;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    const popup = window.open(startUrl, "meta_oauth", `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);

    // Poll for popup close — then refresh to pick up new connection
    if (popup) {
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          revalidator.revalidate();
        }
      }, 1000);
    } else {
      // Popup blocked — fall back to redirect
      try { window.top.location.href = startUrl; } catch { window.location.href = startUrl; }
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

              {connected && data.expiresAt && !data.businessLoginActive && (
                <Text as="p" tone="subdued" variant="bodySm">
                  Token expires: {new Date(data.expiresAt).toLocaleDateString()}
                </Text>
              )}

              {connected && data.businessLoginActive && (
                <Text as="p" tone="subdued" variant="bodySm">
                  Connected via Meta Business Login — token never expires.
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

        {/* Connected Assets (Business Login mode) */}
        {connected && data.businessLoginActive && data.connectedAssets && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Connected assets</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Managed via Meta Business Login. To change these, click Reconnect Meta above.
                </Text>

                <div style={{ display: "grid", gap: 12 }}>
                  {/* Ad Account */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                    <span style={{ fontSize: 24 }}>💼</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Ad Account</div>
                      {data.connectedAssets.adAccount ? (
                        <div style={{ fontSize: 13, color: "#374151" }}>
                          {data.connectedAssets.adAccount.name} <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11 }}>{data.connectedAssets.adAccount.id}</code> — {data.connectedAssets.adAccount.currency}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#9ca3af" }}>Not selected</div>
                      )}
                    </div>
                    <Badge tone="success">Active</Badge>
                  </div>

                  {/* Pixel */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                    <span style={{ fontSize: 24 }}>📊</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Meta Pixel</div>
                      {data.connectedAssets.pixel ? (
                        <>
                          <div style={{ fontSize: 13, color: "#374151" }}>
                            {data.connectedAssets.pixel.name} <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11 }}>{data.connectedAssets.pixel.id}</code>
                          </div>
                          {data.connectedAssets.pixel.lastFired && (
                            <div style={{ fontSize: 11, color: "#6b7280" }}>Last fired: {new Date(data.connectedAssets.pixel.lastFired).toLocaleString()}</div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: "#9ca3af" }}>Not selected</div>
                      )}
                    </div>
                    <Badge tone="success">Active</Badge>
                  </div>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Manual ad account / pixel selection (legacy, hidden when Business Login is active) */}
        {connected && !data.businessLoginActive && (
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
                      {syncOk.campaignRows > 0
                        ? `Synced ${syncOk.campaignRows} campaign rows and ${syncOk.adRows} ad rows for the last ${syncOk.days} days.`
                        : `Sync ran but found 0 campaign rows for the last ${syncOk.days} days. Check that your ad account has active campaigns with spend in this period.`
                      }
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

        {/* Meta Pixel & CAPI — hidden when Business Login is active */}
        {!data.businessLoginActive && (
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Meta Pixel & Conversions API</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Add your Meta Pixel ID to enable browser-side tracking. Add a Conversions API token to send server-side events for better attribution accuracy (especially with iOS privacy and ad blockers).
              </Text>

              <Divider />

              <BlockStack gap="300">
                {/* Auto-detected pixels */}
                {availablePixels.length > 0 && (
                  <div style={{ maxWidth: 400 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Select Pixel from your account</label>
                    <Select
                      label=""
                      labelHidden
                      options={[
                        { label: "Select a pixel...", value: "" },
                        ...availablePixels.map(p => ({ label: `${p.name} (${p.id})`, value: p.id })),
                      ]}
                      value={pixelId}
                      onChange={(v) => { setPixelId(v); setPixelInputMode("auto"); }}
                    />
                    <p style={{ fontSize: 12, color: "#16a34a", marginTop: 4 }}>✓ {availablePixels.length} pixel{availablePixels.length !== 1 ? "s" : ""} found from your Meta ad account</p>
                  </div>
                )}

                {pixelsLoading && (
                  <InlineStack gap="200" blockAlign="center">
                    <Spinner size="small" />
                    <Text as="p" variant="bodySm" tone="subdued">Loading pixels from Meta...</Text>
                  </InlineStack>
                )}

                {/* Manual input toggle */}
                <div>
                  <Button variant="plain" onClick={() => setPixelInputMode(pixelInputMode === "manual" ? "auto" : "manual")}>
                    {pixelInputMode === "manual" ? "Use auto-detected pixel" : "Enter pixel ID manually"}
                  </Button>
                </div>

                {pixelInputMode === "manual" && (
                  <div style={{ maxWidth: 400 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Meta Pixel ID (manual)</label>
                    <input
                      value={pixelId}
                      onChange={e => setPixelId(e.target.value)}
                      placeholder="e.g. 1234567890123456"
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #c4cdd5", borderRadius: 8, fontSize: 14 }}
                    />
                    <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Found in Meta Events Manager → Data Sources → Your Pixel → Settings</p>
                  </div>
                )}

                <Divider />

                <BlockStack gap="200">
                  <Button variant="plain" onClick={() => setShowAdvanced(!showAdvanced)}>
                    {showAdvanced ? "Hide advanced settings" : "Advanced: Server-side tracking (CAPI)"}
                  </Button>
                  {showAdvanced && (
                    <div style={{ maxWidth: 400, paddingTop: 8 }}>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Conversions API Token</label>
                      <input
                        value={capiToken}
                        onChange={e => setCapiToken(e.target.value)}
                        placeholder="EAABs..."
                        type="password"
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #c4cdd5", borderRadius: 8, fontSize: 14 }}
                      />
                      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Optional — enables server-side event tracking for better accuracy on iOS and ad-blocked browsers. Generate in Meta Events Manager → Settings → Conversions API.</p>
                    </div>
                  )}
                </BlockStack>

                <InlineStack gap="200" blockAlign="center">
                  <Button variant="primary" onClick={savePixelSettings} loading={pixelSaving}>
                    {pixelSaved ? "Saved ✓" : "Save pixel settings"}
                  </Button>
                  {pixelId && <Badge tone="success">Pixel configured</Badge>}
                  {capiToken && <Badge tone="success">CAPI enabled</Badge>}
                </InlineStack>
              </BlockStack>
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

// app/routes/app.settings.jsx — Tracking & Attribution
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";
import {
  Badge, Banner, BlockStack, Button, Card, Divider, InlineStack,
  Page, Select, Text, TextField,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { SettingsNav } from "~/components/SettingsNav";

async function getCurrentShop(request) {
  const { session } = await authenticate.admin(request);
  return session.shop;
}

export const loader = async ({ request }) => {
  const shop = await getCurrentShop(request);
  const { getTrackingSettings } = await import("../models/trackingSettings.server.ts");
  const settings = await getTrackingSettings(shop);
  return json({ shop, settings: settings ?? null });
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const shop = formData.get("shop");
  if (!shop || typeof shop !== "string") return json({ ok: false, error: "Missing shop" }, { status: 400 });

  const actionType = (formData.get("_action") || "save").toString();
  const settingsModule = await import("../models/trackingSettings.server.ts");

  if (actionType === "generateTrackingKey") {
    const key = await settingsModule.ensureTrackingKey(shop);
    const settings = await settingsModule.getTrackingSettings(shop);
    return json({ ok: true, action: actionType, trackingKey: key, settings, message: "Tracking key generated" });
  }
  if (actionType === "rotateTrackingKey") {
    const key = await settingsModule.rotateTrackingKey(shop);
    const settings = await settingsModule.getTrackingSettings(shop);
    return json({ ok: true, action: actionType, trackingKey: key, settings, message: "Tracking key rotated" });
  }

  const input = {
    ga4Id: (formData.get("ga4Id") || "").toString().trim() || null,
    ga4Secret: (formData.get("ga4Secret") || "").toString().trim() || null,
    fbPixelId: (formData.get("fbPixelId") || "").toString().trim() || null,
    fbToken: (formData.get("fbToken") || "").toString().trim() || null,
    trackingEnabled: formData.get("trackingEnabled") === "true",
    attributionModel: (formData.get("attributionModel") || "last_touch").toString().trim(),
    attributionWindowDays: Math.max(1, Math.min(90, Number(formData.get("attributionWindowDays") || "7") || 7)),
  };
  await settingsModule.upsertTrackingSettings(shop, input);
  await settingsModule.ensureTrackingKey(shop);
  const settings = await settingsModule.getTrackingSettings(shop);
  return json({ ok: true, action: actionType, settings, message: "Settings saved" });
};

export function shouldRevalidate({ formAction, formMethod, actionResult, defaultShouldRevalidate }) {
  const isPost = typeof formMethod === "string" && formMethod.toUpperCase() === "POST";
  const isSettings = typeof formAction === "string" && formAction.includes("/app/settings");
  if (isPost && isSettings && actionResult?.ok) return false;
  return defaultShouldRevalidate;
}

function CopyButton({ text }) {
  const [copied, setCopied] = React.useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <button onClick={handleCopy} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}>
      {copied ? "✓ Copied" : "📋 Copy"}
    </button>
  );
}

function SectionLabel({ n, title, desc }) {
  return (
    <InlineStack gap="300" blockAlign="start">
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#F3F4F6", border: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#374151" }}>
        {n}
      </div>
      <BlockStack gap="025">
        <Text as="h3" variant="headingSm" fontWeight="semibold">{title}</Text>
        {desc && <Text as="p" variant="bodySm" tone="subdued">{desc}</Text>}
      </BlockStack>
    </InlineStack>
  );
}

function SecretField({ label, value, onChange, helpText }) {
  const [show, setShow] = React.useState(false);
  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
      </div>
      <InlineStack gap="200" blockAlign="center">
        <div style={{ flex: 1 }}>
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, fontFamily: value && !show ? "monospace" : undefined }}
            placeholder="●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●"
          />
        </div>
        <button onClick={() => setShow(s => !s)} style={{ padding: "7px 14px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
          {show ? "Hide" : "Show"}
        </button>
      </InlineStack>
      {helpText && <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text>}
    </div>
  );
}

export default function TrackingAndAttributionPage() {
  const { shop, settings: loaderSettings } = useLoaderData();
  const keyFetcher = useFetcher();
  const saveFetcher = useFetcher();
  const pixelFetcher = useFetcher();

  React.useEffect(() => {
    pixelFetcher.submit({ accountID: "1" }, { method: "post", action: "/api/web-pixel/ensure" });
  }, []);

  const latestSettings = saveFetcher.data?.settings ?? keyFetcher.data?.settings ?? loaderSettings;

  const [form, setForm] = React.useState({
    ga4Id: loaderSettings?.ga4Id ?? "",
    ga4Secret: loaderSettings?.ga4Secret ?? "",
    fbPixelId: loaderSettings?.fbPixelId ?? "",
    fbToken: loaderSettings?.fbToken ?? "",
    trackingEnabled: loaderSettings?.trackingEnabled !== false,
    attributionModel: loaderSettings?.attributionModel ?? "last_touch",
    attributionWindowDays: String(loaderSettings?.attributionWindowDays ?? "7"),
  });

  React.useEffect(() => {
    if (latestSettings) {
      setForm({
        ga4Id: latestSettings.ga4Id ?? "",
        ga4Secret: latestSettings.ga4Secret ?? "",
        fbPixelId: latestSettings.fbPixelId ?? "",
        fbToken: latestSettings.fbToken ?? "",
        trackingEnabled: latestSettings.trackingEnabled !== false,
        attributionModel: latestSettings.attributionModel ?? "last_touch",
        attributionWindowDays: String(latestSettings.attributionWindowDays ?? "7"),
      });
    }
  }, [JSON.stringify(latestSettings)]);

  const trackingKey = keyFetcher.data?.trackingKey ?? latestSettings?.trackingKey ?? null;
  const isSaving = saveFetcher.state !== "idle";
  const isKeyBusy = keyFetcher.state !== "idle";
  const savedOk = saveFetcher.data?.ok && saveFetcher.data?.action === "save" && !isSaving;

  const metaConnected = !!(form.fbPixelId && form.fbToken);
  const ga4Connected = !!(form.ga4Id && form.ga4Secret);

  const pixelStatus = latestSettings?.pixelLastSeenAt
    ? (() => {
        const h = (Date.now() - new Date(latestSettings.pixelLastSeenAt).getTime()) / 3600000;
        return h < 24 ? "success" : h < 168 ? "warning" : "critical";
      })()
    : "critical";

  function submitKeyAction(action) {
    const fd = new FormData();
    fd.set("shop", shop); fd.set("_action", action);
    keyFetcher.submit(fd, { method: "post", action: "/app/settings" });
  }

  function handleSave() {
    const fd = new FormData();
    fd.set("shop", shop); fd.set("_action", "save");
    fd.set("ga4Id", form.ga4Id); fd.set("ga4Secret", form.ga4Secret);
    fd.set("fbPixelId", form.fbPixelId); fd.set("fbToken", form.fbToken);
    fd.set("trackingEnabled", form.trackingEnabled ? "true" : "false");
    fd.set("attributionModel", form.attributionModel);
    fd.set("attributionWindowDays", form.attributionWindowDays);
    saveFetcher.submit(fd, { method: "post", action: "/app/settings" });
  }

  const lastSyncLabel = latestSettings?.pixelLastSeenAt
    ? (() => {
        const d = new Date(latestSettings.pixelLastSeenAt);
        const diff = Date.now() - d.getTime();
        if (diff < 120000) return "Today " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        if (diff < 86400000) return "Today " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      })()
    : null;

  return (
    <Page fullWidth>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <SettingsNav />
        <div style={{ flex: 1, minWidth: 0 }}>
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl">Tracking &amp; Attribution</Text>
            <Text as="p" variant="bodySm" tone="subdued">Manage your tracking key, attribution model, event destinations, and platform settings.</Text>
          </BlockStack>
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>

        {/* ── MAIN CONTENT ───────────────────────────────────── */}
        <BlockStack gap="400">

          {/* Status row */}
          <div style={{ display: "flex", gap: 20, padding: "14px 20px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10 }}>
            {[
              { label: "Tracking is active", status: form.trackingEnabled ? "Active" : "Off", ok: form.trackingEnabled },
              { label: "Meta connected", status: metaConnected ? "Connected" : "Not set", ok: metaConnected },
              { label: "GA4 connected", status: ga4Connected ? "Connected" : "Not set", ok: ga4Connected },
            ].map(item => (
              <InlineStack key={item.label} gap="150" blockAlign="center">
                <span style={{ fontSize: 16 }}>{item.ok ? "✅" : "⭕"}</span>
                <Text as="p" variant="bodySm" tone="subdued">{item.label}</Text>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                  background: item.ok ? "#DCFCE7" : "#F3F4F6",
                  color: item.ok ? "#15803D" : "#6B7280",
                }}>{item.status}</span>
              </InlineStack>
            ))}
          </div>

          {savedOk && <Banner tone="success" title="Settings saved" />}
          {saveFetcher.data?.ok === false && <Banner tone="critical" title="Error">{saveFetcher.data?.error}</Banner>}

          {/* 1. Tracking key */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <SectionLabel n="1" title="Tracking key" desc="Used by the pixel to authenticate events from your storefront." />
                <Badge tone={form.trackingEnabled ? "success" : "critical"}>Tracking {form.trackingEnabled ? "ON" : "OFF"}</Badge>
              </InlineStack>
              <Divider />
              {trackingKey ? (
                <InlineStack gap="200" blockAlign="center">
                  <div style={{ flex: 1, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 13, color: "#374151", wordBreak: "break-all" }}>
                    {trackingKey}
                  </div>
                  <CopyButton text={trackingKey} />
                  <button
                    onClick={() => { if (confirm("Rotating the key will break tracking until you update the storefront pixel. Continue?")) submitKeyAction("rotateTrackingKey"); }}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}
                  >
                    🔄 Rotate
                  </button>
                </InlineStack>
              ) : (
                <Button onClick={() => submitKeyAction("generateTrackingKey")} loading={isKeyBusy}>Generate tracking key</Button>
              )}
              {latestSettings?.lastEventAt && (
                <Text as="p" variant="bodySm" tone="subdued">Last event received: {new Date(latestSettings.lastEventAt).toLocaleString()}</Text>
              )}
            </BlockStack>
          </Card>

          {/* 2. Attribution settings */}
          <Card>
            <BlockStack gap="300">
              <SectionLabel n="2" title="Attribution settings" desc="Control how purchases are matched to ad campaigns." />
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Attribution model</Text>
                  <select
                    value={form.attributionModel}
                    onChange={e => setForm(f => ({ ...f, attributionModel: e.target.value }))}
                    style={{ padding: "9px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", width: "100%" }}>
                    <option value="last_touch">Last touch (default) — credit the most recent ad click</option>
                    <option value="first_touch">First touch — credit the very first ad click</option>
                    <option value="linear">Linear — split credit equally</option>
                    <option value="time_decay">Time decay — more credit closer to purchase</option>
                  </select>
                  <Text as="p" variant="bodySm" tone="subdued">Last touch is recommended for direct response campaigns.</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Attribution window (days)</Text>
                  <input
                    type="number" min="1" max="90"
                    value={form.attributionWindowDays}
                    onChange={e => setForm(f => ({ ...f, attributionWindowDays: e.target.value }))}
                    style={{ padding: "9px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", width: "100%" }}
                  />
                  <Text as="p" variant="bodySm" tone="subdued">How far back to look for a matching ad click. Default: 7 days.</Text>
                </BlockStack>
              </div>
            </BlockStack>
          </Card>

          {/* 3. Event destinations */}
          <Card>
            <BlockStack gap="300">
              <SectionLabel n="3" title="Event destinations" desc="Send purchase events to your connected platforms." />
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Meta Pixel / Conversions API", ok: metaConnected, icon: "🎯" },
                  { label: "Google Analytics 4", ok: ga4Connected, icon: "📊" },
                ].map(dest => (
                  <div key={dest.label} style={{
                    padding: "14px 16px", borderRadius: 10, border: "1.5px solid",
                    borderColor: dest.ok ? "#BBF7D0" : "#E5E7EB",
                    background: dest.ok ? "#F0FDF4" : "#F9FAFB",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <InlineStack gap="200" blockAlign="center">
                      <span style={{ fontSize: 18 }}>{dest.icon}</span>
                      <Text as="p" variant="bodySm" fontWeight="semibold">{dest.label}</Text>
                    </InlineStack>
                    <span style={{ fontSize: 11, fontWeight: 700, color: dest.ok ? "#15803D" : "#9CA3AF" }}>
                      {dest.ok ? "● Connected" : "○ Not set"}
                    </span>
                  </div>
                ))}
              </div>
            </BlockStack>
          </Card>

          {/* 4. Meta (Facebook) */}
          <Card>
            <BlockStack gap="300">
              <SectionLabel n="4" title="Meta (Facebook)" desc="Configure your Meta Pixel and Conversions API." />
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Meta Pixel ID</Text>
                  <input value={form.fbPixelId} onChange={e => setForm(f => ({ ...f, fbPixelId: e.target.value }))}
                    placeholder="715094023804146"
                    style={{ padding: "9px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", width: "100%", boxSizing: "border-box" }} />
                  <Text as="p" variant="bodySm" tone="subdued">Found in Meta Events Manager.</Text>
                </BlockStack>
                <SecretField
                  label="Meta Access Token"
                  value={form.fbToken}
                  onChange={v => setForm(f => ({ ...f, fbToken: v }))}
                  helpText="Generate a Conversions API access token in Meta Events Manager."
                />
              </div>
            </BlockStack>
          </Card>

          {/* 5. Google Analytics 4 */}
          <Card>
            <BlockStack gap="300">
              <SectionLabel n="5" title="Google Analytics 4" desc="Configure your GA4 Measurement Protocol." />
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold">GA4 Measurement ID</Text>
                  <input value={form.ga4Id} onChange={e => setForm(f => ({ ...f, ga4Id: e.target.value }))}
                    placeholder="G-0000000000"
                    style={{ padding: "9px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", width: "100%", boxSizing: "border-box" }} />
                  <Text as="p" variant="bodySm" tone="subdued">Found in GA4 Admin &gt; Data Streams &gt; Web stream details.</Text>
                </BlockStack>
                <SecretField
                  label="GA4 API Secret"
                  value={form.ga4Secret}
                  onChange={v => setForm(f => ({ ...f, ga4Secret: v }))}
                  helpText="Create a Measurement Protocol API secret in GA4 Admin &gt; Data Streams."
                />
              </div>
            </BlockStack>
          </Card>

          {/* 6. Tracking control */}
          <Card>
            <BlockStack gap="300">
              <SectionLabel n="6" title="Tracking control" desc="Enable or disable event tracking for this shop." />
              <Divider />
              {form.trackingEnabled && (
                <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", background: "#FEF9C3", border: "1px solid #FDE047", borderRadius: 8 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
                  <Text as="p" variant="bodySm">
                    Disabling tracking will stop sending events to all connected destinations.<br />
                    This will affect attribution and analytics data.
                  </Text>
                </div>
              )}
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="025">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Tracking status</Text>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: form.trackingEnabled ? "#15803D" : "#9CA3AF" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: form.trackingEnabled ? "#16A34A" : "#9CA3AF", display: "inline-block" }} />
                    {form.trackingEnabled ? "Enabled" : "Disabled"}
                  </span>
                </BlockStack>
                <button
                  onClick={() => setForm(f => ({ ...f, trackingEnabled: !f.trackingEnabled }))}
                  style={{
                    padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
                    border: form.trackingEnabled ? "1.5px solid #EF4444" : "1.5px solid #16A34A",
                    background: form.trackingEnabled ? "#FEF2F2" : "#F0FDF4",
                    color: form.trackingEnabled ? "#DC2626" : "#15803D",
                  }}>
                  {form.trackingEnabled ? "Disable tracking" : "Enable tracking"}
                </button>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Save */}
          <InlineStack align="end" gap="300" blockAlign="center">
            {savedOk && <Text as="span" tone="success" variant="bodySm" fontWeight="semibold">✓ Settings saved</Text>}
            <Button variant="primary" onClick={handleSave} loading={isSaving}>Save settings</Button>
          </InlineStack>

        </BlockStack>

        {/* ── RIGHT SIDEBAR ───────────────────────────────────── */}
        <BlockStack gap="300">

          {/* Last sync */}
          {lastSyncLabel && (
            <Card>
              <InlineStack gap="200" blockAlign="center">
                <span style={{ color: "#16A34A", fontSize: 18 }}>✅</span>
                <BlockStack gap="0">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Last sync: {lastSyncLabel}</Text>
                </BlockStack>
              </InlineStack>
            </Card>
          )}

          {/* Shop */}
          <Card>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <span style={{ fontSize: 18 }}>🏪</span>
                <Text as="p" variant="bodySm" fontWeight="semibold">Shop</Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">{shop}</Text>
            </BlockStack>
          </Card>

          {/* Need help */}
          <Card>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <span style={{ fontSize: 18 }}>❓</span>
                <Text as="p" variant="bodySm" fontWeight="semibold">Need help?</Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                Make sure the pixel extension is installed in your Shopify theme and the tracking key is set correctly in the pixel settings.
              </Text>
              <Button variant="plain" size="slim">View installation guide ↗</Button>
            </BlockStack>
          </Card>

          {/* How attribution works */}
          <Card>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <span style={{ fontSize: 18 }}>🎯</span>
                <Text as="p" variant="bodySm" fontWeight="semibold">How attribution works</Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                When a customer clicks an ad, we store a secure click ID. If they make a purchase within the attribution window, the conversion is attributed back to that ad based on your selected model.
              </Text>
              <Button variant="plain" size="slim">Learn more ↗</Button>
            </BlockStack>
          </Card>

        </BlockStack>

            </div>{/* end grid */}
          </div>{/* end marginTop */}
        </div>{/* end flex:1 */}
      </div>{/* end flex container */}
    </Page>
  );
}

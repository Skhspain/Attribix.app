// app/routes/app.settings.jsx
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";

async function getCurrentShop(request) {
  // Never fall back to a hardcoded shop — that would leak another merchant's
  // settings on any auth failure. If the session is missing, the
  // authenticate.admin call re-throws a redirect/401 which Remix will handle.
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
  if (!shop || typeof shop !== "string") {
    return json({ ok: false, error: "Missing shop" }, { status: 400 });
  }

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
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <Button size="slim" onClick={handleCopy} variant="plain">
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}

export default function AppSettingsRoute() {
  const { shop, settings: loaderSettings } = useLoaderData();
  const keyFetcher = useFetcher();
  const saveFetcher = useFetcher();

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

  // Sync form when settings update from server
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

  function submitKeyAction(action) {
    const fd = new FormData();
    fd.set("shop", shop);
    fd.set("_action", action);
    keyFetcher.submit(fd, { method: "post", action: "/app/settings" });
  }

  function handleSave() {
    const fd = new FormData();
    fd.set("shop", shop);
    fd.set("_action", "save");
    fd.set("ga4Id", form.ga4Id);
    fd.set("ga4Secret", form.ga4Secret);
    fd.set("fbPixelId", form.fbPixelId);
    fd.set("fbToken", form.fbToken);
    fd.set("trackingEnabled", form.trackingEnabled ? "true" : "false");
    fd.set("attributionModel", form.attributionModel);
    fd.set("attributionWindowDays", form.attributionWindowDays);
    saveFetcher.submit(fd, { method: "post", action: "/app/settings" });
  }

  const pixelStatus = latestSettings?.pixelLastSeenAt
    ? (() => {
        const h = (Date.now() - new Date(latestSettings.pixelLastSeenAt).getTime()) / 3600000;
        return h < 24 ? "success" : h < 168 ? "warning" : "critical";
      })()
    : "critical";

  const pixelLabel = { success: "Active", warning: "Inactive >24h", critical: "Not seen" }[pixelStatus];

  return (
    <Page title="Settings" subtitle="Tracking, attribution, and integrations">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">

            {saveFetcher.data?.ok && saveFetcher.data?.action === "save" && (
              <Banner tone="success" title="Settings saved" />
            )}
            {saveFetcher.data?.ok === false && (
              <Banner tone="critical" title="Error">{saveFetcher.data?.error}</Banner>
            )}

            {/* Tracking key */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Tracking key</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Used by the pixel to authenticate events from your storefront.
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={form.trackingEnabled ? "success" : "critical"}>
                      {form.trackingEnabled ? "Tracking on" : "Tracking off"}
                    </Badge>
                    <Badge tone={pixelStatus}>{pixelLabel}</Badge>
                  </InlineStack>
                </InlineStack>

                <Divider />

                {trackingKey ? (
                  <InlineStack gap="300" blockAlign="center">
                    <Box
                      background="bg-surface-secondary"
                      padding="200"
                      borderRadius="200"
                      minWidth="0"
                    >
                      <Text as="p" variant="bodySm" breakWord>
                        <code style={{ fontFamily: "monospace", fontSize: 13 }}>{trackingKey}</code>
                      </Text>
                    </Box>
                    <CopyButton text={trackingKey} />
                    <Button size="slim" onClick={() => submitKeyAction("rotateTrackingKey")} loading={isKeyBusy} tone="critical" variant="plain">
                      Rotate
                    </Button>
                  </InlineStack>
                ) : (
                  <Button onClick={() => submitKeyAction("generateTrackingKey")} loading={isKeyBusy}>
                    Generate tracking key
                  </Button>
                )}

                {latestSettings?.lastEventAt && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Last event received: {new Date(latestSettings.lastEventAt).toLocaleString()}
                  </Text>
                )}
              </BlockStack>
            </Card>

            {/* Attribution */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Attribution</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Controls how purchases are matched to ad campaigns.
                  </Text>
                </BlockStack>
                <Divider />
                <FormLayout>
                  <Select
                    label="Attribution model"
                    options={[
                      { label: "Last touch (default) — credit the most recent ad click", value: "last_touch" },
                      { label: "First touch — credit the very first ad click", value: "first_touch" },
                    ]}
                    value={form.attributionModel}
                    onChange={(v) => setForm((f) => ({ ...f, attributionModel: v }))}
                    helpText="Last touch is recommended for direct response campaigns. First touch suits brand awareness."
                  />
                  <TextField
                    label="Attribution window (days)"
                    type="number"
                    min={1}
                    max={90}
                    value={form.attributionWindowDays}
                    onChange={(v) => setForm((f) => ({ ...f, attributionWindowDays: v }))}
                    helpText="How far back to look for a matching ad click. Default: 7 days."
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            {/* Tracking toggle */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Tracking control</Text>
                <Divider />
                <InlineStack gap="300" blockAlign="center">
                  <div style={{ flex: 1 }}>
                    <Text as="p" variant="bodyMd">Enable tracking</Text>
                    <Text as="p" variant="bodySm" tone="subdued">When disabled, no events will be saved for this shop.</Text>
                  </div>
                  <Button
                    onClick={() => setForm((f) => ({ ...f, trackingEnabled: !f.trackingEnabled }))}
                    tone={form.trackingEnabled ? "critical" : undefined}
                    variant={form.trackingEnabled ? "plain" : "primary"}
                  >
                    {form.trackingEnabled ? "Disable tracking" : "Enable tracking"}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Save button */}
            <InlineStack align="end">
              <Button variant="primary" onClick={handleSave} loading={isSaving}>
                Save settings
              </Button>
            </InlineStack>

          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Shop</Text>
                <Text as="p" variant="bodySm" tone="subdued">{shop}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Need help?</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Make sure the pixel extension is installed in your Shopify theme and the tracking key is set correctly in the pixel settings.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

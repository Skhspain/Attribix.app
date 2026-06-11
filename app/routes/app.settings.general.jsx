// app/routes/app.settings.general.jsx
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  BlockStack, Button, Card, Divider, InlineStack,
  Page, Select, Text, Banner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { SettingsNav } from "~/components/SettingsNav";
import db from "~/db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db;
  const settings = await anyDb.trackingSettings?.findUnique?.({ where: { shop } }).catch(() => null);
  return json({
    shop,
    attributionWindow: settings?.attributionWindowDays ?? 30,
    attributionModel: settings?.attributionModel ?? "last_touch",
    storeCurrency: settings?.storeCurrency ?? "USD",
  });
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db;

  const form = await request.formData();
  const attributionWindow = Number(form.get("attributionWindow") ?? 30);
  const attributionModel = String(form.get("attributionModel") ?? "last_touch");
  const storeCurrency = String(form.get("storeCurrency") ?? "USD");

  await anyDb.trackingSettings?.upsert?.({
    where: { shop },
    create: { shop, attributionWindowDays: attributionWindow, attributionModel, storeCurrency },
    update: { attributionWindowDays: attributionWindow, attributionModel, storeCurrency },
  }).catch(() => null);

  return json({ ok: true });
}

export default function GeneralSettings() {
  const data = useLoaderData();
  const fetcher = useFetcher();

  const [attributionWindow, setAttributionWindow] = useState(String(data.attributionWindow ?? 30));
  const [attributionModel, setAttributionModel] = useState(data.attributionModel ?? "last_touch");
  const [storeCurrency, setStoreCurrency] = useState(data.storeCurrency ?? "USD");
  const backfillFetcher = useFetcher();

  const saving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok && !saving;

  function save() {
    const fd = new FormData();
    fd.set("attributionWindow", attributionWindow);
    fd.set("attributionModel", attributionModel);
    fd.set("storeCurrency", storeCurrency);
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <Page fullWidth>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <SettingsNav />
        <div style={{ flex: 1, minWidth: 0 }}>
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl">General</Text>
            <Text as="p" variant="bodySm" tone="subdued">Core settings for how Attribix attributes and reports on your store's performance.</Text>
          </BlockStack>

          <div style={{ marginTop: 24 }}>
            <BlockStack gap="500">

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text as="h2" variant="headingMd">Attribution</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Configure how Attribix assigns credit for conversions.
                      </Text>
                    </BlockStack>
                    <Button variant="primary" onClick={save} loading={saving}>
                      {saved ? "Saved ✓" : "Save"}
                    </Button>
                  </InlineStack>

                  <Divider />

                  <InlineStack gap="400" wrap>
                    <div style={{ minWidth: 220, flex: 1 }}>
                      <Select
                        label="Attribution window"
                        helpText="How far back to look for ad interactions before a conversion."
                        value={attributionWindow}
                        onChange={setAttributionWindow}
                        options={[
                          { label: "7 days", value: "7" },
                          { label: "14 days", value: "14" },
                          { label: "30 days", value: "30" },
                          { label: "60 days", value: "60" },
                          { label: "90 days", value: "90" },
                        ]}
                      />
                    </div>
                    <div style={{ minWidth: 220, flex: 1 }}>
                      <Select
                        label="Attribution model"
                        helpText="Determines which touchpoint gets credit for a sale."
                        value={attributionModel}
                        onChange={setAttributionModel}
                        options={[
                          { label: "Last touch", value: "last_touch" },
                          { label: "First touch", value: "first_touch" },
                          { label: "Linear (equal split)", value: "linear" },
                        ]}
                      />
                    </div>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text as="h2" variant="headingMd">Display</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        How numbers and dates are shown across the dashboard.
                      </Text>
                    </BlockStack>
                  </InlineStack>

                  <Divider />

                  <div style={{ maxWidth: 240 }}>
                    <Select
                      label="Currency"
                      helpText="Used when displaying revenue figures in Attribix reports."
                      value={storeCurrency}
                      onChange={setStoreCurrency}
                      options={[
                        { label: "USD — US Dollar", value: "USD" },
                        { label: "EUR — Euro", value: "EUR" },
                        { label: "GBP — British Pound", value: "GBP" },
                        { label: "NOK — Norwegian Krone", value: "NOK" },
                        { label: "SEK — Swedish Krona", value: "SEK" },
                        { label: "DKK — Danish Krone", value: "DKK" },
                        { label: "AUD — Australian Dollar", value: "AUD" },
                        { label: "CAD — Canadian Dollar", value: "CAD" },
                      ]}
                    />
                  </div>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">Historical order backfill</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Import the last 90 days of Shopify orders into Attribix so attribution data covers orders placed before the app was installed.
                    </Text>
                  </BlockStack>

                  <Divider />

                  {backfillFetcher.data?.ok && (
                    <Banner tone="success">
                      Backfill complete — {backfillFetcher.data.created} orders imported, {backfillFetcher.data.skipped} already tracked.
                    </Banner>
                  )}
                  {backfillFetcher.data?.error && (
                    <Banner tone="critical">{backfillFetcher.data.error}</Banner>
                  )}

                  <backfillFetcher.Form method="post" action="/api/backfill-orders">
                    <Button
                      submit
                      loading={backfillFetcher.state !== "idle"}
                      disabled={backfillFetcher.state !== "idle"}
                    >
                      {backfillFetcher.state !== "idle" ? "Importing…" : "Run backfill"}
                    </Button>
                  </backfillFetcher.Form>
                </BlockStack>
              </Card>

            </BlockStack>
          </div>
        </div>
      </div>
    </Page>
  );
}

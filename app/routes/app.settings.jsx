// File: app/routes/app.settings.jsx

import React, { useState } from "react";
import { json } from "@remix-run/node";
import { Form, useLoaderData, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Checkbox,
  Button,
  Banner,
  Text,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { getSettings, setSettings } from "~/settings.server";

export const loader = async ({ request }) => {
  const { authenticate } = await import("~/shopify.server");
  await authenticate.admin(request);
  const settings = await getSettings();
  return json(settings);
};

export const action = async ({ request }) => {
  const { authenticate } = await import("~/shopify.server");
  const { session, admin } = await authenticate.admin(request);

  const form = await request.formData();
  const pixelId = form.get("pixelId")?.toString() || "";
  const ga4Id = form.get("ga4Id")?.toString() || "";
  const adsId = form.get("adsId")?.toString() || "";
  const requireConsent = form.has("requireConsent");
  const enabled = form.has("enabled");

  await setSettings({ pixelId, ga4Id, adsId, requireConsent, enabled });

  // Build proxy URL
  const shop = session.shop;
  const src = `https://${shop}/apps/attribix-app/pixel?shop=${shop}`;

  if (enabled) {
    await admin.rest.post({
      path: "script_tags",
      type: "application/json",
      data: { script_tag: { event: "onload", src } },
    });
  } else {
    const existing = await admin.rest.get({ path: "script_tags" });
    for (const tag of existing.body.script_tags || []) {
      if (tag.src === src) {
        await admin.rest.delete({ path: `script_tags/${tag.id}` });
      }
    }
  }

  return json({ success: true });
};

export default function SettingsRoute() {
  const {
    pixelId: initialPixel = "",
    ga4Id: initialGa4 = "",
    adsId: initialAds = "",
    requireConsent: initialConsent = false,
    enabled: initialEnabled = false,
  } = useLoaderData();
  const actionData = useActionData();

  const [pixelId, setPixelId] = useState(initialPixel);
  const [ga4Id, setGa4Id] = useState(initialGa4);
  const [adsId, setAdsId] = useState(initialAds);
  const [requireConsent, setRequireConsent] = useState(initialConsent);
  const [enabled, setEnabled] = useState(initialEnabled);

  return (
    <Page title="Settings">
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <Card sectioned>
            {actionData?.success && (
              <Banner status="success">Settings saved!</Banner>
            )}
            <Form method="post">
              <FormLayout>

                {/* Facebook Pixel */}
                <Text>
                  <strong>Facebook Pixel</strong><br />
                  Paste your Pixel ID here (a numeric string).{" "}
                  <Link external url="https://business.facebook.com/events_manager">
                    Get it in Facebook Events Manager →
                  </Link>
                </Text>
                <TextField
                  name="pixelId"
                  value={pixelId}
                  onChange={setPixelId}
                  placeholder="e.g. 1234567890"
                  autoComplete="off"
                />
                <Button submit>Save Pixel ID</Button>

                {/* GA4 */}
                <Text>
                  <strong>Google Analytics 4</strong><br />
                  Your GA4 “Measurement ID” looks like <code>G-XXXXXXXXXX</code>.{" "}
                  Find it under Admin → Data Streams in your GA4 property.
                </Text>
                <TextField
                  name="ga4Id"
                  value={ga4Id}
                  onChange={setGa4Id}
                  placeholder="G-XXXXXXXXXX"
                  autoComplete="off"
                />
                <Button submit>Save GA4 ID</Button>

                {/* Google Ads */}
                <Text>
                  <strong>Google Ads Conversion ID</strong><br />
                  Use the format <code>AW-123456789/abcdefGhIjK</code>. Get it from Ads → Tools & Settings → Conversions.
                </Text>
                <TextField
                  name="adsId"
                  value={adsId}
                  onChange={setAdsId}
                  placeholder="AW-XXXXXXXXX/xxxxxxx"
                  autoComplete="off"
                />
                <Button submit>Save Ads ID</Button>

                {/* Consent */}
                <Text>
                  <strong>Cookie Consent</strong><br />
                  When enabled, tracking scripts only fire after the customer calls{" "}
                  <code>acceptTracking()</code> in their theme’s <code>&lt;head&gt;</code>.
                </Text>
                <Checkbox
                  name="requireConsent"
                  label="Require Customer Cookie Consent"
                  checked={requireConsent}
                  onChange={setRequireConsent}
                />
                <Button submit>Save Consent Setting</Button>

                {/* Enable/Disable All */}
                <Checkbox
                  name="enabled"
                  label="Enable Tracking"
                  checked={enabled}
                  onChange={setEnabled}
                />
                <Button submit primary>Save All</Button>

              </FormLayout>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// File: app/routes/app.settings.jsx
import React, { useState } from "react";
import { json, redirect } from "@remix-run/node";
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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { shopify, authenticate } from "~/shopify.server";
import { getSettings, setSettings } from "~/settings.server";

// Loader: enforce auth and fetch stored settings
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const settings = await getSettings();
  return json(settings);
};

// Action: authenticate, persist settings, and update script_tags
export const action = async ({ request }) => {
  // Authenticate admin and get session
  const { session } = await authenticate.admin(request);

  // Parse form data
  const form = await request.formData();
  const pixelId = form.get("pixelId")?.toString() || "";
  const enabled = form.has("enabled");

  // Persist settings
  await setSettings({ pixelId, enabled });

  // Build REST client from your Shopify instance
  const client = new shopify.api.clients.Rest(
    session.shop,
    session.accessToken
  );
  const srcUrl = `${process.env.SHOPIFY_APP_URL}/pixel.js`;

  if (enabled) {
    await client.post({
      path: "script_tags",
      type: "application/json",
      data: { script_tag: { event: "onload", src: srcUrl } },
    });
  } else {
    const existing = await client.get({ path: "script_tags" });
    for (const tag of existing.body.script_tags || []) {
      if (tag.src === srcUrl) {
        await client.delete({ path: `script_tags/${tag.id}` });
      }
    }
  }

  // Return JSON so UI can display success banner
  return json({ success: true });
};

// React component: controlled form UI
export default function SettingsRoute() {
  const { pixelId: initialPixel = "", enabled: initialEnabled = false } = useLoaderData();
  const actionData = useActionData();
  const [pixelId, setPixelId] = useState(initialPixel);
  const [enabled, setEnabled] = useState(initialEnabled);

  return (
    <Page title="Settings">
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <Card sectioned>
            {actionData?.success && <Banner status="success">Settings saved!</Banner>}
            <Form method="post">
              <FormLayout>
                <TextField
                  name="pixelId"
                  label="Facebook Pixel ID"
                  value={pixelId}
                  onChange={setPixelId}
                  placeholder="e.g. 1234567890"
                  autoComplete="off"
                />
                <Checkbox
                  name="enabled"
                  label="Enable Tracking"
                  checked={enabled}
                  onChange={setEnabled}
                />
                <Button submit primary>
                  Save
                </Button>
              </FormLayout>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

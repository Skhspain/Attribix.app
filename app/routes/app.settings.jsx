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
import { createRequire } from "module";

import { authenticate } from "~/shopify.server";
import { getSettings, setSettings } from "~/settings.server";

// Use CommonJS require to load Shopify API on the server
const require = createRequire(import.meta.url);
const { Shopify } = require("@shopify/shopify-api");

// Loader: enforce authentication and load stored settings
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return json(await getSettings());
};

// Action: persist settings and manage script_tags
export const action = async ({ request }) => {
  // Authenticate and get session
  const { session } = await authenticate.admin(request);

  // Parse form data
  const form = await request.formData();
  const pixelId = form.get("pixelId")?.toString() || "";
  const enabled = form.has("enabled");

  // Save settings
  await setSettings({ pixelId, enabled });

  // Initialize Shopify REST client via CommonJS import
  const client = new Shopify.Clients.Rest(
    session.shop,
    session.accessToken
  );
  const srcUrl = `${process.env.SHOPIFY_APP_URL}/pixel.js`;

  if (enabled) {
    // Register or update script tag
    await client.post({
      path: "script_tags",
      type: "application/json",
      data: { script_tag: { event: "onload", src: srcUrl } },
    });
  } else {
    // Remove existing script tags matching our URL
    const existing = await client.get({ path: "script_tags" });
    for (const tag of existing.body.script_tags || []) {
      if (tag.src === srcUrl) {
        await client.delete({ path: `script_tags/${tag.id}` });
      }
    }
  }

  // Redirect back to settings UI
  return redirect("/app/settings");
};

// Component: controlled form for pixel settings
export default function SettingsRoute() {
  const { pixelId: initialPixel = "", enabled: initialEnabled = false } =
    useLoaderData();
  const actionData = useActionData();

  const [pixelId, setPixelId] = useState(initialPixel);
  const [enabled, setEnabled] = useState(initialEnabled);

  return (
    <Page title="Settings">
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <Card sectioned>
            {actionData && <Banner status="success">Settings saved!</Banner>}
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
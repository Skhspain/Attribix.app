// File: app/routes/app.settings.jsx
import React from "react";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
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
import { authenticate } from "~/shopify.server";
import { getSettings, setSettings } from "~/settings.server";
import * as ShopifyAPI from "@shopify/shopify-api";

// Loader enforces authentication and fetches saved settings
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return json(await getSettings());
};

// Action persists new settings and updates script tags
export const action = async ({ request }) => {
  // Authenticate and grab Shopify session
  const { admin, session } = await authenticate.admin(request);

  const form = await request.formData();
  const pixelId = form.get("pixelId") || "";
  const enabled = form.has("enabled");

  // Save settings to your storage
  await setSettings({ pixelId, enabled });

  // Build REST client using session
  const restClient = new ShopifyAPI.Clients.Rest(
    session.shop,
    session.accessToken
  );
  const srcUrl = `${process.env.SHOPIFY_APP_URL}/pixel.js`;

  if (enabled) {
    // Register or re-register the pixel loader
    await restClient.post({
      path: "script_tags",
      type: "application/json",
      data: { script_tag: { event: "onload", src: srcUrl } },
    });
  } else {
    // Remove any existing pixel loader scripts
    const existing = await restClient.get({ path: "script_tags" });
    for (const tag of existing.body.script_tags || []) {
      if (tag.src === srcUrl) {
        await restClient.delete({ path: `script_tags/${tag.id}` });
      }
    }
  }

  return redirect("/app/settings");
};

// Component renders the settings form
export default function SettingsRoute() {
  const { pixelId, enabled } = useLoaderData();
  const actionData = useActionData();

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
                  defaultValue={pixelId}
                  placeholder="e.g. 1234567890"
                  autoComplete="off"
                />
                <Checkbox
                  name="enabled"
                  label="Enable Tracking"
                  defaultChecked={enabled}
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
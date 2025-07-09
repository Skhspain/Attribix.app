// app/routes/app.settings.jsx
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

import { sessionStorage, shopify } from "../shopify.server";
import { getSettings, setSettings } from "../settings.server";
// namespace import so Vite can see Clients.Rest
import * as ShopifyAPI from "@shopify/shopify-api";

export const loader = async () => {
  return json(await getSettings());
};

export const action = async ({ request }) => {
  const form = await request.formData();
  const pixelId = form.get("pixelId") || "";
  const enabled = form.get("enabled") === "on";

  // persist your settings
  await setSettings({ pixelId, enabled });

  // get the current session
  const cookieHeader = request.headers.get("Cookie") || "";
  const session = await sessionStorage.getSession(cookieHeader);

  // build a Rest client
  const restClient = new ShopifyAPI.Clients.Rest(
    session.get("shop"),
    session.get("accessToken")
  );

  const srcUrl = `${process.env.SHOPIFY_APP_URL}/pixel.js`;

  if (enabled) {
    // register (or re-register) your pixel loader script
    await restClient.post({
      path: "script_tags",
      type: "application/json",
      data: { script_tag: { event: "onload", src: srcUrl } },
    });
  } else {
    // remove any existing pixel loader scripts
    const existing = await restClient.get({ path: "script_tags" });
    for (const tag of existing.body.script_tags || []) {
      if (tag.src === srcUrl) {
        await restClient.delete({ path: `script_tags/${tag.id}` });
      }
    }
  }

  return redirect("/app/settings");
};

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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginTop: "1rem",
                  }}
                >
                  <Checkbox
                    name="enabled"
                    label="Enable Tracking"
                    defaultChecked={enabled}
                  />
                  <div style={{ flexGrow: 1 }} />
                  <Button submit primary>
                    Save
                  </Button>
                </div>
              </FormLayout>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
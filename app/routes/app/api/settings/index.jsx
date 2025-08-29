// app/routes/app/settings/index.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import {
  Page,
  TitleBar,
  Layout,
  Card,
  TextField,
  Checkbox,
  Button,
  Banner,
} from "@shopify/polaris";

// In-memory store (feel free to swap for Prisma/DB later)
let settings = {
  pixelId: "",
  enabled: false,
};

// ==== 1) loader: runs on GET /app/settings ====
export const loader = async () => {
  return json(settings);
};

// ==== 2) action: runs when the Form below does `method="post"` ====
export const action = async ({ request }) => {
  const form = await request.formData();
  settings.pixelId = form.get("pixelId") || "";
  settings.enabled = form.get("enabled") === "on";
  return json({ success: true });
};

export default function SettingsPage() {
  // data from the loader:
  const { pixelId: initialPixelId, enabled: initialEnabled } = useLoaderData();
  // data from the last action (so we can show “Settings saved!”):
  const actionData = useActionData();

  return (
    <Page title="Settings">
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <Card sectioned>
            {/* show a banner if save succeeded */}
            {actionData?.success && (
              <Banner status="success">Settings saved!</Banner>
            )}
            <Form method="post">
              <TextField
                name="pixelId"
                label="Facebook Pixel ID"
                defaultValue={initialPixelId}
                autoComplete="off"
                placeholder="e.g. 1234567890"
              />
              <Checkbox
                name="enabled"
                label="Enable Tracking"
                defaultChecked={initialEnabled}
              />
              <Button submit primary style={{ marginTop: 16 }}>
                Save
              </Button>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

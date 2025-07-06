// app/routes/app.settings.jsx
import { json } from "@remix-run/node";
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

// In-memory settings (replaceable by a DB later)
let settings = {
  pixelId: "",
  enabled: false,
};

export const loader = () => json(settings);

export const action = async ({ request }) => {
  const form = await request.formData();
  settings.pixelId = form.get("pixelId") || "";
  settings.enabled = form.get("enabled") === "on";
  return json({ success: true });
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
            {actionData?.success && (
              <Banner status="success">Settings saved!</Banner>
            )}
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
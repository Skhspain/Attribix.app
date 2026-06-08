// app/routes/app.settings.notifications.jsx
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  BlockStack, Button, Card, Checkbox, Divider, InlineStack,
  Page, Text, TextField,
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
    notifyEmail: settings?.notifyEmail ?? "",
    weeklyDigest: settings?.weeklyDigest ?? true,
    alertLowRoas: settings?.alertLowRoas ?? false,
    alertRoasThreshold: settings?.alertRoasThreshold ?? 1.5,
    alertNewOrders: settings?.alertNewOrders ?? false,
  });
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db;

  const form = await request.formData();
  const notifyEmail = String(form.get("notifyEmail") ?? "");
  const weeklyDigest = form.get("weeklyDigest") === "true";
  const alertLowRoas = form.get("alertLowRoas") === "true";
  const alertRoasThreshold = Number(form.get("alertRoasThreshold") ?? 1.5);
  const alertNewOrders = form.get("alertNewOrders") === "true";

  await anyDb.trackingSettings?.upsert?.({
    where: { shop },
    create: { shop, notifyEmail, weeklyDigest, alertLowRoas, alertRoasThreshold, alertNewOrders },
    update: { notifyEmail, weeklyDigest, alertLowRoas, alertRoasThreshold, alertNewOrders },
  }).catch(() => null);

  return json({ ok: true });
}

export default function NotificationsSettings() {
  const data = useLoaderData();
  const fetcher = useFetcher();

  const [notifyEmail, setNotifyEmail] = useState(data.notifyEmail ?? "");
  const [weeklyDigest, setWeeklyDigest] = useState(data.weeklyDigest ?? true);
  const [alertLowRoas, setAlertLowRoas] = useState(data.alertLowRoas ?? false);
  const [alertRoasThreshold, setAlertRoasThreshold] = useState(String(data.alertRoasThreshold ?? 1.5));
  const [alertNewOrders, setAlertNewOrders] = useState(data.alertNewOrders ?? false);

  const saving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok && !saving;

  function save() {
    const fd = new FormData();
    fd.set("notifyEmail", notifyEmail);
    fd.set("weeklyDigest", String(weeklyDigest));
    fd.set("alertLowRoas", String(alertLowRoas));
    fd.set("alertRoasThreshold", alertRoasThreshold);
    fd.set("alertNewOrders", String(alertNewOrders));
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <Page fullWidth>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <SettingsNav />
        <div style={{ flex: 1, minWidth: 0 }}>
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl">Notifications</Text>
            <Text as="p" variant="bodySm" tone="subdued">Choose when and how Attribix keeps you in the loop.</Text>
          </BlockStack>

          <div style={{ marginTop: 24 }}>
            <BlockStack gap="500">

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text as="h2" variant="headingMd">Notification email</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Where Attribix sends reports and alerts.
                      </Text>
                    </BlockStack>
                    <Button variant="primary" onClick={save} loading={saving}>
                      {saved ? "Saved ✓" : "Save"}
                    </Button>
                  </InlineStack>

                  <Divider />

                  <div style={{ maxWidth: 360 }}>
                    <TextField
                      label="Email address"
                      type="email"
                      value={notifyEmail}
                      onChange={setNotifyEmail}
                      autoComplete="email"
                      placeholder="you@yourstore.com"
                    />
                  </div>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Reports</Text>
                  <Divider />
                  <Checkbox
                    label="Weekly performance digest"
                    helpText="A summary of your revenue, ROAS, and top-performing ads, sent every Monday morning."
                    checked={weeklyDigest}
                    onChange={setWeeklyDigest}
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Alerts</Text>
                  <Divider />
                  <BlockStack gap="300">
                    <Checkbox
                      label="Alert when ROAS drops below threshold"
                      helpText="Get notified if your overall ROAS falls below the value you set."
                      checked={alertLowRoas}
                      onChange={setAlertLowRoas}
                    />
                    {alertLowRoas && (
                      <div style={{ paddingLeft: 28, maxWidth: 180 }}>
                        <TextField
                          label="ROAS threshold"
                          type="number"
                          value={alertRoasThreshold}
                          onChange={setAlertRoasThreshold}
                          autoComplete="off"
                          step="0.1"
                          min="0"
                          suffix="×"
                        />
                      </div>
                    )}
                    <Checkbox
                      label="Alert on new attributed orders"
                      helpText="Get notified when a new order is successfully attributed to an ad campaign."
                      checked={alertNewOrders}
                      onChange={setAlertNewOrders}
                    />
                  </BlockStack>
                </BlockStack>
              </Card>

            </BlockStack>
          </div>
        </div>
      </div>
    </Page>
  );
}

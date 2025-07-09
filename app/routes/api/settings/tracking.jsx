import React, { useEffect, useState } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Checkbox,
  Button,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";

export default function SettingsRoute() {
  const fetcher = useAuthenticatedFetch();
  const [pixelId, setPixelId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState(null); // "loading" | "error" | "saved" | null

  // Load saved settings on mount
  useEffect(() => {
    setStatus("loading");
    fetcher("/api/settings/tracking")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        setPixelId(data.pixelId);
        setEnabled(data.enabled);
        setStatus(null);
      })
      .catch(() => setStatus("error"));
  }, [fetcher]);

  // Save handler
  async function handleSave(e) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetcher("/api/settings/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixelId, enabled }),
      });
      if (!res.ok) throw new Error();
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Page fullWidth>
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <Card sectioned>
            {status === "error" && (
              <Banner status="critical">
                Failed to load or save settings.
              </Banner>
            )}
            {status === "saved" && (
              <Banner status="success">Settings saved!</Banner>
            )}
            <form onSubmit={handleSave}>
              <TextField
                label="Facebook Pixel ID"
                value={pixelId}
                onChange={setPixelId}
                placeholder="e.g. 1234567890"
                autoComplete="off"
              />
              <Checkbox
                label="Enable Tracking"
                checked={enabled}
                onChange={setEnabled}
              />
              <Button
                submit
                primary
                loading={status === "loading"}
                disabled={status === "loading"}
                style={{ marginTop: 16 }}
              >
                Save
              </Button>
            </form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
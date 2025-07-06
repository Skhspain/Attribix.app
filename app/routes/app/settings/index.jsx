// app/routes/app/settings/index.jsx
import React, { useEffect, useState } from "react";
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
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";

export default function SettingsPage() {
  const fetcher = useAuthenticatedFetch();
  const [pixelId, setPixelId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<"loading" | "error" | "saved" | null>(null);

  // Load existing settings when the page mounts
  useEffect(() => {
    setStatus("loading");
    fetcher("/api/settings/tracking")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
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
  async function handleSave(event) {
    event.preventDefault();
    setStatus("loading");
    try {
      const res = await fetcher("/api/settings/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixelId, enabled }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Page title="Settings">
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
              <Banner status="success" title="Settings saved!" />
            )}
            <form onSubmit={handleSave}>
              <TextField
                label="Facebook Pixel ID"
                value={pixelId}
                onChange={setPixelId}
                autoComplete="off"
                placeholder="e.g. 1234567890"
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
                style={{ marginTop: "1rem" }}
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
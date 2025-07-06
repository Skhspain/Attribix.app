// app/routes/app.settings.jsx
import React, { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Checkbox,
  Button,
  Banner,
  InlineStack,           // ← use InlineStack, not Stack
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function AppSettings() {
  const [pixelId, setPixelId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/app/api/settings/tracking")
      .then((res) => {
        if (!res.ok) throw new Error("Network response was not ok");
        return res.json();
      })
      .then(({ pixelId, enabled }) => {
        setPixelId(pixelId || "");
        setEnabled(Boolean(enabled));
      })
      .catch(() => setStatus("Failed to load settings"));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setStatus("Saving...");
    try {
      const res = await fetch("/app/api/settings/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixelId, enabled }),
      });
      setStatus(res.ok ? "Settings saved" : "Error saving settings");
    } catch (err) {
      console.error(err);
      setStatus("Error saving settings");
    }
  }

  return (
    <Page>
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <form onSubmit={handleSave}>
              <InlineStack vertical gap="4">
                <TextField
                  label="Facebook Pixel ID"
                  value={pixelId}
                  onChange={setPixelId}
                  autoComplete="off"
                />
                <Checkbox
                  label="Enable Tracking"
                  checked={enabled}
                  onChange={setEnabled}
                />
                <Button submit primary>
                  Save
                </Button>
                {status && <Banner title={status} status="info" />}
              </InlineStack>
            </form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
import { useEffect, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Checkbox,
  Button,
  Banner,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";

export default function SettingsRoute() {
  const fetcher = useAuthenticatedFetch();
  const [pixelId, setPixelId] = useState("");
  const [enabled, setEnabled] = useState(false);

  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetcher("/api/settings/tracking", { method: "GET" });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setStatus("error");
          setErrorMsg(data?.error || "Failed to load settings");
          return;
        }

        setPixelId(data?.pixelId || "");
        setEnabled(Boolean(data?.enabled));
        setStatus("idle");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg("Failed to load settings");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  async function save() {
    setStatus("saving");
    setErrorMsg("");

    try {
      const res = await fetcher("/api/settings/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixelId, enabled }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data?.error || "Failed to save settings");
        return;
      }

      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1200);
    } catch (e) {
      setStatus("error");
      setErrorMsg("Failed to save settings");
    }
  }

  return (
    <Page title="Settings" fullWidth>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="p" tone="subdued">
                Configure tracking settings for your shop.
              </Text>

              {status === "error" && (
                <Banner tone="critical">
                  <p>{errorMsg || "Something went wrong"}</p>
                </Banner>
              )}

              {status === "saved" && (
                <Banner tone="success">
                  <p>Saved ✅</p>
                </Banner>
              )}

              <BlockStack gap="300">
                <TextField
                  label="Pixel ID"
                  value={pixelId}
                  onChange={setPixelId}
                  autoComplete="off"
                />

                <Checkbox
                  label="Enable tracking"
                  checked={enabled}
                  onChange={setEnabled}
                />

                <InlineStack gap="200">
                  <Button
                    variant="primary"
                    onClick={save}
                    disabled={status === "saving"}
                  >
                    {status === "saving" ? "Saving…" : "Save"}
                  </Button>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

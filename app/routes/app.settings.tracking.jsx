// app/routes/app.settings.tracking.jsx
import React from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  BlockStack,
  Banner,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

/**
 * Stores settings on the SHOP as metafields.
 * Namespace: "attribix"
 * Keys: "meta_pixel_id", "meta_access_token"
 */

const NAMESPACE = "attribix";
const KEY_PIXEL_ID = "meta_pixel_id";
const KEY_ACCESS_TOKEN = "meta_access_token";

async function readTrackingMetafields(admin) {
  // Use the most compatible query: shop.metafield(namespace, key)
  const query = `
    query TrackingMetafields {
      shop {
        pixel: metafield(namespace: "${NAMESPACE}", key: "${KEY_PIXEL_ID}") { value }
        token: metafield(namespace: "${NAMESPACE}", key: "${KEY_ACCESS_TOKEN}") { value }
      }
    }
  `;

  const res = await admin.graphql(query);
  const payload = await res.json();

  // If Shopify returns GraphQL errors, surface them clearly
  if (payload?.errors?.length) {
    const msg = payload.errors.map((e) => e.message).join(" | ");
    throw new Error(msg || "Shopify GraphQL error");
  }

  return {
    metaPixelId: payload?.data?.shop?.pixel?.value ?? "",
    metaAccessToken: payload?.data?.shop?.token?.value ?? "",
  };
}

async function writeTrackingMetafields(admin, { metaPixelId, metaAccessToken }) {
  const mutation = `
    mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }
  `;

  const metafields = [
    {
      namespace: NAMESPACE,
      key: KEY_PIXEL_ID,
      type: "single_line_text_field",
      value: String(metaPixelId ?? ""),
    },
    {
      namespace: NAMESPACE,
      key: KEY_ACCESS_TOKEN,
      type: "single_line_text_field",
      value: String(metaAccessToken ?? ""),
    },
  ];

  const res = await admin.graphql(mutation, { variables: { metafields } });
  const payload = await res.json();

  if (payload?.errors?.length) {
    const msg = payload.errors.map((e) => e.message).join(" | ");
    throw new Error(msg || "Shopify GraphQL error");
  }

  const userErrors = payload?.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length) {
    const msg = userErrors.map((e) => e?.message).filter(Boolean).join(" | ");
    throw new Error(msg || "Failed to save metafields");
  }

  return true;
}

export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const settings = await readTrackingMetafields(admin);

    return json(settings);
  } catch (e) {
    // THIS will show up in Fly logs
    console.error("[/app/settings/tracking] loader error:", e);
    throw e;
  }
}

export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);

    const form = await request.formData();
    const metaPixelId = String(form.get("metaPixelId") || "").trim();
    const metaAccessToken = String(form.get("metaAccessToken") || "").trim();

    if (metaPixelId && !/^\d+$/.test(metaPixelId)) {
      return json(
        { ok: false, error: "Meta Pixel ID must be numbers only." },
        { status: 400 }
      );
    }

    await writeTrackingMetafields(admin, { metaPixelId, metaAccessToken });

    return json({ ok: true });
  } catch (e) {
    console.error("[/app/settings/tracking] action error:", e);
    return json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export default function TrackingSettings() {
  const initial = useLoaderData();
  const fetcher = useFetcher();

  const busy = fetcher.state !== "idle";
  const data = fetcher.data;

  const [debug, setDebug] = React.useState("");
  const [metaPixelId, setMetaPixelId] = React.useState(initial?.metaPixelId ?? "");
  const [metaAccessToken, setMetaAccessToken] = React.useState(initial?.metaAccessToken ?? "");

  const pushDebug = React.useCallback((line) => {
    const ts = new Date().toISOString();
    setDebug((d) => `${ts}  ${line}\n${d}`);
  }, []);

  React.useEffect(() => {
    if (!data) return;
    if (data?.ok) pushDebug("Save OK (action returned ok:true).");
    if (data?.ok === false) pushDebug(`Save ERROR: ${data?.error || "Unknown"}`);
  }, [data, pushDebug]);

  const pixelIdError = React.useMemo(() => {
    if (!metaPixelId) return null;
    if (!/^\d+$/.test(metaPixelId)) return "Meta Pixel ID must be numbers only.";
    if (metaPixelId.length < 8) return "Pixel ID looks too short.";
    return null;
  }, [metaPixelId]);

  return (
    <Page title="Tracking Settings" fullWidth>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {data?.ok === false && (
                <Banner tone="critical" title="Save failed">
                  <Text as="p">{data?.error || "Unknown error"}</Text>
                </Banner>
              )}

              {data?.ok === true && <Banner tone="success" title="Saved" />}

              <fetcher.Form
                method="post"
                onSubmit={() => pushDebug("Submitting POST to /app/settings/tracking ...")}
              >
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Meta Pixel (Conversions API)
                  </Text>

                  <TextField
                    label="Meta Pixel ID"
                    name="metaPixelId"
                    value={metaPixelId}
                    onChange={setMetaPixelId}
                    autoComplete="off"
                    error={pixelIdError}
                  />

                  <TextField
                    label="Meta Access Token"
                    name="metaAccessToken"
                    value={metaAccessToken}
                    onChange={setMetaAccessToken}
                    autoComplete="off"
                  />

                  <Button
                    submit
                    variant="primary"
                    loading={busy}
                    disabled={busy || Boolean(pixelIdError)}
                  >
                    Save settings
                  </Button>
                </BlockStack>
              </fetcher.Form>

              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Debug output</Text>

                  <textarea
                    readOnly
                    value={debug}
                    style={{
                      width: "100%",
                      minHeight: 220,
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                      fontSize: 12,
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid #e1e3e5",
                      background: "#fafbfb",
                    }}
                  />

                  <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                    {JSON.stringify({ fetcherState: fetcher.state, fetcherData: fetcher.data }, null, 2)}
                  </pre>
                </BlockStack>
              </Card>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

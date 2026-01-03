// app/routes/app.settings.tsx
import * as React from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Box,
  TextField,
  Checkbox,
  Text,
  InlineStack,
  Button,
  Banner,
  Divider,
} from "@shopify/polaris";

import { authenticate } from "~/shopify.server";
import {
  getShopSettings,
  upsertShopSettings,
  type ShopSettingsValues,
} from "~/utils/shop-settings.server";

type LoaderData = {
  shopDomain: string;
  settings: ShopSettingsValues;
};

type ActionData = {
  ok: boolean;
  error?: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const settings = await getShopSettings(shopDomain);

  return json<LoaderData>({
    shopDomain,
    settings,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const formData = await request.formData();

  const metaPixelId = (formData.get("metaPixelId") || "").toString().trim();
  const googleAdsId = (formData.get("googleAdsId") || "").toString().trim();
  const googleAdsConversionId = (formData.get("googleAdsConversionId") || "")
    .toString()
    .trim();
  const ga4MeasurementId = (formData.get("ga4MeasurementId") || "")
    .toString()
    .trim();
  const serverEndpoint = (formData.get("serverEndpoint") || "")
    .toString()
    .trim();

  const debugMode = formData.get("debugMode") === "on";
  const enableServerSide = formData.get("enableServerSide") === "on";

  try {
    await upsertShopSettings(shopDomain, {
      metaPixelId,
      googleAdsId,
      googleAdsConversionId,
      ga4MeasurementId,
      serverEndpoint,
      debugMode,
      enableServerSide,
    });

    return json<ActionData>({ ok: true });
  } catch (err) {
    console.error("Failed to save ShopSettings", err);
    return json<ActionData>(
      {
        ok: false,
        error: "Could not save settings. Please try again.",
      },
      { status: 500 },
    );
  }
}

export default function AppSettingsPage() {
  const { shopDomain, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [metaPixelId, setMetaPixelId] = React.useState(settings.metaPixelId);
  const [googleAdsId, setGoogleAdsId] = React.useState(settings.googleAdsId);
  const [googleAdsConversionId, setGoogleAdsConversionId] = React.useState(
    settings.googleAdsConversionId,
  );
  const [ga4MeasurementId, setGa4MeasurementId] = React.useState(
    settings.ga4MeasurementId,
  );
  const [serverEndpoint, setServerEndpoint] = React.useState(
    settings.serverEndpoint,
  );
  const [debugMode, setDebugMode] = React.useState(settings.debugMode);
  const [enableServerSide, setEnableServerSide] = React.useState(
    settings.enableServerSide,
  );

  const showSuccess = actionData && actionData.ok;
  const showError = actionData && !actionData.ok && actionData.error;

  const previewPayload = {
    shopDomain,
    metaPixelId,
    googleAdsId,
    googleAdsConversionId,
    ga4MeasurementId,
    serverEndpoint,
    debugMode,
    enableServerSide,
  };

  return (
    <Page
      title="Tracking settings"
      subtitle="Configure Attribix tracking and server-side events for this shop."
    >
      <Form method="post">
        <BlockStack gap="400">
          {/* Top toolbar row */}
          <Box paddingBlockEnd="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                {shopDomain}
              </Text>
              <Button
                submit
                variant="primary"
                loading={isSubmitting}
                disabled={isSubmitting}
              >
                Save settings
              </Button>
            </InlineStack>
          </Box>

          {showSuccess && (
            <Banner tone="success" title="Settings saved">
              <Text as="p" variant="bodySm">
                Your tracking configuration has been updated and will be used
                for new events.
              </Text>
            </Banner>
          )}

          {showError && (
            <Banner tone="critical" title="Could not save settings">
              <Text as="p" variant="bodySm">
                {actionData?.error}
              </Text>
            </Banner>
          )}

          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm">
                    Meta & Google
                  </Text>

                  <BlockStack gap="300">
                    <TextField
                      label="Meta Pixel ID"
                      helpText="Your Meta / Facebook Pixel ID, for example: 1234567890."
                      autoComplete="off"
                      name="metaPixelId"
                      value={metaPixelId}
                      onChange={setMetaPixelId}
                    />

                    <TextField
                      label="Google Ads ID"
                      helpText='Main Google Ads ID, for example: "AW-123456789".'
                      autoComplete="off"
                      name="googleAdsId"
                      value={googleAdsId}
                      onChange={setGoogleAdsId}
                    />

                    <TextField
                      label="Google Ads conversion ID (optional)"
                      helpText="Optional conversion ID if you use a separate key for conversions."
                      autoComplete="off"
                      name="googleAdsConversionId"
                      value={googleAdsConversionId}
                      onChange={setGoogleAdsConversionId}
                    />

                    <TextField
                      label="GA4 measurement ID (optional)"
                      helpText='Your GA4 measurement ID, for example: "G-XXXXXXX".'
                      autoComplete="off"
                      name="ga4MeasurementId"
                      value={ga4MeasurementId}
                      onChange={setGa4MeasurementId}
                    />
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm">
                    Server-side & debugging
                  </Text>

                  <BlockStack gap="300">
                    <TextField
                      label="Attribix server endpoint"
                      helpText="URL where your pixel sends events. Leave blank to use the default Attribix endpoint."
                      autoComplete="off"
                      name="serverEndpoint"
                      value={serverEndpoint}
                      onChange={setServerEndpoint}
                    />

                    <Checkbox
                      label="Enable server-side tracking"
                      name="enableServerSide"
                      checked={enableServerSide}
                      onChange={setEnableServerSide}
                    />

                    <Checkbox
                      label="Enable debug mode"
                      helpText="When enabled, Attribix will include extra logging for this shop."
                      name="debugMode"
                      checked={debugMode}
                      onChange={setDebugMode}
                    />
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* 🔧 NOTE: removed `secondary` prop here */}
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">
                    Pixel payload preview
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    This is an example of the configuration Attribix will use
                    when sending events to Meta, Google, and your server-side
                    endpoint.
                  </Text>

                  <Divider />

                  <Box
                    background="bg-surface-secondary"
                    padding="300"
                    borderRadius="300"
                    overflowX="scroll"
                  >
                    <pre
                      style={{
                        margin: 0,
                        fontFamily: "monospace",
                        fontSize: 12,
                        whiteSpace: "pre",
                      }}
                    >
                      {JSON.stringify(previewPayload, null, 2)}
                    </pre>
                  </Box>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>

          {/* Bottom Save button (backup + for long pages) */}
          <Box paddingBlockStart="300">
            <InlineStack align="end">
              <Button
                submit
                variant="primary"
                loading={isSubmitting}
                disabled={isSubmitting}
              >
                Save settings
              </Button>
            </InlineStack>
          </Box>
        </BlockStack>
      </Form>
    </Page>
  );
}

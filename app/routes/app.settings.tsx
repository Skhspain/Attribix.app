// app/routes/app.settings.tsx
import * as React from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  Form as RemixForm,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineGrid,
  TextField,
  Checkbox,
  InlineStack,
  Banner,
  Box,
  Divider,
  Button,
} from "@shopify/polaris";

type LoaderData = {
  host: string;
  shop: string;
  metaPixelId: string;
  googleAdsId: string;
  serverEndpoint: string;
  debugMode: boolean;
  lastSavedAt: string | null;
};

type ActionData = {
  ok: boolean;
  error?: string;
  values?: {
    metaPixelId: string;
    googleAdsId: string;
    serverEndpoint: string;
    debugMode: boolean;
  };
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const host = url.searchParams.get("host") ?? "";
  const shop = url.searchParams.get("shop") ?? "";

  // Later this will come from Prisma (StoreSettings)
  const metaPixelId = "";
  const googleAdsId = "";
  const serverEndpoint = "";
  const debugMode = false;
  const lastSavedAt = null;

  return json<LoaderData>({
    host,
    shop,
    metaPixelId,
    googleAdsId,
    serverEndpoint,
    debugMode,
    lastSavedAt,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();

  const metaPixelId = (formData.get("metaPixelId") ?? "").toString().trim();
  const googleAdsId = (formData.get("googleAdsId") ?? "").toString().trim();
  const serverEndpoint = (formData.get("serverEndpoint") ?? "")
    .toString()
    .trim();
  const debugMode = formData.get("debugMode") === "on";

  // Later: validate + store in Prisma (StoreSettings)
  // For now we just echo values back to show the banner + preview.
  const hasAnyValue =
    metaPixelId.length > 0 ||
    googleAdsId.length > 0 ||
    serverEndpoint.length > 0 ||
    debugMode;

  if (!hasAnyValue) {
    return json<ActionData>(
      {
        ok: false,
        error:
          "Add at least one tracking value (Meta pixel, Google Ads ID or advanced setting) before saving.",
      },
      { status: 400 },
    );
  }

  // Placeholder: pretend we saved successfully
  console.log("Saved tracking settings", {
    metaPixelId,
    googleAdsId,
    serverEndpoint,
    debugMode,
  });

  return json<ActionData>({
    ok: true,
    values: {
      metaPixelId,
      googleAdsId,
      serverEndpoint,
      debugMode,
    },
  });
}

export default function AppSettingsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const [metaPixelId, setMetaPixelId] = React.useState(
    loaderData.metaPixelId ?? "",
  );
  const [googleAdsId, setGoogleAdsId] = React.useState(
    loaderData.googleAdsId ?? "",
  );
  const [serverEndpoint, setServerEndpoint] = React.useState(
    loaderData.serverEndpoint ?? "",
  );
  const [debugMode, setDebugMode] = React.useState<boolean>(
    loaderData.debugMode ?? false,
  );

  const isSubmitting = navigation.state === "submitting";

  const hasChanges =
    loaderData.metaPixelId !== metaPixelId ||
    loaderData.googleAdsId !== googleAdsId ||
    (loaderData.serverEndpoint ?? "") !== serverEndpoint ||
    loaderData.debugMode !== debugMode;

  return (
    <Page title="Attribix settings">
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400">
              <RemixForm method="post">
                <BlockStack gap="400">
                  {/* Header + top save button */}
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h1" variant="headingLg">
                        Tracking &amp; integration
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Connect your Meta and Google pixels to unlock full
                        attribution in Attribix.
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        These settings apply to all events that Attribix tracks
                        from your storefront and server.
                      </Text>
                    </BlockStack>

                    <BlockStack gap="100" align="end">
                      {loaderData.lastSavedAt && (
                        <Text as="span" variant="bodySm" tone="subdued">
                          Last saved: {loaderData.lastSavedAt}
                        </Text>
                      )}

                      <Button
                        variant="primary"
                        submit
                        loading={isSubmitting}
                        disabled={isSubmitting || !hasChanges}
                      >
                        {isSubmitting
                          ? "Saving…"
                          : hasChanges
                          ? "Save settings"
                          : "Saved"}
                      </Button>
                    </BlockStack>
                  </InlineStack>

                  {/* Flash messages */}
                  {actionData?.ok && (
                    <Banner title="Settings saved">
                      <Text as="p" variant="bodySm">
                        Your tracking settings are now active. New events will
                        use the updated configuration.
                      </Text>
                    </Banner>
                  )}

                  {actionData?.error && (
                    <Banner title="Could not save settings">
                      <Text as="p" variant="bodySm" tone="critical">
                        {actionData.error}
                      </Text>
                    </Banner>
                  )}

                  <Divider />

                  {/* Main form fields */}
                  <Box paddingBlockStart="400" paddingBlockEnd="400">
                    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                      {/* Meta + Google column */}
                      <BlockStack gap="400">
                        <BlockStack gap="200">
                          <Text as="h2" variant="headingMd">
                            Meta &amp; Google IDs
                          </Text>
                          <Text as="p" tone="subdued" variant="bodySm">
                            Paste the IDs from your ad platforms. Attribix will
                            handle event mapping and server-side forwarding.
                          </Text>
                        </BlockStack>

                        <TextField
                          label="Meta Pixel ID"
                          helpText="Example: 123456789012345. Used for server-side and client-side Meta tracking."
                          autoComplete="off"
                          name="metaPixelId"
                          value={metaPixelId}
                          onChange={(value) => setMetaPixelId(value)}
                        />

                        <TextField
                          label="Google Ads Conversion ID"
                          helpText="Example: AW-123456789. Used for server-side and client-side Google Ads tracking."
                          autoComplete="off"
                          name="googleAdsId"
                          value={googleAdsId}
                          onChange={(value) => setGoogleAdsId(value)}
                        />
                      </BlockStack>

                      {/* Advanced column */}
                      <BlockStack gap="400">
                        <BlockStack gap="200">
                          <Text as="h2" variant="headingMd">
                            Advanced tracking
                          </Text>
                          <Text as="p" tone="subdued" variant="bodySm">
                            For power users and developers. Most stores can
                            leave these settings as they are.
                          </Text>
                        </BlockStack>

                        <TextField
                          label="Custom server endpoint (optional)"
                          helpText="Override the default tracking endpoint if you proxy events through your own API."
                          autoComplete="off"
                          name="serverEndpoint"
                          value={serverEndpoint}
                          onChange={(value) => setServerEndpoint(value)}
                        />

                        <Checkbox
                          label="Enable debug logging"
                          helpText="Log extra debugging information to help validate event delivery."
                          name="debugMode"
                          checked={debugMode}
                          onChange={(checked) => setDebugMode(checked)}
                        />
                      </BlockStack>
                    </InlineGrid>
                  </Box>

                  <Divider />

                  {/* Live preview */}
                  <Box paddingBlockStart="400">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">
                        Live preview
                      </Text>

                      <Text as="p" variant="bodySm" tone="subdued">
                        This is what Attribix will send when a purchase event
                        fires from your storefront:
                      </Text>

                      <Box padding="400" borderRadius="300">
                        <pre>
                          {JSON.stringify(
                            {
                              shop: loaderData.shop,
                              metaPixelId,
                              googleAdsId,
                              serverEndpoint:
                                serverEndpoint || "default",
                              debugMode,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </Box>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </RemixForm>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// app/routes/app._index.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Box,
  BlockStack,
  Text,
  InlineStack,
  Button,
} from "@shopify/polaris";

type LoaderData = {
  trackingEnabled: boolean;
  lastEvent: string | null;
  host: string;
  shop: string;
};

/**
 * Simple loader – no DB.
 * Reads `host` and `shop` from the URL and passes them to the UI
 * so we can keep them on internal links.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const host = url.searchParams.get("host") ?? "";
  const shop = url.searchParams.get("shop") ?? "";

  return json<LoaderData>({
    trackingEnabled: true,
    lastEvent: null,
    host,
    shop,
  });
}

export default function AppIndex() {
  const { trackingEnabled, lastEvent, host, shop } =
    useLoaderData<typeof loader>();

  const navigate = useNavigate();

  // Helper to build URLs that preserve host + shop
  const buildUrl = (path: string) => {
    const params = new URLSearchParams();
    if (host) params.set("host", host);
    if (shop) params.set("shop", shop);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };

  const handleOpenSettings = () => {
    navigate(buildUrl("/app/settings"));
  };

  const handleViewReports = () => {
    navigate(buildUrl("/app/reports"));
  };

  return (
    <Page title="Attribix">
      <Box padding="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Congrats on creating a new Shopify app 🎉
          </Text>
          <Text as="p" variant="bodyMd">
            This is your Attribix home. Use the buttons below to jump to
            settings and reports.
          </Text>
        </BlockStack>
      </Box>

      <Box padding="400">
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Tracking status
          </Text>

          <InlineStack gap="200" align="start">
            <Text as="span" tone={trackingEnabled ? "success" : "critical"}>
              {trackingEnabled ? "Enabled" : "Disabled"}
            </Text>

            {/* IMPORTANT: use client-side navigation, not url= (anchor) */}
            <Button onClick={handleOpenSettings} variant="primary">
              Open settings
            </Button>

            <Button onClick={handleViewReports}>View reports</Button>
          </InlineStack>

          <Text as="p" tone="subdued" variant="bodySm">
            Last event: {lastEvent ?? "—"}
          </Text>
        </BlockStack>
      </Box>
    </Page>
  );
}

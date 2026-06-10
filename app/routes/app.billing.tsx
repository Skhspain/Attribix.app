// app/routes/app.billing.tsx
// Billing gate landing page. Shown when a shop has no active plan.
// Renders a UI within the app (so App Bridge is loaded) and lets the user
// click a button to navigate to Shopify's managed pricing page.
// Using a client-side button avoids the server-side exit-iframe redirect chain,
// which caused a blank "200" screen due to popup-blocker interference with
// the automatic window.open() call.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { BlockStack, Button, Page, Text } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopHandle = session.shop.replace(".myshopify.com", "");
  const APP_HANDLE = process.env.SHOPIFY_APP_HANDLE || "attribix-app";
  const pricingUrl = `https://admin.shopify.com/store/${shopHandle}/charges/${APP_HANDLE}/pricing_plans`;
  return json({ pricingUrl });
}

export default function BillingPage() {
  const { pricingUrl } = useLoaderData<typeof loader>();

  function handleGoToBilling() {
    // window.open with _top is the correct way to escape the Shopify iframe.
    // Calling it from a click event avoids popup-blocker restrictions.
    window.open(pricingUrl, "_top");
  }

  return (
    <Page title="Choose a Plan">
      <div
        style={{
          maxWidth: 480,
          margin: "80px auto",
          textAlign: "center",
        }}
      >
        <BlockStack gap="500" inlineAlign="center">
          <div style={{ fontSize: 52 }}>📋</div>
          <BlockStack gap="200">
            <Text as="h2" variant="headingXl">
              Select a plan to continue
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Attribix requires an active subscription. Choose a plan that fits
              your store and start tracking revenue attribution today.
            </Text>
          </BlockStack>
          <Button variant="primary" size="large" onClick={handleGoToBilling}>
            View pricing plans →
          </Button>
          <Text as="p" variant="bodySm" tone="subdued">
            You&apos;ll be taken to Shopify&apos;s secure billing page.
          </Text>
        </BlockStack>
      </div>
    </Page>
  );
}

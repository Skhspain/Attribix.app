// app/routes/app.feeds.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);
  const appUrl = (process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev").replace(/\/$/, "");
  return json({ shop: session.shop, appUrl });
}

function CopyBox({ url, downloadName }: { url: string; downloadName?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ flex: 1, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", color: "#374151" }}>
        {url}
      </div>
      <Button
        size="slim"
        onClick={() => navigator.clipboard.writeText(url)}
      >
        Copy
      </Button>
      {downloadName && (
        <a
          href={url}
          download={downloadName}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: "none" }}
        >
          <Button size="slim">Download</Button>
        </a>
      )}
    </div>
  );
}

export default function FeedsPage() {
  const { shop, appUrl } = useLoaderData<typeof loader>();

  const shoppingFeedUrl = `${appUrl}/feeds/google-shopping/${shop}.xml`;
  const reviewsFeedUrl = `${appUrl}/feeds/google-reviews/${shop}.xml`;

  return (
    <Page
      fullWidth
      title="Product Feeds"
      subtitle="Submit your products and reviews to Google, Meta, and other channels"
    >
      <BlockStack gap="600">

        {/* Google Merchant Center */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">Google Merchant Center</Text>
                  <Badge tone="success">Live</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">Submit your products to Google Shopping and enable review stars in search results</Text>
              </BlockStack>
            </InlineStack>

            <Divider />

            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">1. Product Feed (Google Shopping)</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Register this URL in <strong>Google Merchant Center → Products → Feeds → Add feed</strong>. Choose "Scheduled fetch" and paste the URL below. Google refreshes it daily.
              </Text>
              <CopyBox url={shoppingFeedUrl} downloadName="google-shopping-feed.xml" />
            </BlockStack>

            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">2. Product Reviews Feed</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Register this URL in <strong>Google Merchant Center → Marketing → Reviews → Product reviews</strong>. This adds star ratings to your Google Shopping listings and ads.
              </Text>
              <CopyBox url={reviewsFeedUrl} downloadName="google-reviews-feed.xml" />
            </BlockStack>

            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" fontWeight="semibold">Setup steps</Text>
                <Text as="p" variant="bodySm" tone="subdued">1. Go to merchant.google.com → Sign in or create account</Text>
                <Text as="p" variant="bodySm" tone="subdued">2. Add your store URL and verify ownership</Text>
                <Text as="p" variant="bodySm" tone="subdued">3. Products → Feeds → Add feed → "Scheduled fetch" → paste the product feed URL</Text>
                <Text as="p" variant="bodySm" tone="subdued">4. Marketing → Reviews → Request access → paste the reviews feed URL</Text>
                <Text as="p" variant="bodySm" tone="subdued">5. Wait 24–72 hours for approval and indexing</Text>
              </BlockStack>
            </Box>
          </BlockStack>
        </Card>

        {/* Meta Catalog */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">Meta Product Catalog</Text>
                  <Badge>Same feed</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">Use the same Google Shopping feed URL for Meta — the format is compatible</Text>
              </BlockStack>
            </InlineStack>

            <Divider />

            <BlockStack gap="300">
              <Text as="p" variant="bodySm" tone="subdued">
                In <strong>Meta Business Suite → Commerce → Catalogs → Add items → Use a data feed</strong>, paste the product feed URL. Meta accepts the Google Shopping RSS format.
              </Text>
              <CopyBox url={shoppingFeedUrl} />
            </BlockStack>

            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" fontWeight="semibold">What this unlocks</Text>
                <Text as="p" variant="bodySm" tone="subdued">• Dynamic product ads (retarget visitors with products they viewed)</Text>
                <Text as="p" variant="bodySm" tone="subdued">• Advantage+ Shopping campaigns with automatic product selection</Text>
                <Text as="p" variant="bodySm" tone="subdued">• Instagram Shopping tags on posts and stories</Text>
                <Text as="p" variant="bodySm" tone="subdued">• Facebook Shop tab on your business page</Text>
              </BlockStack>
            </Box>
          </BlockStack>
        </Card>

        {/* Other channels */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">Microsoft / Bing Shopping</Text>
                  <Badge tone="info">Same feed</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  In <strong>Microsoft Merchant Center → Catalog → Create catalog → Feed</strong>, paste the product feed URL. Microsoft accepts Google Shopping format directly.
                </Text>
                <CopyBox url={shoppingFeedUrl} />
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">Pinterest Catalog</Text>
                  <Badge tone="info">Same feed</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  In <strong>Pinterest Business → Catalogs → Connect your store → RSS / Atom feed</strong>, paste the product feed URL. Pinterest accepts Google Shopping format.
                </Text>
                <CopyBox url={shoppingFeedUrl} />
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

      </BlockStack>
    </Page>
  );
}

// app/routes/app._index.jsx
import { useFetcher } from "@remix-run/react";
import { useMemo, useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  TextField,
  Badge,
  Divider,
} from "@shopify/polaris";

export default function AppIndex() {
  const fetcher = useFetcher();
  const [accountID, setAccountID] = useState("1");

  const isBusy = fetcher.state !== "idle";

  const lastResult = useMemo(() => {
    if (!fetcher.data) return null;
    return JSON.stringify(fetcher.data, null, 2);
  }, [fetcher.data]);

  function connectPixel() {
    fetcher.submit(
      { accountID },
      {
        method: "post",
        action: "/api/web-pixel/ensure",
      }
    );
  }

  return (
    <Page
      title="Attribix"
      subtitle="Tracking + Ads Manager analytics in one place"
      primaryAction={<Button url="/app/ads" variant="primary">Meta ads dashboard</Button>}
      secondaryActions={[
        { content: "Tracking analytics", url: "/app/analytics" },
        { content: "Meta integration", url: "/app/integrations/meta" },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Quick actions</Text>
                  <Badge tone="info">Home</Badge>
                </InlineStack>

                <InlineStack gap="200" wrap>
                  <Button url="/app/analytics" variant="secondary">Tracking analytics</Button>
                  <Button url="/app/ads" variant="secondary">Meta ads dashboard</Button>
                  <Button url="/app/integrations/meta" variant="secondary">Meta integration</Button>
                </InlineStack>

                <Text as="p" tone="subdued">
                  Tip: Connect Meta first, then sync insights in the Meta ads dashboard.
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Pixel connection tool</Text>
                <Text as="p" tone="subdued">
                  This uses your existing <code>/api/web-pixel/ensure</code> action. Nothing changed — just a nicer UI.
                </Text>

                <InlineStack gap="200" blockAlign="end">
                  <div style={{ minWidth: 240 }}>
                    <TextField
                      label="Account ID"
                      value={accountID}
                      onChange={setAccountID}
                      autoComplete="off"
                    />
                  </div>

                  <Button onClick={connectPixel} disabled={isBusy} variant="primary">
                    {isBusy ? "Connecting…" : "Connect pixel"}
                  </Button>
                </InlineStack>

                {fetcher.data ? (
                  <>
                    <Divider />
                    <Text as="h3" variant="headingSm">Result</Text>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{lastResult}</pre>
                  </>
                ) : null}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Recommended setup</Text>
                <BlockStack gap="150">
                  <Text as="p">1) Connect Meta</Text>
                  <Text as="p">2) Sync last 7–30 days</Text>
                  <Text as="p">3) Compare with Tracking analytics</Text>
                </BlockStack>
                <Button url="/app/integrations/meta" variant="primary">
                  Go to Meta integration
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">What’s new</Text>
                <Text as="p" tone="subdued">
                  You now store Ads Manager insights in Postgres:
                  <br />
                  <code>MetaCampaignDailyInsight</code> and <code>AdSpendDaily</code>.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

import { useFetcher } from "@remix-run/react";
import { Page, Layout, Card, Button, Banner, Text, BlockStack, TextField, Box } from "@shopify/polaris";
import { useMemo, useState } from "react";

type EnsureResult =
  | {
      ok: true;
      shop: string;
      accountID: string;
      action: "created" | "updated";
      webPixelId?: string;
      ms: number;
      note?: string;
    }
  | {
      ok: false;
      shop?: string;
      accountID?: string;
      error: string;
      hint?: string;
      stack?: string;
      ms: number;
    };

export default function PixelToolsRoute() {
  const fetcher = useFetcher<EnsureResult>();

  const [accountID, setAccountID] = useState("1");

  const busy = fetcher.state !== "idle";

  const result = fetcher.data;
  const error = useMemo(() => {
    if (!fetcher.data) return null;
    if (fetcher.data.ok === false) return fetcher.data.error || "Unknown error";
    return null;
  }, [fetcher.data]);

  return (
    <Page title="Pixel tools">
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="p">
                  Optional tool. This tries to (re)create/update the Shopify Web Pixel for this shop.
                  Tracking can still work even if you never use this.
                </Text>

                <fetcher.Form method="post" action="/api/web-pixel/ensure">
                  <BlockStack gap="300">
                    <TextField
                      label="Account ID (your internal id)"
                      value={accountID}
                      onChange={setAccountID}
                      name="accountID"
                      autoComplete="off"
                      helpText="This value is stored in the web pixel settings as { accountID }. Use 1 for testing."
                    />

                    <Button submit variant="primary" loading={busy} disabled={busy}>
                      Ensure web pixel
                    </Button>
                  </BlockStack>
                </fetcher.Form>

                {error && (
                  <Banner tone="critical" title="Ensure failed">
                    <Text as="p">{error}</Text>
                  </Banner>
                )}

                {result?.ok === true && (
                  <Banner tone="success" title="Ensure completed">
                    <Text as="p">
                      Action: {result.action}
                      <br />
                      Pixel ID: {result.webPixelId}
                      <br />
                      Took: {result.ms} ms
                    </Text>
                  </Banner>
                )}

                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">
                        Output
                      </Text>
                      <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                        {JSON.stringify(
                          {
                            fetcherState: fetcher.state,
                            result: fetcher.data,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </BlockStack>
                  </Box>
                </Card>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

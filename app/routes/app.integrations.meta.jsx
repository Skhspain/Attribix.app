// app/routes/app.integrations.meta.jsx
import React from "react";
import { redirect, json } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import { Page, Layout, Card, Text, Button, BlockStack, Banner } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";

/**
 * Meta integration page.
 * Diagnostics included:
 * - A client-side click logger (proves UI receives clicks)
 * - A fetcher POST button (proves POST hits Remix without relying on <form>)
 */

export async function loader() {
  return json({ ok: true });
}

export async function action({ request }) {
  console.log("[app.integrations.meta] ACTION HIT", new Date().toISOString());
  await authenticate.admin(request);
  return redirect("/api/meta/oauth/start?returnTo=/app/integrations/meta");
}

export default function MetaIntegrationsPage() {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";

  return (
    <Page title="Meta">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Banner tone="info" title="Debug mode enabled">
                <Text as="p">
                  1) If you click and the timestamp updates, clicks are reaching the browser.
                  2) If you click “POST via fetcher” and you see ACTION HIT in Fly logs, POSTs reach Remix.
                </Text>
              </Banner>

              <Text as="p">
                Connect your Meta account to sync campaigns and enable Meta-related features.
              </Text>

              {/* Client-side click proof */}
              <Button
                onClick={() => {
                  console.log("[app.integrations.meta] CLIENT CLICK", new Date().toISOString());
                  alert("CLIENT CLICK OK: " + new Date().toISOString());
                }}
              >
                Test click (client)
              </Button>

              {/* Server POST proof without relying on <form> submit */}
              <fetcher.Form method="post">
                <Button submit variant="primary" loading={busy} disabled={busy}>
                  POST via fetcher (server)
                </Button>
              </fetcher.Form>

              {/* Your original method (keep it too) */}
              <form method="post">
                <Button submit variant="secondary">
                  Connect Meta (form submit)
                </Button>
              </form>

              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify({ fetcherState: fetcher.state, fetcherData: fetcher.data }, null, 2)}
              </pre>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

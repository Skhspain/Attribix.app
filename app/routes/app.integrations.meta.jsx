// app/routes/app.integrations.meta.jsx
import React from "react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  Banner,
  InlineStack,
  Badge,
  Select,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }) {
  const result = await authenticate.admin(request);

  // ✅ Embedded refresh fix:
  // If Shopify returns a redirect to /auth..., do NOT pass that through to the browser,
  // because it loads /auth/login inside the iframe and you get the "problem loading page" refresh.
  // Instead, tell Shopify to reauthorize via headers.
  if (result instanceof Response) {
    const location = result.headers.get("Location") || result.headers.get("location");

    if (location?.startsWith("/auth")) {
      return new Response(null, {
        status: 401,
        headers: {
          "X-Shopify-API-Request-Failure-Reauthorize": "1",
          "X-Shopify-API-Request-Failure-Reauthorize-Url": location,
        },
      });
    }

    return result;
  }

  const url = new URL(request.url);

  const shop = result.session.shop;
  const host = url.searchParams.get("host") || "";
  const embedded = url.searchParams.get("embedded") || "1";

  const appOrigin = url.origin;
  const apiKey = process.env.SHOPIFY_API_KEY || "";

  const conn = await db.metaConnection
    .findUnique({ where: { shop } })
    .catch(() => null);

  const connected = !!(conn && conn.accessToken && conn.accessToken !== "__PENDING__");
  const adAccountId = conn?.adAccountId || "";
  const expiresAt = conn?.expiresAt ? new Date(conn.expiresAt).toISOString() : null;

  return json({
    shop,
    host,
    embedded,
    appOrigin,
    apiKey,
    connected,
    adAccountId,
    expiresAt,
  });
}

async function getShopifySessionToken({ apiKey, host }) {
  if (typeof window === "undefined") return null;
  if (!apiKey || !host) return null;

  const { default: createApp } = await import("@shopify/app-bridge");
  const { getSessionToken } = await import("@shopify/app-bridge/utilities");

  const app = createApp({
    apiKey,
    host,
    forceRedirect: true,
  });

  const token = await getSessionToken(app);
  return token;
}

export default function MetaIntegrationsPage() {
  const data = useLoaderData();

  const apiUrl = React.useCallback(
    (path) => new URL(path, data.appOrigin).toString(),
    [data.appOrigin]
  );

  const [accounts, setAccounts] = React.useState([]);
  const [accountsLoading, setAccountsLoading] = React.useState(false);
  const [accountsError, setAccountsError] = React.useState(null);

  const [selected, setSelected] = React.useState(data.adAccountId || "");
  const [saveLoading, setSaveLoading] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);
  const [saveOk, setSaveOk] = React.useState(false);

  const [debugStep, setDebugStep] = React.useState("");

  const connected = !!data.connected;

  async function authedFetch(path, init = {}) {
    setDebugStep("session-token:starting");

    const token = await getShopifySessionToken({
      apiKey: data.apiKey,
      host: data.host,
    });

    if (!token) {
      setDebugStep("session-token:missing");
      throw new Error(
        "Missing Shopify session token (apiKey/host missing or App Bridge not available)."
      );
    }

    setDebugStep("session-token:ok");

    const url = apiUrl(path);

    const headers = new Headers(init.headers || {});
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(url, {
      ...init,
      headers,
      credentials: "include",
    });

    return res;
  }

  async function fetchAdAccounts() {
    try {
      setSaveOk(false);
      setAccountsError(null);
      setAccountsLoading(true);

      const res = await authedFetch("/api/meta/adaccounts", { method: "GET" });

      const text = await res.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {}

      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}: ${text.slice(0, 160)}`);
      }

      if (!payload?.accounts || !Array.isArray(payload.accounts)) {
        throw new Error("No accounts returned (unexpected response).");
      }

      setAccounts(payload.accounts);
      setDebugStep("adaccounts:ok");
    } catch (e) {
      setAccounts([]);
      setAccountsError(String(e?.message || e));
      setDebugStep("adaccounts:error");
    } finally {
      setAccountsLoading(false);
    }
  }

  async function saveAdAccount() {
    if (!selected) return;

    try {
      setSaveOk(false);
      setSaveError(null);
      setSaveLoading(true);

      const form = new FormData();
      form.set("adAccountId", selected);

      // âœ… IMPORTANT: include shop explicitly so the server can always persist correctly
      form.set("shop", data.shop);

      const res = await authedFetch("/api/meta/adaccount/select", {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {}

      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}: ${text.slice(0, 160)}`);
      }

      setSaveOk(true);
      setDebugStep("adaccount:save:ok");
    } catch (e) {
      setSaveOk(false);
      setSaveError(String(e?.message || e));
      setDebugStep("adaccount:save:error");
    } finally {
      setSaveLoading(false);
    }
  }

  function startMetaOAuthTopLevel() {
    const returnTo = "/app/integrations/meta";

    const startUrl =
      apiUrl(`/api/meta/oauth/start?shop=${encodeURIComponent(data.shop)}`) +
      `&host=${encodeURIComponent(data.host || "")}` +
      `&embedded=${encodeURIComponent(data.embedded || "1")}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;

    try {
      window.top.location.href = startUrl;
    } catch {
      window.location.href = startUrl;
    }
  }

  const options = [
    { label: "Select an ad accountâ€¦", value: "" },
    ...accounts.map((a) => ({
      label: a.name ? `${a.name} (${a.id})` : a.id,
      value: a.id,
    })),
  ];

  return (
    <Page title="Meta">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Banner tone="info" title="Debug mode enabled">
                <Text as="p">
                  Use â€œConnect Meta (top-level)â€. This must navigate to Facebook, not /auth/login,
                  and not use fetcher/POST.
                </Text>
              </Banner>

              <Text as="p">
                Connect your Meta account to sync campaigns and enable Meta-related features.
              </Text>

              <InlineStack gap="200">
                <Button variant="primary" onClick={startMetaOAuthTopLevel}>
                  {connected ? "Reconnect Meta (top-level)" : "Connect Meta (top-level)"}
                </Button>
              </InlineStack>

              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(
                  {
                    shop: data.shop,
                    host: data.host,
                    embedded: data.embedded,
                    appOrigin: data.appOrigin,
                    connected: data.connected,
                    expiresAt: data.expiresAt,
                    debugStep,
                    hasApiKey: Boolean(data.apiKey),
                  },
                  null,
                  2
                )}
              </pre>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Connection status
                </Text>

                {connected ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="warning">Not connected</Badge>
                )}
              </InlineStack>

              <BlockStack gap="100">
                <Text as="p" tone="subdued">Shop: {data.shop}</Text>
                <Text as="p" tone="subdued">Token expiry: {data.expiresAt ?? "â€”"}</Text>
                <Text as="p" tone="subdued">Selected ad account: {data.adAccountId || "â€”"}</Text>
              </BlockStack>

              {!connected ? (
                <Banner tone="warning" title="Meta not connected">
                  <Text as="p">
                    Click â€œConnect Meta (top-level)â€, complete OAuth, then come back here.
                  </Text>
                </Banner>
              ) : (
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Button onClick={fetchAdAccounts} loading={accountsLoading}>
                      Fetch ad accounts
                    </Button>
                  </InlineStack>

                  {accountsError ? (
                    <Banner tone="critical" title="Failed to load ad accounts">
                      <Text as="p">{accountsError}</Text>
                    </Banner>
                  ) : null}

                  <Select
                    label="Ad account"
                    options={options}
                    value={selected}
                    onChange={setSelected}
                    helpText="Attribix needs an ad account (act_...) to pull campaign insights."
                  />

                  <InlineStack gap="200" blockAlign="center">
                    <Button
                      variant="primary"
                      onClick={saveAdAccount}
                      disabled={!selected || saveLoading}
                      loading={saveLoading}
                    >
                      Save ad account
                    </Button>
                  </InlineStack>

                  {saveOk ? (
                    <Banner tone="success" title="Saved">
                      <Text as="p">Ad account saved successfully.</Text>
                    </Banner>
                  ) : null}

                  {saveError ? (
                    <Banner tone="critical" title="Failed to save selection">
                      <Text as="p">{saveError}</Text>
                    </Banner>
                  ) : null}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// app/routes/app.integrations.meta.jsx
import React from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
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
  Divider,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

function isResponseLike(x) {
  return (
    x &&
    typeof x === "object" &&
    typeof x.status === "number" &&
    x.headers &&
    typeof x.headers.get === "function"
  );
}

function getAppOrigin(request) {
  const url = new URL(request.url);

  const proto =
    request.headers.get("x-forwarded-proto") ||
    request.headers.get("fly-forwarded-proto") ||
    url.protocol.replace(":", "") ||
    "https";

  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.host;

  return `${proto}://${host}`;
}

export async function loader({ request }) {
  const result = await authenticate.admin(request);

  if (isResponseLike(result)) {
    const location = result.headers.get("Location") || result.headers.get("location") || "";
    if (location.startsWith("/auth")) {
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

  const appOrigin = getAppOrigin(request);
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
  const revalidator = useRevalidator();

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

  const connected = !!data.connected;

  async function authedFetch(path, init = {}) {
    const token = await getShopifySessionToken({
      apiKey: data.apiKey,
      host: data.host,
    });

    if (!token) {
      throw new Error(
        "Missing Shopify session token — try refreshing the page."
      );
    }

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
        throw new Error("No accounts returned — unexpected response.");
      }

      setAccounts(payload.accounts);
    } catch (e) {
      setAccounts([]);
      setAccountsError(String(e?.message || e));
    } finally {
      setAccountsLoading(false);
    }
  }

  // Auto-fetch accounts on load when connected
  React.useEffect(() => {
    if (connected) {
      fetchAdAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  async function saveAdAccount() {
    if (!selected) return;

    try {
      setSaveOk(false);
      setSaveError(null);
      setSaveLoading(true);

      const form = new FormData();
      form.set("adAccountId", selected);
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
      revalidator.revalidate();
    } catch (e) {
      setSaveOk(false);
      setSaveError(String(e?.message || e));
    } finally {
      setSaveLoading(false);
    }
  }

  function startMetaOAuth() {
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

  const hasSelectedInAccounts = !!selected && accounts.some((a) => a?.id === selected);

  const options = [
    { label: "Select an ad account…", value: "" },
    ...(!selected || hasSelectedInAccounts
      ? []
      : [{ label: `Saved: ${selected}`, value: selected }]),
    ...accounts.map((a) => ({
      label: a.name ? `${a.name} (${a.id})` : a.id,
      value: a.id,
    })),
  ];

  return (
    <Page
      title="Meta"
      subtitle="Connect Facebook & Instagram Ads to sync campaign spend and enable server-side conversions."
      backAction={{ content: "Integrations", url: "/app/ads" }}
    >
      <Layout>
        {/* Connection card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Connection
                </Text>
                {connected ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="warning">Not connected</Badge>
                )}
              </InlineStack>

              {!connected && (
                <Text as="p" tone="subdued">
                  Click "Connect Meta" to complete OAuth with Facebook. You'll be redirected back
                  here automatically.
                </Text>
              )}

              {connected && data.expiresAt && (
                <Text as="p" tone="subdued" variant="bodySm">
                  Token expires: {new Date(data.expiresAt).toLocaleDateString()}
                </Text>
              )}

              <InlineStack gap="200">
                <Button variant="primary" onClick={startMetaOAuth}>
                  {connected ? "Reconnect Meta" : "Connect Meta"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Ad account selection */}
        {connected && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Ad account
                </Text>

                <Text as="p" tone="subdued" variant="bodySm">
                  Attribix needs an ad account (<code>act_…</code>) to pull campaign insights and
                  match attribution data.
                </Text>

                {data.adAccountId && (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Current selection:{" "}
                    <Text as="span" fontWeight="semibold">
                      {data.adAccountId}
                    </Text>
                  </Text>
                )}

                <Divider />

                <InlineStack gap="200" blockAlign="center">
                  <Button onClick={fetchAdAccounts} loading={accountsLoading}>
                    Refresh ad accounts
                  </Button>
                </InlineStack>

                {accountsError && (
                  <Banner tone="critical" title="Failed to load ad accounts">
                    <Text as="p">{accountsError}</Text>
                  </Banner>
                )}

                <Select
                  label="Select ad account"
                  options={options}
                  value={selected}
                  onChange={setSelected}
                />

                <InlineStack gap="200" blockAlign="center">
                  <Button
                    variant="primary"
                    onClick={saveAdAccount}
                    disabled={!selected || saveLoading}
                    loading={saveLoading}
                  >
                    Save
                  </Button>
                </InlineStack>

                {saveOk && (
                  <Banner tone="success" title="Saved">
                    <Text as="p">Ad account saved successfully.</Text>
                  </Banner>
                )}

                {saveError && (
                  <Banner tone="critical" title="Failed to save">
                    <Text as="p">{saveError}</Text>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Not connected prompt */}
        {!connected && (
          <Layout.Section>
            <Banner tone="info" title="How it works">
              <Text as="p">
                After connecting, Attribix will pull campaign-level spend daily and report ROAS on
                your Attribution dashboard. Server-side conversion events will also be sent to Meta
                for every attributed order, improving tracking accuracy on iOS and ad-blocked
                browsers.
              </Text>
            </Banner>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}

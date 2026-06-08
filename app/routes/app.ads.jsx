// app/routes/app.ads.jsx  — Integrations hub
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, BlockStack, InlineStack, Text, Button, Badge, Card, Divider,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db;

  const [metaConn, googleConn, stripeConn] = await Promise.all([
    db.metaConnection.findUnique({ where: { shop } }).catch(() => null),
    db.googleConnection.findUnique({ where: { shop } }).catch(() => null),
    anyDb.stripeConnection?.findUnique?.({ where: { shop } }).catch(() => null),
  ]);

  const metaConnected = !!(metaConn?.accessToken && metaConn.accessToken !== "__PENDING__");
  const googleConnected = !!(googleConn?.accessToken && googleConn.accessToken !== "__PENDING__");
  const googleComplete = googleConnected && !!googleConn?.adCustomerId;
  const stripeConnected = !!stripeConn;

  const connectedCount = [metaConnected, googleConnected, stripeConnected].filter(Boolean).length;

  return json({
    meta: { connected: metaConnected, adAccountId: metaConn?.adAccountId || null, lastSyncedAt: metaConn?.lastSyncedAt || null },
    google: { connected: googleConnected, complete: googleComplete, adCustomerId: googleConn?.adCustomerId || null, lastSyncedAt: googleConn?.lastSyncedAt || null, developerTokenConfigured: !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN },
    stripe: { connected: stripeConnected, accountName: stripeConn?.accountName || null },
    connectedCount,
    totalCount: 3,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ConnBadge({ ok, incomplete }) {
  if (incomplete) return <span style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B", display: "inline-block" }} />Incomplete</span>;
  if (ok) return <span style={{ fontSize: 12, fontWeight: 700, color: "#16A34A", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16A34A", display: "inline-block" }} />Connected</span>;
  return <span style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#E5E7EB", display: "inline-block" }} />Not connected</span>;
}

function EnabledRow({ label, value = "Active" }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, paddingBottom: 6 }}>
      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" variant="bodySm" fontWeight="semibold">{value}</Text>
    </div>
  );
}

function EnablesCheck({ label }) {
  return (
    <InlineStack gap="150" blockAlign="center">
      <span style={{ color: "#16A34A", fontSize: 14 }}>✓</span>
      <Text as="p" variant="bodySm">{label}</Text>
    </InlineStack>
  );
}

function fmtSync(d) {
  if (!d) return "Never";
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 2 * 60 * 1000) return "Just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 24 * 60 * 60 * 1000) return `Today at ${new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IntegrationsHub() {
  const { meta, google, stripe, connectedCount, totalCount } = useLoaderData();

  return (
    <Page
      title="Integrations"
      subtitle="Connect your ad, analytics and payment platforms to sync spend, conversions and revenue."
      secondaryActions={[
        { content: "Re-check connections", icon: undefined, onAction: () => window.location.reload() },
        { content: "View setup guide" },
      ]}
    >
      <BlockStack gap="500">

        {/* ── Status summary banner ──────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "16px 24px",
        }}>
          <InlineStack gap="300" blockAlign="center">
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 20 }}>✓</span>
            </div>
            <BlockStack gap="025">
              <Text as="p" variant="bodyMd" fontWeight="semibold">{connectedCount} of {totalCount} integrations connected</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {connectedCount > 0
                  ? "Your tracking setup is working well. Spend and conversions are being synced."
                  : "Connect your first integration to start tracking ad performance."}
              </Text>
            </BlockStack>
          </InlineStack>

          {/* Status pills */}
          <InlineStack gap="400">
            {[
              { label: "Meta", ok: meta.connected },
              { label: "Google Ads", ok: google.complete },
              { label: "Stripe", ok: stripe.connected },
            ].map(({ label, ok }) => (
              <InlineStack key={label} gap="100" blockAlign="center">
                <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                  background: ok ? "#DCFCE7" : "#FEF3C7",
                  color: ok ? "#15803D" : "#92400E",
                }}>
                  {ok ? "Connected" : "Not connected"}
                </span>
              </InlineStack>
            ))}
          </InlineStack>
        </div>

        {/* ── Ad platforms ──────────────────────────────────────────── */}
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Ad platforms</Text>
          <Text as="p" variant="bodySm" tone="subdued">Sync ad spend and send server-side conversions to improve tracking accuracy.</Text>
        </BlockStack>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Meta Ads */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="start">
                <InlineStack gap="300" blockAlign="center">
                  {/* Meta logo */}
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "#1877F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 008.44-9.9c0-5.53-4.5-10.02-10-10.02z" fill="white"/>
                    </svg>
                  </div>
                  <BlockStack gap="025">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Meta Ads</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Sync ad spend and send purchase events via Conversions API.</Text>
                  </BlockStack>
                </InlineStack>
                <ConnBadge ok={meta.connected} />
              </InlineStack>

              {meta.connected ? (
                <>
                  <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "12px 16px" }}>
                    <EnabledRow label="Ad account" value={meta.adAccountId || "—"} />
                    <EnabledRow label="Ad spend sync" />
                    <EnabledRow label="Server-side events" />
                    <EnabledRow label="Last sync" value={fmtSync(meta.lastSyncedAt)} />
                  </div>
                  <div>
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">This integration enables</Text>
                    <BlockStack gap="100" inlineSize="100%">
                      <EnablesCheck label="Ad spend tracking" />
                      <EnablesCheck label="Server-side conversions (CAPI)" />
                      <EnablesCheck label="ROAS reporting" />
                      <EnablesCheck label="Campaign attribution" />
                    </BlockStack>
                  </div>
                  <InlineStack gap="200">
                    <Button variant="primary" url="/app/integrations/meta">Manage Meta</Button>
                    <Button url="/app/meta-ads">View campaigns</Button>
                    <button style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>⋮</button>
                  </InlineStack>
                </>
              ) : (
                <>
                  <Text as="p" variant="bodySm" tone="subdued">Connect your Meta account to pull campaign insights and enable server-side conversion reporting.</Text>
                  <Button variant="primary" url="/app/integrations/meta">Connect Meta</Button>
                </>
              )}
            </BlockStack>
          </Card>

          {/* Google Ads */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="start">
                <InlineStack gap="300" blockAlign="center">
                  {/* Google logo */}
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "#fff", border: "1.5px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="28" height="28" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                  </div>
                  <BlockStack gap="025">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Google Ads</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Sync ad spend and upload offline conversions.</Text>
                  </BlockStack>
                </InlineStack>
                <ConnBadge ok={google.complete} incomplete={google.connected && !google.adCustomerId} />
              </InlineStack>

              {google.connected ? (
                <>
                  <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "12px 16px" }}>
                    <EnabledRow label="Google Ads account" value={google.adCustomerId || "—"} />
                    <EnabledRow label="Ad spend sync" />
                    <EnabledRow label="Offline conversions" />
                    <EnabledRow label="Last sync" value={fmtSync(google.lastSyncedAt)} />
                  </div>
                  {!google.adCustomerId && (
                    <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "10px 14px" }}>
                      <Text as="p" variant="bodySm" tone="caution">Ad account not selected — go to Manage Google Ads to complete setup.</Text>
                    </div>
                  )}
                  <div>
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">This integration enables</Text>
                    <BlockStack gap="100" inlineSize="100%">
                      <EnablesCheck label="Google Ads spend tracking" />
                      <EnablesCheck label="Conversion uploads" />
                      <EnablesCheck label="ROAS reporting" />
                      <EnablesCheck label="Campaign attribution" />
                    </BlockStack>
                  </div>
                  <InlineStack gap="200">
                    <Button variant="primary" url="/app/integrations/google">Manage Google Ads</Button>
                    <Button url="/app/google-ads">View campaigns</Button>
                    <button style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>⋮</button>
                  </InlineStack>
                </>
              ) : (
                <>
                  <Text as="p" variant="bodySm" tone="subdued">Connect your Google Ads account to sync daily spend and upload offline conversions for attributed orders.</Text>
                  {!google.developerTokenConfigured && (
                    <Text as="p" tone="critical" variant="bodySm">Developer token not configured — contact support.</Text>
                  )}
                  <Button variant="primary" url="/app/integrations/google">Connect Google Ads</Button>
                </>
              )}
            </BlockStack>
          </Card>
        </div>

        {/* ── Payment platforms ─────────────────────────────────────── */}
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Payment platforms</Text>
          <Text as="p" variant="bodySm" tone="subdued">Sync payment data to attribute revenue and reconcile orders.</Text>
        </BlockStack>

        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {/* Stripe info */}
            <InlineStack gap="300" blockAlign="start">
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "#635BFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ color: "#fff", fontWeight: 900, fontSize: 22 }}>S</span>
              </div>
              <BlockStack gap="150">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Stripe</Text>
                  {stripe.connected
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", padding: "1px 8px", borderRadius: 99, background: "#DCFCE7" }}>Connected</span>
                    : <span style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", padding: "1px 8px", borderRadius: 99, background: "#FEF3C7" }}>Not connected</span>
                  }
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {stripe.connected
                    ? `Account: ${stripe.accountName || "Connected"}`
                    : "Connect Stripe to sync payment revenue and attribute non-Shopify transactions."}
                </Text>
                {stripe.connected && (
                  <Button size="slim" url="/app/stripe">Manage Stripe</Button>
                )}
              </BlockStack>
            </InlineStack>

            {/* What it enables */}
            <div style={{ borderLeft: "1px solid #F3F4F6", paddingLeft: 24 }}>
              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">This integration enables</Text>
              <div style={{ marginTop: 8 }}>
                <BlockStack gap="100" inlineSize="100%">
                  <EnablesCheck label="Payment revenue sync" />
                  <EnablesCheck label="Non-Shopify payment attribution" />
                  <EnablesCheck label="Revenue reconciliation" />
                </BlockStack>
              </div>
              {!stripe.connected && (
                <div style={{ marginTop: 16 }}>
                  <Button variant="primary" url="/app/stripe">Connect Stripe</Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ── How integrations work ──────────────────────────────────── */}
        <Card background="bg-surface-secondary">
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm" fontWeight="semibold">How integrations work</Text>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
              {[
                { icon: "📊", title: "Ad spend sync", desc: "We pull daily ad spend from your connected ad platforms so you can see accurate ROAS." },
                { icon: "🖥️", title: "Server-side conversions", desc: "Purchase events are sent directly from your server to ad platforms for better accuracy and fewer reporting gaps." },
                { icon: "🎯", title: "Attribution", desc: <span>Orders are matched to clicks, campaigns and traffic sources based on your attribution model in <a href="/app/settings" style={{ color: "#008060" }}>Settings</a>.</span> },
              ].map(item => (
                <InlineStack key={item.title} gap="300" blockAlign="start">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodySm" fontWeight="semibold">{item.title}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{item.desc}</Text>
                  </BlockStack>
                </InlineStack>
              ))}
            </div>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}

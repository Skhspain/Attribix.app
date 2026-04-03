// app/routes/app.product-feed.tsx
// Product feed dashboard — Google Shopping + Meta Catalog with auto-sync, health check, UTM, custom labels.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Page, Card, BlockStack, InlineStack, Text, Button, Badge, Divider, Banner, Select, TextField,
} from "@shopify/polaris";
import { useState } from "react";

const APP_URL = process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const config = await anyDb.productFeedConfig?.findUnique?.({ where: { shop } }).catch(() => null);

  // Feed health: count issues
  const allItems: any[] = await anyDb.productFeedItem?.findMany?.({
    where: { shop },
    select: { productId: true, title: true, imagesJson: true, bodyHtml: true, barcode: true, sku: true, available: true, price: true, compareAtPrice: true },
  }).catch(() => []) ?? [];

  const health = {
    total: allItems.length,
    noImage: allItems.filter(p => { try { return JSON.parse(p.imagesJson || "[]").length === 0; } catch { return true; } }).length,
    noDescription: allItems.filter(p => !p.bodyHtml || p.bodyHtml.replace(/<[^>]*>/g, "").trim().length < 10).length,
    noGtin: allItems.filter(p => !p.barcode && !p.sku).length,
    outOfStock: allItems.filter(p => !p.available).length,
    onSale: allItems.filter(p => p.compareAtPrice && parseFloat(p.compareAtPrice) > parseFloat(p.price || "0")).length,
  };

  return json({
    shop,
    config: config ?? {},
    health,
    googleFeedUrl: `${APP_URL}/feeds/${shop}/google.xml`,
    metaFeedUrl: `${APP_URL}/feeds/${shop}/meta.json`,
  });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));
  const intent = body?.intent as string;

  if (intent === "save-settings") {
    const existing = await anyDb.productFeedConfig?.findUnique?.({ where: { shop } }).catch(() => null);
    const wasAutoSync = existing?.autoSync ?? false;
    const nowAutoSync = body.autoSync ?? false;

    let webhookId = existing?.webhookId ?? null;

    // Register or remove webhook based on autoSync toggle
    if (nowAutoSync && !wasAutoSync) {
      // Register webhook for products/update and products/create
      try {
        const res = await admin.graphql(`
          mutation {
            webhookSubscriptionCreate(
              topic: PRODUCTS_UPDATE
              webhookSubscription: {
                format: JSON
                callbackUrl: "${APP_URL}/webhooks/product-feed"
              }
            ) {
              webhookSubscription { id }
              userErrors { message }
            }
          }
        `);
        const j = await res.json();
        webhookId = j?.data?.webhookSubscriptionCreate?.webhookSubscription?.id ?? null;
      } catch (e) {
        console.error("[product-feed] webhook register error:", e);
      }
    } else if (!nowAutoSync && wasAutoSync && webhookId) {
      // Delete webhook
      try {
        await admin.graphql(`
          mutation { webhookSubscriptionDelete(id: "${webhookId}") { deletedWebhookSubscriptionId } }
        `);
        webhookId = null;
      } catch (e) {
        console.error("[product-feed] webhook delete error:", e);
      }
    }

    await anyDb.productFeedConfig?.upsert?.({
      where: { shop },
      create: {
        shop,
        autoSync: nowAutoSync,
        webhookId,
        excludeOutOfStock: body.excludeOutOfStock ?? false,
        appendUtm: body.appendUtm ?? true,
        utmSource: body.utmSource ?? "attribix_feed",
        utmMedium: body.utmMedium ?? "cpc",
      },
      update: {
        autoSync: nowAutoSync,
        webhookId,
        excludeOutOfStock: body.excludeOutOfStock ?? false,
        appendUtm: body.appendUtm ?? true,
        utmSource: body.utmSource ?? "attribix_feed",
        utmMedium: body.utmMedium ?? "cpc",
      },
    }).catch(() => null);

    return json({ ok: true, saved: true });
  }

  return json({ ok: false });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant="plain" size="slim" onClick={() => {
      navigator.clipboard?.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }}>
      {copied ? "✓ Copied" : "Copy URL"}
    </Button>
  );
}

function Toggle({ label, helpText, checked, onChange }: { label: string; helpText?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <InlineStack align="space-between" blockAlign="center">
      <BlockStack gap="050">
        <Text as="p" variant="bodyMd" fontWeight="semibold">{label}</Text>
        {helpText && <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text>}
      </BlockStack>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
          background: checked ? "#008060" : "#e5e7eb", position: "relative", transition: "background 0.2s",
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 3, left: checked ? 23 : 3, transition: "left 0.2s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }} />
      </button>
    </InlineStack>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductFeedPage() {
  const { shop, config, health, googleFeedUrl, metaFeedUrl } = useLoaderData<typeof loader>();
  const syncFetcher = useFetcher<any>();
  const settingsFetcher = useFetcher<any>();

  const [autoSync, setAutoSync] = useState(config?.autoSync ?? false);
  const [excludeOutOfStock, setExcludeOutOfStock] = useState(config?.excludeOutOfStock ?? false);
  const [appendUtm, setAppendUtm] = useState(config?.appendUtm ?? true);
  const [utmSource, setUtmSource] = useState(config?.utmSource ?? "attribix_feed");
  const [utmMedium, setUtmMedium] = useState(config?.utmMedium ?? "cpc");

  const isSyncing = syncFetcher.state !== "idle";
  const isSaving = settingsFetcher.state !== "idle";
  const saved = settingsFetcher.data?.saved;

  function handleSync() {
    syncFetcher.submit({}, { method: "post", action: "/api/product-feed/sync" });
  }

  function handleSave() {
    settingsFetcher.submit(
      { intent: "save-settings", autoSync, excludeOutOfStock, appendUtm, utmSource, utmMedium },
      { method: "post", encType: "application/json" }
    );
  }

  const hasIssues = health.noImage > 0 || health.noDescription > 0 || health.noGtin > 0;
  const lastSync = config?.lastSyncedAt ? new Date(config.lastSyncedAt).toLocaleString() : "Never";

  return (
    <Page
      title="Product feed"
      subtitle="Google Shopping & Meta Catalog — keep your ads perfectly in sync"
      primaryAction={{ content: isSyncing ? "Syncing…" : "Sync now", onAction: handleSync, loading: isSyncing }}
      secondaryActions={[{ content: isSaving ? "Saving…" : saved ? "Saved ✓" : "Save settings", onAction: handleSave }]}
    >
      <BlockStack gap="500">

        {syncFetcher.data?.ok && (
          <Banner tone="success">
            <Text as="p">✓ Synced {syncFetcher.data.totalSynced} products into both feeds.</Text>
          </Banner>
        )}

        {/* Status overview */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12 }}>
          {[
            { label: "Products", value: health.total.toLocaleString(), color: "#111827" },
            { label: "On sale", value: health.onSale.toLocaleString(), color: "#008060" },
            { label: "Out of stock", value: health.outOfStock.toLocaleString(), color: "#6b7280" },
            { label: "Missing image", value: health.noImage.toLocaleString(), color: health.noImage > 0 ? "#dc2626" : "#111827" },
            { label: "No description", value: health.noDescription.toLocaleString(), color: health.noDescription > 0 ? "#d97706" : "#111827" },
            { label: "No GTIN/SKU", value: health.noGtin.toLocaleString(), color: health.noGtin > 0 ? "#d97706" : "#111827" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Health warnings */}
        {hasIssues && health.total > 0 && (
          <Card>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingSm">⚠️ Feed health warnings</Text>
                <Badge tone="warning">Action needed</Badge>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                These issues reduce your ad performance. Fix them in your Shopify product editor.
              </Text>
              <BlockStack gap="200">
                {health.noImage > 0 && (
                  <div style={{ background: "#fef2f2", borderRadius: 8, padding: "10px 14px" }}>
                    <InlineStack gap="200" blockAlign="center">
                      <span style={{ color: "#dc2626", fontSize: 16 }}>📷</span>
                      <Text as="p" variant="bodySm">
                        <strong>{health.noImage} products</strong> have no image — Google will reject these from Shopping ads.
                      </Text>
                    </InlineStack>
                  </div>
                )}
                {health.noDescription > 0 && (
                  <div style={{ background: "#fffbeb", borderRadius: 8, padding: "10px 14px" }}>
                    <InlineStack gap="200" blockAlign="center">
                      <span style={{ fontSize: 16 }}>📝</span>
                      <Text as="p" variant="bodySm">
                        <strong>{health.noDescription} products</strong> have no description — adds context for Google's algorithm.
                      </Text>
                    </InlineStack>
                  </div>
                )}
                {health.noGtin > 0 && (
                  <div style={{ background: "#fffbeb", borderRadius: 8, padding: "10px 14px" }}>
                    <InlineStack gap="200" blockAlign="center">
                      <span style={{ fontSize: 16 }}>🏷️</span>
                      <Text as="p" variant="bodySm">
                        <strong>{health.noGtin} products</strong> have no barcode/SKU — adding GTINs improves Shopping ad performance.
                      </Text>
                    </InlineStack>
                  </div>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* Feed URLs */}
        {[
          { icon: "🛍️", title: "Google Shopping feed", subtitle: "Submit to Google Merchant Center", url: googleFeedUrl, bg: "#fef9c3", mcUrl: "https://merchants.google.com", steps: ["Merchant Center → Products → Feeds", 'Click "+" → Scheduled fetch', "Paste the URL and set to Daily"] },
          { icon: "📘", title: "Meta catalog feed", subtitle: "Submit to Meta Commerce Manager", url: metaFeedUrl, bg: "#ede9fe", mcUrl: "https://business.facebook.com/commerce_manager", steps: ["Commerce Manager → Catalog → Data sources", '"Add items" → Use a data feed', "Paste the URL and set to Daily"] },
        ].map(({ icon, title, subtitle, url, bg, mcUrl, steps }) => (
          <Card key={title}>
            <BlockStack gap="300">
              <InlineStack gap="300" blockAlign="center">
                <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{icon}</div>
                <BlockStack gap="050">
                  <Text as="h2" variant="headingSm">{title}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{subtitle}</Text>
                </BlockStack>
                {health.total > 0 && <Badge tone="success">Ready</Badge>}
              </InlineStack>
              <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 16px" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: "#374151", wordBreak: "break-all" }}>{url}</span>
                  <CopyButton value={url} />
                </InlineStack>
              </div>
              <InlineStack gap="200">
                {steps.map((s, i) => (
                  <InlineStack key={i} gap="100" blockAlign="center">
                    <span style={{ background: "#e5e7eb", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                    <Text as="p" variant="bodySm" tone="subdued">{s}</Text>
                    {i < steps.length - 1 && <span style={{ color: "#d1d5db" }}>→</span>}
                  </InlineStack>
                ))}
              </InlineStack>
              <InlineStack gap="200">
                <Button url={url} external variant="secondary" size="slim">Preview feed</Button>
                <Button url={mcUrl} external variant="plain" size="slim">Open platform →</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        ))}

        {/* Settings */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingSm">Feed settings</Text>
            <Divider />

            <Toggle
              label="Auto-sync on product changes"
              helpText="Automatically update the feed whenever you add, edit, or delete a product in Shopify"
              checked={autoSync}
              onChange={setAutoSync}
            />
            {autoSync && (
              <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "10px 14px" }}>
                <Text as="p" variant="bodySm">
                  ✓ A webhook will be registered. Your feed updates within seconds of any product change.
                </Text>
              </div>
            )}

            <Divider />

            <Toggle
              label="Exclude out-of-stock products"
              helpText="Remove unavailable products from the feed — Google won't charge for clicks on products you can't sell"
              checked={excludeOutOfStock}
              onChange={setExcludeOutOfStock}
            />

            <Divider />

            <Toggle
              label="Append UTM tracking to product URLs"
              helpText="Adds UTM parameters to every product link so you can track feed-driven traffic in Analytics"
              checked={appendUtm}
              onChange={setAppendUtm}
            />
            {appendUtm && (
              <InlineStack gap="300">
                <div style={{ flex: 1 }}>
                  <TextField label="utm_source" value={utmSource} onChange={setUtmSource} autoComplete="off"
                    helpText="e.g. google_shopping, meta_catalog" />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField label="utm_medium" value={utmMedium} onChange={setUtmMedium} autoComplete="off"
                    helpText="e.g. cpc, social" />
                </div>
              </InlineStack>
            )}

            <Divider />

            {/* Custom labels */}
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" fontWeight="semibold">Custom labels (Google Shopping)</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Custom labels let you group products in Google Ads for smarter bidding. These are auto-assigned based on product data.
              </Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 8 }}>
                {[
                  { label: "custom_label_0 = sale", desc: `${health.onSale} products on sale (has compare price)`, active: health.onSale > 0, color: "#008060" },
                  { label: "custom_label_1 = new", desc: "Products added in last 30 days", active: true, color: "#2563eb" },
                  { label: "custom_label_2 = out_of_stock", desc: `${health.outOfStock} products unavailable`, active: health.outOfStock > 0, color: "#6b7280" },
                  { label: "custom_label_3 = no_gtin", desc: `${health.noGtin} products without barcode`, active: health.noGtin > 0, color: "#d97706" },
                ].map(({ label, desc, active, color }) => (
                  <div key={label} style={{ border: `1.5px solid ${active ? color + "44" : "#e5e7eb"}`, borderRadius: 8, padding: "10px 12px", background: active ? color + "08" : "#f9fafb" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: active ? color : "#9ca3af", fontFamily: "monospace", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{desc}</div>
                  </div>
                ))}
              </div>
              <Text as="p" variant="bodySm" tone="subdued">
                Custom labels are automatically included in your Google feed. Set up bid adjustments in Google Ads → Product groups.
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>

        {/* What's included */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">What's included in every feed</Text>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
              {[
                "Product title & description",
                "All product images (up to 10)",
                "Price & sale price",
                "In stock / out of stock",
                "All variants with unique IDs",
                "SKU / barcode (GTIN)",
                "Product type & brand (vendor)",
                "UTM-tagged product URLs",
                "Custom labels for Google bidding",
                "Variant-level items for Meta",
              ].map((item) => (
                <InlineStack key={item} gap="200" blockAlign="center">
                  <span style={{ color: "#008060", flexShrink: 0 }}>✓</span>
                  <Text as="p" variant="bodySm">{item}</Text>
                </InlineStack>
              ))}
            </div>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}

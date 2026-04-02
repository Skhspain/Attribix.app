// app/routes/app.buy-now.tsx
// Buy Now button dashboard — settings, preview, and click analytics.
// NEW FILE.

import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Select,
  Button,
  Badge,
  Grid,
  Divider,
  Banner,
  DataTable,
  Checkbox,
  ColorPicker,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

// ─── Client-side dark-color helper ───────────────────────────────────────────

function isDark(hex: string): boolean {
  if (!hex || hex === "transparent" || !hex.startsWith("#")) return true;
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const [settings, clickStats] = await Promise.all([
    anyDb.buyNowSettings?.findUnique?.({ where: { shop } }).catch(() => null),
    anyDb.buyNowClick?.findMany?.({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 100,
    }).catch(() => []) ?? [],
  ]);

  // Check if ScriptTag is already installed
  let scriptTagInstalled = false;
  try {
    const APP_URL = process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev";
    const scriptUrl = `${APP_URL}/scripts/buy-now.js`;
    const tagsRes = await admin.graphql(`
      query {
        scriptTags(first: 20) {
          edges { node { id src } }
        }
      }
    `);
    const tagsJson = await tagsRes.json();
    const tags = tagsJson?.data?.scriptTags?.edges ?? [];
    scriptTagInstalled = tags.some((e: any) => e.node?.src === scriptUrl);
  } catch {}

  // Aggregate stats
  const totalClicks = clickStats.length;
  const conversions = clickStats.filter((c: any) => c.convertedOrderId).length;
  const conversionRate = totalClicks > 0 ? Math.round((conversions / totalClicks) * 100) : 0;

  const productCounts: Record<string, number> = {};
  for (const c of clickStats) {
    if (c.productId) productCounts[c.productId] = (productCounts[c.productId] || 0) + 1;
  }
  const topProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, clicks]) => ({ id, clicks }));

  const sourceCounts: Record<string, number> = {};
  for (const c of clickStats) {
    const src = c.utmSource || "direct";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }

  return json({
    settings: settings ?? {
      enabled: true,
      buttonText: "Buy Now",
      buttonColor: "#008060",
      textColor: "#ffffff",
      borderRadius: 4,
      size: "medium",
      action: "checkout",
    },
    scriptTagInstalled,
    totalClicks,
    conversions,
    conversionRate,
    topProducts,
    sourceCounts,
    recentClicks: clickStats.slice(0, 20),
    shop,
  });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const body = await request.json().catch(() => ({}));

  // Save settings
  await anyDb.buyNowSettings?.upsert?.({
    where: { shop },
    create: { shop, ...body },
    update: body,
  });

  // Manage ScriptTag automatically
  try {
    const APP_URL = process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev";
    const scriptUrl = `${APP_URL}/scripts/buy-now.js`;

    // Find existing tag
    const tagsRes = await admin.graphql(`
      query { scriptTags(first: 20) { edges { node { id src } } } }
    `);
    const tagsJson = await tagsRes.json();
    const tags = tagsJson?.data?.scriptTags?.edges ?? [];
    const existing = tags.find((e: any) => e.node?.src === scriptUrl);

    if (body.enabled && !existing) {
      // Create the ScriptTag
      await admin.graphql(`
        mutation {
          scriptTagCreate(input: { src: "${scriptUrl}", displayScope: ALL_PAGES }) {
            scriptTag { id src }
            userErrors { field message }
          }
        }
      `);
    } else if (!body.enabled && existing) {
      // Remove the ScriptTag
      await admin.graphql(`
        mutation {
          scriptTagDelete(id: "${existing.node.id}") {
            deletedScriptTagId
            userErrors { field message }
          }
        }
      `);
    }
  } catch (e) {
    console.error("[buy-now] ScriptTag management error:", e);
  }

  return json({ ok: true });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BuyNowDashboard() {
  const {
    settings,
    scriptTagInstalled,
    totalClicks,
    conversions,
    conversionRate,
    topProducts,
    sourceCounts,
    recentClicks,
    shop,
  } = useLoaderData<typeof loader>();

  const fetcher = useFetcher<any>();
  const [s, setS] = useState(settings);
  const [saved, setSaved] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [suggestion, setSuggestion] = useState<null | {
    buttonColor: string;
    textColor: string;
    borderRadius: number;
    fontFamily: string | null;
    themeHint: string;
    accentColor: string | null;
  }>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const update = (key: string, value: any) => setS((prev: any) => ({ ...prev, [key]: value }));

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/buy-now/scan-style");
      const data = await res.json();
      if (data.ok) {
        setSuggestion(data);
      } else {
        setScanError(data.error ?? "Scan failed");
      }
    } catch (e: any) {
      setScanError(e.message);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleSave = useCallback(() => {
    fetcher.submit(s, {
      method: "POST",
      encType: "application/json",
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [s, fetcher]);

  // Live button preview
  const previewStyle: React.CSSProperties = {
    background: s.buttonColor,
    color: s.textColor,
    border: "none",
    borderRadius: s.borderRadius,
    padding:
      s.size === "small" ? "8px 16px" : s.size === "large" ? "14px 28px" : "11px 22px",
    fontSize: s.size === "small" ? 13 : s.size === "large" ? 17 : 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };


  return (
    <Page
      title="Buy Now Button"
      primaryAction={{ content: saved ? "Saved ✓" : "Save settings", onAction: handleSave }}
    >
      <BlockStack gap="500">
        <Banner tone="info" title="How it works">
          <Text as="p" variant="bodySm">
            The Buy Now button is automatically injected into your Shopify storefront via a ScriptTag — no theme editing required.
            Every click is tracked with full attribution (UTM, gclid, fbclid) and linked back to conversions in your analytics.
          </Text>
        </Banner>

        {/* KPI cards */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Total clicks</Text>
                <Text as="p" variant="headingXl">{totalClicks.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Conversions</Text>
                <Text as="p" variant="headingXl" tone="success">{conversions.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Conversion rate</Text>
                <Text as="p" variant="headingXl">{conversionRate}%</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        <Grid>
          {/* Settings panel */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 7, xl: 7 }}>
            <BlockStack gap="400">
            {/* Scan banner */}
            <Card>
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">Auto-detect store style</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    We scan your store's CSS to suggest a matching button design.
                  </Text>
                </BlockStack>
                <Button onClick={handleScan} loading={scanning} variant="secondary">
                  {scanning ? "Scanning…" : "Scan my store"}
                </Button>
              </InlineStack>

              {scanError && (
                <div style={{ marginTop: 12 }}>
                  <Text as="p" variant="bodySm" tone="critical">{scanError}</Text>
                </div>
              )}

              {suggestion && (
                <div style={{ marginTop: 16 }}>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Detected theme: <strong>{suggestion.themeHint}</strong>
                    {suggestion.fontFamily ? ` · Font: ${suggestion.fontFamily}` : ""}
                  </Text>

                  {/* 3 design variants as clickable cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
                    {[
                      {
                        label: "Exact match",
                        color: suggestion.buttonColor,
                        text: suggestion.textColor,
                        radius: suggestion.borderRadius,
                      },
                      {
                        label: "Pill",
                        color: suggestion.buttonColor,
                        text: suggestion.textColor,
                        radius: 50,
                      },
                      {
                        label: "Outlined",
                        color: "transparent",
                        text: suggestion.buttonColor,
                        radius: suggestion.borderRadius,
                        border: `2px solid ${suggestion.buttonColor}`,
                      },
                      ...(suggestion.accentColor ? [{
                        label: "Accent",
                        color: suggestion.accentColor,
                        text: isDark(suggestion.accentColor) ? "#ffffff" : "#111111",
                        radius: suggestion.borderRadius,
                      }] : []),
                    ].slice(0, 3).map((variant) => (
                      <div
                        key={variant.label}
                        onClick={() => {
                          update("buttonColor", variant.color === "transparent" ? "#ffffff" : variant.color);
                          update("textColor", variant.text);
                          update("borderRadius", variant.radius);
                        }}
                        style={{
                          border: "1px solid #e1e3e5",
                          borderRadius: 8,
                          padding: 12,
                          cursor: "pointer",
                          textAlign: "center",
                          background: "#fafafa",
                          transition: "box-shadow 0.1s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)")}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                      >
                        <button
                          style={{
                            background: variant.color,
                            color: variant.text,
                            border: (variant as any).border ?? "none",
                            borderRadius: variant.radius,
                            padding: "8px 16px",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            width: "100%",
                            fontFamily: suggestion.fontFamily || "inherit",
                          }}
                        >
                          {s.buttonText || "Buy Now"}
                        </button>
                        <Text as="p" variant="bodySm" tone="subdued">{variant.label}</Text>
                        <Text as="p" variant="bodySm" tone="magic">Click to apply</Text>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingSm">Button settings</Text>

                <Checkbox
                  label="Enable Buy Now button"
                  checked={s.enabled}
                  onChange={(v) => update("enabled", v)}
                />

                <TextField
                  label="Button text"
                  value={s.buttonText}
                  onChange={(v) => update("buttonText", v)}
                  autoComplete="off"
                />

                <InlineStack gap="400">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Button colour (hex)"
                      value={s.buttonColor}
                      onChange={(v) => update("buttonColor", v)}
                      autoComplete="off"
                      prefix={
                        <div style={{
                          width: 16, height: 16, borderRadius: 4,
                          background: s.buttonColor, border: "1px solid #ccc"
                        }} />
                      }
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Text colour (hex)"
                      value={s.textColor}
                      onChange={(v) => update("textColor", v)}
                      autoComplete="off"
                      prefix={
                        <div style={{
                          width: 16, height: 16, borderRadius: 4,
                          background: s.textColor, border: "1px solid #ccc"
                        }} />
                      }
                    />
                  </div>
                </InlineStack>

                <InlineStack gap="400">
                  <div style={{ flex: 1 }}>
                    <Select
                      label="Size"
                      options={[
                        { label: "Small", value: "small" },
                        { label: "Medium", value: "medium" },
                        { label: "Large", value: "large" },
                      ]}
                      value={s.size}
                      onChange={(v) => update("size", v)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select
                      label="On click"
                      options={[
                        { label: "Go to checkout", value: "checkout" },
                        { label: "Add to cart", value: "cart" },
                        { label: "Go to product page", value: "product" },
                      ]}
                      value={s.action}
                      onChange={(v) => update("action", v)}
                    />
                  </div>
                </InlineStack>

                <TextField
                  label="Border radius (px)"
                  type="number"
                  value={String(s.borderRadius)}
                  onChange={(v) => update("borderRadius", parseInt(v, 10) || 0)}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>
            </BlockStack>
          </Grid.Cell>

          {/* Preview + source breakdown */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 5, xl: 5 }}>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">Live preview</Text>
                  <div style={{ padding: "24px", background: "#f6f6f7", borderRadius: 8, textAlign: "center" }}>
                    <button style={previewStyle}>{s.buttonText}</button>
                  </div>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">Clicks by source</Text>
                  {Object.keys(sourceCounts).length === 0 ? (
                    <Text as="p" tone="subdued">No clicks yet.</Text>
                  ) : (
                    <BlockStack gap="150">
                      {Object.entries(sourceCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 6)
                        .map(([src, count]) => (
                          <InlineStack key={src} align="space-between">
                            <Text as="p" variant="bodySm">{src}</Text>
                            <Text as="p" variant="bodySm" fontWeight="semibold">{(count as number).toLocaleString()}</Text>
                          </InlineStack>
                        ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Grid.Cell>
        </Grid>

        {/* Installation status */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingSm">Automatic installation</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  The Buy Now button is injected directly into your store. No theme editing or code required.
                </Text>
              </BlockStack>
              {s.enabled ? (
                scriptTagInstalled ? (
                  <span style={{
                    background: "#f0fdf4", color: "#15803d", border: "1.5px solid #16a34a",
                    borderRadius: 20, padding: "5px 16px", fontSize: 13, fontWeight: 700,
                  }}>
                    ✓ Active on store
                  </span>
                ) : (
                  <span style={{
                    background: "#fffbeb", color: "#b45309", border: "1.5px solid #d97706",
                    borderRadius: 20, padding: "5px 16px", fontSize: 13, fontWeight: 700,
                  }}>
                    ⏳ Activating…
                  </span>
                )
              ) : (
                <span style={{
                  background: "#f3f4f6", color: "#6b7280", border: "1.5px solid #d1d5db",
                  borderRadius: 20, padding: "5px 16px", fontSize: 13, fontWeight: 700,
                }}>
                  ○ Disabled
                </span>
              )}
            </InlineStack>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { step: "1", label: "Enable the button", done: s.enabled },
                { step: "2", label: "Save settings", done: scriptTagInstalled },
                { step: "3", label: "Live on your store", done: scriptTagInstalled && s.enabled },
              ].map((item) => (
                <div key={item.step} style={{
                  background: item.done ? "#f0fdf4" : "#f9fafb",
                  border: `1px solid ${item.done ? "#16a34a" : "#e5e7eb"}`,
                  borderRadius: 8, padding: "12px 14px",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 99, flexShrink: 0,
                    background: item.done ? "#16a34a" : "#e5e7eb",
                    color: item.done ? "#fff" : "#9ca3af",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {item.done ? "✓" : item.step}
                  </div>
                  <Text as="p" variant="bodySm" fontWeight={item.done ? "semibold" : "regular"}>
                    {item.label}
                  </Text>
                </div>
              ))}
            </div>

            <Text as="p" variant="bodySm" tone="subdued">
              The button auto-detects product pages and inserts itself after the "Add to cart" button.
              It works with Dawn, Debut, Craft, and most Shopify themes.
              {!scriptTagInstalled && s.enabled && " Save your settings to activate it."}
            </Text>
          </BlockStack>
        </Card>

        {/* Recent clicks table */}
        {recentClicks.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">Recent clicks</Text>
              <DataTable
                columnContentTypes={["text","text","text","text","text"]}
                headings={["Product","Source","UTM Campaign","Converted","Time"]}
                rows={recentClicks.map((c: any) => [
                  c.productId || "—",
                  c.utmSource || (c.gclid ? "Google" : c.fbclid ? "Meta" : "Direct"),
                  c.utmCampaign || "—",
                  c.convertedOrderId ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>,
                  new Date(c.createdAt).toLocaleTimeString(),
                ])}
              />
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

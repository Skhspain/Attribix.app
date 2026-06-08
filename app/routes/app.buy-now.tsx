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
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";
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

  // Check if ScriptTag is installed — and auto-install if settings say enabled
  let scriptTagInstalled = false;
  const APP_URL = process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev";
  const scriptUrl = `${APP_URL}/scripts/buy-now.js`;
  try {
    const tagsRes = await admin.graphql(`
      query { scriptTags(first: 20) { edges { node { id src } } } }
    `);
    const tagsJson = await tagsRes.json();
    const tags = tagsJson?.data?.scriptTags?.edges ?? [];
    scriptTagInstalled = tags.some((e: any) => e.node?.src === scriptUrl);

    // Auto-install if button is enabled but ScriptTag is missing
    const isEnabled = settings?.enabled ?? true;
    if (isEnabled && !scriptTagInstalled) {
      const createRes = await admin.graphql(`
        mutation {
          scriptTagCreate(input: { src: "${scriptUrl}", displayScope: ONLINE_STORE }) {
            scriptTag { id src }
            userErrors { field message }
          }
        }
      `);
      const createJson = await createRes.json();
      const userErrors = createJson?.data?.scriptTagCreate?.userErrors ?? [];
      if (userErrors.length === 0 && createJson?.data?.scriptTagCreate?.scriptTag) {
        scriptTagInstalled = true;
      } else if (userErrors.length > 0) {
        console.error("[buy-now] scriptTagCreate userErrors:", userErrors);
      }
    }
  } catch (e) {
    console.error("[buy-now] loader ScriptTag error:", e);
  }

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
      const createRes = await admin.graphql(`
        mutation {
          scriptTagCreate(input: { src: "${scriptUrl}", displayScope: ONLINE_STORE }) {
            scriptTag { id src }
            userErrors { field message }
          }
        }
      `);
      const createJson = await createRes.json();
      const createErrors = createJson?.data?.scriptTagCreate?.userErrors ?? [];
      if (createErrors.length > 0) {
        console.error("[buy-now] action scriptTagCreate userErrors:", createErrors);
      }
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
  const { settings, scriptTagInstalled, shop } = useLoaderData<typeof loader>();

  const fetcher = useFetcher<any>();
  const authFetch = useAuthenticatedFetch();
  const [s, setS] = useState({
    ...settings,
    showOn: (settings as any).showOn || "product_pages",
    position: (settings as any).position || "below_add_to_cart",
  });
  const [saved, setSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [suggestion, setSuggestion] = useState<null | {
    buttonColor: string; textColor: string; borderRadius: number;
    fontFamily: string | null; themeHint: string; accentColor: string | null;
  }>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const update = (key: string, value: any) => setS((prev: any) => ({ ...prev, [key]: value }));

  const isActive = s.enabled && scriptTagInstalled;
  const needsAttention = s.enabled && !scriptTagInstalled;

  // Enable + immediately save so the ScriptTag gets created right away
  const handleEnable = useCallback(() => {
    const next = { ...s, enabled: true };
    setS(next);
    fetcher.submit(next, { method: "POST", encType: "application/json" });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [s, fetcher]);

  const handleScan = useCallback(async () => {
    setScanning(true); setScanError(null); setSuggestion(null);
    try {
      const res = await authFetch("/api/buy-now/scan-style");
      const data = await res.json().catch(() => null);
      if (data?.ok) setSuggestion(data);
      else setScanError(data?.error ?? "Scan failed");
    } catch (e: any) { setScanError(e.message); }
    finally { setScanning(false); }
  }, [authFetch]);

  const handleSave = useCallback(() => {
    fetcher.submit(s, { method: "POST", encType: "application/json" });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [s, fetcher]);

  // Live preview style
  const btnStyle: React.CSSProperties = {
    width: "100%", background: s.buttonColor, color: s.textColor,
    border: "none", borderRadius: s.borderRadius,
    padding: s.size === "small" ? "8px 16px" : s.size === "large" ? "14px 22px" : "11px 20px",
    fontSize: s.size === "small" ? 13 : s.size === "large" ? 17 : 15,
    fontWeight: 600, cursor: "pointer",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  return (
    <Page
      title="Buy Now Button"
      subtitle="Add a direct checkout button to your product pages. No theme editing required."
      primaryAction={{ content: saved ? "Saved ✓" : "Save settings", onAction: handleSave }}
      secondaryActions={[{
        content: "Preview on store",
        url: `https://${shop}`,
        external: true,
      }]}
    >
      <BlockStack gap="500">

        {/* ── Dynamic status banner ─────────────────────────────── */}
        {isActive ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #BBF7D0", gap: 16 }}>
            <InlineStack gap="300" blockAlign="center">
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 16, fontWeight: 800, flexShrink: 0 }}>✓</div>
              <BlockStack gap="025">
                <Text as="p" variant="headingSm" fontWeight="semibold">Buy Now Button is active on your store</Text>
                <Text as="p" variant="bodySm" tone="subdued">The button is automatically added to product pages and works with your current theme.</Text>
              </BlockStack>
            </InlineStack>
            <Button size="slim" url={`https://${shop}`} external>Preview on store</Button>
          </div>
        ) : needsAttention ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", gap: 16 }}>
            <InlineStack gap="300" blockAlign="center">
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#D97706", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 16, fontWeight: 800, flexShrink: 0 }}>!</div>
              <BlockStack gap="025">
                <Text as="p" variant="headingSm" fontWeight="semibold">Buy Now Button needs attention</Text>
                <Text as="p" variant="bodySm" tone="subdued">The button is enabled, but Attribix could not confirm it is live on your store.</Text>
              </BlockStack>
            </InlineStack>
            <Button size="slim" onClick={handleSave}>Check installation</Button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderRadius: 10, background: "#EFF6FF", border: "1px solid #BFDBFE", gap: 16 }}>
            <InlineStack gap="300" blockAlign="center">
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 16, fontWeight: 800, flexShrink: 0 }}>i</div>
              <BlockStack gap="025">
                <Text as="p" variant="headingSm" fontWeight="semibold">Buy Now Button is ready to set up</Text>
                <Text as="p" variant="bodySm" tone="subdued">Customise the button below, then enable it when you are ready to add it to your product pages.</Text>
              </BlockStack>
            </InlineStack>
            <Button size="slim" variant="primary" onClick={handleEnable}>Enable & publish</Button>
          </div>
        )}

        {/* ── Two-column: Settings + Preview ─────────────────────── */}
        <Grid>
          {/* LEFT: Settings */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 7, xl: 7 }}>
            <BlockStack gap="400">

              {/* 1. Button content */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="025">
                    <Text as="h2" variant="headingMd">1. Button content</Text>
                  </BlockStack>
                  <Divider />
                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                      <TextField label="Button text" value={s.buttonText} onChange={(v) => update("buttonText", v)} autoComplete="off" />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                      <Select
                        label="After click"
                        options={[
                          { label: "Go to checkout", value: "checkout" },
                          { label: "Add to cart", value: "cart" },
                          { label: "Go to product page", value: "product" },
                        ]}
                        value={s.action}
                        onChange={(v) => update("action", v)}
                      />
                    </Grid.Cell>
                  </Grid>
                </BlockStack>
              </Card>

              {/* 2. Design */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">2. Design</Text>
                    <Button size="slim" onClick={handleScan} loading={scanning} variant="plain">
                      {scanning ? "Scanning…" : "Match my store style"}
                    </Button>
                  </InlineStack>
                  <Divider />

                  {scanError && <Text as="p" variant="bodySm" tone="critical">{scanError}</Text>}

                  {suggestion && (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">Detected theme: <strong>{suggestion.themeHint}</strong></Text>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                        {[
                          { label: "Exact match", color: suggestion.buttonColor, text: suggestion.textColor, radius: suggestion.borderRadius },
                          { label: "Pill", color: suggestion.buttonColor, text: suggestion.textColor, radius: 50 },
                          { label: "Outlined", color: "transparent", text: suggestion.buttonColor, radius: suggestion.borderRadius, border: `2px solid ${suggestion.buttonColor}` },
                        ].map((v) => (
                          <div key={v.label} onClick={() => { update("buttonColor", v.color === "transparent" ? "#ffffff" : v.color); update("textColor", v.text); update("borderRadius", v.radius); }}
                            style={{ border: "1px solid #e1e3e5", borderRadius: 8, padding: 10, cursor: "pointer", textAlign: "center" }}>
                            <button style={{ background: v.color, color: v.text, border: (v as any).border ?? "none", borderRadius: v.radius, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                              {s.buttonText || "Buy Now"}
                            </button>
                            <Text as="p" variant="bodySm" tone="subdued">{v.label}</Text>
                          </div>
                        ))}
                      </div>
                    </BlockStack>
                  )}

                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                      <TextField label="Button colour" value={s.buttonColor} onChange={(v) => update("buttonColor", v)} autoComplete="off"
                        prefix={
                          <div style={{ position: "relative", width: 22, height: 22, flexShrink: 0 }}>
                            <div style={{ width: 22, height: 22, borderRadius: 5, background: s.buttonColor, border: "1px solid #ccc" }} />
                            <input type="color" value={s.buttonColor} onChange={e => update("buttonColor", e.target.value)}
                              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
                          </div>
                        } />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                      <TextField label="Text colour" value={s.textColor} onChange={(v) => update("textColor", v)} autoComplete="off"
                        prefix={
                          <div style={{ position: "relative", width: 22, height: 22, flexShrink: 0 }}>
                            <div style={{ width: 22, height: 22, borderRadius: 5, background: s.textColor, border: "1px solid #ccc" }} />
                            <input type="color" value={s.textColor} onChange={e => update("textColor", e.target.value)}
                              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
                          </div>
                        } />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                      <Select label="Size" options={[{ label: "Small", value: "small" }, { label: "Medium", value: "medium" }, { label: "Large", value: "large" }]} value={s.size} onChange={(v) => update("size", v)} />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                      <TextField label="Border radius (px)" type="number" value={String(s.borderRadius)} onChange={(v) => update("borderRadius", parseInt(v, 10) || 0)} autoComplete="off" />
                    </Grid.Cell>
                  </Grid>
                </BlockStack>
              </Card>

              {/* 3. Placement */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">3. Placement</Text>
                  <Divider />
                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                      <Select label="Show on" options={[{ label: "Product pages", value: "product_pages" }, { label: "All pages", value: "all_pages" }]}
                        value={s.showOn} onChange={(v) => update("showOn", v)} />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                      <Select label="Position" options={[{ label: "Below Add to cart", value: "below_add_to_cart" }, { label: "Above Add to cart", value: "above_add_to_cart" }]}
                        value={s.position} onChange={(v) => update("position", v)} />
                    </Grid.Cell>
                  </Grid>
                  <Text as="p" variant="bodySm" tone="subdued">Settings are applied automatically. No theme editing required.</Text>
                </BlockStack>
              </Card>

            </BlockStack>
          </Grid.Cell>

          {/* RIGHT: Live preview */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 5, xl: 5 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Live preview</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Updates as you edit</Text>
                </InlineStack>
                <Divider />

                {/* Product page mockup */}
                <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", background: "white" }}>
                  {/* Product image */}
                  <div style={{ background: "#F3F4F6", height: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 56 }}>🎒</span>
                  </div>
                  <div style={{ padding: "16px" }}>
                    {/* Stars */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                      {"★★★★★".split("").map((s, i) => <span key={i} style={{ color: "#F59E0B", fontSize: 13 }}>{s}</span>)}
                      <span style={{ fontSize: 12, color: "#6B7280" }}>(128)</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>TrailDay Backpack</div>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>$79.00</div>

                    {/* Size selector */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#374151" }}>Size</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {["S", "M", "L", "XL"].map((sz) => (
                          <div key={sz} style={{ padding: "4px 10px", border: sz === "M" ? "2px solid #111" : "1px solid #D1D5DB", borderRadius: 4, fontSize: 12, fontWeight: sz === "M" ? 600 : 400 }}>{sz}</div>
                        ))}
                      </div>
                    </div>

                    {/* Add to cart */}
                    <button style={{ width: "100%", padding: "11px 20px", background: "white", border: "1px solid #D1D5DB", borderRadius: 6, fontWeight: 600, fontSize: 14, marginBottom: 8, cursor: "default" }}>
                      Add to cart
                    </button>

                    {/* Buy Now — live styled */}
                    <button style={btnStyle}>{s.buttonText || "Buy Now"}</button>
                  </div>
                </div>

                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  This is a preview of how the button will appear on your product pages.
                </Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* ── How installation works ───────────────────────────── */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="025">
              <Text as="h2" variant="headingMd">How installation works</Text>
              <Text as="p" variant="bodySm" tone="subdued">Attribix automatically installs the Buy Now button across your store.</Text>
            </BlockStack>
            <Divider />
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", gap: 12, alignItems: "center" }}>
              {[
                { icon: "✓", label: "1. Enable the button", desc: "Turn on the button and configure its content and design.", done: s.enabled },
                null,
                { icon: "↑", label: "2. Auto-install", desc: "We automatically add the button to your product pages.", done: scriptTagInstalled },
                null,
                { icon: "🏪", label: "3. Live on store", desc: "Your Buy Now button is live and ready for customers to use.", done: isActive },
              ].map((item, i) => item === null ? (
                <div key={i} style={{ textAlign: "center", color: "#D1D5DB", fontSize: 24 }}>→</div>
              ) : (
                <div key={item.label} style={{ background: item.done ? "#F0FDF4" : "#F9FAFB", border: `1px solid ${item.done ? "#BBF7D0" : "#E5E7EB"}`, borderRadius: 10, padding: "16px" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: item.done ? "#16A34A" : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", color: item.done ? "white" : "#9CA3AF", fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                    {item.done ? "✓" : item.icon}
                  </div>
                  <Text as="p" variant="headingSm" fontWeight="semibold">{item.label}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{item.desc}</Text>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 14px", background: "#F9FAFB", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>🛡️</span>
              <Text as="p" variant="bodySm" tone="subdued">No theme editing or code required. Works with Dawn, Debut, Craft, and most Shopify themes.</Text>
            </div>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}

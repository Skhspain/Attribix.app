// app/routes/app.seo._index.tsx
// SEO Audit — fetches all products from Shopify, scores them, surfaces issues.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import {
  Page, Card, BlockStack, InlineStack, Text, Badge, Button,
  Grid, ProgressBar, DataTable, Spinner, Divider, Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

const METAFIELD_LIMIT = 50;

// ─── Scoring ──────────────────────────────────────────────────────────────────

interface ProductAudit {
  id: string;
  title: string;
  handle: string;
  url: string;
  image: string | null;
  score: number;           // 0–100
  issues: Issue[];
}

interface Issue {
  field: string;
  severity: "error" | "warning" | "info";
  message: string;
}

function scoreProduct(p: any): ProductAudit {
  const issues: Issue[] = [];
  let deductions = 0;

  // ── Meta title ──
  const metaTitle: string = p.metafields?.find((m: any) => m.namespace === "global" && m.key === "title_tag")?.value || "";
  const titleFallback = p.title || "";
  const effectiveTitle = metaTitle || titleFallback;

  if (!metaTitle) {
    issues.push({ field: "Meta Title", severity: "warning", message: "No custom meta title set — using product title as fallback" });
    deductions += 10;
  } else if (effectiveTitle.length < 30) {
    issues.push({ field: "Meta Title", severity: "warning", message: `Too short (${effectiveTitle.length} chars) — aim for 30–60` });
    deductions += 8;
  } else if (effectiveTitle.length > 60) {
    issues.push({ field: "Meta Title", severity: "warning", message: `Too long (${effectiveTitle.length} chars) — Google truncates at ~60` });
    deductions += 8;
  }

  // ── Meta description ──
  const metaDesc: string = p.metafields?.find((m: any) => m.namespace === "global" && m.key === "description_tag")?.value || "";
  if (!metaDesc) {
    issues.push({ field: "Meta Description", severity: "error", message: "Missing meta description — critical for CTR in search results" });
    deductions += 25;
  } else if (metaDesc.length < 120) {
    issues.push({ field: "Meta Description", severity: "warning", message: `Too short (${metaDesc.length} chars) — aim for 120–160` });
    deductions += 10;
  } else if (metaDesc.length > 160) {
    issues.push({ field: "Meta Description", severity: "info", message: `Too long (${metaDesc.length} chars) — Google truncates at ~160` });
    deductions += 5;
  }

  // ── Image alt text ──
  const images: any[] = p.images || [];
  const missingAlt = images.filter((img: any) => !img.alt || img.alt.trim() === "").length;
  if (images.length === 0) {
    issues.push({ field: "Images", severity: "warning", message: "No images — products with images rank better" });
    deductions += 10;
  } else if (missingAlt === images.length) {
    issues.push({ field: "Alt Text", severity: "error", message: `All ${images.length} image(s) missing alt text` });
    deductions += 15;
  } else if (missingAlt > 0) {
    issues.push({ field: "Alt Text", severity: "warning", message: `${missingAlt} of ${images.length} image(s) missing alt text` });
    deductions += 8;
  }

  // ── Body / description ──
  const body: string = p.body_html || "";
  const wordCount = body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) {
    issues.push({ field: "Description", severity: "error", message: "No product description — thin content hurts rankings" });
    deductions += 20;
  } else if (wordCount < 50) {
    issues.push({ field: "Description", severity: "warning", message: `Very short description (${wordCount} words) — aim for 100+` });
    deductions += 10;
  }

  // ── Handle / URL slug ──
  const handle: string = p.handle || "";
  const stopWords = ["the", "a", "an", "and", "or", "of", "in", "is", "it", "to", "for"];
  const handleWords = handle.split("-");
  const allStopWords = handleWords.every((w: string) => stopWords.includes(w));
  if (handle.length > 60) {
    issues.push({ field: "URL Slug", severity: "info", message: `Handle is long (${handle.length} chars) — shorter URLs are preferred` });
    deductions += 3;
  }

  const score = Math.max(0, 100 - deductions);

  return {
    id: String(p.id),
    title: p.title,
    handle,
    url: `https://${p.shop}/products/${handle}`,
    image: images[0]?.src || null,
    score,
    issues,
  };
}

// ─── Shopify fetchers (GraphQL) ───────────────────────────────────────────────

async function fetchAllProducts(admin: any): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;

  do {
    const query = `#graphql
      query FetchProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
              descriptionHtml
              images(first: 10) {
                edges { node { url altText } }
              }
              metafields(first: 5, namespace: "global") {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `;
    const res = await admin.graphql(query, { variables: { first: 50, after: cursor } });
    const data = await res.json();
    const productsPage = data?.data?.products;
    if (!productsPage) break;

    for (const edge of productsPage.edges ?? []) {
      const node = edge.node;
      all.push({
        id: node.id,
        title: node.title,
        handle: node.handle,
        body_html: node.descriptionHtml ?? "",
        images: (node.images?.edges ?? []).map((e: any) => ({ src: e.node.url, alt: e.node.altText })),
        metafields: (node.metafields?.edges ?? []).map((e: any) => e.node),
      });
    }

    const pageInfo = productsPage.pageInfo;
    cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor && all.length < 2000);

  return all;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch all products with metafields via GraphQL (includes global metafields inline)
  const products = await fetchAllProducts(admin);
  const allEnriched = products.map((p) => ({ ...p, shop }));

  const audits = allEnriched.map(scoreProduct);

  // ── Aggregate stats ──
  const totalProducts = audits.length;
  const avgScore = totalProducts > 0
    ? Math.round(audits.reduce((s, a) => s + a.score, 0) / totalProducts)
    : 0;

  const missingMetaDesc = audits.filter(a => a.issues.some(i => i.field === "Meta Description" && i.severity === "error")).length;
  const missingAltText  = audits.filter(a => a.issues.some(i => i.field === "Alt Text")).length;
  const thinContent     = audits.filter(a => a.issues.some(i => i.field === "Description" && i.severity === "error")).length;
  const missingMetaTitle = audits.filter(a => a.issues.some(i => i.field === "Meta Title" && i.severity === "warning" && i.message.startsWith("No custom"))).length;

  const errorCount   = audits.filter(a => a.score < 50).length;
  const warningCount = audits.filter(a => a.score >= 50 && a.score < 80).length;
  const goodCount    = audits.filter(a => a.score >= 80).length;

  // Sort by score ascending (worst first) for the issues table
  const sorted = [...audits].sort((a, b) => a.score - b.score);

  return json({
    shop,
    totalProducts,
    avgScore,
    missingMetaDesc,
    missingAltText,
    thinContent,
    missingMetaTitle,
    errorCount,
    warningCount,
    goodCount,
    products: sorted,
    metafieldLimit: METAFIELD_LIMIT,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreBadge(score: number) {
  if (score >= 80) return <Badge tone="success">{score}</Badge>;
  if (score >= 50) return <Badge tone="attention">{score}</Badge>;
  return <Badge tone="critical">{score}</Badge>;
}

function scoreColor(score: number) {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function severityIcon(s: "error" | "warning" | "info") {
  if (s === "error")   return "🔴";
  if (s === "warning") return "🟡";
  return "🔵";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SeoIndex() {
  const {
    shop, totalProducts, avgScore,
    missingMetaDesc, missingAltText, thinContent, missingMetaTitle,
    errorCount, warningCount, goodCount,
    products, metafieldLimit,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const { revalidate, state } = useRevalidator();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "good">("all");

  const filtered = products.filter(p => {
    if (filter === "error")   return p.score < 50;
    if (filter === "warning") return p.score >= 50 && p.score < 80;
    if (filter === "good")    return p.score >= 80;
    return true;
  });

  const toggle = useCallback((id: string) => {
    setExpanded(prev => prev === id ? null : id);
  }, []);

  const storeGrade =
    avgScore >= 80 ? "A" :
    avgScore >= 65 ? "B" :
    avgScore >= 50 ? "C" :
    avgScore >= 35 ? "D" : "F";

  const gradeColor =
    avgScore >= 80 ? "#22c55e" :
    avgScore >= 65 ? "#84cc16" :
    avgScore >= 50 ? "#f59e0b" :
    avgScore >= 35 ? "#f97316" : "#ef4444";

  return (
    <Page
      title="SEO Audit"
      subtitle={`${totalProducts} products scanned`}
      primaryAction={{ content: state === "loading" ? "Scanning…" : "Re-scan", onAction: revalidate, loading: state === "loading" }}
    >
      <BlockStack gap="500">

        {/* ── Store Score ── */}
        <Card>
          <InlineStack gap="800" align="start" blockAlign="center" wrap={false}>
            {/* Grade circle */}
            <div style={{
              width: 96, height: 96, borderRadius: "50%",
              background: gradeColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: "#fff" }}>{storeGrade}</span>
            </div>

            <BlockStack gap="200" inlineSize="100%">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">Overall SEO Score</Text>
                <Text variant="headingLg" as="p" tone={avgScore >= 80 ? "success" : avgScore >= 50 ? "caution" : "critical"}>
                  {avgScore} / 100
                </Text>
              </InlineStack>
              <ProgressBar progress={avgScore} tone={avgScore >= 80 ? "success" : avgScore >= 50 ? "warning" : "critical"} size="medium" />
              <InlineStack gap="400">
                <Text variant="bodySm" tone="critical">🔴 {errorCount} critical</Text>
                <Text variant="bodySm" tone="caution">🟡 {warningCount} needs work</Text>
                <Text variant="bodySm" tone="success">🟢 {goodCount} good</Text>
              </InlineStack>
            </BlockStack>
          </InlineStack>
        </Card>

        {/* ── Issue Summary ── */}
        <Grid columns={{ xs: 2, sm: 2, md: 4, lg: 4, xl: 4 }}>
          {[
            { label: "Missing Meta Description", count: missingMetaDesc, color: "#ef4444", tip: "Critical — directly impacts click-through rate" },
            { label: "Missing Alt Text",         count: missingAltText,  color: "#f97316", tip: "Image alt text helps Google understand your products" },
            { label: "Thin Content",             count: thinContent,     color: "#f59e0b", tip: "Less than 50 words — Google prefers detailed descriptions" },
            { label: "No Custom Meta Title",     count: missingMetaTitle,color: "#eab308", tip: "Shopify uses product title as fallback — not always ideal" },
          ].map(({ label, count, color, tip }) => (
            <Grid.Cell key={label}>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingXl" as="p" fontWeight="bold">
                    <span style={{ color }}>{count}</span>
                  </Text>
                  <Text variant="bodyMd" as="p">{label}</Text>
                  <Text variant="bodySm" tone="subdued">{tip}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          ))}
        </Grid>

        {/* ── Quick Wins ── */}
        {missingMetaDesc > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">⚡ Quick Wins</Text>
              <Text variant="bodySm" tone="subdued">Fix these first — highest impact on organic traffic</Text>
              <Divider />
              <BlockStack gap="200">
                {missingMetaDesc > 0 && (
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text variant="bodyMd" fontWeight="semibold">Add meta descriptions to {missingMetaDesc} product{missingMetaDesc > 1 ? "s" : ""}</Text>
                      <Text variant="bodySm" tone="subdued">Meta descriptions directly affect CTR — each one you add can increase clicks by 5–10%</Text>
                    </BlockStack>
                    <Badge tone="critical">High impact</Badge>
                  </InlineStack>
                )}
                {missingAltText > 0 && (
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text variant="bodyMd" fontWeight="semibold">Add alt text to images on {missingAltText} product{missingAltText > 1 ? "s" : ""}</Text>
                      <Text variant="bodySm" tone="subdued">Helps Google Images index your products and improves accessibility</Text>
                    </BlockStack>
                    <Badge tone="attention">Medium impact</Badge>
                  </InlineStack>
                )}
                {thinContent > 0 && (
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text variant="bodyMd" fontWeight="semibold">Expand descriptions on {thinContent} product{thinContent > 1 ? "s" : ""}</Text>
                      <Text variant="bodySm" tone="subdued">Products with 100+ word descriptions rank significantly better</Text>
                    </BlockStack>
                    <Badge tone="attention">Medium impact</Badge>
                  </InlineStack>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* ── Product Table ── */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">Products</Text>
              <InlineStack gap="200">
                {(["all", "error", "warning", "good"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 6,
                      border: "1px solid",
                      borderColor: filter === f ? "#4f46e5" : "#e5e7eb",
                      background: filter === f ? "#4f46e5" : "#fff",
                      color: filter === f ? "#fff" : "#374151",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {f === "all" ? `All (${products.length})` :
                     f === "error" ? `🔴 Critical (${errorCount})` :
                     f === "warning" ? `🟡 Needs work (${warningCount})` :
                     `🟢 Good (${goodCount})`}
                  </button>
                ))}
              </InlineStack>
            </InlineStack>

            <Divider />

            {filtered.length === 0 && (
              <Box padding="600">
                <Text alignment="center" tone="subdued">No products in this category.</Text>
              </Box>
            )}

            <BlockStack gap="0">
              {filtered.map((product, idx) => (
                <div key={product.id}>
                  {idx > 0 && <Divider />}
                  <div
                    onClick={() => toggle(product.id)}
                    style={{ padding: "12px 0", cursor: "pointer" }}
                  >
                    <InlineStack align="space-between" blockAlign="center" wrap={false} gap="400">
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        {/* Score ring */}
                        <div style={{
                          width: 44, height: 44, borderRadius: "50%",
                          border: `3px solid ${scoreColor(product.score)}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(product.score) }}>
                            {product.score}
                          </span>
                        </div>

                        {/* Product image */}
                        {product.image && (
                          <img
                            src={product.image}
                            alt=""
                            style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                          />
                        )}

                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="semibold">{product.title}</Text>
                          <Text variant="bodySm" tone="subdued">/{product.handle}</Text>
                        </BlockStack>
                      </InlineStack>

                      <InlineStack gap="200" blockAlign="center" wrap={false}>
                        {/* Issue pills */}
                        <InlineStack gap="100" wrap={false}>
                          {product.issues.filter(i => i.severity === "error").length > 0 && (
                            <Badge tone="critical">
                              {product.issues.filter(i => i.severity === "error").length} error{product.issues.filter(i => i.severity === "error").length > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {product.issues.filter(i => i.severity === "warning").length > 0 && (
                            <Badge tone="attention">
                              {product.issues.filter(i => i.severity === "warning").length} warning{product.issues.filter(i => i.severity === "warning").length > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {product.issues.length === 0 && <Badge tone="success">Perfect</Badge>}
                        </InlineStack>

                        <Text tone="subdued" variant="bodySm">
                          {expanded === product.id ? "▲" : "▼"}
                        </Text>
                      </InlineStack>
                    </InlineStack>

                    {/* Expanded issues */}
                    {expanded === product.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          marginTop: 12,
                          marginLeft: 56,
                          background: "#f9fafb",
                          borderRadius: 8,
                          padding: "12px 16px",
                        }}
                      >
                        {product.issues.length === 0 ? (
                          <Text tone="success" variant="bodySm">✅ No issues found — this product is well optimised!</Text>
                        ) : (
                          <BlockStack gap="200">
                            {product.issues.map((issue, i) => (
                              <InlineStack key={i} gap="200" blockAlign="start" wrap={false}>
                                <span style={{ flexShrink: 0 }}>{severityIcon(issue.severity)}</span>
                                <BlockStack gap="0">
                                  <Text variant="bodySm" fontWeight="semibold">{issue.field}</Text>
                                  <Text variant="bodySm" tone="subdued">{issue.message}</Text>
                                </BlockStack>
                              </InlineStack>
                            ))}
                            <div style={{ marginTop: 8 }}>
                              <Button
                                size="slim"
                                url={`https://${shop}/admin/products/${product.id}`}
                                target="_blank"
                              >
                                Edit in Shopify →
                              </Button>
                            </div>
                          </BlockStack>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </BlockStack>

            {metafieldLimit < products.length && (
              <Box paddingBlockStart="200">
                <Text variant="bodySm" tone="subdued" alignment="center">
                  ℹ️ Meta title/description data shown for first {metafieldLimit} products. Re-scan loads more.
                </Text>
              </Box>
            )}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}

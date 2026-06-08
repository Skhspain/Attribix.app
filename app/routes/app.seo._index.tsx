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

  // Estimated score after fixing all flagged issues
  const estimatedAvgScore = totalProducts > 0
    ? Math.min(100, Math.round(avgScore + (missingMetaDesc * 25 + thinContent * 20 + missingAltText * 15 + missingMetaTitle * 10) / totalProducts))
    : 0;

  return json({
    shop,
    totalProducts,
    avgScore,
    estimatedAvgScore,
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

function statusLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: "Good", color: "#15803D", bg: "#DCFCE7" };
  if (score >= 50) return { label: "Needs work", color: "#92400E", bg: "#FEF3C7" };
  return { label: "Critical", color: "#991B1B", bg: "#FEE2E2" };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SeoIndex() {
  const {
    shop, totalProducts, avgScore, estimatedAvgScore,
    missingMetaDesc, missingAltText, thinContent, missingMetaTitle,
    errorCount, warningCount, goodCount,
    products, metafieldLimit,
  } = useLoaderData<typeof loader>();

  const { revalidate, state } = useRevalidator();
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "good">("all");
  const [selectedId, setSelectedId] = useState<string | null>(products[0]?.id ? products[0].id.split("/").pop() ?? null : null);

  const numericId = (gid: string) => gid.split("/").pop() ?? gid;

  const storeGrade = avgScore >= 80 ? "A" : avgScore >= 65 ? "B" : avgScore >= 50 ? "C" : avgScore >= 35 ? "D" : "F";
  const gradeColor = avgScore >= 80 ? "#22c55e" : avgScore >= 65 ? "#84cc16" : avgScore >= 50 ? "#f59e0b" : avgScore >= 35 ? "#f97316" : "#ef4444";
  const scoreDesc = avgScore >= 80 ? "Your store's SEO is in great shape!" : avgScore >= 50 ? "Your SEO needs some work." : "Your SEO needs attention.";

  const filtered = products.filter(p => {
    if (filter === "error")   return p.score < 50;
    if (filter === "warning") return p.score >= 50 && p.score < 80;
    if (filter === "good")    return p.score >= 80;
    return true;
  });

  const selectedProduct = products.find(p => numericId(p.id) === selectedId) ?? null;

  const fixes = [
    missingMetaDesc > 0 && { icon: "⭐", title: `Add meta descriptions to ${missingMetaDesc} product${missingMetaDesc > 1 ? "s" : ""}`, desc: `Meta descriptions directly affect CTR — each one you add can increase clicks by 5–10%.`, impact: "High impact", color: "#EF4444" },
    thinContent > 0 && { icon: "⭐", title: `Expand descriptions on ${thinContent} product${thinContent > 1 ? "s" : ""}`, desc: "Products with 100+ word descriptions rank significantly better.", impact: "Medium impact", color: "#F59E0B" },
    missingAltText > 0 && { icon: "☆", title: `Add alt text to images on ${missingAltText} product${missingAltText > 1 ? "s" : ""}`, desc: "Helps Google Images index your products.", impact: "Medium impact", color: "#F59E0B" },
    missingMetaTitle > 0 && { icon: "☆", title: `Set custom meta titles on ${missingMetaTitle} product${missingMetaTitle > 1 ? "s" : ""}`, desc: "Shopify uses the product title as fallback — custom titles are better.", impact: "Low impact", color: "#9CA3AF" },
  ].filter(Boolean) as Array<{ icon: string; title: string; desc: string; impact: string; color: string }>;

  return (
    <Page
      title="SEO Audit"
      subtitle={`Last scan: Just now • ${totalProducts} product${totalProducts !== 1 ? "s" : ""} scanned`}
      primaryAction={{ content: state === "loading" ? "Scanning…" : "Re-scan", onAction: revalidate, loading: state === "loading", icon: undefined }}
      secondaryActions={[{
        content: "Export report",
        onAction: () => {
          const csv = ["Product,Score,Issues,Status"].concat(products.map(p => `"${p.title}",${p.score},"${p.issues.map(i => i.field).join("; ")}","${statusLabel(p.score).label}"`)).join("\n");
          const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "seo-audit.csv"; a.click();
        }
      }]}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>

        {/* ── MAIN CONTENT ───────────────────────────────────── */}
        <BlockStack gap="400">

          {/* Score card (3 columns) */}
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
              {/* Column 1: grade + score */}
              <div style={{ display: "flex", gap: 20, alignItems: "center", paddingRight: 24, borderRight: "1px solid #F3F4F6" }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: gradeColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>{storeGrade}</span>
                </div>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Overall SEO Score</Text>
                  <Text as="p" variant="headingXl" fontWeight="bold"><span style={{ color: gradeColor }}>{avgScore} / 100</span></Text>
                  <div style={{ width: "100%", background: "#F3F4F6", borderRadius: 4, height: 6 }}>
                    <div style={{ width: `${avgScore}%`, background: gradeColor, borderRadius: 4, height: "100%", transition: "width 0.5s" }} />
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued">{scoreDesc}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Fix the issues below to improve your rankings and get more traffic to your store.</Text>
                </BlockStack>
              </div>

              {/* Column 2: estimated after fixes */}
              <div style={{ padding: "0 24px", borderRight: "1px solid #F3F4F6" }}>
                <Text as="p" variant="bodySm" tone="subdued">Estimated score after fixes</Text>
                <Text as="p" variant="headingXl" fontWeight="bold"><span style={{ color: "#22c55e" }}>{estimatedAvgScore} / 100</span></Text>
                <div style={{ width: "100%", background: "#F3F4F6", borderRadius: 4, height: 6, marginTop: 4, marginBottom: 8 }}>
                  <div style={{ width: `${estimatedAvgScore}%`, background: "#22c55e", borderRadius: 4, height: "100%", transition: "width 0.5s" }} />
                </div>
                <Text as="p" variant="bodySm" tone="success"><strong>Great!</strong> Fixing the critical issues can significantly improve your SEO score.</Text>
              </div>

              {/* Column 3: what is SEO score */}
              <div style={{ paddingLeft: 24 }}>
                <Text as="p" variant="bodyMd" fontWeight="semibold">What is SEO Score?</Text>
                <Text as="p" variant="bodySm" tone="subdued">We analyze key on-page SEO factors that impact your search rankings.</Text>
                <div style={{ marginTop: 10 }}>
                  {["Meta titles & descriptions", "Content quality", "Image alt text", "Technical basics"].map(item => (
                    <div key={item} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ color: "#16A34A", fontSize: 14 }}>✓</span>
                      <Text as="p" variant="bodySm">{item}</Text>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text as="p" variant="bodySm"><a href="#" style={{ color: "#008060" }}>Learn more about SEO scoring ↗</a></Text>
                </div>
              </div>
            </div>
          </Card>

          {/* Issue cards row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { field: "Missing Meta Description", count: missingMetaDesc, severity: "Critical", color: "#EF4444", bg: "#FEF2F2", icon: "📝", desc: "Directly impacts click-through rate" },
              { field: "Missing Alt Text", count: missingAltText, severity: "Needs work", color: "#F97316", bg: "#FFF7ED", icon: "🖼️", desc: "Helps search engines understand your images" },
              { field: "Thin Content", count: thinContent, severity: "Needs work", color: "#F59E0B", bg: "#FFFBEB", icon: "✏️", desc: "Less than 50 words — Google prefers detailed descriptions" },
              { field: "This is not a Meta Title", count: missingMetaTitle, severity: "Critical", color: "#EF4444", bg: "#FEF2F2", icon: "🏷️", desc: "Your product title is used as fallback, not always ideal" },
            ].map((card, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "16px", position: "relative" }}>
                <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{card.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: card.bg, color: card.color }}>{card.severity}</span>
                </div>
                <Text as="p" variant="headingXl" fontWeight="bold">{card.count}</Text>
                <Text as="p" variant="bodyMd" fontWeight="semibold">{card.field}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{card.desc}</Text>
                {card.count > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: "#008060", fontWeight: 600, cursor: "pointer" }}>
                      {card.count} product{card.count !== 1 ? "s" : ""} affected
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Recommended fixes */}
          {fixes.length > 0 && (
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ fontSize: 18 }}>📈</span>
                  <BlockStack gap="025">
                    <Text as="h2" variant="headingMd">Recommended fixes</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Start with these improvements for the biggest SEO impact.</Text>
                  </BlockStack>
                </InlineStack>
                <Divider />
                <BlockStack gap="200">
                  {fixes.slice(0, 4).map((fix, i) => (
                    <InlineStack key={i} align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="start">
                        <span style={{ fontSize: 18, marginTop: 2 }}>{fix.icon}</span>
                        <BlockStack gap="025">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">{fix.title}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{fix.desc}</Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 99, background: fix.color + "18", color: fix.color, whiteSpace: "nowrap" }}>
                          {fix.impact}
                        </span>
                        <Button size="slim" onClick={() => selectedProduct && window.open(`https://${shop}/admin/products/${numericId(selectedProduct.id)}`, "_blank")}>
                          Fix now
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  ))}
                </BlockStack>
                {fixes.length > 0 && (
                  <div style={{ textAlign: "center", paddingTop: 4 }}>
                    <span style={{ fontSize: 13, color: "#008060", fontWeight: 600, cursor: "pointer" }}>View all issues →</span>
                  </div>
                )}
              </BlockStack>
            </Card>
          )}

          {/* Products table */}
          <Card padding="0">
            {/* Header */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6" }}>
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Products</Text>
                <InlineStack gap="100">
                  {(["all", "error", "warning", "good"] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)} style={{
                      padding: "4px 12px", borderRadius: 8, border: "1.5px solid",
                      borderColor: filter === f ? "#008060" : "#E5E7EB",
                      background: filter === f ? "#008060" : "#fff",
                      color: filter === f ? "#fff" : "#374151",
                      cursor: "pointer", fontSize: 12, fontWeight: 600,
                    }}>
                      {f === "all" ? `All (${products.length})` :
                       f === "error" ? `🔴 Critical (${errorCount})` :
                       f === "warning" ? `🟡 Needs work (${warningCount})` :
                       `🟢 Good (${goodCount})`}
                    </button>
                  ))}
                </InlineStack>
              </InlineStack>
            </div>

            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 130px 140px 90px 100px 100px", padding: "8px 20px", background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
              {["Product", "SEO Score", "Issues", "Status", "Last scanned", "Action"].map(h => (
                <Text key={h} as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{h}</Text>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <Text as="p" tone="subdued">No products in this category.</Text>
              </div>
            ) : (
              filtered.map((product, idx) => {
                const pid = numericId(product.id);
                const errors = product.issues.filter(i => i.severity === "error").length;
                const warnings = product.issues.filter(i => i.severity === "warning").length;
                const status = statusLabel(product.score);
                const isSelected = selectedId === pid;
                return (
                  <div key={pid}>
                    {idx > 0 && <div style={{ height: 1, background: "#F3F4F6" }} />}
                    <div
                      onClick={() => setSelectedId(pid)}
                      style={{ display: "grid", gridTemplateColumns: "2fr 130px 140px 90px 100px 100px", padding: "14px 20px", alignItems: "center", cursor: "pointer", background: isSelected ? "#F0FDF4" : undefined }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#FAFAFA"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? "#F0FDF4" : ""; }}
                    >
                      {/* Product */}
                      <InlineStack gap="200" blockAlign="center">
                        {product.image
                          ? <img src={product.image} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                          : <div style={{ width: 40, height: 40, background: "#F3F4F6", borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🛍️</div>
                        }
                        <BlockStack gap="0">
                          <Text as="p" variant="bodySm" fontWeight="semibold">{product.title}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">/{product.handle}</Text>
                        </BlockStack>
                      </InlineStack>

                      {/* SEO Score */}
                      <InlineStack gap="150" blockAlign="center">
                        <div style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid ${scoreColor(product.score)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(product.score) }}>{product.score}</span>
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">/ 100</Text>
                      </InlineStack>

                      {/* Issues */}
                      <InlineStack gap="100" wrap={false}>
                        {errors > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#FEE2E2", color: "#991B1B" }}>{errors} error{errors > 1 ? "s" : ""}</span>}
                        {warnings > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#FEF3C7", color: "#92400E" }}>{warnings} warning{warnings > 1 ? "s" : ""}</span>}
                        {product.issues.length === 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#DCFCE7", color: "#15803D" }}>None</span>}
                      </InlineStack>

                      {/* Status */}
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: status.bg, color: status.color }}>{status.label}</span>

                      {/* Last scanned */}
                      <Text as="p" variant="bodySm" tone="subdued">Just now</Text>

                      {/* Action */}
                      <Button size="slim" onClick={() => window.open(`https://${shop}/admin/products/${pid}`, "_blank")}>
                        Fix SEO
                      </Button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Footer */}
            <div style={{ padding: "10px 20px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Text as="p" variant="bodySm" tone="subdued">Showing 1 to {filtered.length} of {filtered.length} product{filtered.length !== 1 ? "s" : ""}</Text>
              <InlineStack gap="100">
                <button style={{ width: 30, height: 30, border: "1px solid #E5E7EB", borderRadius: 6, background: "#F3F4F6", cursor: "not-allowed", color: "#D1D5DB" }}>‹</button>
                <button style={{ width: 30, height: 30, border: "1.5px solid #008060", borderRadius: 6, background: "#008060", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>1</button>
                <button style={{ width: 30, height: 30, border: "1px solid #E5E7EB", borderRadius: 6, background: "#F3F4F6", cursor: "not-allowed", color: "#D1D5DB" }}>›</button>
              </InlineStack>
            </div>
          </Card>

        </BlockStack>

        {/* ── RIGHT SIDEBAR ────────────────────────────────────── */}
        <BlockStack gap="300">

          {/* Selected product panel */}
          {selectedProduct ? (
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="start">
                  <BlockStack gap="025">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{selectedProduct.title}</Text>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, ...statusLabel(selectedProduct.score) as any, background: statusLabel(selectedProduct.score).bg, color: statusLabel(selectedProduct.score).color }}>
                      {statusLabel(selectedProduct.score).label}
                    </span>
                    <Text as="p" variant="bodySm" tone="subdued">{selectedProduct.issues.length} issue{selectedProduct.issues.length !== 1 ? "s" : ""} found</Text>
                  </BlockStack>
                  <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#9CA3AF" }}>✕</button>
                </InlineStack>

                <Divider />

                <Text as="p" variant="bodySm" fontWeight="semibold">Issues found</Text>
                <BlockStack gap="150">
                  {selectedProduct.issues.length === 0 ? (
                    <Text as="p" variant="bodySm" tone="success">✅ No issues found!</Text>
                  ) : (
                    selectedProduct.issues.map((issue, i) => (
                      <InlineStack key={i} gap="150" blockAlign="center">
                        <span style={{ fontSize: 14 }}>{severityIcon(issue.severity)}</span>
                        <div>
                          <Text as="p" variant="bodySm" fontWeight="semibold">{issue.field}</Text>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: issue.severity === "error" ? "#FEE2E2" : "#FEF3C7", color: issue.severity === "error" ? "#991B1B" : "#92400E" }}>
                            {issue.severity === "error" ? "Critical" : "Needs work"}
                          </span>
                        </div>
                      </InlineStack>
                    ))
                  )}
                </BlockStack>

                <Divider />

                <Text as="p" variant="bodySm" fontWeight="semibold">Quick actions</Text>
                <BlockStack gap="100">
                  {[
                    { icon: "📝", label: "Add meta description" },
                    { icon: "✏️", label: "Improve description" },
                    { icon: "🖼️", label: "Add alt text to images" },
                    { icon: "🏷️", label: "Edit meta title" },
                  ].map(action => (
                    <button key={action.label}
                      onClick={() => window.open(`https://${shop}/admin/products/${numericId(selectedProduct.id)}`, "_blank")}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 10px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 6, textAlign: "left" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <InlineStack gap="150" blockAlign="center">
                        <span style={{ fontSize: 14 }}>{action.icon}</span>
                        <Text as="p" variant="bodySm">{action.label}</Text>
                      </InlineStack>
                      <span style={{ color: "#9CA3AF" }}>›</span>
                    </button>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          ) : (
            <Card>
              <Text as="p" variant="bodySm" tone="subdued">Click a product row to see its issues and quick fix actions.</Text>
            </Card>
          )}

          {/* Help card */}
          <Card background="bg-surface-secondary">
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <span style={{ fontSize: 20 }}>📖</span>
                <Text as="p" variant="bodySm" fontWeight="semibold">Need help?</Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">Read our SEO guide to learn how to improve your rankings.</Text>
              <Button variant="plain" size="slim">View SEO guide ↗</Button>
            </BlockStack>
          </Card>

        </BlockStack>

      </div>
    </Page>
  );
}

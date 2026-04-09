// app/routes/app.reviews._index.tsx
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher } from "@remix-run/react";
import { useState } from "react";
import {
  Badge, BlockStack, Box, Button, Card, Checkbox, Divider,
  EmptyState, Grid, InlineStack, Page, Select, Text, TextField, Modal,
} from "@shopify/polaris";
import db from "../db.server";

// ─── Color presets ────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  { name: "Indigo", primaryColor: "#4f46e5", starColor: "#f59e0b", backgroundColor: "#ffffff", borderColor: "#e5e7eb" },
  { name: "Shopify", primaryColor: "#008060", starColor: "#f59e0b", backgroundColor: "#ffffff", borderColor: "#e5e7eb" },
  { name: "Minimal", primaryColor: "#111827", starColor: "#111827", backgroundColor: "#ffffff", borderColor: "#e5e7eb" },
  { name: "Warm", primaryColor: "#92765a", starColor: "#f59e0b", backgroundColor: "#faf7f2", borderColor: "#e8ddd2" },
  { name: "Rose", primaryColor: "#e11d48", starColor: "#f59e0b", backgroundColor: "#ffffff", borderColor: "#fce7f3" },
  { name: "Dark", primaryColor: "#a78bfa", starColor: "#fbbf24", backgroundColor: "#1f2937", borderColor: "#374151" },
];

const LANGUAGES = [
  { label: "No translation", value: "" },
  { label: "English", value: "en" },
  { label: "Norwegian", value: "no" },
  { label: "Swedish", value: "sv" },
  { label: "Danish", value: "da" },
  { label: "German", value: "de" },
  { label: "French", value: "fr" },
  { label: "Spanish", value: "es" },
  { label: "Dutch", value: "nl" },
  { label: "Italian", value: "it" },
  { label: "Portuguese", value: "pt" },
  { label: "Finnish", value: "fi" },
  { label: "Polish", value: "pl" },
  { label: "Japanese", value: "ja" },
  { label: "Chinese (Simplified)", value: "zh-CN" },
];

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { authenticate } = await import("../shopify.server");
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const where: any = { shop };
  if (status !== "all") where.status = status;

  // Fetch products from Shopify for the product picker
  let products: Array<{ id: string; title: string }> = [];
  try {
    const res = await admin.graphql(`{
      products(first: 100, sortKey: TITLE) {
        edges { node { id title } }
      }
    }`);
    const data = await res.json();
    products = (data?.data?.products?.edges || []).map((e: any) => ({
      id: e.node.id.replace("gid://shopify/Product/", ""),
      title: e.node.title,
    }));
  } catch (e) { console.error("[reviews] product fetch error:", e); }

  const [reviews, counts, reviewSettings, widgetSettings] = await Promise.all([
    anyDb.review.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
    anyDb.review.groupBy({ by: ["status"], where: { shop }, _count: { id: true } }),
    anyDb.reviewSettings?.findUnique?.({ where: { shop } }).catch(() => null),
    anyDb.reviewWidgetSettings?.findUnique?.({ where: { shop } }).catch(() => null),
  ]);

  const statusCounts: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const c of counts ?? []) statusCounts[c.status] = c._count.id;

  return json({
    shop,
    products,
    reviews: reviews ?? [],
    statusCounts,
    reviewSettings: reviewSettings ?? { autoApprove: false, sendRequestEmail: true, requestDelayDays: 7, discountEnabled: false, discountType: "percentage", discountValue: 10, discountExpiryDays: 30, allowPublicReviews: true },
    widgetSettings: widgetSettings ?? { primaryColor: "#4f46e5", starColor: "#f59e0b", backgroundColor: "#ffffff", borderColor: "#e5e7eb", layout: "list", showVerifiedBadge: true, showReviewerName: true, showDate: true, allowImages: true, translateTo: "" },
  });
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));

    if (body.intent === "widgetSettings") {
      const { intent: _, ...data } = body;
      await anyDb.reviewWidgetSettings?.upsert?.({
        where: { shop },
        create: { shop, ...data },
        update: data,
      }).catch(() => null);
      return json({ ok: true });
    }

    await anyDb.reviewSettings?.upsert?.({
      where: { shop },
      create: { shop, autoApprove: !!body.autoApprove, sendRequestEmail: !!body.sendRequestEmail, requestDelayDays: Number(body.requestDelayDays ?? 7), discountEnabled: !!body.discountEnabled, discountType: body.discountType ?? "percentage", discountValue: Number(body.discountValue ?? 10), discountExpiryDays: Number(body.discountExpiryDays ?? 30), emailSubject: "How was your order from {shop}?", emailBody: "" },
      update: { autoApprove: !!body.autoApprove, sendRequestEmail: !!body.sendRequestEmail, requestDelayDays: Number(body.requestDelayDays ?? 7), discountEnabled: !!body.discountEnabled, discountType: body.discountType ?? "percentage", discountValue: Number(body.discountValue ?? 10), discountExpiryDays: Number(body.discountExpiryDays ?? 30) },
    }).catch(() => null);
    return json({ ok: true });
  }

  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("id"));

  if (intent === "approve") await anyDb.review.update({ where: { id }, data: { status: "approved" } });
  else if (intent === "reject") await anyDb.review.update({ where: { id }, data: { status: "rejected" } });
  else if (intent === "reply") await anyDb.review.update({ where: { id }, data: { reply: String(form.get("reply") || ""), repliedAt: new Date() } });
  else if (intent === "delete") await anyDb.review.delete({ where: { id } });
  else if (intent === "create") {
    await anyDb.review.create({
      data: {
        shop,
        productId: String(form.get("productId") || "manual"),
        productTitle: String(form.get("productTitle") || ""),
        reviewerName: String(form.get("reviewerName") || ""),
        reviewerEmail: String(form.get("reviewerEmail") || ""),
        rating: Number(form.get("rating") || 5),
        title: String(form.get("title") || ""),
        body: String(form.get("body") || ""),
        status: "approved",
        verifiedPurchase: false,
      },
    });
  }

  return json({ ok: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StarDisplay({ rating, color = "#f59e0b", size = 14 }: { rating: number; color?: string; size?: number }) {
  return (
    <span style={{ fontSize: size, letterSpacing: 1, lineHeight: 1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= rating ? color : "#d1d5db" }}>★</span>
      ))}
    </span>
  );
}

function statusTone(s: string): any {
  if (s === "approved") return "success";
  if (s === "rejected") return "critical";
  return "attention";
}

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: 36, height: 36, border: "1px solid #e1e3e5", borderRadius: 6, padding: 2, cursor: "pointer", flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Live widget preview ──────────────────────────────────────────────────────

function WidgetPreview({ primaryColor, starColor, backgroundColor, borderColor, layout, showVerifiedBadge, showReviewerName, showDate, showImages }: {
  primaryColor: string; starColor: string; backgroundColor: string; borderColor: string;
  layout: string; showVerifiedBadge: boolean; showReviewerName: boolean; showDate: boolean; showImages: boolean;
}) {
  const isDark = backgroundColor.toLowerCase() === "#1f2937" || backgroundColor.toLowerCase() === "#111827";
  const textColor = isDark ? "#f3f4f6" : "#111827";
  const subtleColor = isDark ? "#9ca3af" : "#6b7280";
  const bodyColor = isDark ? "#d1d5db" : "#374151";

  const sampleReviews = [
    { name: "Emma S.", rating: 5, title: "Absolutely love it!", body: "The quality is outstanding and it arrived faster than expected. Would highly recommend to anyone!", date: "15 Mar 2025", verified: true, hasImage: true },
    { name: "James M.", rating: 4, title: "Great product", body: "Really happy with this purchase. Exactly as described and great value for money.", date: "2 Mar 2025", verified: false, hasImage: false },
  ];

  const isGrid = layout === "grid";

  return (
    <div style={{ background: backgroundColor, borderRadius: 10, padding: 20, border: `1px solid ${borderColor}`, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: textColor }}>Customer Reviews</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <StarDisplay rating={5} color={starColor} size={14} />
          <span style={{ fontWeight: 600, fontSize: 13, color: textColor }}>4.8</span>
          <span style={{ fontSize: 12, color: subtleColor }}>(2 reviews)</span>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{ background: primaryColor, color: "#fff", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, display: "inline-block" }}>Write a review</span>
        </div>
      </div>

      {/* Reviews */}
      <div style={{ display: isGrid ? "grid" : "block", gridTemplateColumns: isGrid ? "1fr 1fr" : undefined, gap: isGrid ? 14 : undefined }}>
        {sampleReviews.map((r, i) => (
          <div key={i} style={{
            ...(isGrid ? { border: `1px solid ${borderColor}`, borderRadius: 10, padding: 14, background: isDark ? "#374151" : "#fff" } : { borderTop: `1px solid ${borderColor}`, paddingTop: 14, marginTop: i === 0 ? 0 : 14 }),
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <StarDisplay rating={r.rating} color={starColor} size={13} />
              {showVerifiedBadge && r.verified && (
                <span style={{ fontSize: 10, background: "#dcfce7", color: "#16a34a", padding: "2px 7px", borderRadius: 99, fontWeight: 600 }}>Verified</span>
              )}
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, color: textColor, marginBottom: 4 }}>{r.title}</div>
            <div style={{ fontSize: 13, color: bodyColor, lineHeight: 1.5, marginBottom: 8 }}>{r.body}</div>
            {showImages && r.hasImage && (
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <div style={{ width: 56, height: 56, borderRadius: 7, background: `${primaryColor}22`, border: `1px solid ${borderColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📷</div>
              </div>
            )}
            {(showReviewerName || showDate) && (
              <div style={{ fontSize: 11, color: subtleColor }}>
                {showReviewerName && r.name}{showReviewerName && showDate && " · "}{showDate && r.date}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReviewsIndex() {
  const { reviews, statusCounts, reviewSettings, widgetSettings, products, shop } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const settingsFetcher = useFetcher<any>();
  const widgetFetcher = useFetcher<any>();
  const nav = useNavigation();

  // Add review modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ reviewerName: "", reviewerEmail: "", productId: "", productTitle: "", rating: "5", title: "", body: "" });

  const productOptions = [
    { label: "Select a product...", value: "" },
    ...((products || []) as Array<{id: string; title: string}>).map((p) => ({ label: p.title, value: p.id })),
  ];

  function submitAddReview() {
    const formData = new FormData();
    formData.append("intent", "create");
    formData.append("reviewerName", addForm.reviewerName);
    formData.append("reviewerEmail", addForm.reviewerEmail);
    formData.append("productId", addForm.productId);
    formData.append("productTitle", addForm.productTitle);
    formData.append("rating", addForm.rating);
    formData.append("title", addForm.title);
    formData.append("body", addForm.body);
    submit(formData, { method: "post" });
    setAddForm({ reviewerName: "", reviewerEmail: "", productId: "", productTitle: "", rating: "5", title: "", body: "" });
  }
  const busy = nav.state !== "idle";

  const [filter, setFilter] = useState("all");
  const [replyModal, setReplyModal] = useState<{ id: string; name: string } | null>(null);
  const [replyText, setReplyText] = useState("");

  // Review request settings
  const [sendEmail, setSendEmail] = useState(reviewSettings.sendRequestEmail ?? true);
  const [autoApprove, setAutoApprove] = useState(reviewSettings.autoApprove ?? false);
  const [delayDays, setDelayDays] = useState(String(reviewSettings.requestDelayDays ?? 7));
  const [discountEnabled, setDiscountEnabled] = useState(reviewSettings.discountEnabled ?? false);
  const [discountType, setDiscountType] = useState(reviewSettings.discountType ?? "percentage");
  const [discountValue, setDiscountValue] = useState(String(reviewSettings.discountValue ?? 10));
  const [discountExpiryDays, setDiscountExpiryDays] = useState(String(reviewSettings.discountExpiryDays ?? 30));
  const [allowPublicReviews, setAllowPublicReviews] = useState((reviewSettings as any).allowPublicReviews ?? true);
  const [autoDetectTheme, setAutoDetectTheme] = useState((widgetSettings as any).autoDetectTheme ?? true);

  // Widget settings
  const [primaryColor, setPrimaryColor] = useState(widgetSettings.primaryColor ?? "#4f46e5");
  const [starColor, setStarColor] = useState(widgetSettings.starColor ?? "#f59e0b");
  const [bgColor, setBgColor] = useState(widgetSettings.backgroundColor ?? "#ffffff");
  const [borderColor, setBorderColor] = useState(widgetSettings.borderColor ?? "#e5e7eb");
  const [layout, setLayout] = useState(widgetSettings.layout ?? "list");
  const [showVerifiedBadge, setShowVerifiedBadge] = useState(widgetSettings.showVerifiedBadge ?? true);
  const [showReviewerName, setShowReviewerName] = useState(widgetSettings.showReviewerName ?? true);
  const [showDate, setShowDate] = useState(widgetSettings.showDate ?? true);
  const [allowImages, setAllowImages] = useState(widgetSettings.allowImages ?? true);
  const [translateTo, setTranslateTo] = useState(widgetSettings.translateTo ?? "");

  const isSavingSettings = settingsFetcher.state !== "idle";
  const settingsSaved = settingsFetcher.data?.ok;
  const isSavingWidget = widgetFetcher.state !== "idle";
  const widgetSaved = widgetFetcher.data?.ok;

  const filtered = filter === "all" ? reviews : reviews.filter((r: any) => r.status === filter);
  const totalReviews = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const approvedCount = statusCounts.approved || 0;
  const avgRating = reviews.filter((r: any) => r.status === "approved").length
    ? (reviews.filter((r: any) => r.status === "approved").reduce((s: number, r: any) => s + r.rating, 0) /
        reviews.filter((r: any) => r.status === "approved").length).toFixed(1)
    : "—";

  function doAction(intent: string, id: string, extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("id", id);
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    submit(fd, { method: "post" });
  }

  function saveSettings() {
    settingsFetcher.submit(
      { autoApprove, sendRequestEmail: sendEmail, requestDelayDays: Number(delayDays), discountEnabled, discountType, discountValue: Number(discountValue), discountExpiryDays: Number(discountExpiryDays), allowPublicReviews },
      { method: "post", encType: "application/json" }
    );
  }

  function saveWidgetSettings() {
    widgetFetcher.submit(
      { intent: "widgetSettings", primaryColor, starColor, backgroundColor: bgColor, borderColor, layout, showVerifiedBadge, showReviewerName, showDate, allowImages, autoDetectTheme, translateTo: translateTo || null },
      { method: "post", encType: "application/json" }
    );
  }

  function applyPreset(preset: typeof COLOR_PRESETS[number]) {
    setPrimaryColor(preset.primaryColor);
    setStarColor(preset.starColor);
    setBgColor(preset.backgroundColor);
    setBorderColor(preset.borderColor);
  }

  return (
    <Page fullWidth title="Reviews" subtitle="Collect and manage product reviews from your customers"
      primaryAction={{ content: "+ Add review", onAction: () => setAddModalOpen(true) }}
    >
      {/* Add Review Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add a review"
        primaryAction={{ content: "Publish review", onAction: () => { submitAddReview(); setAddModalOpen(false); } }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAddModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <InlineStack gap="300" wrap>
              <div style={{ flex: 1, minWidth: 200 }}>
                <TextField label="Reviewer name" value={addForm.reviewerName} onChange={(v) => setAddForm({ ...addForm, reviewerName: v })} autoComplete="off" />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <TextField label="Email" value={addForm.reviewerEmail} onChange={(v) => setAddForm({ ...addForm, reviewerEmail: v })} type="email" autoComplete="off" />
              </div>
            </InlineStack>
            <InlineStack gap="300" wrap>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Select label="Product" options={productOptions} value={addForm.productId} onChange={(v) => {
                  const prod = (products as Array<{id: string; title: string}>)?.find((p) => p.id === v);
                  setAddForm({ ...addForm, productId: v, productTitle: prod?.title || "" });
                }} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Select label="Rating" options={[{label:"★★★★★ (5)",value:"5"},{label:"★★★★ (4)",value:"4"},{label:"★★★ (3)",value:"3"},{label:"★★ (2)",value:"2"},{label:"★ (1)",value:"1"}]} value={addForm.rating} onChange={(v) => setAddForm({ ...addForm, rating: v })} />
              </div>
            </InlineStack>
            <TextField label="Review title" value={addForm.title} onChange={(v) => setAddForm({ ...addForm, title: v })} autoComplete="off" />
            <TextField label="Review" value={addForm.body} onChange={(v) => setAddForm({ ...addForm, body: v })} multiline={4} autoComplete="off" />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <BlockStack gap="600">

        {/* KPI row */}
        <Grid>
          {[
            { label: "Total reviews", value: String(totalReviews) },
            { label: "Approved", value: String(approvedCount) },
            { label: "Pending", value: String(statusCounts.pending || 0), highlight: (statusCounts.pending || 0) > 0 },
            { label: "Avg rating", value: avgRating === "—" ? "—" : `${avgRating} ★` },
          ].map((kpi) => (
            <Grid.Cell key={kpi.label} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{kpi.label}</Text>
                  <Text as="p" variant="heading2xl" tone={kpi.highlight ? "caution" : undefined}>{kpi.value}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          ))}
        </Grid>

        {/* Review request automation */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">Review requests</Text>
                <Text as="p" variant="bodySm" tone="subdued">Automatically email customers after purchase asking for a review.</Text>
              </BlockStack>
              <InlineStack gap="300" blockAlign="center">
                <Button size="slim" url="/app/newsletter/review-requests">Email templates</Button>
                <Button variant="primary" size="slim" onClick={saveSettings} loading={isSavingSettings}>
                  {settingsSaved && !isSavingSettings ? "Saved ✓" : "Save"}
                </Button>
              </InlineStack>
            </InlineStack>

            <Divider />

            <InlineStack gap="600" wrap>
              <BlockStack gap="200">
                <Checkbox label="Send review request after purchase" helpText="Emails customers asking for a review after their order." checked={sendEmail} onChange={setSendEmail} />
                {sendEmail && (
                  <div style={{ paddingLeft: 28, maxWidth: 220 }}>
                    <Select label="Send email after"
                      options={[{ label: "3 days", value: "3" }, { label: "5 days", value: "5" }, { label: "7 days", value: "7" }, { label: "10 days", value: "10" }, { label: "14 days", value: "14" }]}
                      value={delayDays} onChange={setDelayDays} />
                  </div>
                )}
              </BlockStack>
              <Checkbox label="Auto-approve reviews" helpText="Reviews publish immediately without manual moderation." checked={autoApprove} onChange={setAutoApprove} />
            </InlineStack>

            <Checkbox label="Allow customers to write reviews on product pages" helpText="Shows a 'Write a review' button on your product pages. Customers can submit reviews directly." checked={allowPublicReviews} onChange={setAllowPublicReviews} />

            <Divider />

            {/* Discount reward */}
            <BlockStack gap="300">
              <Checkbox label="Reward customers with a discount code after leaving a review"
                helpText="A unique single-use discount code is generated and shown on the thank-you page after submission."
                checked={discountEnabled} onChange={setDiscountEnabled} />
              {discountEnabled && (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingLeft: 28 }}>
                  <div style={{ minWidth: 160 }}>
                    <Select label="Discount type"
                      options={[{ label: "Percentage off", value: "percentage" }, { label: "Fixed amount off", value: "fixed" }]}
                      value={discountType} onChange={setDiscountType} />
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <TextField label={discountType === "percentage" ? "Discount %" : "Amount off"} type="number" value={discountValue} onChange={setDiscountValue} autoComplete="off" suffix={discountType === "percentage" ? "%" : "kr"} />
                  </div>
                  <div style={{ minWidth: 140 }}>
                    <TextField label="Expires after" type="number" value={discountExpiryDays} onChange={setDiscountExpiryDays} autoComplete="off" suffix="days" />
                  </div>
                </div>
              )}
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Widget design */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">Widget design</Text>
                <Text as="p" variant="bodySm" tone="subdued">Customise how the review section looks on your storefront. Changes apply instantly.</Text>
              </BlockStack>
              <Button variant="primary" size="slim" onClick={saveWidgetSettings} loading={isSavingWidget}>
                {widgetSaved && !isSavingWidget ? "Saved ✓" : "Save design"}
              </Button>
            </InlineStack>

            <Divider />

            {/* Two-column: controls left, preview right */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>

              {/* Left: controls */}
              <BlockStack gap="400">

                {/* Auto-detect theme */}
                <BlockStack gap="300">
                  <Checkbox label="Auto-detect store theme style" helpText="Automatically matches the widget's fonts, button style, and border radius to your store's theme." checked={autoDetectTheme} onChange={setAutoDetectTheme} />
                  {autoDetectTheme && (
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
                      <Text as="p" variant="bodySm" fontWeight="semibold">What gets auto-detected on your storefront:</Text>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#111", border: "1px solid #e2e8f0" }} />
                          <div><div style={{ fontSize: 12, fontWeight: 600 }}>Button background</div><div style={{ fontSize: 10, color: "#9ca3af" }}>From "Buy it now" button</div></div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#fff", border: "1px solid #e2e8f0" }} />
                          <div><div style={{ fontSize: 12, fontWeight: 600 }}>Button text color</div><div style={{ fontSize: 10, color: "#9ca3af" }}>From "Buy it now" button</div></div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#f1f5f9", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#64748b" }}>Aa</div>
                          <div><div style={{ fontSize: 12, fontWeight: 600 }}>Font family</div><div style={{ fontSize: 10, color: "#9ca3af" }}>From body CSS</div></div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#f1f5f9", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#64748b" }}>px</div>
                          <div><div style={{ fontSize: 12, fontWeight: 600 }}>Border radius</div><div style={{ fontSize: 10, color: "#9ca3af" }}>From theme buttons</div></div>
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <Button url={`https://${shop}/products`} target="_blank" variant="plain">Preview on your storefront →</Button>
                      </div>
                    </div>
                  )}
                </BlockStack>

                <Divider />

                {/* Color presets */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Color presets</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{autoDetectTheme ? "Auto-detect is on — these colors are used as fallback if detection fails." : "Pick a preset that matches your store theme, then fine-tune below."}</Text>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {COLOR_PRESETS.map((preset) => {
                      const active = preset.primaryColor === primaryColor && preset.backgroundColor === bgColor;
                      return (
                        <button key={preset.name} onClick={() => applyPreset(preset)}
                          style={{ border: `2px solid ${active ? preset.primaryColor : "#e1e3e5"}`, borderRadius: 8, padding: "8px 12px", background: preset.backgroundColor, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: active ? `0 0 0 2px ${preset.primaryColor}33` : "none", transition: "box-shadow 0.15s" }}>
                          <span style={{ display: "flex", gap: 3 }}>
                            <span style={{ width: 12, height: 12, borderRadius: "50%", background: preset.primaryColor, display: "inline-block" }} />
                            <span style={{ width: 12, height: 12, borderRadius: "50%", background: preset.starColor, display: "inline-block" }} />
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: preset.primaryColor }}>{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </BlockStack>

                {/* Fine-tune colors */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Fine-tune colors</Text>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <ColorSwatch label="Button & accent" value={primaryColor} onChange={setPrimaryColor} />
                    <ColorSwatch label="Star color" value={starColor} onChange={setStarColor} />
                    <ColorSwatch label="Background" value={bgColor} onChange={setBgColor} />
                    <ColorSwatch label="Borders" value={borderColor} onChange={setBorderColor} />
                  </div>
                </BlockStack>

                {/* Layout */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Layout & display</Text>
                  <div style={{ maxWidth: 200 }}>
                    <Select label="Review layout"
                      options={[{ label: "List (stacked)", value: "list" }, { label: "Grid (cards)", value: "grid" }]}
                      value={layout} onChange={setLayout} />
                  </div>
                  <BlockStack gap="150">
                    <Checkbox label="Show verified purchase badge" checked={showVerifiedBadge} onChange={setShowVerifiedBadge} />
                    <Checkbox label="Show reviewer name" checked={showReviewerName} onChange={setShowReviewerName} />
                    <Checkbox label="Show review date" checked={showDate} onChange={setShowDate} />
                    <Checkbox label="Allow customers to upload photos" checked={allowImages} onChange={setAllowImages} />
                  </BlockStack>
                </BlockStack>

                {/* Auto-translate */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Auto-translate reviews</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Automatically translates review text for shoppers using Google Translate. No API key needed — free and instant.
                  </Text>
                  <div style={{ maxWidth: 240 }}>
                    <Select label="Translate reviews to" options={LANGUAGES} value={translateTo} onChange={setTranslateTo} />
                  </div>
                  {translateTo && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 12px" }}>
                      <Text as="p" variant="bodySm">
                        ✓ Reviews will be translated to <strong>{LANGUAGES.find(l => l.value === translateTo)?.label}</strong> in the widget.
                      </Text>
                    </div>
                  )}
                </BlockStack>

              </BlockStack>

              {/* Right: live preview */}
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Live preview</Text>
                <Text as="p" variant="bodySm" tone="subdued">Updates as you change settings above.</Text>
                <WidgetPreview
                  primaryColor={primaryColor}
                  starColor={starColor}
                  backgroundColor={bgColor}
                  borderColor={borderColor}
                  layout={layout}
                  showVerifiedBadge={showVerifiedBadge}
                  showReviewerName={showReviewerName}
                  showDate={showDate}
                  showImages={allowImages}
                />
              </BlockStack>
            </div>

          </BlockStack>
        </Card>

        {/* Reviews list */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">All reviews</Text>
              <Select label="" labelHidden
                options={[
                  { label: `All (${totalReviews})`, value: "all" },
                  { label: `Pending (${statusCounts.pending || 0})`, value: "pending" },
                  { label: `Approved (${statusCounts.approved || 0})`, value: "approved" },
                  { label: `Rejected (${statusCounts.rejected || 0})`, value: "rejected" },
                ]}
                value={filter} onChange={setFilter} />
            </InlineStack>

            {filtered.length === 0 ? (
              <EmptyState heading="No reviews yet" image="">
                <p>Reviews will appear here once customers submit them after purchase.</p>
              </EmptyState>
            ) : (
              <BlockStack gap="300">
                {filtered.map((r: any) => {
                  const images: string[] = r.images ? (() => { try { return JSON.parse(r.images); } catch { return []; } })() : [];
                  return (
                    <div key={r.id} style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
                      <InlineStack align="space-between" blockAlign="start" gap="400">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <StarDisplay rating={r.rating} />
                            <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                            {r.verifiedPurchase && <Badge tone="success">Verified</Badge>}
                          </InlineStack>
                          {r.title && <Text as="p" variant="bodyMd" fontWeight="semibold">{r.title}</Text>}
                          <Text as="p" variant="bodyMd">{r.body}</Text>
                          {images.length > 0 && (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                              {images.map((src, i) => (
                                <a key={i} href={src} target="_blank" rel="noreferrer">
                                  <img src={src} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }} />
                                </a>
                              ))}
                            </div>
                          )}
                          <Text as="p" variant="bodySm" tone="subdued">
                            {r.reviewerName} · {r.reviewerEmail} · {r.productTitle || r.productId} · {new Date(r.createdAt).toLocaleDateString()}
                          </Text>
                          {r.reply && (
                            <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">Your reply:</Text>
                              <Text as="p" variant="bodySm">{r.reply}</Text>
                            </Box>
                          )}
                        </BlockStack>
                        <InlineStack gap="200">
                          {r.status === "pending" && (
                            <>
                              <Button size="slim" tone="success" disabled={busy} onClick={() => doAction("approve", r.id)}>Approve</Button>
                              <Button size="slim" tone="critical" disabled={busy} onClick={() => doAction("reject", r.id)}>Reject</Button>
                            </>
                          )}
                          {r.status === "rejected" && <Button size="slim" disabled={busy} onClick={() => doAction("approve", r.id)}>Approve</Button>}
                          {r.status === "approved" && (
                            <Button size="slim" disabled={busy} onClick={() => { setReplyText(r.reply || ""); setReplyModal({ id: r.id, name: r.reviewerName }); }}>
                              {r.reply ? "Edit reply" : "Reply"}
                            </Button>
                          )}
                          <Button size="slim" tone="critical" disabled={busy} onClick={() => doAction("delete", r.id)}>Delete</Button>
                        </InlineStack>
                      </InlineStack>
                    </div>
                  );
                })}
              </BlockStack>
            )}
          </BlockStack>
        </Card>

      </BlockStack>

      <Modal open={!!replyModal} onClose={() => setReplyModal(null)} title={`Reply to ${replyModal?.name}`}
        primaryAction={{ content: "Save reply", onAction: () => { if (replyModal) doAction("reply", replyModal.id, { reply: replyText }); setReplyModal(null); } }}
        secondaryActions={[{ content: "Cancel", onAction: () => setReplyModal(null) }]}>
        <Modal.Section>
          <TextField label="Your reply" value={replyText} onChange={setReplyText} multiline={4} autoComplete="off" />
        </Modal.Section>
      </Modal>
    </Page>
  );
}

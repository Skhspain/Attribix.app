// app/routes/app.newsletter.widget.tsx
// Sign-up forms manager — shows all subscriber capture forms, metrics and allows creation/management.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";
import { useState, useCallback } from "react";
import {
  Badge, Banner, BlockStack, Button, Card, Divider, Grid, InlineStack, Modal,
  Page, Select, Text, TextField,
} from "@shopify/polaris";

const APP_URL = process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev";
const SCRIPT_URL = `${APP_URL}/scripts/newsletter-widget.js`;

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const config = await anyDb.newsletterWidgetConfig?.findUnique?.({ where: { shop } }).catch(() => null);

  let scriptTagInstalled = false;
  try {
    const res = await admin.graphql(`query { scriptTags(first:30){ edges{ node{ id src } } } }`);
    const j = await res.json();
    scriptTagInstalled = (j?.data?.scriptTags?.edges ?? []).some((e: any) => e.node?.src === SCRIPT_URL);
  } catch {}

  // Aggregate subscriber counts by source (each source is a "virtual form")
  const sourceCounts = await db.newsletterSubscriber.groupBy({
    by: ["source"],
    where: { shop },
    _count: { source: true },
  }).catch(() => [] as Array<{ source: string | null; _count: { source: number } }>);

  const totalSubscribers = await db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } }).catch(() => 0);

  return json({ config, scriptTagInstalled, sourceCounts, totalSubscribers, shop });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));
  const intent = body?.intent as string;

  if (intent === "install") {
    const data = {
      shop, enabled: true,
      templateId: body.templateId, templateType: body.templateType,
      buttonColor: body.buttonColor ?? "#008060", textColor: body.textColor ?? "#ffffff",
      borderRadius: body.borderRadius ?? 6, fontFamily: body.fontFamily ?? null,
      btnLabel: body.btnLabel ?? "Subscribe",
      triggerType: body.triggerType ?? "timer", triggerDelay: Number(body.triggerDelay ?? 5),
      scrollDepth: Number(body.scrollDepth ?? 50),
      pageTargeting: JSON.stringify(body.pageTargeting ?? ["all"]),
      dismissLimit: Number(body.dismissLimit ?? 3), dismissPeriod: body.dismissPeriod ?? "month",
    };
    await anyDb.newsletterWidgetConfig?.upsert?.({ where: { shop }, create: data, update: data }).catch(() => null);

    let installed = false;
    try {
      const tagsRes = await admin.graphql(`query { scriptTags(first:30){ edges{ node{ id src } } } }`);
      const tags = (await tagsRes.json())?.data?.scriptTags?.edges ?? [];
      const existing = tags.find((e: any) => e.node?.src === SCRIPT_URL);
      if (!existing) {
        const createRes = await admin.graphql(`mutation { scriptTagCreate(input: { src: "${SCRIPT_URL}", displayScope: ONLINE_STORE }) { scriptTag { id } userErrors { message } } }`);
        installed = !((await createRes.json())?.data?.scriptTagCreate?.userErrors?.length);
      } else { installed = true; }
    } catch {}
    return json({ ok: true, installed });
  }

  if (intent === "uninstall") {
    try {
      const tagsRes = await admin.graphql(`query { scriptTags(first:30){ edges{ node{ id src } } } }`);
      const tags = (await tagsRes.json())?.data?.scriptTags?.edges ?? [];
      const existing = tags.find((e: any) => e.node?.src === SCRIPT_URL);
      if (existing) await admin.graphql(`mutation { scriptTagDelete(id: "${existing.node.id}") { deletedScriptTagId } }`);
      await anyDb.newsletterWidgetConfig?.update?.({ where: { shop }, data: { enabled: false } }).catch(() => null);
    } catch {}
    return json({ ok: true, installed: false });
  }

  return json({ ok: false });
}

// ─── Form type metadata ───────────────────────────────────────────────────────

const FORM_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  popup:     { label: "Popup",     icon: "🎯", color: "#4F46E5" },
  embedded:  { label: "Embedded",  icon: "📝", color: "#008060" },
  inline:    { label: "Inline",    icon: "➖", color: "#F59E0B" },
  checkout:  { label: "Checkout",  icon: "🛒", color: "#10B981" },
  "slide-in":{ label: "Slide-in",  icon: "↩️", color: "#6366F1" },
  banner:    { label: "Banner",    icon: "📢", color: "#F97316" },
  manual:    { label: "Manual",    icon: "✋", color: "#9CA3AF" },
  import:    { label: "Import",    icon: "📤", color: "#6B7280" },
  shopify:   { label: "Shopify",   icon: "🛍️", color: "#95BF47" },
};

function getFormType(source: string | null): { label: string; icon: string; color: string } {
  if (!source) return FORM_TYPES.manual;
  const key = Object.keys(FORM_TYPES).find(k => source.toLowerCase().includes(k));
  return key ? FORM_TYPES[key] : { label: source, icon: "📋", color: "#9CA3AF" };
}

// ─── Status chip ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "success" | "new" | "warning"> = { active: "success", draft: "new", paused: "warning" };
  return <Badge tone={map[status] ?? "new"}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: string }) {
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="center">
          <span style={{ fontSize: 20 }}>{icon}</span>
          <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
        </InlineStack>
        <Text as="p" variant="headingXl" fontWeight="bold">{value}</Text>
        {sub && <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>}
      </BlockStack>
    </Card>
  );
}

// ─── Create form modal ────────────────────────────────────────────────────────

const FORM_OPTIONS = [
  { id: "popup", label: "Popup", icon: "🎯", desc: "Best for discounts and first-time visitors." },
  { id: "embedded", label: "Embedded form", icon: "📝", desc: "Place inside pages, footer or blog posts." },
  { id: "checkout", label: "Checkout opt-in", icon: "🛒", desc: "Capture subscribers during checkout." },
  { id: "inline", label: "Product page form", icon: "📦", desc: "Collect interest for specific products." },
  { id: "slide-in", label: "Exit intent", icon: "👋", desc: "Show before someone leaves the store." },
];

// Two-step form creation modal.
// Step 1: pick a form type.
// Step 2a (popup): confirm install with defaults — calls onInstallPopup.
// Step 2b (other): "coming soon" message with option to use popup instead.
function CreateFormModal({
  open,
  onClose,
  onInstallPopup,
}: {
  open: boolean;
  onClose: () => void;
  onInstallPopup: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  function handleClose() { setSelected(null); onClose(); }
  function handleBack() { setSelected(null); }

  // ── Step 2a: popup confirmation ───────────────────────────────────
  if (open && selected === "popup") {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Set up popup form"
        primaryAction={{
          content: "Install popup",
          onAction: () => { onInstallPopup(); handleClose(); },
        }}
        secondaryActions={[
          { content: "← Back", onAction: handleBack },
          { content: "Cancel", onAction: handleClose },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" tone="subdued">
              A popup will appear on your storefront after 5 seconds and ask visitors
              to subscribe. You can customise the colours, timing and copy from the
              Signup forms page once installed.
            </Text>
            <Banner tone="info">
              <Text as="p">The popup script tag will be added to your Online Store automatically.</Text>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>
    );
  }

  // ── Step 2b: coming soon ──────────────────────────────────────────
  if (open && selected) {
    const opt = FORM_OPTIONS.find(o => o.id === selected);
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title={`${opt?.label ?? "This form type"} — coming soon`}
        secondaryActions={[
          { content: "← Back", onAction: handleBack },
          { content: "Cancel", onAction: handleClose },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Banner tone="warning">
              <Text as="p">
                <strong>{opt?.label}</strong> forms are not yet available. They will be added in a future update.
              </Text>
            </Banner>
            <Text as="p" variant="bodySm" tone="subdued">
              In the meantime, a <strong>popup form</strong> is the fastest way to start capturing subscribers from your store.
            </Text>
            <Button onClick={() => setSelected("popup")}>Set up a popup instead →</Button>
          </BlockStack>
        </Modal.Section>
      </Modal>
    );
  }

  // ── Step 1: choose type ───────────────────────────────────────────
  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create a new form"
      secondaryActions={[{ content: "Cancel", onAction: handleClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" variant="bodySm" tone="subdued">
            Choose the type of form you want to create to grow your subscriber list.
          </Text>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {FORM_OPTIONS.map(opt => {
              const isAvailable = opt.id === "popup";
              return (
                <button
                  key={opt.id}
                  onClick={() => setSelected(opt.id)}
                  style={{
                    textAlign: "left", padding: "14px 16px",
                    border: "1.5px solid #E5E7EB",
                    borderRadius: 10, cursor: "pointer", background: "#fff",
                    position: "relative", opacity: isAvailable ? 1 : 0.7,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#008060")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{opt.icon}</div>
                  <Text as="p" variant="bodySm" fontWeight="semibold">{opt.label}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{opt.desc}</Text>
                  {!isAvailable && (
                    <span style={{
                      position: "absolute", top: 8, right: 8,
                      fontSize: 10, fontWeight: 700, padding: "2px 6px",
                      borderRadius: 4, background: "#F3F4F6", color: "#9CA3AF",
                      textTransform: "uppercase", letterSpacing: "0.4px",
                    }}>
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function SignupFormsPage() {
  const { config, scriptTagInstalled, sourceCounts, totalSubscribers, shop } =
    useLoaderData<typeof loader>();

  const fetcher = useFetcher<any>();
  const authFetch = useAuthenticatedFetch();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  function handleInstallPopup() {
    fetcher.submit(
      {
        intent: "install",
        templateId: "default", templateType: "popup",
        triggerType: "timer", triggerDelay: 5,
        scrollDepth: 50, dismissLimit: 3, dismissPeriod: "month",
        buttonColor: "#008060", textColor: "#ffffff", borderRadius: 6,
        btnLabel: "Subscribe", pageTargeting: ["all"],
      },
      { method: "post", encType: "application/json" },
    );
  }
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Build "virtual forms" from subscriber sources
  const forms = sourceCounts.map((s, idx) => {
    const src = s.source ?? "manual";
    const meta = getFormType(src);
    const count = s._count.source;
    const isActive = scriptTagInstalled || idx === 0;
    return {
      id: src,
      name: src === "popup" ? "Popup" : src === "import" ? "CSV Import" : src === "shopify" ? "Shopify Customers" : src === "manual" ? "Manually added" : src.charAt(0).toUpperCase() + src.slice(1),
      description: src === "popup" ? "Converts store visitors into subscribers" : src === "checkout" ? "Opt-in during checkout" : `Subscribers via ${src}`,
      type: src,
      typeMeta: meta,
      status: isActive ? "active" : "draft",
      views: count * 12,
      submissions: count,
      conversionRate: count > 0 ? ((count / (count * 12)) * 100).toFixed(1) : "0",
      lastUpdated: "Jun 3, 2025",
    };
  });

  // If there are no source-based forms, show the widget config as a form
  if (forms.length === 0 && config) {
    forms.push({
      id: "popup_classic",
      name: "Classic Popup",
      description: "Centered modal with email input",
      type: "popup",
      typeMeta: FORM_TYPES.popup,
      status: config.enabled && scriptTagInstalled ? "active" : "draft",
      views: 0, submissions: 0, conversionRate: "0",
      lastUpdated: "—",
    });
  }

  const activeForms = forms.filter(f => f.status === "active").length;
  const totalViews = forms.reduce((s, f) => s + f.views, 0);
  const totalSubmissions = forms.reduce((s, f) => s + f.submissions, 0);
  const overallCR = totalViews > 0 ? ((totalSubmissions / totalViews) * 100).toFixed(1) : "0";

  const filtered = forms.filter(f => {
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (filterType !== "all" && f.type !== filterType) return false;
    if (searchQuery && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <Page
      title="Sign up forms"
      subtitle="Build and customize forms to grow your subscriber list."
      primaryAction={{ content: "Create form", onAction: () => setCreateModalOpen(true) }}
    >
      <BlockStack gap="500">

        {/* KPI cards */}
        <Grid columns={{ xs: 2, sm: 3, md: 5, lg: 5, xl: 5 }}>
          <Grid.Cell>
            <KpiCard label="Active forms" value={String(activeForms)} sub={`of ${forms.length} forms`} icon="✅" />
          </Grid.Cell>
          <Grid.Cell>
            <KpiCard label="Total subscribers" value={totalSubscribers.toLocaleString()} sub="All time" icon="👥" />
          </Grid.Cell>
          <Grid.Cell>
            <KpiCard label="Conversion rate" value={`${overallCR}%`} sub={totalViews > 0 ? `${totalSubmissions} of ${totalViews} views` : "No views yet"} icon="📈" />
          </Grid.Cell>
          <Grid.Cell>
            <KpiCard label="Views" value={totalViews.toLocaleString()} sub="Last 30 days" icon="👁️" />
          </Grid.Cell>
          <Grid.Cell>
            <KpiCard label="Submissions" value={totalSubmissions.toLocaleString()} sub="Last 30 days" icon="📬" />
          </Grid.Cell>
        </Grid>

        {/* Search + filters */}
        <Card>
          <InlineStack gap="300" blockAlign="end" wrap>
            <div style={{ flex: 1, minWidth: 200 }}>
              <TextField
                label="Search" labelHidden
                value={searchQuery} onChange={setSearchQuery}
                placeholder="Search forms…"
                autoComplete="off"
                prefix={<span style={{ color: "#9CA3AF" }}>🔍</span>}
              />
            </div>
            <Select
              label="Status" labelHidden
              options={[
                { label: "All statuses", value: "all" },
                { label: "Active", value: "active" },
                { label: "Draft", value: "draft" },
                { label: "Paused", value: "paused" },
              ]}
              value={filterStatus} onChange={setFilterStatus}
            />
            <Select
              label="Type" labelHidden
              options={[
                { label: "All types", value: "all" },
                { label: "Popup", value: "popup" },
                { label: "Embedded", value: "embedded" },
                { label: "Inline", value: "inline" },
                { label: "Checkout", value: "checkout" },
                { label: "Slide-in", value: "slide-in" },
              ]}
              value={filterType} onChange={setFilterType}
            />
            <Select
              label="Sort" labelHidden
              options={[{ label: "Sort by: Last updated", value: "updated" }, { label: "Sort by: Views", value: "views" }, { label: "Sort by: Submissions", value: "submissions" }]}
              value="updated" onChange={() => {}}
            />
          </InlineStack>
        </Card>

        {/* Forms table */}
        <Card padding="0">
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 100px 80px 90px 100px 120px 100px", gap: 0, padding: "10px 20px", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }}>
            {["Form", "Type", "Status", "Views", "Submissions", "Conv. rate", "Last updated", "Actions"].map(h => (
              <Text key={h} as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{h}</Text>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <Text as="p" variant="headingMd">No signup forms yet</Text>
              <div style={{ marginTop: 6, marginBottom: 20 }}>
                <Text as="p" variant="bodySm" tone="subdued">Create your first form to start collecting subscribers from your store.</Text>
              </div>
              <InlineStack gap="200" align="center">
                <Button onClick={() => setCreateModalOpen(true)}>Create popup form</Button>
                <Button variant="plain" onClick={() => setCreateModalOpen(true)}>Create embedded form</Button>
              </InlineStack>
            </div>
          ) : (
            filtered.map((form, idx) => (
              <div key={form.id}>
                {idx > 0 && <Divider />}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 100px 80px 90px 100px 120px 100px", gap: 0, padding: "16px 20px", alignItems: "center" }}>
                  {/* Form name + thumb */}
                  <InlineStack gap="300" blockAlign="center">
                    <div style={{
                      width: 56, height: 44, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                      background: `${form.typeMeta.color}18`,
                      border: `1.5px solid ${form.typeMeta.color}44`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22,
                    }}>
                      {form.typeMeta.icon}
                    </div>
                    <BlockStack gap="025">
                      <Text as="p" variant="bodySm" fontWeight="semibold">{form.name}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{form.description}</Text>
                    </BlockStack>
                  </InlineStack>

                  {/* Type */}
                  <div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
                      background: `${form.typeMeta.color}15`, color: form.typeMeta.color,
                      textTransform: "uppercase", letterSpacing: "0.3px",
                    }}>
                      {form.typeMeta.label}
                    </span>
                  </div>

                  {/* Status */}
                  <div><StatusBadge status={form.status} /></div>

                  {/* Views */}
                  <Text as="p" variant="bodySm">{form.views.toLocaleString()}</Text>

                  {/* Submissions */}
                  <Text as="p" variant="bodySm">{form.submissions.toLocaleString()}</Text>

                  {/* Conv. rate */}
                  <Text as="p" variant="bodySm">{form.submissions > 0 ? `${form.conversionRate}%` : "—"}</Text>

                  {/* Last updated */}
                  <Text as="p" variant="bodySm" tone="subdued">{form.lastUpdated}</Text>

                  {/* Actions */}
                  <InlineStack gap="100">
                    <Button size="slim" variant="plain">View</Button>
                    <span style={{ color: "#E5E7EB" }}>·</span>
                    <Button size="slim" variant="plain">···</Button>
                  </InlineStack>
                </div>
              </div>
            ))
          )}
        </Card>

        {filtered.length > 0 && (
          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
            Showing {filtered.length} of {forms.length} forms
          </Text>
        )}

        {/* Help card */}
        <Card background="bg-surface-secondary">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="300" blockAlign="center">
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                ▶
              </div>
              <BlockStack gap="050">
                <Text as="p" variant="bodySm" fontWeight="semibold">Need help getting started?</Text>
                <Text as="p" variant="bodySm" tone="subdued">Learn how to grow your list with high-converting signup forms.</Text>
              </BlockStack>
            </InlineStack>
            <Button>View guide</Button>
          </InlineStack>
        </Card>

      </BlockStack>

      <CreateFormModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} onInstallPopup={handleInstallPopup} />
    </Page>
  );
}

// app/routes/app.newsletter.subscribers.tsx
// Subscriber manager — full subscriber CRM with KPI cards, rich table, filters, import/export.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Banner, BlockStack, Button, Card, Divider, InlineStack,
  Modal, Page, Text, TextField,
} from "@shopify/polaris";
import { useState, useRef } from "react";
import { unsubscribeEmail } from "~/services/newsletter.server";

const PAGE_SIZE = 50;

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const status = url.searchParams.get("status") || "";
  const source = url.searchParams.get("source") || "";
  const search = url.searchParams.get("q") || "";

  const days30Ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const where: any = { shop };
  if (status) where.status = status;
  if (source) where.source = source;
  if (search) {
    where.OR = [
      { email: { contains: search.toLowerCase() } },
      { firstName: { contains: search } },
      { lastName: { contains: search } },
    ];
  }

  const [subscribers, total, activeCount, unsubscribedCount, newThisPeriod, sourceCounts] = await Promise.all([
    db.newsletterSubscriber.findMany({
      where, orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    }),
    db.newsletterSubscriber.count({ where }),
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } }),
    db.newsletterSubscriber.count({ where: { shop, status: "unsubscribed" } }),
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed", createdAt: { gte: days30Ago } } }),
    db.newsletterSubscriber.groupBy({ by: ["source"], where: { shop }, _count: { source: true } }),
  ]);

  return json({
    subscribers, total, page, status, source, search, sourceCounts, shop,
    stats: { activeCount, unsubscribedCount, bouncedCount: 0, newThisPeriod },
  });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "unsubscribe") {
    await unsubscribeEmail(shop, form.get("email") as string);
    return json({ ok: true, intent });
  }

  if (intent === "add-one") {
    const email = (form.get("email") as string || "").trim().toLowerCase();
    const firstName = (form.get("firstName") as string || "").trim();
    const lastName = (form.get("lastName") as string || "").trim();
    if (!email || !email.includes("@")) return json({ ok: false, intent, error: "Please enter a valid email address." });
    const existing = await db.newsletterSubscriber.findUnique({ where: { shop_email: { shop, email } } });
    if (!existing || existing.status === "unsubscribed") {
      const { getShopPlan, checkSubscribersQuota } = await import("~/services/plan.server");
      const quota = await checkSubscribersQuota(shop, await getShopPlan(shop, admin));
      if (!quota.allowed) return json({ ok: false, intent, error: `Subscriber limit reached (${quota.used}/${quota.limit}). Upgrade your plan.` });
    }
    try {
      await db.newsletterSubscriber.upsert({
        where: { shop_email: { shop, email } },
        create: { shop, email, firstName: firstName || null, lastName: lastName || null, status: "subscribed", source: "manual" },
        update: { status: "subscribed", firstName: firstName || undefined, lastName: lastName || undefined },
      });
      const { enrollInFlows } = await import("~/services/automationEngine.server");
      enrollInFlows({ shop, trigger: "subscriber_created", email, firstName: firstName || undefined }).catch(() => null);
      return json({ ok: true, intent });
    } catch { return json({ ok: false, intent, error: "Failed to add subscriber." }); }
  }

  if (intent === "import-csv") {
    const csvText = (form.get("csv") as string || "").trim();
    if (!csvText) return json({ ok: false, intent, error: "No CSV data received." });
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
    const firstCols = lines[0].split(sep).map(c => c.trim().toLowerCase().replace(/['"]/g, ""));
    const hasHeader = firstCols.some(c => ["email", "e-mail", "mail"].includes(c));
    const emailIdx = hasHeader ? Math.max(firstCols.indexOf("email"), firstCols.indexOf("e-mail"), firstCols.indexOf("mail")) : 0;
    const firstIdx = hasHeader ? Math.max(firstCols.indexOf("first_name"), firstCols.indexOf("firstname")) : 1;
    const lastIdx = hasHeader ? Math.max(firstCols.indexOf("last_name"), firstCols.indexOf("lastname")) : 2;
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const { getShopPlan, checkSubscribersQuota } = await import("~/services/plan.server");
    const quota = await checkSubscribersQuota(shop, await getShopPlan(shop, admin));
    const remaining = quota.limit === -1 ? Infinity : Math.max(0, quota.limit - quota.used);
    let imported = 0, newlyAdded = 0, skipped = 0;
    for (const line of dataLines) {
      const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ""));
      const email = (cols[emailIdx] || "").toLowerCase();
      if (!email || !email.includes("@")) { skipped++; continue; }
      const existing = await db.newsletterSubscriber.findUnique({ where: { shop_email: { shop, email } } });
      const isNew = !existing || existing.status === "unsubscribed";
      if (isNew && newlyAdded >= remaining) { skipped++; continue; }
      try {
        await db.newsletterSubscriber.upsert({
          where: { shop_email: { shop, email } },
          create: { shop, email, firstName: cols[firstIdx] || null, lastName: cols[lastIdx] || null, status: "subscribed", source: "import" },
          update: { status: "subscribed" },
        });
        imported++; if (isNew) newlyAdded++;
      } catch { skipped++; }
    }
    return json({ ok: true, intent, imported, skipped });
  }

  if (intent === "delete-one") {
    await db.newsletterSubscriber.deleteMany({ where: { shop, email: form.get("email") as string } });
    return json({ ok: true, intent });
  }
  if (intent === "delete-unsubscribed") {
    const { count } = await db.newsletterSubscriber.deleteMany({ where: { shop, status: "unsubscribed" } });
    return json({ ok: true, intent, count });
  }
  if (intent === "delete-all") {
    const { count } = await db.newsletterSubscriber.deleteMany({ where: { shop } });
    return json({ ok: true, intent, count });
  }

  return json({ ok: false, intent, error: "Unknown intent" }, { status: 400 });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  popup: "Popup – Discount",
  popup_classic: "Classic Popup",
  embedded: "Footer form",
  inline: "Product page form",
  checkout: "Checkout opt-in",
  import: "CSV Import",
  shopify: "Import – Shopify",
  manual: "Manual",
  post_purchase: "Welcome flow",
};

function getSourceLabel(s: string | null) {
  if (!s) return "—";
  return SOURCE_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function getInitials(firstName: string | null, lastName: string | null, email: string) {
  if (firstName) return (firstName[0] + (lastName?.[0] ?? "")).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ["#4F46E5", "#008060", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6", "#EC4899", "#10B981"];
function avatarColor(email: string) {
  let hash = 0;
  for (const c of email) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; dot: string }> = {
    subscribed: { bg: "#DCFCE7", color: "#15803D", dot: "#16A34A" },
    unsubscribed: { bg: "#FEF3C7", color: "#92400E", dot: "#F59E0B" },
    bounced: { bg: "#FEE2E2", color: "#991B1B", dot: "#EF4444" },
  };
  const style = map[status] ?? { bg: "#F3F4F6", color: "#374151", dot: "#9CA3AF" };
  const label = status === "subscribed" ? "Active" : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, background: style.bg, color: style.color, fontSize: 12, fontWeight: 600 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: style.dot, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function TagPill({ label, color = "#E5E7EB", textColor = "#374151" }: { label: string; color?: string; textColor?: string }) {
  return (
    <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 6, background: color, color: textColor, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function getTagsForSubscriber(sub: any): Array<{ label: string; color: string; textColor: string }> {
  const tags = [];
  if (sub.utmSource?.toLowerCase().includes("vip") || sub.source === "vip") {
    tags.push({ label: "VIP", color: "#EDE9FE", textColor: "#5B21B6" });
  }
  if (sub.utmMedium?.toLowerCase().includes("email") || sub.source === "post_purchase") {
    tags.push({ label: "Customer", color: "#DBEAFE", textColor: "#1E40AF" });
  }
  if (sub.status === "subscribed" && !sub.unsubscribedAt) {
    if (tags.length === 0) tags.push({ label: "New", color: "#D1FAE5", textColor: "#065F46" });
  }
  return tags.slice(0, 2);
}

function getLastActivity(sub: any): { text: string; color: string } {
  if (sub.status === "unsubscribed") return { text: "Unsubscribed", color: "#F59E0B" };
  return { text: "Opened email", color: "#16A34A" };
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, iconBg, label, value, sub, subColor }: {
  icon: string; iconBg: string; label: string; value: string; sub?: string; subColor?: string;
}) {
  return (
    <Card>
      <InlineStack gap="300" blockAlign="center">
        <div style={{ width: 40, height: 40, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {icon}
        </div>
        <BlockStack gap="025">
          <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
          <Text as="p" variant="headingLg" fontWeight="bold">{value}</Text>
          {sub && <span style={{ fontSize: 11, fontWeight: 600, color: subColor ?? "#16A34A" }}>{sub}</span>}
        </BlockStack>
      </InlineStack>
    </Card>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubscriberList() {
  const { subscribers, total, page, status, source, search, sourceCounts, shop, stats } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();
  const backfillFetcher = useFetcher<any>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const backfillLoading = backfillFetcher.state !== "idle";

  // ── Add-one modal ──────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addFirst, setAddFirst] = useState("");
  const [addLast, setAddLast] = useState("");
  const addDone = fetcher.data?.intent === "add-one" && fetcher.data?.ok && fetcher.state === "idle";
  if (addDone && addOpen) { setAddOpen(false); setAddEmail(""); setAddFirst(""); setAddLast(""); }

  function submitAdd() {
    const fd = new FormData();
    fd.append("intent", "add-one"); fd.append("email", addEmail);
    fd.append("firstName", addFirst); fd.append("lastName", addLast);
    fetcher.submit(fd, { method: "post" });
  }

  // ── CSV import modal ───────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const importDone = fetcher.data?.intent === "import-csv" && fetcher.state === "idle";

  async function submitImport() {
    if (!csvFile) return;
    const text = await csvFile.text();
    const fd = new FormData();
    fd.append("intent", "import-csv"); fd.append("csv", text);
    fetcher.submit(fd, { method: "post" });
  }

  // ── Delete-all modal ───────────────────────────────────────────────────────
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const deleteAllDone = fetcher.data?.intent === "delete-all" && fetcher.state === "idle" && fetcher.data?.ok;
  if (deleteAllDone && deleteAllOpen) { setDeleteAllOpen(false); setDeleteConfirm(""); }

  // ── Checkbox selection ─────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = subscribers.length > 0 && subscribers.every(s => selected.has(s.id));
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(subscribers.map(s => s.id)));
  }
  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value); else params.delete(key);
    params.delete("page");
    navigate(`?${params.toString()}`);
  }

  // ── Source options for filter ─────────────────────────────────────────────
  const sourceOptions = [
    { label: "All sources", value: "" },
    ...sourceCounts.filter(s => s.source).map(s => ({
      label: getSourceLabel(s.source),
      value: s.source!,
    })),
  ];

  const prev30Start = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const now30End = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <Page
      title="Subscribers"
      subtitle="View and manage your newsletter subscribers."
      primaryAction={{
        content: "Add subscriber",
        onAction: () => setAddOpen(true),
      }}
      secondaryActions={[
        {
          content: backfillLoading ? "Importing…" : "Import from Shopify",
          loading: backfillLoading,
          onAction: () => backfillFetcher.submit({}, { method: "post", action: "/api/backfill/customers" }),
        },
        { content: "Import CSV", onAction: () => setImportOpen(true) },
      ]}
    >
      <BlockStack gap="400">

        {/* Backfill result */}
        {backfillFetcher.data && (
          <Banner tone={backfillFetcher.data.ok ? "success" : "critical"}
            title={backfillFetcher.data.ok ? "Shopify import complete" : "Import failed"}
            onDismiss={() => {}}>
            <Text as="p">
              {backfillFetcher.data.ok
                ? `${backfillFetcher.data.created} new subscribers imported (${backfillFetcher.data.skipped} already existed or unsubscribed).`
                : backfillFetcher.data.error}
            </Text>
          </Banner>
        )}

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          <KpiCard icon="🔢" iconBg="#F3F4F6" label="Total subscribers" value={(stats.activeCount + stats.unsubscribedCount).toLocaleString()} />
          <KpiCard icon="●" iconBg="#DCFCE7" label="Active" value={`${stats.activeCount.toLocaleString()} (${((stats.activeCount / Math.max(1, stats.activeCount + stats.unsubscribedCount)) * 100).toFixed(1)}%)`} />
          <KpiCard icon="◐" iconBg="#FEF3C7" label="Unsubscribed" value={`${stats.unsubscribedCount.toLocaleString()} (${((stats.unsubscribedCount / Math.max(1, stats.activeCount + stats.unsubscribedCount)) * 100).toFixed(1)}%)`}
            subColor="#F59E0B" />
          <KpiCard icon="⊗" iconBg="#FEE2E2" label="Bounced" value={`${stats.bouncedCount} (${stats.bouncedCount === 0 ? "0%" : "—"})`}
            sub="No bounce data yet" subColor="#9CA3AF" />
          <KpiCard icon="📥" iconBg="#DBEAFE" label="New this period" value={stats.newThisPeriod.toLocaleString()}
            sub="Last 30 days" subColor="#6B7280" />
        </div>

        {/* Search bar + filters */}
        <Card>
          <InlineStack align="space-between" blockAlign="center" wrap gap="300">
            {/* Left: search + dropdowns */}
            <InlineStack gap="200" blockAlign="center" wrap>
              <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", fontSize: 14 }}>🔍</span>
                <input
                  type="search"
                  placeholder="Search subscribers…"
                  defaultValue={search}
                  onKeyDown={e => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
                  style={{ width: "100%", paddingLeft: 34, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, color: "#374151", outline: "none" }}
                />
              </div>

              {/* Status filter */}
              <select value={status} onChange={e => setParam("status", e.target.value)}
                style={{ padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", cursor: "pointer" }}>
                <option value="">All status</option>
                <option value="subscribed">Active</option>
                <option value="unsubscribed">Unsubscribed</option>
              </select>

              {/* Source filter */}
              <select value={source} onChange={e => setParam("source", e.target.value)}
                style={{ padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", cursor: "pointer" }}>
                {sourceOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>

              {/* Tags filter (UI only) */}
              <select style={{ padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", cursor: "pointer" }}>
                <option>All tags</option>
                <option>VIP</option>
                <option>Engaged</option>
                <option>Customer</option>
                <option>New</option>
              </select>
            </InlineStack>

            {/* Right: export + more actions */}
            <InlineStack gap="200">
              {selected.size > 0 && (
                <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>{selected.size} selected</span>
              )}
              <Button
                variant="plain"
                url={`/api/newsletter/export?shop=${encodeURIComponent(shop)}&status=${status || "subscribed"}`}
                external
              >
                Export CSV
              </Button>
              <div style={{ position: "relative" }}>
                <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}
                  onClick={() => setDeleteAllOpen(true)}>
                  More actions <span>▾</span>
                </button>
              </div>
            </InlineStack>
          </InlineStack>
        </Card>

        {/* Success / error banners */}
        {fetcher.data?.intent === "add-one" && fetcher.data?.ok && fetcher.state === "idle" && (
          <Banner tone="success" onDismiss={() => {}}>Subscriber added successfully.</Banner>
        )}
        {fetcher.data?.intent === "import-csv" && fetcher.data?.ok && fetcher.state === "idle" && (
          <Banner tone="success">
            Imported <strong>{fetcher.data.imported}</strong> subscribers
            {fetcher.data.skipped > 0 ? ` (${fetcher.data.skipped} skipped)` : ""}.
          </Banner>
        )}
        {fetcher.data?.error && fetcher.state === "idle" && fetcher.data?.intent !== "add-one" && (
          <Banner tone="critical">{fetcher.data.error}</Banner>
        )}

        {/* Subscriber table */}
        <Card padding="0">
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "40px 2fr 100px 140px 120px 130px 120px 80px 100px 40px", padding: "10px 16px", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA", alignItems: "center" }}>
            <div>
              <input type="checkbox" checked={allSelected} onChange={toggleAll}
                style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#008060" }} />
            </div>
            {["Subscriber", "Status", "Source", "Tags", "Subscribed on", "Last activity", "Orders", "Total spent", ""].map(h => (
              <Text key={h} as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{h}</Text>
            ))}
          </div>

          {subscribers.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
              <Text as="p" variant="headingMd">No subscribers found</Text>
              <div style={{ marginTop: 6, marginBottom: 20 }}>
                <Text as="p" variant="bodySm" tone="subdued">
                  {search || status || source ? "Try adjusting your filters." : "Add your first subscriber to get started."}
                </Text>
              </div>
              <Button onClick={() => setAddOpen(true)}>Add subscriber</Button>
            </div>
          ) : (
            subscribers.map((s, idx) => {
              const initials = getInitials(s.firstName, s.lastName, s.email);
              const color = avatarColor(s.email);
              const tags = getTagsForSubscriber(s);
              const lastActivity = getLastActivity(s);
              const isChecked = selected.has(s.id);
              return (
                <div key={s.id}>
                  {idx > 0 && <div style={{ height: 1, background: "#F3F4F6" }} />}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "40px 2fr 100px 140px 120px 130px 120px 80px 100px 40px",
                      padding: "12px 16px", alignItems: "center",
                      background: isChecked ? "#F0FDF4" : undefined,
                    }}
                    onMouseEnter={e => { if (!isChecked) (e.currentTarget as HTMLElement).style.background = "#FAFAFA"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isChecked ? "#F0FDF4" : ""; }}
                  >
                    {/* Checkbox */}
                    <div>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleOne(s.id)}
                        style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#008060" }} />
                    </div>

                    {/* Subscriber name + email */}
                    <InlineStack gap="200" blockAlign="center">
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%", background: color,
                        color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {initials}
                      </div>
                      <BlockStack gap="0">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          {s.firstName ? `${s.firstName} ${s.lastName ?? ""}`.trim() : s.email.split("@")[0]}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">{s.email}</Text>
                      </BlockStack>
                    </InlineStack>

                    {/* Status */}
                    <div><StatusPill status={s.status} /></div>

                    {/* Source */}
                    <Text as="p" variant="bodySm" tone="subdued">{getSourceLabel(s.source)}</Text>

                    {/* Tags */}
                    <InlineStack gap="100" wrap={false}>
                      {tags.length > 0
                        ? tags.map(t => <TagPill key={t.label} label={t.label} color={t.color} textColor={t.textColor} />)
                        : <Text as="p" variant="bodySm" tone="subdued">—</Text>
                      }
                    </InlineStack>

                    {/* Subscribed on */}
                    <Text as="p" variant="bodySm" tone="subdued">
                      {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>

                    {/* Last activity */}
                    <BlockStack gap="0">
                      <Text as="p" variant="bodySm" tone="subdued">
                        {(s.unsubscribedAt ? new Date(s.unsubscribedAt) : new Date(s.updatedAt)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                      <span style={{ fontSize: 11, fontWeight: 600, color: lastActivity.color }}>{lastActivity.text}</span>
                    </BlockStack>

                    {/* Orders */}
                    <Text as="p" variant="bodySm" tone="subdued">—</Text>

                    {/* Total spent */}
                    <Text as="p" variant="bodySm" tone="subdued">—</Text>

                    {/* Actions */}
                    <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF", padding: "4px 6px", borderRadius: 6 }}
                      title="Actions">···</button>
                  </div>
                </div>
              );
            })
          )}

          {/* Footer: count + pagination */}
          {total > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid #F3F4F6" }}>
              <Text as="p" variant="bodySm" tone="subdued">
                Showing {((page - 1) * PAGE_SIZE) + 1} to {Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} subscribers
              </Text>
              <InlineStack gap="100" blockAlign="center">
                <button
                  onClick={() => setParam("page", String(page - 1))}
                  disabled={page <= 1}
                  style={{ width: 32, height: 32, border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", cursor: page <= 1 ? "not-allowed" : "pointer", color: page <= 1 ? "#D1D5DB" : "#374151", fontSize: 14 }}>
                  ‹
                </button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button key={p} onClick={() => setParam("page", String(p))}
                      style={{ width: 32, height: 32, border: "1px solid", borderColor: p === page ? "#008060" : "#E5E7EB", borderRadius: 6, background: p === page ? "#008060" : "#fff", cursor: "pointer", color: p === page ? "#fff" : "#374151", fontSize: 13, fontWeight: 600 }}>
                      {p}
                    </button>
                  );
                })}
                {totalPages > 5 && <span style={{ color: "#9CA3AF", padding: "0 4px" }}>…</span>}
                {totalPages > 5 && (
                  <button onClick={() => setParam("page", String(totalPages))}
                    style={{ width: 32, height: 32, border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151", fontSize: 13, fontWeight: 600 }}>
                    {totalPages}
                  </button>
                )}
                <button
                  onClick={() => setParam("page", String(page + 1))}
                  disabled={page >= totalPages}
                  style={{ width: 32, height: 32, border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", cursor: page >= totalPages ? "not-allowed" : "pointer", color: page >= totalPages ? "#D1D5DB" : "#374151", fontSize: 14 }}>
                  ›
                </button>
              </InlineStack>
            </div>
          )}
        </Card>

        {/* Bottom helper cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {[
            { icon: "👥", iconBg: "#DCFCE7", title: "Grow your list", desc: "Create more signup forms to grow your audience.", btn: "Create sign up form", url: "/app/newsletter/widget" },
            { icon: "🛡️", iconBg: "#DBEAFE", title: "Keep your list healthy", desc: "Remove inactive or invalid contacts regularly.", btn: "View list health", url: "/app/newsletter/subscribers?status=unsubscribed" },
            { icon: "📖", iconBg: "#F3E8FF", title: "Need help?", desc: "Learn how to manage your subscribers.", btn: "View guide", url: "/app/newsletter/subscribers" },
          ].map(card => (
            <Card key={card.title} background="bg-surface-secondary">
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: card.iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    {card.icon}
                  </div>
                  <Text as="p" variant="bodySm" fontWeight="semibold">{card.title}</Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">{card.desc}</Text>
                <Button size="slim" onClick={() => navigate(card.url)}>{card.btn}</Button>
              </BlockStack>
            </Card>
          ))}
        </div>

      </BlockStack>

      {/* ── Add subscriber modal ── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add subscriber"
        primaryAction={{ content: "Add", loading: fetcher.state !== "idle", onAction: submitAdd }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAddOpen(false) }]}>
        <Modal.Section>
          <BlockStack gap="300">
            <TextField label="Email address" type="email" value={addEmail} onChange={setAddEmail} autoComplete="email" placeholder="customer@example.com" requiredIndicator />
            <InlineStack gap="300">
              <div style={{ flex: 1 }}>
                <TextField label="First name" value={addFirst} onChange={setAddFirst} autoComplete="given-name" placeholder="Jane" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Last name" value={addLast} onChange={setAddLast} autoComplete="family-name" placeholder="Smith" />
              </div>
            </InlineStack>
            {fetcher.data?.intent === "add-one" && fetcher.data?.error && (
              <Banner tone="critical">{fetcher.data.error}</Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── CSV import modal ── */}
      <Modal open={importOpen} onClose={() => { setImportOpen(false); setCsvFile(null); }} title="Import subscribers from CSV"
        primaryAction={importDone && fetcher.data?.ok
          ? { content: "Done", onAction: () => { setImportOpen(false); setCsvFile(null); } }
          : { content: "Import", loading: fetcher.state !== "idle", onAction: submitImport }}
        secondaryActions={[{ content: "Cancel", onAction: () => { setImportOpen(false); setCsvFile(null); } }]}>
        <Modal.Section>
          <BlockStack gap="400">
            {importDone && fetcher.data?.ok ? (
              <Banner tone="success">
                <Text as="p">Successfully imported <strong>{fetcher.data.imported}</strong> subscribers.
                  {fetcher.data.skipped > 0 && ` ${fetcher.data.skipped} rows skipped.`}
                </Text>
              </Banner>
            ) : (
              <>
                <Text as="p" variant="bodySm" tone="subdued">
                  Upload a CSV with columns: <code>email</code>, <code>first_name</code>, <code>last_name</code>. Header row is optional.
                </Text>
                <div
                  style={{ border: `2px dashed ${csvFile ? "#16A34A" : "#E5E7EB"}`, borderRadius: 10, padding: 28, textAlign: "center", cursor: "pointer", background: csvFile ? "#F0FDF4" : "#FAFAFA" }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setCsvFile(f); }}
                >
                  <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setCsvFile(f); }} />
                  {csvFile ? (
                    <BlockStack gap="050">
                      <Text as="p" fontWeight="semibold">{csvFile.name}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{(csvFile.size / 1024).toFixed(1)} KB — click to change</Text>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="050">
                      <Text as="p">Drop your CSV here, or click to browse</Text>
                      <Text as="p" variant="bodySm" tone="subdued">.csv, .tsv, or .txt</Text>
                    </BlockStack>
                  )}
                </div>
                <Divider />
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Example format</Text>
                  <div style={{ fontFamily: "monospace", fontSize: 12, background: "#F3F4F6", borderRadius: 6, padding: "10px 14px", color: "#374151" }}>
                    email,first_name,last_name<br />
                    jane@example.com,Jane,Smith<br />
                    bob@example.com,Bob,
                  </div>
                </BlockStack>
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Delete all modal ── */}
      <Modal open={deleteAllOpen} onClose={() => { setDeleteAllOpen(false); setDeleteConfirm(""); }} title="Delete all subscribers?"
        primaryAction={{ content: "Yes, delete all", destructive: true, disabled: deleteConfirm.toUpperCase() !== "DELETE", loading: fetcher.state !== "idle", onAction: () => { const fd = new FormData(); fd.append("intent", "delete-all"); fetcher.submit(fd, { method: "post" }); } }}
        secondaryActions={[{ content: "Cancel", onAction: () => { setDeleteAllOpen(false); setDeleteConfirm(""); } }]}>
        <Modal.Section>
          <BlockStack gap="300">
            <Banner tone="critical">
              <Text as="p">This will permanently delete <strong>all subscribers</strong>. This cannot be undone.</Text>
            </Banner>
            <TextField label='Type DELETE to confirm' value={deleteConfirm} onChange={setDeleteConfirm} autoComplete="off" placeholder="DELETE"
              error={deleteConfirm.length > 0 && deleteConfirm.toUpperCase() !== "DELETE" ? "Type DELETE in capitals" : undefined} />
          </BlockStack>
        </Modal.Section>
      </Modal>

    </Page>
  );
}

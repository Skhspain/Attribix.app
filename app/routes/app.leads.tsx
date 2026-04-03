// app/routes/app.leads.tsx
// Lead Center — manage and track leads from all sources.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Page,
  Card,
  DataTable,
  Badge,
  Select,
  Button,
  Modal,
  Form,
  FormLayout,
  TextField,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  EmptyState,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";
type LeadSource =
  | "newsletter_signup"
  | "contact_form"
  | "manual"
  | "import"
  | "meta_ad"
  | "google_ad";

interface Lead {
  id: string;
  shop: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  tags: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  fbclid: string | null;
  gclid: string | null;
  referrer: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sourceLabel(source: string | null): string {
  const map: Record<string, string> = {
    newsletter_signup: "Newsletter",
    meta_ad: "Meta Ad",
    google_ad: "Google Ad",
    manual: "Manual",
    contact_form: "Contact Form",
    import: "Import",
  };
  return source ? (map[source] ?? source) : "—";
}

function statusTone(
  status: string
): "info" | "warning" | "attention" | "success" | "subdued" | "critical" | "magic" | "read-only" | "enabled" | "new" {
  const map: Record<string, "info" | "warning" | "attention" | "success" | "subdued"> = {
    new: "info",
    contacted: "warning",
    qualified: "attention",
    converted: "success",
    lost: "subdued",
  };
  return map[status] ?? "info";
}

function formatAttribution(lead: Lead): string {
  const parts: string[] = [];
  if (lead.utmSource) parts.push(`src: ${lead.utmSource}`);
  if (lead.utmMedium) parts.push(`med: ${lead.utmMedium}`);
  if (lead.utmCampaign) parts.push(`cmp: ${lead.utmCampaign}`);
  if (lead.gclid) parts.push("gclid");
  if (lead.fbclid) parts.push("fbclid");
  return parts.length ? parts.join(" · ") : "—";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "all";
  const sourceFilter = url.searchParams.get("source") ?? "all";

  const where: Record<string, unknown> = { shop };
  if (statusFilter !== "all") where.status = statusFilter;
  if (sourceFilter !== "all") where.source = sourceFilter;

  const leads: Lead[] = await anyDb.lead
    ?.findMany?.({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    })
    .catch(() => []) ?? [];

  // Stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allLeads: Lead[] = await anyDb.lead
    ?.findMany?.({ where: { shop }, select: { status: true, createdAt: true } })
    .catch(() => []) ?? [];

  const totalLeads = allLeads.length;
  const newToday = allLeads.filter(
    (l: Lead) => new Date(l.createdAt) >= today
  ).length;
  const converted = allLeads.filter((l: Lead) => l.status === "converted").length;
  const qualified = allLeads.filter((l: Lead) => l.status === "qualified").length;
  const conversionRate =
    totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

  return json({
    leads: leads.map((l: Lead) => ({
      ...l,
      createdAt: l.createdAt instanceof Date ? (l.createdAt as Date).toISOString() : String(l.createdAt),
      updatedAt: l.updatedAt instanceof Date ? (l.updatedAt as Date).toISOString() : String(l.updatedAt),
      convertedAt: l.convertedAt ? (l.convertedAt instanceof Date ? (l.convertedAt as Date).toISOString() : String(l.convertedAt)) : null,
    })),
    stats: { totalLeads, newToday, conversionRate, qualified },
    statusFilter,
    sourceFilter,
  });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const body = await request.json().catch(() => ({}));
  const intent = body._intent as string;

  if (intent === "update_status") {
    const { id, status } = body as { id: string; status: string };
    await anyDb.lead
      ?.update?.({
        where: { id },
        data: {
          status,
          convertedAt: status === "converted" ? new Date() : undefined,
        },
      })
      .catch(() => null);
    return json({ ok: true });
  }

  if (intent === "add_note") {
    const { id, notes } = body as { id: string; notes: string };
    await anyDb.lead?.update?.({ where: { id }, data: { notes } }).catch(() => null);
    return json({ ok: true });
  }

  if (intent === "create_lead") {
    const { email, firstName, lastName, phone, company, source, notes } = body as {
      email: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      company?: string;
      source?: string;
      notes?: string;
    };

    if (!email) return json({ ok: false, error: "Email is required" }, { status: 400 });

    await anyDb.lead
      ?.upsert?.({
        where: { shop_email: { shop, email: email.toLowerCase().trim() } },
        create: {
          shop,
          email: email.toLowerCase().trim(),
          firstName: firstName ?? null,
          lastName: lastName ?? null,
          phone: phone ?? null,
          company: company ?? null,
          source: source ?? "manual",
          notes: notes ?? null,
          status: "new",
        },
        update: {
          firstName: firstName ?? undefined,
          lastName: lastName ?? undefined,
          phone: phone ?? undefined,
          company: company ?? undefined,
          notes: notes ?? undefined,
        },
      })
      .catch((err: Error) => {
        console.error("[leads] create_lead error:", err?.message);
      });
    return json({ ok: true });
  }

  if (intent === "delete_lead") {
    const { id } = body as { id: string };
    // Soft delete: mark as lost
    await anyDb.lead?.update?.({ where: { id }, data: { status: "lost" } }).catch(() => null);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
}

// ─── Status quick-change row component ───────────────────────────────────────

function StatusSelect({ lead }: { lead: Lead }) {
  const fetcher = useFetcher();
  const currentStatus = (fetcher.formData?.get("status") as string) ?? lead.status;

  const options = [
    { label: "New", value: "new" },
    { label: "Contacted", value: "contacted" },
    { label: "Qualified", value: "qualified" },
    { label: "Converted", value: "converted" },
    { label: "Lost", value: "lost" },
  ];

  return (
    <Select
      label=""
      labelHidden
      options={options}
      value={currentStatus}
      onChange={(val) => {
        fetcher.submit(
          { _intent: "update_status", id: lead.id, status: val },
          { method: "post", encType: "application/json" }
        );
      }}
    />
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "16px 20px",
        flex: 1,
        minWidth: 130,
      }}
    >
      <Text as="p" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <Text as="p" variant="headingLg">
        {value}
      </Text>
      {sub && (
        <Text as="p" variant="bodySm" tone="subdued">
          {sub}
        </Text>
      )}
    </div>
  );
}

// ─── Add Lead Modal ───────────────────────────────────────────────────────────

function AddLeadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("manual");

  const isSaving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok && fetcher.state === "idle";

  const handleSubmit = useCallback(() => {
    fetcher.submit(
      { _intent: "create_lead", email, firstName, lastName, phone, company, notes, source },
      { method: "post", encType: "application/json" }
    );
  }, [fetcher, email, firstName, lastName, phone, company, notes, source]);

  const handleClose = useCallback(() => {
    setEmail("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setCompany("");
    setNotes("");
    setSource("manual");
    onClose();
  }, [onClose]);

  // Auto-close on success
  if (saved && open) {
    handleClose();
  }

  const sourceOptions = [
    { label: "Manual", value: "manual" },
    { label: "Newsletter Signup", value: "newsletter_signup" },
    { label: "Contact Form", value: "contact_form" },
    { label: "Meta Ad", value: "meta_ad" },
    { label: "Google Ad", value: "google_ad" },
    { label: "Import", value: "import" },
  ];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add lead"
      primaryAction={{
        content: isSaving ? "Saving..." : "Add lead",
        onAction: handleSubmit,
        loading: isSaving,
        disabled: !email || isSaving,
      }}
      secondaryActions={[{ content: "Cancel", onAction: handleClose }]}
    >
      <Modal.Section>
        {fetcher.data?.error && (
          <Box paddingBlockEnd="400">
            <Banner tone="critical">{fetcher.data.error}</Banner>
          </Box>
        )}
        <Form onSubmit={handleSubmit}>
          <FormLayout>
            <TextField
              label="Email address"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
              requiredIndicator
            />
            <FormLayout.Group>
              <TextField
                label="First name"
                value={firstName}
                onChange={setFirstName}
                autoComplete="given-name"
              />
              <TextField
                label="Last name"
                value={lastName}
                onChange={setLastName}
                autoComplete="family-name"
              />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField
                label="Phone"
                value={phone}
                onChange={setPhone}
                type="tel"
                autoComplete="tel"
              />
              <TextField
                label="Company"
                value={company}
                onChange={setCompany}
                autoComplete="organization"
              />
            </FormLayout.Group>
            <Select
              label="Source"
              options={sourceOptions}
              value={source}
              onChange={setSource}
            />
            <TextField
              label="Notes"
              value={notes}
              onChange={setNotes}
              multiline={3}
              autoComplete="off"
            />
          </FormLayout>
        </Form>
      </Modal.Section>
    </Modal>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { leads, stats, statusFilter, sourceFilter } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addModalOpen, setAddModalOpen] = useState(false);

  const handleStatusFilter = useCallback(
    (val: string) => {
      const next = new URLSearchParams(searchParams);
      val === "all" ? next.delete("status") : next.set("status", val);
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const handleSourceFilter = useCallback(
    (val: string) => {
      const next = new URLSearchParams(searchParams);
      val === "all" ? next.delete("source") : next.set("source", val);
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const statusOptions = [
    { label: "All statuses", value: "all" },
    { label: "New", value: "new" },
    { label: "Contacted", value: "contacted" },
    { label: "Qualified", value: "qualified" },
    { label: "Converted", value: "converted" },
    { label: "Lost", value: "lost" },
  ];

  const sourceOptions = [
    { label: "All sources", value: "all" },
    { label: "Newsletter", value: "newsletter_signup" },
    { label: "Contact Form", value: "contact_form" },
    { label: "Meta Ad", value: "meta_ad" },
    { label: "Google Ad", value: "google_ad" },
    { label: "Manual", value: "manual" },
    { label: "Import", value: "import" },
  ];

  const rows = leads.map((lead) => [
    // Name / Email
    <BlockStack gap="050" key={lead.id + "_name"}>
      <Text as="span" variant="bodyMd" fontWeight="semibold">
        {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—"}
      </Text>
      <Text as="span" variant="bodySm" tone="subdued">
        {lead.email}
      </Text>
      {lead.company && (
        <Text as="span" variant="bodySm" tone="subdued">
          {lead.company}
        </Text>
      )}
    </BlockStack>,
    // Source
    <Text as="span" variant="bodySm" key={lead.id + "_src"}>
      {sourceLabel(lead.source)}
    </Text>,
    // Status
    <Badge key={lead.id + "_badge"} tone={statusTone(lead.status)}>
      {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
    </Badge>,
    // Attribution
    <Text as="span" variant="bodySm" tone="subdued" key={lead.id + "_attr"}>
      {formatAttribution(lead)}
    </Text>,
    // Created
    <Text as="span" variant="bodySm" tone="subdued" key={lead.id + "_date"}>
      {formatDate(lead.createdAt)}
    </Text>,
    // Actions
    <div key={lead.id + "_actions"} style={{ minWidth: 140 }}>
      <StatusSelect lead={lead} />
    </div>,
  ]);

  return (
    <Page
      title="Lead Center"
      subtitle={`${stats.totalLeads} total lead${stats.totalLeads !== 1 ? "s" : ""}`}
      primaryAction={{
        content: "Add lead",
        onAction: () => setAddModalOpen(true),
      }}
    >
      <BlockStack gap="500">
        {/* Stats row */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard label="Total Leads" value={stats.totalLeads} />
          <StatCard label="New Today" value={stats.newToday} />
          <StatCard
            label="Conversion Rate"
            value={`${stats.conversionRate}%`}
            sub="converted / total"
          />
          <StatCard label="Qualified" value={stats.qualified} />
        </div>

        {/* Filters */}
        <Card>
          <InlineStack gap="400" wrap blockAlign="end">
            <div style={{ minWidth: 180 }}>
              <Select
                label="Status"
                options={statusOptions}
                value={statusFilter}
                onChange={handleStatusFilter}
              />
            </div>
            <div style={{ minWidth: 180 }}>
              <Select
                label="Source"
                options={sourceOptions}
                value={sourceFilter}
                onChange={handleSourceFilter}
              />
            </div>
          </InlineStack>
        </Card>

        {/* Table */}
        <Card padding="0">
          {leads.length === 0 ? (
            <EmptyState
              heading="No leads yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <Text as="p" variant="bodyMd">
                Leads are automatically created when visitors submit your newsletter popup or contact
                forms. You can also add leads manually using the button above.
              </Text>
            </EmptyState>
          ) : (
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text", "text"]}
              headings={["Name / Email", "Source", "Status", "Attribution", "Created", "Change status"]}
              rows={rows}
              hasZebraStripingOnData
              increasedTableDensity
            />
          )}
        </Card>
      </BlockStack>

      <AddLeadModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
    </Page>
  );
}

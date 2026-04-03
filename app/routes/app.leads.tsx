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
  DropZone,
  Link,
} from "@shopify/polaris";
import { useState, useCallback, useRef } from "react";

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

  if (intent === "import_leads") {
    const { rows } = body as {
      rows: Array<{
        email: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        company?: string;
        notes?: string;
        tags?: string;
        utmSource?: string;
        utmMedium?: string;
        utmCampaign?: string;
      }>;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ ok: false, error: "No rows to import" }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows.slice(0, 5000)) {
      const email = row.email?.trim()?.toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        skipped++;
        continue;
      }
      try {
        await anyDb.lead?.upsert?.({
          where: { shop_email: { shop, email } },
          create: {
            shop, email,
            firstName: row.firstName?.trim() || null,
            lastName: row.lastName?.trim() || null,
            phone: row.phone?.trim() || null,
            company: row.company?.trim() || null,
            notes: row.notes?.trim() || null,
            tags: row.tags?.trim() || null,
            utmSource: row.utmSource?.trim() || null,
            utmMedium: row.utmMedium?.trim() || null,
            utmCampaign: row.utmCampaign?.trim() || null,
            source: "import",
            status: "new",
          },
          update: {
            firstName: row.firstName?.trim() || undefined,
            lastName: row.lastName?.trim() || undefined,
            phone: row.phone?.trim() || undefined,
            company: row.company?.trim() || undefined,
            notes: row.notes?.trim() || undefined,
            tags: row.tags?.trim() || undefined,
            utmSource: row.utmSource?.trim() || undefined,
            utmMedium: row.utmMedium?.trim() || undefined,
            utmCampaign: row.utmCampaign?.trim() || undefined,
          },
        });
        imported++;
      } catch (e: any) {
        errors.push(email);
        skipped++;
      }
    }

    return json({ ok: true, imported, skipped, errors: errors.slice(0, 10) });
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

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").trim());
  return lines.slice(1).map((line) => {
    // Simple CSV parse: handles quoted fields
    const vals: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { vals.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  }).filter((r) => r.email || r.Email || r.EMAIL);
}

// Maps flexible header names to our field names
function normaliseRow(raw: Record<string, string>) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k] ?? raw[k.toLowerCase()] ?? raw[k.toUpperCase()];
      if (v) return v;
    }
    return undefined;
  };
  return {
    email: get("email", "Email", "EMAIL", "e-mail") ?? "",
    firstName: get("firstName", "first_name", "First Name", "firstname"),
    lastName: get("lastName", "last_name", "Last Name", "lastname"),
    phone: get("phone", "Phone", "mobile", "Mobile"),
    company: get("company", "Company", "organisation", "organization"),
    notes: get("notes", "Notes"),
    tags: get("tags", "Tags"),
    utmSource: get("utmSource", "utm_source"),
    utmMedium: get("utmMedium", "utm_medium"),
    utmCampaign: get("utmCampaign", "utm_campaign"),
  };
}

const CSV_TEMPLATE = `email,firstName,lastName,phone,company,notes,tags,utmSource,utmMedium,utmCampaign
john@example.com,John,Smith,+1 555 0100,Acme Corp,Met at conference,vip,google,cpc,spring_sale
jane@example.com,Jane,Doe,,,,`;

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "leads_import_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

function ImportLeadsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fetcher = useFetcher<{ ok: boolean; imported?: number; skipped?: number; errors?: string[]; error?: string }>();
  const [rows, setRows] = useState<ReturnType<typeof normaliseRow>[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const isImporting = fetcher.state !== "idle";
  const result = fetcher.data;

  const handleFile = useCallback((file: File) => {
    setParseError("");
    setRows([]);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseCSV(text).map(normaliseRow).filter((r) => r.email);
        if (parsed.length === 0) {
          setParseError("No valid email addresses found. Make sure your CSV has an 'email' column.");
          return;
        }
        setRows(parsed);
      } catch {
        setParseError("Failed to parse CSV. Please check the file format.");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((_: File[], accepted: File[]) => {
    if (accepted[0]) handleFile(accepted[0]);
  }, [handleFile]);

  const handleImport = useCallback(() => {
    fetcher.submit(
      { _intent: "import_leads", rows } as any,
      { method: "post", encType: "application/json" }
    );
  }, [fetcher, rows]);

  const handleClose = useCallback(() => {
    setRows([]);
    setFileName("");
    setParseError("");
    onClose();
  }, [onClose]);

  const done = result?.ok && fetcher.state === "idle" && rows.length > 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import leads from CSV"
      primaryAction={rows.length > 0 && !done ? {
        content: isImporting ? `Importing ${rows.length} leads…` : `Import ${rows.length} lead${rows.length !== 1 ? "s" : ""}`,
        onAction: handleImport,
        loading: isImporting,
        disabled: isImporting,
      } : undefined}
      secondaryActions={[{ content: done ? "Close" : "Cancel", onAction: handleClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {/* Template download */}
          <InlineStack align="space-between" blockAlign="center">
            <Text as="p" variant="bodySm" tone="subdued">
              CSV must have an <code>email</code> column. Optional: firstName, lastName, phone, company, notes, tags, utmSource, utmMedium, utmCampaign
            </Text>
            <Button variant="plain" onClick={downloadTemplate}>Download template</Button>
          </InlineStack>

          {/* Success result */}
          {done && (
            <Banner tone="success">
              ✅ Imported <strong>{result?.imported}</strong> lead{result?.imported !== 1 ? "s" : ""}
              {(result?.skipped ?? 0) > 0 && ` · ${result?.skipped} skipped (invalid email or duplicate)`}
            </Banner>
          )}

          {/* Error */}
          {result?.error && <Banner tone="critical">{result.error}</Banner>}
          {parseError && <Banner tone="critical">{parseError}</Banner>}

          {/* Drop zone */}
          {!done && (
            <DropZone
              accept=".csv,text/csv"
              type="file"
              allowMultiple={false}
              onDrop={handleDrop}
              label="Drop CSV file here or click to browse"
            >
              {fileName ? (
                <Box padding="400">
                  <Text as="p" variant="bodyMd">📄 {fileName} — <strong>{rows.length}</strong> valid lead{rows.length !== 1 ? "s" : ""} found</Text>
                </Box>
              ) : (
                <DropZone.FileUpload actionTitle="Choose CSV file" actionHint="or drag and drop" />
              )}
            </DropZone>
          )}

          {/* Preview table */}
          {rows.length > 0 && !done && (
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">Preview (first 5 rows):</Text>
              <div style={{ overflowX: "auto", fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Email", "First", "Last", "Company", "Phone"].map((h) => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "5px 10px" }}>{r.email}</td>
                        <td style={{ padding: "5px 10px" }}>{r.firstName ?? "—"}</td>
                        <td style={{ padding: "5px 10px" }}>{r.lastName ?? "—"}</td>
                        <td style={{ padding: "5px 10px" }}>{r.company ?? "—"}</td>
                        <td style={{ padding: "5px 10px" }}>{r.phone ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 5 && (
                <Text as="p" variant="bodySm" tone="subdued">…and {rows.length - 5} more rows</Text>
              )}
            </BlockStack>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { leads, stats, statusFilter, sourceFilter } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

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
      secondaryActions={[{
        content: "Import CSV",
        onAction: () => setImportModalOpen(true),
      }]}
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
      <ImportLeadsModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </Page>
  );
}

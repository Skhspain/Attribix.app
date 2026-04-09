// app/routes/app.leads.tsx
// Lead Center — manage and track leads from all sources.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Page,
  Card,
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
import { useState, useCallback, useRef, useEffect } from "react";

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
    google_form: "Google Form",
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

function rowColors(status: string): { bg: string; border: string } {
  if (status === "converted") return { bg: "#f0fdf4", border: "#22c55e" };
  if (status === "lost")      return { bg: "#fef2f2", border: "#ef4444" };
  if (status === "contacted") return { bg: "#fffbeb", border: "#f59e0b" };
  if (status === "qualified") return { bg: "#fffbeb", border: "#f59e0b" };
  // new → white / no color
  return { bg: "#ffffff", border: "#e5e7eb" };
}

function StatusDot({ status }: { status: string }) {
  const { border } = rowColors(status);
  const label =
    status === "converted" ? "Converted" :
    status === "lost"      ? "Lost" :
    status === "new"       ? "New" :
    status === "contacted" ? "Contacted" :
    status === "qualified" ? "Qualified" : status;
  // New leads get a subdued grey dot
  const dotColor = status === "new" ? "#9ca3af" : border;
  const textColor = status === "new" ? "#6b7280" : border;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: textColor }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
      {label}
    </span>
  );
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

  // Webhook token + Meta connection status
  const trackingSettings = await anyDb.trackingSettings?.findUnique?.({ where: { shop } }).catch(() => null);
  const metaConnection = await anyDb.metaConnection?.findUnique?.({ where: { shop }, select: { id: true, accessToken: true } }).catch(() => null);
  const metaConnected = !!metaConnection && metaConnection.accessToken !== "__PENDING__";
  const webhookToken = trackingSettings?.leadWebhookToken || null;
  const apiBase = process.env.APP_URL || "https://api.attribix.app";
  const webhookUrl = webhookToken ? `${apiBase}/api/leads/webhook?shop=${encodeURIComponent(shop)}&token=${encodeURIComponent(webhookToken)}` : null;

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
    webhookUrl,
    webhookToken: !!webhookToken,
    metaConnected,
    shop,
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

    const cleanEmail = email.toLowerCase().trim();

    // Check if lead already exists so we can give accurate feedback
    const existing = await anyDb.lead
      ?.findUnique?.({ where: { shop_email: { shop, email: cleanEmail } }, select: { id: true } })
      .catch(() => null);

    try {
      await anyDb.lead?.upsert?.({
        where: { shop_email: { shop, email: cleanEmail } },
        create: {
          shop,
          email: cleanEmail,
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
      });
      return json({ ok: true, created: !existing, updated: !!existing });
    } catch (err: any) {
      console.error("[leads] create_lead error:", err?.message);
      return json({ ok: false, error: err?.message ?? "Failed to save lead" }, { status: 500 });
    }
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

  if (intent === "generate_webhook_token") {
    const crypto = await import("crypto");
    const token = crypto.randomBytes(24).toString("hex");
    await anyDb.trackingSettings?.upsert?.({
      where: { shop },
      create: { shop, leadWebhookToken: token },
      update: { leadWebhookToken: token },
    });
    return json({ ok: true, token });
  }

  if (intent === "sync_meta_leads") {
    try {
      const metaConn = await anyDb.metaConnection?.findUnique?.({ where: { shop } });
      if (!metaConn || metaConn.accessToken === "__PENDING__") {
        return json({ ok: false, error: "Meta not connected. Connect Meta in Integrations first." }, { status: 400 });
      }
      // Fetch lead gen forms from the ad account's associated pages
      const token = metaConn.accessToken;
      const adAccountId = metaConn.adAccountId;

      // First get pages connected to the ad account / user
      const pagesRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name&access_token=${token}&limit=100`);
      const pagesData = await pagesRes.json();
      const pages = pagesData?.data || [];

      if (pages.length === 0) {
        return json({ ok: false, error: "No Facebook Pages found. Ensure your Meta app has pages_manage_ads permission." }, { status: 400 });
      }

      let totalImported = 0;
      let totalSkipped = 0;

      for (const page of pages) {
        // Get lead gen forms for this page
        const formsRes = await fetch(`https://graph.facebook.com/v20.0/${page.id}/leadgen_forms?fields=id,name,status&access_token=${token}&limit=100`);
        const formsData = await formsRes.json();
        const forms = formsData?.data || [];

        for (const form of forms) {
          // Fetch leads from each form (last 90 days)
          const leadsRes = await fetch(`https://graph.facebook.com/v20.0/${form.id}/leads?fields=id,created_time,field_data&limit=500&access_token=${token}`);
          const leadsData = await leadsRes.json();
          const formLeads = leadsData?.data || [];

          for (const metaLead of formLeads) {
            const fields = metaLead.field_data || [];
            const getField = (names: string[]) => {
              for (const n of names) {
                const f = fields.find((fd: any) => fd.name?.toLowerCase() === n.toLowerCase());
                if (f?.values?.[0]) return f.values[0];
              }
              return null;
            };

            const email = getField(["email", "e-mail", "e_mail"])?.toLowerCase()?.trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { totalSkipped++; continue; }

            const fullName = getField(["full_name", "name"]);
            const firstName = getField(["first_name", "firstname"]) || (fullName?.split(/\s+/)?.[0]) || null;
            const lastName = getField(["last_name", "lastname"]) || (fullName?.split(/\s+/)?.slice(1)?.join(" ")) || null;

            try {
              await anyDb.lead?.upsert?.({
                where: { shop_email: { shop, email } },
                create: {
                  shop, email,
                  firstName,
                  lastName,
                  phone: getField(["phone_number", "phone", "tel"]),
                  company: getField(["company_name", "company", "organization"]),
                  source: "meta_ad",
                  status: "new",
                  notes: `Meta Lead Form: ${form.name || form.id}`,
                },
                update: {
                  firstName: firstName || undefined,
                  lastName: lastName || undefined,
                  phone: getField(["phone_number", "phone", "tel"]) || undefined,
                },
              });
              totalImported++;
            } catch { totalSkipped++; }
          }
        }
      }

      return json({ ok: true, imported: totalImported, skipped: totalSkipped, pages: pages.length });
    } catch (e: any) {
      console.error("[leads] meta sync error:", e.message);
      return json({ ok: false, error: e.message || "Failed to sync Meta leads" }, { status: 500 });
    }
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
  const fetcher = useFetcher<{ ok: boolean; error?: string; created?: boolean; updated?: boolean }>();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("manual");

  // Track whether a submission happened in THIS modal session.
  // fetcher.data persists between modal opens, so without this guard
  // reopening the modal would see saved=true immediately and close again.
  const didSubmitRef = useRef(false);

  const isSaving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok === true && fetcher.state === "idle";

  // Reset the submission guard whenever the modal opens
  useEffect(() => {
    if (open) {
      didSubmitRef.current = false;
    }
  }, [open]);

  const handleClose = useCallback(() => {
    setEmail("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setCompany("");
    setNotes("");
    setSource("manual");
    didSubmitRef.current = false;
    onClose();
  }, [onClose]);

  // Auto-close only on a NEW lead created in this session
  useEffect(() => {
    if (fetcher.data?.created && open && didSubmitRef.current && fetcher.state === "idle") {
      handleClose();
    }
  }, [fetcher.data, fetcher.state, open, handleClose]);

  const handleSubmit = useCallback(() => {
    didSubmitRef.current = true;
    fetcher.submit(
      { _intent: "create_lead", email, firstName, lastName, phone, company, notes, source },
      { method: "post", encType: "application/json" }
    );
  }, [fetcher, email, firstName, lastName, phone, company, notes, source]);

  const sourceOptions = [
    { label: "Manual", value: "manual" },
    { label: "Newsletter Signup", value: "newsletter_signup" },
    { label: "Contact Form", value: "contact_form" },
    { label: "Meta Ad", value: "meta_ad" },
    { label: "Google Ad", value: "google_ad" },
    { label: "Import", value: "import" },
  ];

  // Show result state (only if this session submitted)
  const showResult = fetcher.state === "idle" && fetcher.data && didSubmitRef.current;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add lead"
      primaryAction={showResult && fetcher.data?.updated ? undefined : {
        content: isSaving ? "Saving..." : "Add lead",
        onAction: handleSubmit,
        loading: isSaving,
        disabled: !email || isSaving,
      }}
      secondaryActions={[{ content: showResult ? "Close" : "Cancel", onAction: handleClose }]}
    >
      <Modal.Section>
        {showResult && fetcher.data?.error && (
          <Box paddingBlockEnd="400">
            <Banner tone="critical">
              ❌ {fetcher.data.error}
            </Banner>
          </Box>
        )}
        {showResult && fetcher.data?.updated && (
          <Box paddingBlockEnd="400">
            <Banner tone="warning">
              ⚠️ A lead with this email already exists — their details have been updated instead. To add a new lead, use a different email address.
            </Banner>
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
            <BlockStack gap="200">
              <Banner tone="success">
                ✅ Import complete
              </Banner>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 4 }}>
                {[
                  { label: "Leads created", value: result?.imported ?? 0, color: "#10b981" },
                  { label: "Skipped / duplicates", value: result?.skipped ?? 0, color: "#f59e0b" },
                  { label: "Total in file", value: (result?.imported ?? 0) + (result?.skipped ?? 0), color: "#6b7280" },
                ].map(s => (
                  <div key={s.label} style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {(result?.errors?.length ?? 0) > 0 && (
                <Text as="p" variant="bodySm" tone="caution">
                  Failed emails: {result?.errors?.join(", ")}
                </Text>
              )}
            </BlockStack>
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
  const { leads, stats, statusFilter, sourceFilter, webhookUrl, webhookToken, metaConnected, shop } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [webhookSectionOpen, setWebhookSectionOpen] = useState(false);
  const webhookFetcher = useFetcher();
  const metaSyncFetcher = useFetcher();

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
    { label: "Google Form", value: "google_form" },
    { label: "Manual", value: "manual" },
    { label: "Import", value: "import" },
  ];

  // Legend for the color coding
  const statusLegend = [
    { label: "New", color: "#9ca3af" },
    { label: "In progress (contacted / qualified)", color: "#f59e0b" },
    { label: "Converted", color: "#22c55e" },
    { label: "Lost", color: "#ef4444" },
  ];

  return (
    <Page
      title="Lead Center"
      subtitle={`${stats.totalLeads} total lead${stats.totalLeads !== 1 ? "s" : ""}`}
      primaryAction={{
        content: "Add lead",
        onAction: () => setAddModalOpen(true),
      }}
      secondaryActions={[
        {
          content: "Import CSV",
          onAction: () => setImportModalOpen(true),
        },
        {
          content: "Export CSV",
          onAction: () => window.open("/app/leads/export", "_blank"),
        },
      ]}
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

        {/* Import Sources: Webhook + Meta Sync */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingSm">Import Sources</Text>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {/* Meta Lead Sync */}
              <div style={{ flex: 1, minWidth: 280, padding: 16, background: "#f0f4ff", borderRadius: 8, border: "1px solid #c7d2fe" }}>
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ fontSize: 20 }}>📘</span>
                  <Text as="h3" variant="headingSm">Meta Lead Ads</Text>
                </InlineStack>
                <div style={{ marginTop: 8 }}>
                  {metaConnected ? (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">Pull leads from your Meta Lead Ad forms.</Text>
                      <Button
                        variant="primary"
                        size="slim"
                        loading={metaSyncFetcher.state !== "idle"}
                        onClick={() => metaSyncFetcher.submit(
                          { _intent: "sync_meta_leads" },
                          { method: "post", encType: "application/json" }
                        )}
                      >
                        Sync Meta Leads
                      </Button>
                      {metaSyncFetcher.data?.ok && (
                        <Banner tone="success">
                          Imported {(metaSyncFetcher.data as any).imported} leads from {(metaSyncFetcher.data as any).pages} page(s). {(metaSyncFetcher.data as any).skipped > 0 ? `${(metaSyncFetcher.data as any).skipped} skipped.` : ""}
                        </Banner>
                      )}
                      {metaSyncFetcher.data && !metaSyncFetcher.data.ok && (
                        <Banner tone="critical">{(metaSyncFetcher.data as any).error}</Banner>
                      )}
                    </BlockStack>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Connect Meta in <Link url="/app/integrations/meta">Integrations</Link> to sync leads from Lead Ad forms.
                    </Text>
                  )}
                </div>
              </div>

              {/* Google Forms Webhook */}
              <div style={{ flex: 1, minWidth: 280, padding: 16, background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ fontSize: 20 }}>📝</span>
                  <Text as="h3" variant="headingSm">Google Forms / Webhook</Text>
                </InlineStack>
                <div style={{ marginTop: 8 }}>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Receive leads automatically from Google Forms, Typeform, or any service that can POST JSON.
                    </Text>
                    {webhookUrl ? (
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold">Webhook URL:</Text>
                        <div style={{ padding: "8px 12px", background: "#fff", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, fontFamily: "monospace", wordBreak: "break-all" }}>
                          {webhookUrl}
                        </div>
                        <InlineStack gap="200">
                          <Button size="slim" onClick={() => navigator.clipboard.writeText(webhookUrl)}>Copy URL</Button>
                          <Button size="slim" variant="plain" onClick={() => setWebhookSectionOpen(!webhookSectionOpen)}>
                            {webhookSectionOpen ? "Hide setup guide" : "Setup guide"}
                          </Button>
                        </InlineStack>
                        {webhookSectionOpen && (
                          <div style={{ marginTop: 8, padding: 12, background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                            <Text as="p" variant="bodySm" fontWeight="semibold">Google Forms Apps Script:</Text>
                            <div style={{ marginTop: 8, padding: 10, background: "#1e293b", color: "#e2e8f0", borderRadius: 6, fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap", overflowX: "auto" }}>
{`function onFormSubmit(e) {
  var items = e.response.getItemResponses();
  var data = {};
  items.forEach(function(item) {
    var title = item.getItem().getTitle().toLowerCase();
    if (title.includes("email")) data.email = item.getResponse();
    else if (title.includes("name")) data.name = item.getResponse();
    else if (title.includes("phone")) data.phone = item.getResponse();
    else if (title.includes("company")) data.company = item.getResponse();
    else data[title] = item.getResponse();
  });
  UrlFetchApp.fetch("${webhookUrl}", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(data)
  });
}`}
                            </div>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Paste this in your Google Form's Apps Script editor (Extensions → Apps Script), then set a trigger for "onFormSubmit".
                            </Text>
                          </div>
                        )}
                      </BlockStack>
                    ) : (
                      <Button
                        variant="primary"
                        size="slim"
                        loading={webhookFetcher.state !== "idle"}
                        onClick={() => webhookFetcher.submit(
                          { _intent: "generate_webhook_token" },
                          { method: "post", encType: "application/json" }
                        )}
                      >
                        Generate Webhook URL
                      </Button>
                    )}
                  </BlockStack>
                </div>
              </div>
            </div>
          </BlockStack>
        </Card>

        {/* Filters + Export */}
        <Card>
          <InlineStack gap="400" wrap blockAlign="end" align="space-between">
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
            <div style={{ paddingTop: 20 }}>
              <Button
                variant="plain"
                icon={<span style={{ fontSize: 14 }}>⬇️</span>}
                onClick={() => {
                  const params = new URLSearchParams();
                  if (statusFilter !== "all") params.set("status", statusFilter);
                  if (sourceFilter !== "all") params.set("source", sourceFilter);
                  const qs = params.toString();
                  window.open(`/app/leads/export${qs ? `?${qs}` : ""}`, "_blank");
                }}
              >
                Export CSV ({leads.length}{statusFilter !== "all" || sourceFilter !== "all" ? " filtered" : ""})
              </Button>
            </div>
          </InlineStack>
        </Card>

        {/* Color legend */}
        <InlineStack gap="300" blockAlign="center">
          {statusLegend.map(l => (
            <span key={l.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.color, display: "inline-block" }} />
              <span style={{ color: "#6b7280" }}>{l.label}</span>
            </span>
          ))}
        </InlineStack>

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
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
                    {["Name / Email", "Source", "Status", "Attribution", "Created", "Change status"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const { bg, border } = rowColors(lead.status);
                    return (
                      <tr
                        key={lead.id}
                        style={{
                          borderBottom: "1px solid #e5e7eb",
                          background: bg,
                          borderLeft: `4px solid ${border}`,
                        }}
                      >
                        {/* Name / Email */}
                        <td style={{ padding: "10px 14px", minWidth: 180 }}>
                          <div style={{ fontWeight: 600, color: "#111827" }}>
                            {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—"}
                          </div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{lead.email}</div>
                          {lead.company && <div style={{ color: "#9ca3af", fontSize: 12 }}>{lead.company}</div>}
                        </td>
                        {/* Source */}
                        <td style={{ padding: "10px 14px", color: "#374151", whiteSpace: "nowrap" }}>
                          {sourceLabel(lead.source)}
                        </td>
                        {/* Status */}
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          <StatusDot status={lead.status} />
                        </td>
                        {/* Attribution */}
                        <td style={{ padding: "10px 14px", color: "#6b7280", fontSize: 12, maxWidth: 200 }}>
                          {formatAttribution(lead)}
                        </td>
                        {/* Created */}
                        <td style={{ padding: "10px 14px", color: "#9ca3af", whiteSpace: "nowrap" }}>
                          {formatDate(lead.createdAt)}
                        </td>
                        {/* Change status */}
                        <td style={{ padding: "10px 14px", minWidth: 160 }}>
                          <StatusSelect lead={lead} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </BlockStack>

      <AddLeadModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
      <ImportLeadsModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </Page>
  );
}

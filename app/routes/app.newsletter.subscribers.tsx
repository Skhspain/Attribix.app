// app/routes/app.newsletter.subscribers.tsx
// Subscriber list — filter, paginate, manual add, CSV import, CSV export, unsubscribe.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Card,
  DataTable,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Pagination,
  Modal,
  TextField,
  Banner,
  Divider,
  DropZone,
  Thumbnail,
} from "@shopify/polaris";
import { useState, useCallback, useRef } from "react";
import { unsubscribeEmail } from "~/services/newsletter.server";

const PAGE_SIZE = 50;

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const status = url.searchParams.get("status") || "subscribed";
  const source = url.searchParams.get("source") || "";
  const search = url.searchParams.get("q") || "";

  const where: any = { shop };
  if (status) where.status = status;
  if (source) where.source = source;
  if (search) where.email = { contains: search.toLowerCase() };

  const [subscribers, total] = await Promise.all([
    db.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.newsletterSubscriber.count({ where }),
  ]);

  const sourceCounts = await db.newsletterSubscriber.groupBy({
    by: ["source"],
    where: { shop },
    _count: { source: true },
  });

  return json({ subscribers, total, page, status, source, search, sourceCounts, shop });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  // ── Unsubscribe ────────────────────────────────────────────────────────────
  if (intent === "unsubscribe") {
    const email = form.get("email") as string;
    await unsubscribeEmail(shop, email);
    return json({ ok: true, intent });
  }

  // ── Add single subscriber ──────────────────────────────────────────────────
  if (intent === "add-one") {
    const email = (form.get("email") as string || "").trim().toLowerCase();
    const firstName = (form.get("firstName") as string || "").trim();
    const lastName = (form.get("lastName") as string || "").trim();

    if (!email || !email.includes("@")) {
      return json({ ok: false, intent, error: "Please enter a valid email address." });
    }

    try {
      await db.newsletterSubscriber.upsert({
        where: { shop_email: { shop, email } },
        create: { shop, email, firstName: firstName || null, lastName: lastName || null, status: "subscribed", source: "manual" },
        update: { status: "subscribed", firstName: firstName || undefined, lastName: lastName || undefined },
      });
      return json({ ok: true, intent });
    } catch (e: any) {
      return json({ ok: false, intent, error: "Failed to add subscriber." });
    }
  }

  // ── CSV import ─────────────────────────────────────────────────────────────
  if (intent === "import-csv") {
    const csvText = (form.get("csv") as string || "").trim();
    if (!csvText) return json({ ok: false, intent, error: "No CSV data received." });

    const lines = csvText.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return json({ ok: false, intent, error: "Empty file." });

    // Detect separator
    const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";

    // Detect header row
    const firstCols = lines[0].split(sep).map(c => c.trim().toLowerCase().replace(/['"]/g, ""));
    const hasHeader = firstCols.some(c => ["email", "e-mail", "mail"].includes(c));

    // Map column indices
    const emailIdx = hasHeader ? Math.max(firstCols.indexOf("email"), firstCols.indexOf("e-mail"), firstCols.indexOf("mail")) : 0;
    const firstIdx = hasHeader ? Math.max(firstCols.indexOf("first_name"), firstCols.indexOf("firstname"), firstCols.indexOf("first name")) : 1;
    const lastIdx  = hasHeader ? Math.max(firstCols.indexOf("last_name"),  firstCols.indexOf("lastname"),  firstCols.indexOf("last name"))  : 2;

    const dataLines = hasHeader ? lines.slice(1) : lines;

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const line of dataLines) {
      const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ""));
      const email = (cols[emailIdx] || "").toLowerCase();
      if (!email || !email.includes("@")) { skipped++; continue; }
      const firstName = firstIdx >= 0 ? (cols[firstIdx] || "") : "";
      const lastName  = lastIdx  >= 0 ? (cols[lastIdx]  || "") : "";

      try {
        await db.newsletterSubscriber.upsert({
          where: { shop_email: { shop, email } },
          create: { shop, email, firstName: firstName || null, lastName: lastName || null, status: "subscribed", source: "import" },
          update: { status: "subscribed" },
        });
        imported++;
      } catch {
        skipped++;
      }
    }

    return json({ ok: true, intent, imported, skipped });
  }

  return json({ ok: false, intent, error: "Unknown intent" }, { status: 400 });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubscriberList() {
  const { subscribers, total, page, status, source, search, sourceCounts, shop } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Add-one modal ──────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addFirst, setAddFirst] = useState("");
  const [addLast,  setAddLast]  = useState("");

  function submitAdd() {
    const fd = new FormData();
    fd.append("intent", "add-one");
    fd.append("email", addEmail);
    fd.append("firstName", addFirst);
    fd.append("lastName", addLast);
    fetcher.submit(fd, { method: "post" });
  }

  // Close modal + reset on success
  const addDone = fetcher.data?.intent === "add-one" && fetcher.data?.ok && fetcher.state === "idle";
  if (addDone && addOpen) {
    setAddOpen(false);
    setAddEmail(""); setAddFirst(""); setAddLast("");
  }

  // ── CSV import modal ───────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvError, setCsvError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDropZone = useCallback((_: File[], accepted: File[]) => {
    if (accepted[0]) { setCsvFile(accepted[0]); setCsvError(""); }
  }, []);

  async function submitImport() {
    if (!csvFile) { setCsvError("Please select a CSV file."); return; }
    const text = await csvFile.text();
    const fd = new FormData();
    fd.append("intent", "import-csv");
    fd.append("csv", text);
    fetcher.submit(fd, { method: "post" });
  }

  const importDone = fetcher.data?.intent === "import-csv" && fetcher.state === "idle";
  if (importDone && importOpen && fetcher.data?.ok) {
    // keep modal open so user sees results
  }

  // ── Search / filter helpers ────────────────────────────────────────────────
  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    navigate(`?${params.toString()}`);
  }

  // ── Table rows ─────────────────────────────────────────────────────────────
  const rows = subscribers.map((s) => [
    s.email,
    s.firstName ? `${s.firstName} ${s.lastName || ""}`.trim() : "—",
    <Badge tone={s.status === "subscribed" ? "success" : "critical"}>{s.status}</Badge>,
    s.source || "—",
    s.utmSource ? `${s.utmSource}${s.utmMedium ? `/${s.utmMedium}` : ""}` : "—",
    new Date(s.createdAt).toLocaleDateString(),
    s.status === "subscribed" ? (
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="unsubscribe" />
        <input type="hidden" name="email" value={s.email} />
        <Button variant="plain" tone="critical" submit>Remove</Button>
      </fetcher.Form>
    ) : "—",
  ]);

  return (
    <BlockStack gap="400">

      {/* ── Toolbar ── */}
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h2" variant="headingSm">{total.toLocaleString()} subscribers</Text>
            <InlineStack gap="200">
              <Button variant="plain" onClick={() => setImportOpen(true)}>Import CSV</Button>
              <Button onClick={() => setAddOpen(true)}>Add subscriber</Button>
              <Button
                variant="plain"
                url={`/api/newsletter/export?shop=${encodeURIComponent(shop)}&status=${status}`}
                external
              >
                Export CSV
              </Button>
            </InlineStack>
          </InlineStack>

          {/* Search + status filter */}
          <InlineStack gap="300" wrap>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                type="search"
                placeholder="Search by email…"
                defaultValue={search}
                onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #c9cccf", borderRadius: 6, fontSize: 14 }}
              />
            </div>
            <select
              value={status}
              onChange={(e) => setParam("status", e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid #c9cccf", borderRadius: 6, fontSize: 14 }}
            >
              <option value="subscribed">Subscribed</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="">All</option>
            </select>
            <select
              value={source}
              onChange={(e) => setParam("source", e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid #c9cccf", borderRadius: 6, fontSize: 14 }}
            >
              <option value="">All sources</option>
              {sourceCounts.filter(s => s.source).map(s => (
                <option key={s.source} value={s.source!}>{s.source} ({s._count.source})</option>
              ))}
            </select>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* Success banners */}
      {fetcher.data?.intent === "add-one" && fetcher.state === "idle" && fetcher.data?.ok && (
        <Banner tone="success" onDismiss={() => {}}>Subscriber added successfully.</Banner>
      )}
      {fetcher.data?.intent === "import-csv" && fetcher.state === "idle" && fetcher.data?.ok && (
        <Banner tone="success">
          Imported <strong>{fetcher.data.imported}</strong> subscribers
          {fetcher.data.skipped > 0 ? ` (${fetcher.data.skipped} skipped — invalid or duplicate)` : ""}.
        </Banner>
      )}
      {fetcher.data?.error && fetcher.state === "idle" && (
        <Banner tone="critical">{fetcher.data.error}</Banner>
      )}

      {/* ── Table ── */}
      <Card>
        <DataTable
          columnContentTypes={["text","text","text","text","text","text","text"]}
          headings={["Email","Name","Status","Source","UTM","Joined","Action"]}
          rows={rows}
          footerContent={total === 0 ? "No subscribers found" : `Page ${page} of ${totalPages}`}
        />

        {totalPages > 1 && (
          <div style={{ padding: "16px 0", display: "flex", justifyContent: "center" }}>
            <Pagination
              hasPrevious={page > 1}
              onPrevious={() => setParam("page", String(page - 1))}
              hasNext={page < totalPages}
              onNext={() => setParam("page", String(page + 1))}
            />
          </div>
        )}
      </Card>

      {/* ── Add subscriber modal ── */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add subscriber"
        primaryAction={{
          content: "Add",
          loading: fetcher.state !== "idle",
          onAction: submitAdd,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAddOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField
              label="Email address"
              type="email"
              value={addEmail}
              onChange={setAddEmail}
              autoComplete="email"
              placeholder="customer@example.com"
              requiredIndicator
            />
            <InlineStack gap="300">
              <div style={{ flex: 1 }}>
                <TextField
                  label="First name"
                  value={addFirst}
                  onChange={setAddFirst}
                  autoComplete="given-name"
                  placeholder="Jane"
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Last name"
                  value={addLast}
                  onChange={setAddLast}
                  autoComplete="family-name"
                  placeholder="Smith"
                />
              </div>
            </InlineStack>
            {fetcher.data?.intent === "add-one" && fetcher.data?.error && (
              <Banner tone="critical">{fetcher.data.error}</Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── CSV import modal ── */}
      <Modal
        open={importOpen}
        onClose={() => { setImportOpen(false); setCsvFile(null); setCsvError(""); }}
        title="Import subscribers from CSV"
        primaryAction={
          importDone && fetcher.data?.ok
            ? { content: "Done", onAction: () => { setImportOpen(false); setCsvFile(null); } }
            : { content: "Import", loading: fetcher.state !== "idle", onAction: submitImport }
        }
        secondaryActions={[{ content: "Cancel", onAction: () => { setImportOpen(false); setCsvFile(null); } }]}
      >
        <Modal.Section>
          <BlockStack gap="400">

            {importDone && fetcher.data?.ok ? (
              <Banner tone="success">
                <Text as="p">
                  Successfully imported <strong>{fetcher.data.imported}</strong> subscribers.
                  {fetcher.data.skipped > 0 && ` ${fetcher.data.skipped} rows skipped (invalid email or duplicate).`}
                </Text>
              </Banner>
            ) : (
              <>
                <Text as="p" variant="bodySm" tone="subdued">
                  Upload a CSV file with columns: <code>email</code>, <code>first_name</code>, <code>last_name</code>.
                  A header row is optional. Comma, semicolon and tab delimiters are all supported.
                  Existing subscribers will have their status set back to subscribed.
                </Text>

                <div
                  style={{ border: "2px dashed #c9cccf", borderRadius: 8, padding: 24, textAlign: "center", cursor: "pointer", background: csvFile ? "#f0fdf4" : "#fafafa" }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) { setCsvFile(f); setCsvError(""); }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCsvFile(f); setCsvError(""); } }}
                  />
                  {csvFile ? (
                    <BlockStack gap="100">
                      <Text as="p" fontWeight="semibold">{csvFile.name}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{(csvFile.size / 1024).toFixed(1)} KB — click to change</Text>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="100">
                      <Text as="p">Drop your CSV here, or click to browse</Text>
                      <Text as="p" variant="bodySm" tone="subdued">.csv, .tsv, or .txt</Text>
                    </BlockStack>
                  )}
                </div>

                {csvError && <Banner tone="critical">{csvError}</Banner>}

                <Divider />

                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Example format</Text>
                  <div style={{ fontFamily: "monospace", fontSize: 12, background: "#f3f4f6", borderRadius: 6, padding: "10px 14px", color: "#374151" }}>
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

    </BlockStack>
  );
}

// app/routes/app.newsletter.campaigns.new.tsx
// Step 1 of 2: Full-page template gallery.
// User picks a template → clicks "Next" → campaign is created and editor opens.

import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { useRef, useState } from "react";
import { EMAIL_TEMPLATES, TEMPLATE_CATEGORIES, type EmailTemplate } from "~/data/emailTemplates";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const anyDb = db as any;
  const form = await request.formData();
  const html = (form.get("html") as string) || null;

  const campaign = await anyDb.newsletterCampaign.create({
    data: {
      shop: session.shop,
      name: "Untitled campaign",
      subject: "",
      status: "draft",
      htmlContent: html,
    },
  });

  return redirect(`/app/newsletter/campaigns/${campaign.id}`);
}

// ─── Scale factor for iframe thumbnails ───────────────────────────────────────
const CARD_W = 200;
const CARD_H = 170;
const IFRAME_W = 600;
const SCALE = CARD_W / IFRAME_W; // ~0.333
const IFRAME_H = Math.round(CARD_H / SCALE); // ~510

export default function NewCampaignGallery() {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedId, setSelectedId] = useState<string>("blank");
  const [activeCategory, setActiveCategory] = useState("All");

  const selectedTemplate: EmailTemplate | null =
    selectedId === "blank" ? null : (EMAIL_TEMPLATES.find((t) => t.id === selectedId) ?? null);

  const filtered =
    activeCategory === "All"
      ? EMAIL_TEMPLATES
      : EMAIL_TEMPLATES.filter((t) => t.category === activeCategory);

  function submit() {
    formRef.current?.submit();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      {/* ── Top bar ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e1e3e5", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/app/newsletter/campaigns" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>← Campaigns</a>
          <span style={{ color: "#d1d5db" }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Choose a template</span>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>— {EMAIL_TEMPLATES.length + 1} templates</span>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {selectedId && (
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              {selectedId === "blank" ? "Blank selected" : `Selected: ${selectedTemplate?.name ?? ""}`}
            </span>
          )}
          <button
            onClick={submit}
            disabled={!selectedId}
            style={{
              background: selectedId ? "#008060" : "#d1d5db",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              cursor: selectedId ? "pointer" : "not-allowed",
            }}
          >
            Next →
          </button>
        </div>
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e1e3e5", display: "flex", gap: 0, overflowX: "auto", justifyContent: "center" }}>
        {["All", ...TEMPLATE_CATEGORIES.filter((c) => c !== "All")].map((cat) => {
          const count = cat === "All" ? EMAIL_TEMPLATES.length : EMAIL_TEMPLATES.filter((t) => t.category === cat).length;
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: "14px 20px",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "#008060" : "#6b7280",
                borderBottom: active ? "2px solid #008060" : "2px solid transparent",
                whiteSpace: "nowrap",
                transition: "color 0.1s",
              }}
            >
              {cat} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* ── Grid ── */}
      <div style={{ padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 20 }}>

        {/* Blank — always first in "All" and when no category filter matches */}
        {(activeCategory === "All") && (
          <TemplateCard
            id="blank"
            name="Blank"
            category="Custom"
            primaryColor="#e5e7eb"
            html={null}
            selected={selectedId === "blank"}
            onSelect={() => setSelectedId("blank")}
          />
        )}

        {filtered.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            id={tpl.id}
            name={tpl.name}
            category={tpl.category}
            primaryColor={tpl.primaryColor}
            html={tpl.html}
            selected={selectedId === tpl.id}
            onSelect={() => setSelectedId(tpl.id)}
          />
        ))}
      </div>
      </div>

      {/* Hidden form that POSTs to the action */}
      <Form ref={formRef} method="post">
        <input type="hidden" name="html" value={selectedTemplate?.html ?? ""} />
      </Form>
    </div>
  );
}

// ─── Template card with scaled iframe preview ─────────────────────────────────

function TemplateCard({
  id,
  name,
  category,
  primaryColor,
  html,
  selected,
  onSelect,
}: {
  id: string;
  name: string;
  category: string;
  primaryColor: string;
  html: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        background: "#fff",
        border: selected ? `2px solid #008060` : `1px solid ${hovered ? "#c4c4c4" : "#e1e3e5"}`,
        boxShadow: selected
          ? "0 0 0 3px #d1fae5"
          : hovered
          ? "0 4px 16px rgba(0,0,0,0.10)"
          : "0 1px 3px rgba(0,0,0,0.05)",
        transition: "box-shadow 0.15s, border 0.1s",
        position: "relative",
      }}
    >
      {/* Preview area */}
      <div style={{ width: CARD_W, height: CARD_H, overflow: "hidden", position: "relative", background: html ? "#f4f4f4" : "#f9fafb" }}>
        {html ? (
          <iframe
            srcDoc={html}
            style={{
              width: IFRAME_W,
              height: IFRAME_H,
              border: "none",
              transformOrigin: "top left",
              transform: `scale(${SCALE})`,
              pointerEvents: "none",
              display: "block",
            }}
            title={name}
            sandbox="allow-same-origin"
          />
        ) : (
          // Blank card placeholder
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#9ca3af" }}>+</div>
            <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>Start from scratch</span>
          </div>
        )}

        {/* Selected check */}
        {selected && (
          <div style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: "#008060", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", fontWeight: 700 }}>
            ✓
          </div>
        )}
      </div>

      {/* Label */}
      <div style={{ padding: "10px 12px 12px", borderTop: "1px solid #f3f4f6" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: primaryColor === "#e5e7eb" ? "#9ca3af" : primaryColor, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>
          {category}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>
          {name.replace(/^[^\s]+\s/, "")}
        </div>
      </div>
    </div>
  );
}

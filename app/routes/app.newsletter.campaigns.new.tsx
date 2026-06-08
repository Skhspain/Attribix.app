// app/routes/app.newsletter.campaigns.new.tsx
// Step 1 of 2: Full-page template gallery.
// User picks a template → clicks "Next" → campaign is created and editor opens.

import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { useState } from "react";
import { UNLAYER_TEMPLATES, UNLAYER_CATEGORIES, type UnlayerTemplate } from "~/data/unlayerTemplates";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  // Load user's saved templates
  const savedTemplates = await anyDb.newsletterCampaign?.findMany?.({
    where: { shop, status: "template" },
    select: { id: true, name: true, htmlContent: true, designJson: true },
    orderBy: { createdAt: "desc" },
  }).catch(() => []) ?? [];

  return json({ savedTemplates });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const form = await request.formData();
  const html = (form.get("html") as string) || null;
  const designJsonStr = (form.get("designJson") as string) || null;
  const designJson = designJsonStr ? JSON.parse(designJsonStr) : null;

  // Pre-fill sender defaults from newsletter settings
  const settings = await anyDb.newsletterSettings?.findUnique?.({ where: { shop } }).catch(() => null);

  const campaign = await anyDb.newsletterCampaign.create({
    data: {
      shop,
      name: "Untitled newsletter",
      subject: "",
      status: "draft",
      htmlContent: html,
      designJson: designJson,
      fromName: settings?.fromName || null,
      fromEmail: settings?.fromEmail || null,
      replyTo: settings?.replyTo || null,
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
  const { savedTemplates } = useLoaderData<typeof loader>();
  const remixSubmit = useSubmit();
  const [selectedId, setSelectedId] = useState<string>("blank");
  const [activeCategory, setActiveCategory] = useState("All");
  const hasSaved = savedTemplates && savedTemplates.length > 0;

  const selectedTemplate: UnlayerTemplate | null =
    selectedId === "blank" ? null : (UNLAYER_TEMPLATES.find((t) => t.id === selectedId) ?? null);

  const selectedSaved = savedTemplates?.find((t: any) => t.id === selectedId);

  const filtered =
    activeCategory === "My Templates"
      ? []
      : activeCategory === "All"
      ? UNLAYER_TEMPLATES
      : UNLAYER_TEMPLATES.filter((t) => t.category === activeCategory);

  function submit() {
    const formData = new FormData();
    if (selectedSaved) {
      formData.append("html", selectedSaved.htmlContent ?? "");
      if (selectedSaved.designJson) formData.append("designJson", JSON.stringify(selectedSaved.designJson));
    } else {
      formData.append("html", selectedTemplate?.html ?? "");
      if (selectedTemplate?.design) formData.append("designJson", JSON.stringify(selectedTemplate.design));
    }
    remixSubmit(formData, { method: "post" });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .tpl-shimmer {
          background: linear-gradient(90deg, #ececec 25%, #e0e0e0 50%, #ececec 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s ease-in-out infinite;
        }
      `}} />
      {/* ── Top bar ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e1e3e5", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/app/newsletter/campaigns" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>← Newsletters</a>
          <span style={{ color: "#d1d5db" }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Choose a template</span>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>— {UNLAYER_TEMPLATES.length + 1} templates</span>
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

      {/* ── Category pills ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e1e3e5", padding: "16px 24px", display: "flex", gap: 8, overflowX: "auto", justifyContent: "center", flexWrap: "wrap" }}>
        {["All", ...(hasSaved ? ["My Templates"] : []), ...UNLAYER_CATEGORIES.filter((c) => c !== "All")].map((cat) => {
          const count = cat === "All" ? UNLAYER_TEMPLATES.length + (savedTemplates?.length || 0) : cat === "My Templates" ? savedTemplates?.length || 0 : UNLAYER_TEMPLATES.filter((t) => t.category === cat).length;
          const active = activeCategory === cat;
          const emojis: Record<string, string> = { All: "✨", Welcome: "👋", Promotions: "🏷️", Products: "🛍️", Newsletter: "📰", "Win-back": "💌", "Post-purchase": "📦", Announcements: "📣", VIP: "⭐", "Social Proof": "💬" };
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                border: active ? "2px solid #008060" : "1px solid #e1e3e5",
                background: active ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                color: active ? "#008060" : "#374151",
                borderRadius: 20,
                whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
            >
              {emojis[cat] || "📧"} {cat} <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>({count})</span>
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

        {/* Saved user templates */}
        {(activeCategory === "All" || activeCategory === "My Templates") && savedTemplates?.map((tpl: any) => (
          <TemplateCard
            key={tpl.id}
            id={tpl.id}
            name={tpl.name}
            category="My Templates"
            primaryColor="#6366f1"
            html={tpl.htmlContent}
            description="Your saved template"
            selected={selectedId === tpl.id}
            onSelect={() => setSelectedId(tpl.id)}
          />
        ))}

        {/* Built-in templates */}
        {filtered.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            id={tpl.id}
            name={tpl.name}
            category={tpl.category}
            primaryColor={tpl.primaryColor}
            html={tpl.html}
            description={tpl.description}
            selected={selectedId === tpl.id}
            onSelect={() => setSelectedId(tpl.id)}
          />
        ))}
      </div>
      </div>

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
  description,
  selected,
  onSelect,
}: {
  id: string;
  name: string;
  category: string;
  primaryColor: string;
  html: string | null;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

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
      <div style={{ width: "100%", height: CARD_H, overflow: "hidden", position: "relative", background: html ? "#f4f4f4" : "#f9fafb" }}>
        {html ? (
          <>
            {/* Shimmer skeleton while iframe renders */}
            {!iframeLoaded && (
              <div
                className="tpl-shimmer"
                style={{ position: "absolute", inset: 0, zIndex: 1 }}
              />
            )}
            <iframe
              srcDoc={html}
              style={{
                width: IFRAME_W,
                height: IFRAME_H,
                border: "none",
                position: "absolute",
                top: 0,
                left: 0,
                transformOrigin: "top left",
                transform: `scale(${SCALE})`,
                pointerEvents: "none",
                opacity: iframeLoaded ? 1 : 0,
                transition: "opacity 0.2s ease",
              }}
              title={name}
              sandbox="allow-same-origin"
              onLoad={() => setIframeLoaded(true)}
            />
          </>
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
          {name}
        </div>
        {description && (
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3, lineHeight: 1.4 }}>
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

// app/email/blocks.ts
// Attribix email documents: an ordered list of blocks plus a theme, rendered to
// table-based, inline-styled HTML that holds up in Gmail, Outlook and Apple Mail.
// Shared by the editor's live preview (browser) and the server (save/send), so
// what the merchant sees is exactly what gets sent.

export const EMAIL_DOC_FORMAT = "attribix-blocks/1";

export type EmailTheme = {
  brandColor: string; // buttons, links, header background
  brandTextColor: string; // text on brandColor
  backgroundColor: string; // area around the email
  contentColor: string; // email body background
  textColor: string;
  fontFamily: string;
};

export type ProductItem = {
  id: string;
  title: string;
  price: string;
  imageUrl: string;
  url: string;
};

export type Block =
  | { id: string; type: "header"; logoUrl: string; storeName: string; logoWidth: number; background: "brand" | "content" }
  | { id: string; type: "heading"; text: string; size: "large" | "medium"; align: "left" | "center" }
  | { id: string; type: "text"; text: string; align: "left" | "center" }
  | { id: string; type: "image"; src: string; alt: string; href: string; fullWidth: boolean }
  | { id: string; type: "button"; label: string; href: string; align: "left" | "center" }
  | { id: string; type: "products"; items: ProductItem[]; buttonLabel: string }
  | { id: string; type: "discount"; code: string; text: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; height: number }
  | { id: string; type: "footer"; text: string; address: string };

export type BlockType = Block["type"];

export type EmailDoc = {
  format: typeof EMAIL_DOC_FORMAT;
  theme: EmailTheme;
  blocks: Block[];
};

export const FONT_OPTIONS = [
  { label: "System (clean, modern)", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { label: "Helvetica / Arial", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia (classic serif)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', Helvetica, sans-serif" },
];

export const DEFAULT_THEME: EmailTheme = {
  brandColor: "#111827",
  brandTextColor: "#ffffff",
  backgroundColor: "#f4f4f5",
  contentColor: "#ffffff",
  textColor: "#1f2937",
  fontFamily: FONT_OPTIONS[0].value,
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  header: "Logo header",
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  products: "Products",
  discount: "Discount code",
  divider: "Divider",
  spacer: "Spacer",
  footer: "Footer",
};

export function isEmailDoc(value: unknown): value is EmailDoc {
  return !!value && typeof value === "object" && (value as any).format === EMAIL_DOC_FORMAT && Array.isArray((value as any).blocks);
}

export function newBlockId() {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

export function createBlock(type: BlockType, brand?: Partial<StoreBrand>): Block {
  const id = newBlockId();
  switch (type) {
    case "header":
      return { id, type, logoUrl: brand?.logoUrl ?? "", storeName: brand?.storeName ?? "Your store", logoWidth: 140, background: "content" };
    case "heading":
      return { id, type, text: "Your headline here", size: "large", align: "center" };
    case "text":
      return { id, type, text: "Write something your customers will love. Use **bold** for emphasis and [links](https://example.com) where you need them.", align: "center" };
    case "image":
      return { id, type, src: "", alt: "", href: "", fullWidth: true };
    case "button":
      return { id, type, label: "Shop now", href: brand?.storeUrl ?? "", align: "center" };
    case "products":
      return { id, type, items: [], buttonLabel: "Shop now" };
    case "discount":
      return { id, type, code: "WELCOME10", text: "Use this code at checkout" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, height: 24 };
    case "footer":
      return { id, type, text: `You're receiving this email because you subscribed to ${brand?.storeName ?? "our store"}.`, address: brand?.address ?? "" };
  }
}

// ─── Store brand (from Shopify) ──────────────────────────────────────────────

export type StoreBrand = {
  storeName: string;
  storeUrl: string;
  logoUrl: string;
  primaryColor: string | null;
  primaryTextColor: string | null;
  address: string;
};

export function themeFromBrand(brand: StoreBrand | null): EmailTheme {
  if (!brand?.primaryColor) return { ...DEFAULT_THEME };
  return {
    ...DEFAULT_THEME,
    brandColor: brand.primaryColor,
    brandTextColor: brand.primaryTextColor || readableTextOn(brand.primaryColor),
  };
}

/** Black or white, whichever reads better on the given hex background. */
export function readableTextOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111827" : "#ffffff";
}

// ─── Rendering ───────────────────────────────────────────────────────────────

export type RenderOptions = {
  previewText?: string;
  /** Replaces {{unsubscribe_url}} at send time; left as a placeholder otherwise. */
  unsubscribeUrl?: string;
  /** Editor preview only: tag each block's row so clicks can select it. */
  annotate?: boolean;
};

const WIDTH = 600;
const PAD = 32;

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(url: string) {
  const u = String(url ?? "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(u) || /^\{\{[a-z_]+\}\}$/i.test(u)) return u;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return `https://${u}`;
  return "";
}

function safeColor(c: string, fallback: string) {
  return /^#[0-9a-f]{3,8}$/i.test(String(c ?? "").trim()) ? c.trim() : fallback;
}

/** Tiny formatting language for text blocks: **bold**, *italic*, [label](url), blank line = new paragraph. */
export function formatInline(text: string, linkColor: string) {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      const href = safeUrl(url.replace(/&amp;/g, "&"));
      return href ? `<a href="${esc(href)}" style="color:${linkColor};text-decoration:underline;">${label}</a>` : label;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function paragraphs(text: string, style: string, linkColor: string) {
  return String(text ?? "")
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 16px;${style}">${formatInline(p.trim(), linkColor)}</p>`)
    .join("");
}

function row(inner: string, opts: { padding?: string; bg?: string } = {}) {
  return `<tr><td style="padding:${opts.padding ?? `0 ${PAD}px`};${opts.bg ? `background:${opts.bg};` : ""}">${inner}</td></tr>`;
}

function buttonHtml(label: string, href: string, align: string, t: EmailTheme) {
  const url = safeUrl(href) || "#";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align === "left" ? "left" : "center"}" style="margin:0 ${align === "left" ? "auto 0 0" : "auto"};"><tr><td bgcolor="${t.brandColor}" style="border-radius:6px;background:${t.brandColor};"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${t.fontFamily};font-size:16px;font-weight:600;line-height:1;color:${t.brandTextColor};text-decoration:none;border-radius:6px;">${esc(label)}</a></td></tr></table>`;
}

function renderBlock(b: Block, t: EmailTheme): string {
  const font = `font-family:${t.fontFamily};color:${t.textColor};`;
  switch (b.type) {
    case "header": {
      const bg = b.background === "brand" ? t.brandColor : t.contentColor;
      const fg = b.background === "brand" ? t.brandTextColor : t.textColor;
      const inner = b.logoUrl
        ? `<img src="${esc(b.logoUrl)}" alt="${esc(b.storeName)}" width="${Math.max(40, Math.min(300, b.logoWidth || 140))}" style="display:block;margin:0 auto;height:auto;border:0;max-width:100%;">`
        : `<div style="font-family:${t.fontFamily};font-size:22px;font-weight:700;letter-spacing:0.02em;color:${fg};text-align:center;">${esc(b.storeName)}</div>`;
      return row(inner, { padding: `28px ${PAD}px`, bg });
    }
    case "heading": {
      const size = b.size === "large" ? 30 : 22;
      return row(`<h1 style="margin:0;${font}font-size:${size}px;line-height:1.25;font-weight:700;text-align:${b.align};">${formatInline(b.text, t.brandColor)}</h1>`, { padding: `24px ${PAD}px 8px` });
    }
    case "text":
      return row(`<div style="${font}font-size:16px;line-height:1.6;text-align:${b.align};">${paragraphs(b.text, "", t.brandColor)}</div>`, { padding: `12px ${PAD}px 0` });
    case "image": {
      if (!b.src) return row(`<div style="padding:40px 0;text-align:center;background:#f3f4f6;${font}font-size:14px;color:#9ca3af;">Image</div>`, { padding: `12px ${b.fullWidth ? 0 : PAD}px` });
      const w = b.fullWidth ? WIDTH : WIDTH - PAD * 2;
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${w}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;">`;
      const href = safeUrl(b.href);
      return row(href ? `<a href="${esc(href)}" target="_blank">${img}</a>` : img, { padding: `12px ${b.fullWidth ? 0 : PAD}px` });
    }
    case "button":
      return row(buttonHtml(b.label, b.href, b.align, t), { padding: `16px ${PAD}px` });
    case "products": {
      if (!b.items.length) return row(`<div style="padding:32px 0;text-align:center;background:#f3f4f6;${font}font-size:14px;color:#9ca3af;">Choose products to show</div>`, { padding: `12px ${PAD}px` });
      const colW = Math.floor((WIDTH - PAD * 2 - 16) / 2);
      const cards = b.items.map((p) => {
        const href = safeUrl(p.url) || "#";
        return `<!--[if mso]><td valign="top" width="${colW}"><![endif]--><div style="display:inline-block;vertical-align:top;width:100%;max-width:${colW}px;margin:0 4px 24px;"><a href="${esc(href)}" target="_blank" style="text-decoration:none;">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.title)}" width="${colW}" style="display:block;width:100%;height:auto;border:0;border-radius:6px;">` : ""}</a><div style="${font}font-size:15px;font-weight:600;line-height:1.35;margin:12px 0 4px;text-align:center;">${esc(p.title)}</div><div style="${font}font-size:14px;color:#6b7280;margin:0 0 12px;text-align:center;">${esc(p.price)}</div>${buttonHtml(b.buttonLabel || "Shop now", href, "center", t)}</div><!--[if mso]></td><![endif]-->`;
      });
      return row(`<div style="text-align:center;font-size:0;"><!--[if mso]><table role="presentation" width="100%"><tr><![endif]-->${cards.join("")}<!--[if mso]></tr></table><![endif]--></div>`, { padding: `16px ${PAD - 4}px 0` });
    }
    case "discount":
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:2px dashed ${t.brandColor};border-radius:8px;padding:20px;text-align:center;"><div style="${font}font-size:14px;margin-bottom:8px;">${esc(b.text)}</div><div style="font-family:'Courier New',monospace;font-size:26px;font-weight:700;letter-spacing:0.12em;color:${t.brandColor};">${esc(b.code)}</div></td></tr></table>`, { padding: `16px ${PAD}px` });
    case "divider":
      return row(`<div style="border-top:1px solid #e5e7eb;height:1px;line-height:1px;font-size:1px;">&nbsp;</div>`, { padding: `20px ${PAD}px` });
    case "spacer":
      return row(`<div style="height:${Math.max(4, Math.min(120, b.height || 24))}px;line-height:1px;font-size:1px;">&nbsp;</div>`, { padding: "0" });
    case "footer":
      return row(
        `<div style="font-family:${t.fontFamily};font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">${b.text ? `<p style="margin:0 0 8px;">${formatInline(b.text, "#6b7280")}</p>` : ""}${b.address ? `<p style="margin:0 0 8px;">${esc(b.address)}</p>` : ""}<p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></p></div>`,
        { padding: `32px ${PAD}px 36px` },
      );
  }
}

/** Every document ends with exactly one footer (it carries the unsubscribe link). */
export function withFooter(blocks: Block[], brand?: Partial<StoreBrand>): Block[] {
  const rest = blocks.filter((b) => b.type !== "footer");
  const footer = blocks.find((b) => b.type === "footer") ?? createBlock("footer", brand);
  return [...rest, footer];
}

export function renderEmail(doc: EmailDoc, opts: RenderOptions = {}): string {
  const t: EmailTheme = {
    ...DEFAULT_THEME,
    ...doc.theme,
    brandColor: safeColor(doc.theme?.brandColor, DEFAULT_THEME.brandColor),
    brandTextColor: safeColor(doc.theme?.brandTextColor, DEFAULT_THEME.brandTextColor),
    backgroundColor: safeColor(doc.theme?.backgroundColor, DEFAULT_THEME.backgroundColor),
    contentColor: safeColor(doc.theme?.contentColor, DEFAULT_THEME.contentColor),
    textColor: safeColor(doc.theme?.textColor, DEFAULT_THEME.textColor),
  };
  const body = withFooter(doc.blocks)
    .map((b) => {
      const html = renderBlock(b, t);
      return opts.annotate ? html.replace("<tr>", `<tr data-ax-block="${esc(b.id)}">`) : html;
    })
    .join("\n");
  const preheader = opts.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${t.backgroundColor};">${esc(opts.previewText)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    : "";

  let html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title></title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; }
  img { -ms-interpolation-mode:bicubic; }
  a { color:${t.brandColor}; }
  @media (max-width:620px) { .ax-container { width:100% !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${t.backgroundColor};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.backgroundColor};">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="ax-container" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:${WIDTH}px;max-width:100%;background:${t.contentColor};border-radius:8px;overflow:hidden;">
${body}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  if (opts.unsubscribeUrl) html = html.split("{{unsubscribe_url}}").join(esc(opts.unsubscribeUrl));
  return html;
}

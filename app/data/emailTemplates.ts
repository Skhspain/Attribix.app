// app/data/emailTemplates.ts
// ~25 distinct email templates — each unique layout + color, no palette clones.

export type EmailTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  primaryColor: string;
  html: string;
};

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function wrap(inner: string, bg = "#f4f4f4", surface = "#ffffff"): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 16px;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${surface};border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
${inner}
</table></td></tr></table></body></html>`;
}

function btn(label: string, color: string, textColor = "#ffffff"): string {
  return `<tr><td align="center" style="padding:8px 40px 32px;"><a href="{{shop_url}}" style="display:inline-block;background:${color};color:${textColor};font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">${label}</a></td></tr>`;
}

function header(color: string, content: string, pad = "44px 40px 36px"): string {
  return `<tr><td style="background:${color};padding:${pad};text-align:center;">${content}</td></tr>`;
}

function body(content: string, pad = "28px 40px 8px"): string {
  return `<tr><td style="padding:${pad};">${content}</td></tr>`;
}

function dividerFooter(msg = "Questions? Just reply to this email.", borderColor = "#e5e7eb"): string {
  return `<tr><td style="border-top:1px solid ${borderColor};padding:20px 40px 28px;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:12px;">${msg}</p></td></tr>`;
}

function productRow(items: Array<{label: string; price: string; bg: string}>): string {
  const cols = items.map(i => `<td style="padding:6px;text-align:center;width:${Math.floor(100/items.length)}%;">
    <div style="background:${i.bg};border-radius:8px;height:100px;margin-bottom:8px;"></div>
    <p style="margin:0 0 2px;font-size:12px;font-weight:600;color:#111827;">${i.label}</p>
    <p style="margin:0;font-size:13px;font-weight:700;color:#374151;">${i.price}</p>
  </td>`).join('');
  return `<tr><td style="padding:8px 16px;"><table width="100%" cellpadding="0" cellspacing="0"><tr>${cols}</tr></table></td></tr>`;
}

function highlight(text: string, bg: string, border: string): string {
  return `<div style="background:${bg};border-left:4px solid ${border};border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 20px;"><p style="margin:0;color:#111827;font-size:14px;font-weight:600;line-height:1.5;">${text}</p></div>`;
}

// ─── Template definitions ─────────────────────────────────────────────────────

const T: EmailTemplate[] = [];

function add(t: EmailTemplate) { T.push(t); }

// ── WELCOME ──────────────────────────────────────────────────────────────────

add({ id: "welcome_classic", name: "Welcome — Classic", category: "Welcome", description: "Clean hero welcome with CTA", primaryColor: "#008060",
html: wrap(`
${header("#008060", `<p style="margin:0 0 6px;color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Welcome</p>
<h1 style="margin:0;color:#fff;font-size:32px;font-weight:700;">Welcome to the family! 👋</h1>`)}
${body(`<p style="margin:0;color:#6b7280;font-size:15px;line-height:1.7;text-align:center;">You're in. Thanks for subscribing — we're so glad you're here. Expect early access, exclusive deals, and zero spam.</p>`)}
${btn("Explore the store", "#008060")}
${dividerFooter()}`)}
);

add({ id: "welcome_bold", name: "Welcome — Bold", category: "Welcome", description: "High-contrast bold welcome", primaryColor: "#1e293b",
html: wrap(`
<tr><td style="background:#1e293b;padding:0;">
  <div style="background:#f59e0b;height:6px;"></div>
  <div style="padding:44px 40px 36px;text-align:center;">
    <h1 style="margin:0 0 10px;color:#f59e0b;font-size:40px;font-weight:900;letter-spacing:-1px;">YOU'RE IN.</h1>
    <p style="margin:0;color:#e2e8f0;font-size:15px;line-height:1.6;">Welcome aboard. You now get exclusive early access, member deals, and first look at every new drop.</p>
  </div>
</td></tr>
${btn("Start exploring", "#f59e0b", "#1e293b")}
${dividerFooter("Questions? Reply to this email.", "#334155")}`, "#0f172a", "#1e293b")}
);

add({ id: "welcome_minimal", name: "Welcome — Minimal", category: "Welcome", description: "Typography-led, clean minimal", primaryColor: "#92765a",
html: wrap(`
<tr><td style="padding:56px 40px 8px;text-align:center;">
  <p style="margin:0 0 4px;color:#92765a;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:3px;">A warm welcome</p>
  <h1 style="margin:12px 0 20px;color:#2d1f0e;font-size:28px;font-weight:300;font-style:italic;line-height:1.3;">Hello, and thank you<br>for joining us.</h1>
  <div style="width:48px;height:2px;background:#92765a;margin:0 auto 24px;"></div>
  <p style="margin:0;color:#8c7360;font-size:15px;line-height:1.7;max-width:400px;margin:0 auto;">We promise to make every email worth opening. Expect curated picks, early access, and stories worth reading.</p>
</td></tr>
${btn("Visit the store", "#92765a")}
${dividerFooter("Unsubscribe at any time.", "#f5ede3")}`, "#faf7f2")}
);

add({ id: "welcome_discount", name: "Welcome Gift", category: "Welcome", description: "Welcome + 10% discount for new subscribers", primaryColor: "#7c3aed",
html: wrap(`
${header("#7c3aed", `<p style="margin:0 0 6px;color:#ede9fe;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:2px;">Welcome gift</p>
<h1 style="margin:0 0 8px;color:#fff;font-size:28px;font-weight:700;">Here's 10% off your first order 🎁</h1>
<p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px;">A thank-you for joining the community.</p>`)}
<tr><td style="padding:32px 40px 8px;text-align:center;">
  <p style="margin:0 0 4px;font-size:52px;font-weight:900;color:#7c3aed;line-height:1;">10% OFF</p>
  <p style="margin:0;color:#6b7280;font-size:14px;">Use code <strong style="background:#ede9fe;color:#7c3aed;padding:3px 12px;border-radius:5px;font-family:monospace;">WELCOME10</strong> at checkout</p>
</td></tr>
${btn("Shop now & save", "#7c3aed")}
${dividerFooter("One use per customer. No expiry.")}`, "#f5f3ff")}
);

// ── PRODUCT DROP ──────────────────────────────────────────────────────────────

add({ id: "product_drop", name: "New Drop", category: "Products", description: "New collection launch with product grid", primaryColor: "#111827",
html: wrap(`
${header("#111827", `<p style="margin:0 0 6px;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:3px;">Just dropped</p>
<h1 style="margin:0;color:#fff;font-size:34px;font-weight:900;">The New Collection 🔥</h1>`)}
${productRow([
  { label: "Signature Tee", price: "$49", bg: "#e5e7eb" },
  { label: "Classic Cap", price: "$35", bg: "#d1d5db" },
  { label: "Varsity Jacket", price: "$129", bg: "#e5e7eb" },
  { label: "Cargo Pants", price: "$89", bg: "#d1d5db" },
])}
${btn("Shop the full drop", "#111827")}`, "#f9fafb")}
);

add({ id: "product_spotlight", name: "Product Spotlight", category: "Products", description: "Hero spotlight on a single product", primaryColor: "#0ea5e9",
html: wrap(`
<tr><td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);padding:48px 40px;text-align:center;">
  <p style="margin:0 0 8px;color:rgba(255,255,255,0.75);font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;">Staff pick of the week</p>
  <h1 style="margin:0 0 12px;color:#fff;font-size:30px;font-weight:800;">The Everyday Hoodie</h1>
  <p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;line-height:1.6;">Made from 100% organic cotton. Designed to last a lifetime.</p>
</td></tr>
<tr><td style="padding:0 40px 16px;">
  <div style="background:#f0f9ff;border-radius:10px;height:160px;margin-top:24px;"></div>
</td></tr>
${body(`<p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0c4a6e;">$79 <span style="font-size:15px;font-weight:400;color:#9ca3af;text-decoration:line-through;">$99</span></p>
<p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">Available in 6 colours and sizes XS–3XL. Free shipping on orders over $60.</p>`, "0 40px 8px")}
${btn("Shop now — save 20%", "#0ea5e9")}`, "#f0f9ff")}
);

add({ id: "back_in_stock", name: "Back in Stock", category: "Products", description: "Urgency email for restocked items", primaryColor: "#16a34a",
html: wrap(`
${header("#16a34a", `<p style="margin:0 0 6px;color:#bbf7d0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Back in stock</p>
<h1 style="margin:0 0 8px;color:#fff;font-size:28px;font-weight:700;">Your favourites are back! 🎉</h1>
<p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;">And they're selling fast — don't wait this time.</p>`)}
${productRow([
  { label: "Favourite Item", price: "$59", bg: "#dcfce7" },
  { label: "Classic Style", price: "$79", bg: "#bbf7d0" },
  { label: "Limited Stock", price: "$45", bg: "#dcfce7" },
])}
<tr><td style="padding:0 40px 8px;text-align:center;">
  <div style="background:#dcfce7;border-radius:8px;padding:12px;display:inline-block;">
    <p style="margin:0;color:#15803d;font-size:13px;font-weight:600;">⚡ Limited quantities available</p>
  </div>
</td></tr>
${btn("Grab yours before it's gone", "#16a34a")}`, "#f0fdf4")}
);

add({ id: "new_arrivals", name: "New Arrivals", category: "Products", description: "Seasonal new arrivals showcase", primaryColor: "#db2777",
html: wrap(`
<tr><td style="height:6px;background:linear-gradient(90deg,#db2777,#9333ea);"></td></tr>
<tr><td style="padding:36px 40px 8px;text-align:center;">
  <p style="margin:0 0 6px;color:#db2777;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;">New this season</p>
  <h1 style="margin:0 0 12px;color:#111827;font-size:28px;font-weight:800;">Spring Arrivals Are Here 🌸</h1>
  <p style="margin:0;color:#6b7280;font-size:15px;line-height:1.6;">Fresh styles, light fabrics, and everything you need for the new season.</p>
</td></tr>
${productRow([
  { label: "Linen Shirt", price: "$65", bg: "#fce7f3" },
  { label: "Floral Dress", price: "$89", bg: "#fdf2f8" },
  { label: "Sun Hat", price: "$35", bg: "#fce7f3" },
])}
${btn("Shop spring collection", "#db2777")}`, "#fff5f7")}
);

// ── PROMOTIONS ────────────────────────────────────────────────────────────────

add({ id: "flash_sale", name: "Flash Sale", category: "Promotions", description: "Urgency-driven sale email", primaryColor: "#dc2626",
html: wrap(`
${header("#dc2626", `<p style="margin:0;color:rgba(255,255,255,0.8);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:3.5px;">48 hours only</p>`, "12px 40px")}
<tr><td style="padding:36px 40px 8px;text-align:center;">
  <p style="margin:0;font-size:68px;font-weight:900;color:#dc2626;line-height:1;">50%</p>
  <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">OFF EVERYTHING</p>
  <p style="margin:0;color:#6b7280;font-size:14px;">No code needed. Applied automatically at checkout.</p>
</td></tr>
${btn("Shop the sale →", "#dc2626")}
<tr><td style="padding:0 40px 24px;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:11px;">Sale ends midnight. While stocks last.</p></td></tr>`, "#fff1f2")}
);

add({ id: "promo_code", name: "Exclusive Offer", category: "Promotions", description: "Discount code with urgency copy", primaryColor: "#7c3aed",
html: wrap(`
${header("#7c3aed", `<p style="margin:0 0 6px;color:#ddd6fe;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Subscriber exclusive</p>
<h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;">Your exclusive 25% off is here</h1>`)}
${body(`<p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.7;text-align:center;">This offer is exclusively for our subscribers — don't share it, it's just for you.</p>
<div style="background:#f3e8ff;border-radius:12px;padding:24px;text-align:center;">
  <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Your discount code</p>
  <p style="margin:0;font-family:monospace;font-size:28px;font-weight:800;color:#7c3aed;letter-spacing:4px;">SAVE25</p>
</div>`)}
${btn("Use my code now", "#7c3aed")}
<tr><td style="padding:0 40px 24px;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:11px;">Expires in 48 hours. One use per customer.</p></td></tr>`, "#f5f3ff")}
);

add({ id: "bogo", name: "Buy 2 Get 1 Free", category: "Promotions", description: "BOGO offer with product highlights", primaryColor: "#0891b2",
html: wrap(`
${header("#0891b2", `<h1 style="margin:0 0 6px;color:#fff;font-size:32px;font-weight:900;">BUY 2,<br>GET 1 FREE</h1>
<p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;">Mix and match any items. Add 3 to cart, we'll discount the cheapest.</p>`)}
${productRow([
  { label: "Any Item", price: "Full price", bg: "#e0f2fe" },
  { label: "Any Item", price: "Full price", bg: "#bae6fd" },
  { label: "Any Item", price: "FREE", bg: "#7dd3fc" },
])}
${btn("Start building your bundle", "#0891b2")}
<tr><td style="padding:0 40px 24px;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:11px;">This weekend only. Lowest-priced item is free.</p></td></tr>`, "#f0f9ff")}
);

add({ id: "clearance", name: "Clearance Sale", category: "Promotions", description: "End-of-season clearance with urgency", primaryColor: "#b45309",
html: wrap(`
<tr><td style="background:#fef3c7;border-bottom:2px solid #fbbf24;padding:12px 40px;text-align:center;">
  <p style="margin:0;color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">⚡ Final clearance — up to 70% off</p>
</td></tr>
${body(`<h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#111827;">End of season.<br>Everything must go.</h1>
<p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;">We're making room for new stock. Grab these deals before they're gone for good — prices this low won't come back.</p>
<table width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="padding:4px;"><div style="background:#fef9c3;border-radius:8px;padding:14px;text-align:center;"><p style="margin:0 0 2px;font-size:22px;font-weight:900;color:#b45309;">70% off</p><p style="margin:0;font-size:12px;color:#92400e;">Selected styles</p></div></td>
  <td style="padding:4px;"><div style="background:#fef9c3;border-radius:8px;padding:14px;text-align:center;"><p style="margin:0 0 2px;font-size:22px;font-weight:900;color:#b45309;">50% off</p><p style="margin:0;font-size:12px;color:#92400e;">All accessories</p></div></td>
  <td style="padding:4px;"><div style="background:#fef9c3;border-radius:8px;padding:14px;text-align:center;"><p style="margin:0 0 2px;font-size:22px;font-weight:900;color:#b45309;">30% off</p><p style="margin:0;font-size:12px;color:#92400e;">New arrivals</p></div></td>
</tr></table>`, "28px 40px 12px")}
${btn("Shop clearance now", "#b45309")}`, "#fffbeb")}
);

// ── NEWSLETTER ────────────────────────────────────────────────────────────────

add({ id: "digest", name: "Weekly Digest", category: "Newsletter", description: "Weekly content roundup with tips and links", primaryColor: "#1e40af",
html: wrap(`
${header("#1e40af", `<h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Your Weekly Digest 📰</h1>`)}
${body(`<p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.7;">Here's your weekly roundup — the best of what we've been reading, testing, and thinking about.</p>
${[
  { icon: "💡", title: "Tip of the Week", body: "One focused action beats ten scattered ones. Pick your most important task and do only that." },
  { icon: "🔗", title: "Interesting Read", body: "Why the best brands focus on fewer products, not more — and how simplicity drives loyalty." },
  { icon: "🛠️", title: "Tool Spotlight", body: "Three tools our team uses every day to stay productive and keep customers happy." },
  { icon: "📊", title: "Quick Insight", body: "Consistency is the most underrated competitive advantage in e-commerce. Show up every week." },
].map(item => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
  <td width="36" style="vertical-align:top;padding-top:2px;font-size:22px;">${item.icon}</td>
  <td><p style="margin:0 0 4px;font-weight:700;font-size:14px;color:#111827;">${item.title}</p>
  <p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.6;">${item.body}</p>
  <a href="{{shop_url}}" style="font-size:12px;color:#1e40af;font-weight:600;text-decoration:none;">Read more →</a></td>
</tr></table>
<div style="border-top:1px solid #dbeafe;margin:0 0 16px;"></div>`).join('')}`, "24px 40px 8px")}
${btn("Visit the store →", "#1e40af")}`, "#eff6ff")}
);

add({ id: "story", name: "Personal Story", category: "Newsletter", description: "First-person narrative newsletter style", primaryColor: "#374151",
html: wrap(`
<tr><td style="padding:44px 40px 8px;">
  <p style="margin:0 0 20px;font-size:16px;font-style:italic;font-weight:600;color:#111827;">Hey, I almost didn't share this...</p>
  <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.7;">Yesterday we tried something new in our business that completely changed the results. After months of testing, we finally figured it out — and the answer was surprisingly simple.</p>
  <p style="margin:0 0 12px;color:#374151;font-size:15px;font-weight:600;">Here's the big lesson:</p>
  ${highlight("The smallest consistent actions always beat one-time big efforts. Every single time.", "#f9fafb", "#374151")}
  <p style="margin:0;color:#6b7280;font-size:15px;line-height:1.7;">We applied this to how we design our products, talk to customers, and show up every week. The results speak for themselves.</p>
</td></tr>
${btn("Read the full story →", "#374151")}
${dividerFooter()}`)}
);

add({ id: "content_roundup", name: "Content Roundup", category: "Newsletter", description: "Curated content with image placeholders", primaryColor: "#0f766e",
html: wrap(`
${header("#0f766e", `<p style="margin:0 0 4px;color:#99f6e4;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Curated for you</p>
<h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">This Week's Highlights 🌿</h1>`)}
${[
  { title: "The future of sustainable fashion", tag: "Industry", time: "4 min read" },
  { title: "How to build a brand people love", tag: "Business", time: "6 min read" },
  { title: "Our top product picks this season", tag: "Products", time: "2 min read" },
].map(item => `<tr><td style="padding:16px 40px 0;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="70" style="vertical-align:top;padding-right:16px;"><div style="background:#ccfbf1;border-radius:8px;height:70px;"></div></td>
    <td><p style="margin:0 0 4px;font-size:11px;color:#0f766e;font-weight:700;text-transform:uppercase;">${item.tag} · ${item.time}</p>
    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#111827;">${item.title}</p>
    <a href="{{shop_url}}" style="font-size:12px;color:#0f766e;font-weight:600;text-decoration:none;">Read More →</a></td>
  </tr></table>
  <div style="border-top:1px solid #e5e7eb;margin-top:16px;"></div>
</td></tr>`).join('')}
${btn("See all stories", "#0f766e", "#ffffff")}`, "#f0fdfa")}
);

// ── WIN-BACK ──────────────────────────────────────────────────────────────────

add({ id: "winback_miss", name: "We Miss You", category: "Win-back", description: "Re-engagement email with discount", primaryColor: "#dc2626",
html: wrap(`
${header("#dc2626", `<h1 style="margin:0 0 10px;color:#fff;font-size:28px;font-weight:700;">We miss you 💌</h1>
<p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;line-height:1.6;max-width:380px;margin:0 auto;">It's been a while. Come back and see what's new — we think you'll love it.</p>`)}
<tr><td style="padding:32px 40px 8px;text-align:center;">
  <p style="margin:0;font-size:56px;font-weight:900;color:#dc2626;line-height:1;">15% OFF</p>
  <p style="margin:0;color:#6b7280;font-size:14px;">Use code <strong style="background:#fee2e2;color:#dc2626;padding:3px 12px;border-radius:5px;font-family:monospace;">COMEBACK15</strong></p>
</td></tr>
${btn("Come back & save", "#dc2626")}
<tr><td style="padding:0 40px 24px;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:11px;">Offer valid 7 days. One use per customer.</p></td></tr>`, "#fff1f2")}
);

add({ id: "winback_last", name: "Last Chance", category: "Win-back", description: "Final re-engagement attempt", primaryColor: "#92400e",
html: wrap(`
<tr><td style="background:#fef3c7;padding:10px 40px;text-align:center;border-bottom:2px solid #fbbf24;">
  <p style="margin:0;color:#92400e;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">⏰ This is our last message</p>
</td></tr>
${body(`<h1 style="margin:0 0 14px;font-size:26px;font-weight:700;color:#111827;">Last chance to reconnect</h1>
<p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.7;">We don't want to bother you — so this will be our last email unless you want to hear from us. But before you go, here's our best offer:</p>
<div style="background:#fef9c3;border-radius:10px;padding:24px;text-align:center;">
  <p style="margin:0 0 4px;font-size:40px;font-weight:900;color:#b45309;">30% OFF</p>
  <p style="margin:0;color:#92400e;font-size:13px;">Code: <strong style="font-family:monospace;">LASTCHANCE30</strong></p>
</div>`, "28px 40px 12px")}
${btn("Claim before it expires", "#b45309")}
<tr><td style="padding:0 40px 24px;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:11px;">Expires in 72 hours. Unsubscribe below if you'd prefer not to hear from us.</p></td></tr>`, "#fffbeb")}
);

// ── POST-PURCHASE ─────────────────────────────────────────────────────────────

add({ id: "post_purchase_thanks", name: "Thank You", category: "Post-purchase", description: "Order confirmation with next-step CTA", primaryColor: "#0ea5e9",
html: wrap(`
${header("#0ea5e9", `<h1 style="margin:0 0 10px;color:#fff;font-size:26px;font-weight:700;">Thank you for your order! 📦</h1>
<p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;">Your order is confirmed and our team is already on it.</p>`)}
${body(`<div style="background:#f0f9ff;border-radius:10px;padding:20px;text-align:center;margin-bottom:16px;">
  <p style="margin:0;color:#0c4a6e;font-size:15px;font-weight:500;">🎁 Free shipping on your next order — no code needed!</p>
</div>
<p style="margin:0;color:#6b7280;font-size:14px;line-height:1.7;text-align:center;">We'll send tracking info as soon as your order ships. Expected delivery: 3–5 business days.</p>`)}
${btn("Continue shopping", "#0ea5e9")}
${dividerFooter("Need help? Just reply to this email.")}`, "#f0f9ff")}
);

add({ id: "post_purchase_review", name: "Review Request", category: "Post-purchase", description: "Post-delivery review request with reward", primaryColor: "#f59e0b",
html: wrap(`
${header("#f59e0b", `<h1 style="margin:0 0 8px;color:#fff;font-size:24px;font-weight:700;">How was your order? ⭐</h1>
<p style="margin:0;color:rgba(255,255,255,0.9);font-size:14px;">Your feedback helps other shoppers — and helps us improve.</p>`, "36px 40px 28px")}
${body(`<p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">Hi {{first_name}}, we hope you love your recent purchase. Could you take 60 seconds to share your experience?</p>
<div style="background:#fef3c7;border-radius:10px;padding:20px;text-align:center;">
  <p style="margin:0 0 6px;font-size:32px;">⭐⭐⭐⭐⭐</p>
  <p style="margin:0;color:#92400e;font-weight:600;font-size:14px;">Leave a review → get 15% off your next order</p>
</div>`)}
${btn("Write a quick review", "#f59e0b", "#fff")}
${dividerFooter("Review must be submitted within 30 days of purchase.")}`, "#fffbeb")}
);

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────────────────

add({ id: "announcement_launch", name: "Product Launch", category: "Announcements", description: "New product or feature announcement", primaryColor: "#7c3aed",
html: wrap(`
${header("#7c3aed", `<p style="margin:0 0 6px;color:#ddd6fe;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:3px;">Launching today</p>
<h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;">Something new is here 🚀</h1>`)}
${body(`<p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.7;">We've been working on this for months and we're finally ready to share it. This changes everything about how you shop with us.</p>
<table width="100%" cellpadding="0" cellspacing="0">
${["Faster shipping than ever", "Improved product quality", "New exclusive product lines", "Better prices, always"].map(i =>
  `<tr><td style="padding:5px 0;font-size:14px;color:#6b7280;"><span style="color:#7c3aed;font-weight:700;margin-right:10px;">✓</span>${i}</td></tr>`
).join('')}
</table>`)}
${btn("See what's new", "#7c3aed")}
${dividerFooter()}`, "#f5f3ff")}
);

add({ id: "announcement_update", name: "Policy Update", category: "Announcements", description: "Customer-friendly policy/service update", primaryColor: "#0f766e",
html: wrap(`
<tr><td style="background:#0f766e;padding:10px 40px;text-align:center;">
  <p style="margin:0;color:#99f6e4;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:3px;">Good news</p>
</td></tr>
${body(`<h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#111827;">We upgraded our returns policy 📦</h1>
<p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.7;">Based on your feedback, we've made some big improvements. Here's what changed:</p>
<table width="100%" cellpadding="0" cellspacing="0">
${[
  ["60-day return window", "was 30 days"],
  ["Free return shipping", "on all orders"],
  ["Instant refunds", "approved same day"],
  ["No questions asked", "for any reason"],
].map(([main, sub]) =>
  `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
    <span style="color:#0f766e;font-weight:700;margin-right:8px;">✓</span>
    <strong style="color:#111827;font-size:14px;">${main}</strong>
    <span style="color:#9ca3af;font-size:13px;"> — ${sub}</span>
  </td></tr>`
).join('')}
</table>`, "28px 40px 12px")}
${btn("View full policy", "#0f766e")}
${dividerFooter()}`, "#f0fdfa")}
);

// ── VIP ───────────────────────────────────────────────────────────────────────

add({ id: "vip_early_access", name: "Early Access", category: "VIP", description: "Subscriber-only early access to new drop", primaryColor: "#1e293b",
html: wrap(`
<tr><td style="background:#1e293b;padding:10px 40px;text-align:center;">
  <p style="margin:0;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:3.5px;text-transform:uppercase;">Subscribers only</p>
</td></tr>
<tr><td style="background:#1e40af;padding:40px;text-align:center;">
  <p style="margin:0 0 4px;color:#bfdbfe;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;">You're getting early access</p>
  <h1 style="margin:0 0 10px;color:#fff;font-size:28px;font-weight:700;">Shop before everyone else 🔓</h1>
  <p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px;line-height:1.6;">Our new collection drops publicly tomorrow — but as a subscriber, you get in now. First pick, best selection.</p>
</td></tr>
<tr><td style="padding:24px 40px 8px;text-align:center;">
  <p style="margin:0;color:#6b7280;font-size:14px;">Use your early access code: <strong style="font-family:monospace;background:#dbeafe;color:#1e40af;padding:4px 12px;border-radius:5px;">EARLYBIRD</strong></p>
</td></tr>
${btn("Access the collection now", "#1e40af")}
<tr><td style="padding:0 40px 24px;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:11px;">Early access closes when the public launch begins.</p></td></tr>`, "#eff6ff")}
);

add({ id: "vip_reward", name: "Loyalty Reward", category: "VIP", description: "Thank-you reward for loyal customers", primaryColor: "#92765a",
html: wrap(`
${header("#2d1f0e", `<p style="margin:0 0 6px;color:#d4a853;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:3px;">Loyalty reward</p>
<h1 style="margin:0;color:#fff;font-size:26px;font-weight:700;">You've earned this 🏆</h1>`, "36px 40px")}
${body(`<p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.7;text-align:center;">Your loyalty means everything to us. Here's a reward to say thank you for being part of our community.</p>
<div style="background:#faf7f2;border:2px solid #d4a853;border-radius:12px;padding:28px;text-align:center;">
  <p style="margin:0 0 6px;font-size:44px;font-weight:900;color:#92765a;line-height:1;">25% OFF</p>
  <p style="margin:0 0 12px;color:#8c7360;font-size:13px;">Your exclusive loyalty code</p>
  <p style="margin:0;font-family:monospace;font-size:20px;font-weight:700;color:#92765a;letter-spacing:3px;background:#fff;padding:10px;border-radius:8px;">LOYAL25</p>
</div>`)}
${btn("Redeem my reward", "#92765a")}
${dividerFooter("No expiry on loyalty rewards.", "#f5ede3")}`, "#faf7f2")}
);

export const EMAIL_TEMPLATES: EmailTemplate[] = T;

export const TEMPLATE_CATEGORIES = [
  "All",
  ...Array.from(new Set(T.map((t) => t.category))),
];

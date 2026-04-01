// app/data/emailTemplates.ts
// 100 HTML email templates across 10 layouts × 10 color themes.

export type EmailTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  primaryColor: string;
  html: string;
};

// ─── Themes ──────────────────────────────────────────────────────────────────

type Theme = {
  name: string;
  primary: string;
  primaryLight: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  buttonText: string;
};

const themes: Theme[] = [
  { name: "Emerald",  primary: "#008060", primaryLight: "#d1fae5", bg: "#f0fdf4", surface: "#ffffff", text: "#111827", muted: "#6b7280", buttonText: "#ffffff" },
  { name: "Purple",   primary: "#7c3aed", primaryLight: "#ede9fe", bg: "#f5f3ff", surface: "#ffffff", text: "#111827", muted: "#6b7280", buttonText: "#ffffff" },
  { name: "Red",      primary: "#dc2626", primaryLight: "#fee2e2", bg: "#fff1f2", surface: "#ffffff", text: "#111827", muted: "#6b7280", buttonText: "#ffffff" },
  { name: "Ocean",    primary: "#0ea5e9", primaryLight: "#e0f2fe", bg: "#f0f9ff", surface: "#ffffff", text: "#0c4a6e", muted: "#64748b", buttonText: "#ffffff" },
  { name: "Amber",    primary: "#d97706", primaryLight: "#fef3c7", bg: "#fffbeb", surface: "#ffffff", text: "#111827", muted: "#78716c", buttonText: "#ffffff" },
  { name: "Rose",     primary: "#e11d48", primaryLight: "#ffe4e6", bg: "#fff1f2", surface: "#ffffff", text: "#111827", muted: "#6b7280", buttonText: "#ffffff" },
  { name: "Dark",     primary: "#e2e8f0", primaryLight: "#334155", bg: "#0f172a", surface: "#1e293b", text: "#f1f5f9", muted: "#94a3b8", buttonText: "#0f172a" },
  { name: "Luxury",   primary: "#92765a", primaryLight: "#f5ede3", bg: "#faf7f2", surface: "#ffffff", text: "#2d1f0e", muted: "#8c7360", buttonText: "#ffffff" },
  { name: "Navy",     primary: "#1e40af", primaryLight: "#dbeafe", bg: "#eff6ff", surface: "#ffffff", text: "#0f172a", muted: "#64748b", buttonText: "#ffffff" },
  { name: "Forest",   primary: "#15803d", primaryLight: "#dcfce7", bg: "#f0fdf4", surface: "#ffffff", text: "#14532d", muted: "#6b7280", buttonText: "#ffffff" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wrap(inner: string, t: Theme): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email</title></head>
<body style="margin:0;padding:24px 16px;background:${t.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${t.surface};border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
${inner}
</table>
</td></tr></table>
</body></html>`;
}

function row(content: string, bg = "transparent", pad = "0"): string {
  return `<tr><td style="background:${bg};padding:${pad};">${content}</td></tr>`;
}

function cta(label: string, t: Theme, pad = "8px 40px 32px"): string {
  return `<tr><td align="center" style="padding:${pad};">
<a href="{{shop_url}}" style="display:inline-block;background:${t.primary};color:${t.buttonText};font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;line-height:1;">${label}</a>
</td></tr>`;
}

function divider(t: Theme): string {
  return `<tr><td style="border-top:1px solid ${t.primaryLight};padding:0;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

function footer(t: Theme, msg = "Questions? Reply to this email."): string {
  return `<tr><td style="padding:20px 40px 28px;text-align:center;border-top:1px solid ${t.primaryLight};">
<p style="margin:0;color:${t.muted};font-size:12px;line-height:1.6;">${msg}</p>
</td></tr>`;
}

function productGrid(t: Theme, items: Array<{label: string; price: string}>): string {
  const cols = items.map(item => `
<td width="${Math.floor(100/items.length)}%" style="padding:6px;text-align:center;vertical-align:top;">
  <div style="background:${t.primaryLight};border-radius:8px;height:110px;margin-bottom:8px;"></div>
  <p style="margin:0 0 2px;font-size:12px;font-weight:600;color:${t.text};">${item.label}</p>
  <p style="margin:0;font-size:12px;color:${t.primary};font-weight:700;">${item.price}</p>
</td>`).join('');
  return `<tr><td style="padding:0 16px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cols}</tr></table></td></tr>`;
}

function checklist(items: string[], t: Theme): string {
  return items.map(i => `<tr><td style="padding:3px 0;font-size:14px;color:${t.muted};">
<span style="color:${t.primary};font-weight:700;margin-right:8px;">✓</span>${i}</td></tr>`).join('');
}

function highlightBox(text: string, t: Theme): string {
  return `<div style="background:${t.primaryLight};border-left:4px solid ${t.primary};border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 20px;">
<p style="margin:0;color:${t.text};font-size:14px;font-weight:600;line-height:1.5;">${text}</p>
</div>`;
}

// ─── Layout 1: Welcome ───────────────────────────────────────────────────────

function layoutWelcome(t: Theme, v: number): string {
  const copy = [
    { h: "Welcome to the family! 👋", sub: "You're in. Thanks for subscribing — we're so glad you're here. Expect early access, exclusive deals, and zero spam.", btn: "Explore the store" },
    { h: "Thanks for joining us 🎉", sub: "Great things are coming your way. We'll keep you in the loop on new products, exclusive deals, and more.", btn: "Start shopping" },
    { h: "You made it! 🌟", sub: "Welcome aboard. As a subscriber, you get early access to new arrivals and subscriber-only discounts.", btn: "See what's new" },
    { h: "Hello there! 👋", sub: "We promise to make it worth your while. Expect fresh content, exclusive offers, and absolutely no spam.", btn: "Visit our store" },
    { h: "Welcome to the club ✨", sub: "You now have exclusive access to member-only deals, new arrivals, and curated picks just for you.", btn: "Discover member perks" },
  ][v % 5];
  return wrap(`
${row(`<p style="margin:0 0 8px;color:${t.buttonText};opacity:0.75;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;text-align:center;">Welcome</p>
<h1 style="margin:0;color:${t.buttonText};font-size:30px;font-weight:700;text-align:center;line-height:1.2;">${copy.h}</h1>`, t.primary, "48px 40px 40px")}
${row(`<p style="margin:0;color:${t.muted};font-size:15px;line-height:1.7;text-align:center;">${copy.sub}</p>`, "transparent", "32px 40px 8px")}
${cta(copy.btn, t)}
${footer(t)}`, t);
}

// ─── Layout 2: Product Drop ──────────────────────────────────────────────────

function layoutProductDrop(t: Theme, v: number): string {
  const copy = [
    { label: "NEW COLLECTION", h: "Just Dropped 🔥", sub: "The new collection is here. Shop before it sells out.", btn: "Shop the Drop" },
    { label: "JUST ARRIVED", h: "New Arrivals ✨", sub: "Fresh styles just landed. These won't last long.", btn: "Shop New Arrivals" },
    { label: "SUMMER DROP", h: "Summer Essentials ☀️", sub: "Everything you need for the season — curated just for you.", btn: "Shop Summer Edit" },
    { label: "BACK IN STOCK", h: "Your Favorites Are Back! 🎉", sub: "Grab them before they sell out again. We can't promise they'll stick around.", btn: "Shop Now" },
    { label: "LIMITED EDITION", h: "Limited Edition Drop 💎", sub: "Exclusive pieces, limited quantities. Once it's gone, it's gone.", btn: "Shop Limited Edition" },
  ][v % 5];
  return wrap(`
${row(`<p style="margin:0 0 6px;color:${t.buttonText};opacity:0.7;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;text-align:center;">${copy.label}</p>
<h1 style="margin:0 0 10px;color:${t.buttonText};font-size:32px;font-weight:800;text-align:center;">${copy.h}</h1>
<p style="margin:0;color:${t.buttonText};opacity:0.85;font-size:15px;text-align:center;">${copy.sub}</p>`, t.primary, "40px 40px 36px")}
${productGrid(t, [
  { label: "Product One", price: "$49" },
  { label: "Product Two", price: "$69" },
  { label: "Product Three", price: "$39" },
  { label: "Product Four", price: "$89" },
])}
${cta(copy.btn, t, "20px 40px 32px")}`, t);
}

// ─── Layout 3: Flash Sale ────────────────────────────────────────────────────

function layoutFlashSale(t: Theme, v: number): string {
  const copy = [
    { badge: "48 HOURS ONLY", headline: "SAVE 50% SITEWIDE", discount: "50% OFF", code: "FLASH50", sub: "Our biggest sale of the year. Use code at checkout. Hurry — ends soon!", btn: "Shop the Sale" },
    { badge: "FLASH SALE", headline: "UP TO 40% OFF", discount: "40% OFF", code: "FLASH40", sub: "Limited time, limited stock. No code needed — discount applied automatically.", btn: "Grab the deal" },
    { badge: "TODAY ONLY", headline: "30% OFF EVERYTHING", discount: "30% OFF", code: "TODAY30", sub: "One day only. Shop any product and save 30% automatically at checkout.", btn: "Shop Now" },
    { badge: "WEEKEND SPECIAL", headline: "BUY 2, GET 1 FREE", discount: "B2G1", code: "BUY2GET1", sub: "Mix and match any items. Add 3 to your cart and we'll discount the cheapest.", btn: "Start Shopping" },
    { badge: "SUBSCRIBERS ONLY", headline: "EXCLUSIVE 25% OFF", discount: "25% OFF", code: "SUB25", sub: "This offer is exclusively for subscribers. Don't share — it's just for you.", btn: "Claim Your Discount" },
  ][v % 5];
  return wrap(`
${row(`<p style="margin:0;color:${t.buttonText};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:3px;text-align:center;">${copy.badge}</p>`, t.primary, "14px 40px")}
<tr><td style="padding:36px 40px 8px;text-align:center;">
  <p style="margin:0 0 4px;font-size:60px;font-weight:900;color:${t.primary};line-height:1;">${copy.discount}</p>
  <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${t.text};">${copy.headline}</h1>
  <p style="margin:0 0 16px;color:${t.muted};font-size:14px;line-height:1.6;">${copy.sub}</p>
  <p style="margin:0;color:${t.muted};font-size:13px;">Use code: <strong style="background:${t.primaryLight};color:${t.primary};padding:4px 12px;border-radius:5px;font-family:monospace;">${copy.code}</strong></p>
</td></tr>
${cta(`${copy.btn} →`, t, "20px 40px 32px")}
${row(`<p style="margin:0;color:${t.muted};font-size:11px;text-align:center;">Sale ends soon. While supplies last.</p>`, "transparent", "0 40px 24px")}`, t);
}

// ─── Layout 4: Personal Story ────────────────────────────────────────────────

function layoutStory(t: Theme, v: number): string {
  const copy = [
    { opener: "Hey, I almost didn't share this...", body: "Yesterday I tried something new in our business that completely changed the results. After months of testing, we finally cracked it.", reveal: "Here's what we learned:", lesson: "Small consistent actions always beat one-time big efforts.", cta: "Read the full story →" },
    { opener: "A quick story for you...", body: "A few weeks ago we made a decision that felt risky. Looking back, it was the best choice we could have made for our customers.", reveal: "The lesson?", lesson: "Listening to your customers is the most underrated business strategy.", cta: "See what we changed →" },
    { opener: "We tested this so you don't have to...", body: "Our team spent weeks testing different approaches, and the results were surprising. What we thought would work best... didn't.", reveal: "Here's what actually worked:", lesson: "Simple always beats complex. Every single time.", cta: "Get the full breakdown →" },
    { opener: "Here's what nobody tells you...", body: "Running a store is full of surprises. Last month we hit a milestone that taught us something important about sustainable growth.", reveal: "The key insight:", lesson: "Focus on the next 1% improvement, not the 100x transformation.", cta: "Learn more →" },
    { opener: "I want to be honest with you...", body: "Not every month is perfect. Last quarter was tough. But the lessons from our hardest moments shaped who we are today.", reveal: "What we discovered:", lesson: "Transparency with your community builds more trust than perfection.", cta: "Read our story →" },
  ][v % 5];
  return wrap(`
<tr><td style="padding:40px 40px 8px;">
  <p style="margin:0 0 20px;font-size:16px;font-style:italic;font-weight:600;color:${t.text};">${copy.opener}</p>
  <p style="margin:0 0 20px;color:${t.muted};font-size:15px;line-height:1.7;">${copy.body}</p>
  <p style="margin:0 0 12px;color:${t.text};font-size:15px;font-weight:600;">${copy.reveal}</p>
  ${highlightBox(copy.lesson, t)}
</td></tr>
${cta(copy.cta, t, "4px 40px 32px")}
${footer(t)}`, t);
}

// ─── Layout 5: Digest ────────────────────────────────────────────────────────

function layoutDigest(t: Theme, v: number): string {
  const headlines = [
    "This Week's Highlights 📰",
    "Your Weekly Digest 🗞️",
    "What We're Reading This Week 📚",
    "The Weekly Roundup ✉️",
    "Fresh From the Team 🌿",
  ];
  const intros = [
    "Here's your weekly roundup — the best of what we've been reading, testing, and thinking about.",
    "Curated just for you. The most useful things we've come across this week.",
    "A quick collection of ideas, tools, and insights from our team to yours.",
    "Everything worth knowing this week — business, products, and a little inspiration.",
    "A handpicked selection of our favorite reads, tips, and updates from this week.",
  ];
  const items = [
    { icon: "💡", title: "Tip of the Week", body: "Focus on what moves the needle, not what feels busy. One good action beats ten mediocre ones." },
    { icon: "🔗", title: "Interesting Read", body: "The surprising reason why the best brands focus on fewer products, not more." },
    { icon: "🛠️", title: "Tool Spotlight", body: "Three apps our team uses daily to stay productive and keep customers happy." },
    { icon: "📊", title: "Quick Insight", body: "Consistency is the most underrated competitive advantage in e-commerce today." },
  ];
  const itemRows = items.map(item => `
<tr><td style="padding:0 0 16px;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td width="36" style="vertical-align:top;padding-top:2px;font-size:22px;">${item.icon}</td>
    <td>
      <p style="margin:0 0 4px;font-weight:700;font-size:14px;color:${t.text};">${item.title}</p>
      <p style="margin:0 0 6px;font-size:13px;color:${t.muted};line-height:1.6;">${item.body}</p>
      <a href="{{shop_url}}" style="font-size:12px;color:${t.primary};font-weight:600;text-decoration:none;">Read More →</a>
    </td>
  </tr></table>
</td></tr>
<tr><td style="border-top:1px solid ${t.primaryLight};padding-bottom:16px;"></td></tr>`).join('');

  return wrap(`
${row(`<h1 style="margin:0;color:${t.buttonText};font-size:22px;font-weight:700;text-align:center;">${headlines[v % 5]}</h1>`, t.primary, "28px 40px")}
<tr><td style="padding:24px 40px 8px;">
  <p style="margin:0 0 24px;color:${t.muted};font-size:14px;line-height:1.7;">${intros[v % 5]}</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">${itemRows}</table>
</td></tr>
${cta("Visit the Store →", t, "4px 40px 28px")}`, t);
}

// ─── Layout 6: Win-back ──────────────────────────────────────────────────────

function layoutWinback(t: Theme, v: number): string {
  const copy = [
    { h: "We miss you 💌", sub: "It's been a while since your last visit. Come back and see what's new — we think you'll love it.", discount: "15% OFF", code: "COMEBACK15", btn: "Come Back & Save" },
    { h: "Still thinking about us? 😊", sub: "We noticed you haven't visited in a while. Here's a little something to bring you back.", discount: "20% OFF", code: "MISS20", btn: "Claim Your Discount" },
    { h: "A gift, just for you 🎁", sub: "We want you back. So we're giving you an exclusive discount — because you're worth it.", discount: "10% OFF", code: "GIFT10", btn: "Use My Discount" },
    { h: "Don't forget about us 💙", sub: "We've added new products, improved our service, and we'd love to show you what's changed.", discount: "25% OFF", code: "RETURN25", btn: "See What's New" },
    { h: "Last chance to reconnect ⏰", sub: "This is our final reminder — we'd hate to see you go for good. Here's our best offer yet.", discount: "30% OFF", code: "LASTCHANCE30", btn: "Claim Before It Expires" },
  ][v % 5];
  return wrap(`
${row(`<h1 style="margin:0 0 10px;color:${t.buttonText};font-size:28px;font-weight:700;text-align:center;">${copy.h}</h1>
<p style="margin:0;color:${t.buttonText};opacity:0.85;font-size:14px;line-height:1.6;text-align:center;max-width:420px;margin:0 auto;">${copy.sub}</p>`, t.primary, "44px 40px 36px")}
<tr><td style="padding:28px 40px 8px;text-align:center;">
  <p style="margin:0 0 6px;font-size:56px;font-weight:900;color:${t.primary};line-height:1;">${copy.discount}</p>
  <p style="margin:0;color:${t.muted};font-size:13px;">Use code: <strong style="background:${t.primaryLight};color:${t.primary};padding:3px 12px;border-radius:5px;font-family:monospace;">${copy.code}</strong></p>
</td></tr>
${cta(copy.btn, t, "20px 40px 32px")}
${row(`<p style="margin:0;color:${t.muted};font-size:11px;text-align:center;">Offer valid 7 days. One use per customer.</p>`, "transparent", "0 40px 20px")}`, t);
}

// ─── Layout 7: Post-purchase ─────────────────────────────────────────────────

function layoutPostPurchase(t: Theme, v: number): string {
  const copy = [
    { h: "Thank you for your order! 📦", sub: "Your order is being processed and will ship soon. We'll send tracking info as soon as it's on its way.", bonus: "🎁 Free shipping on your next order — no code needed!", btn: "Continue Shopping" },
    { h: "Order confirmed! 🎉", sub: "We've received your order and our team is already on it. You're going to love what you ordered.", bonus: "⭐ Leave a review and get 10% off your next purchase.", btn: "Leave a Review" },
    { h: "You're all set! ✅", sub: "Your order has been confirmed. While you wait, here are some items that pair perfectly with your purchase.", bonus: "💡 Pro tip: Set up restock alerts on your favorite sold-out items.", btn: "Explore More" },
    { h: "It's on its way! 🚚", sub: "Great news — your order has shipped. Estimated delivery: 3–5 business days.", bonus: "🎁 Your loyalty discount of 10% is now active for your next order.", btn: "Track My Order" },
    { h: "Your review means the world 💬", sub: "You received your order recently — how was it? Your honest feedback helps other shoppers.", bonus: "🌟 Leave a review and unlock a 15% thank-you discount.", btn: "Write a Review" },
  ][v % 5];
  return wrap(`
${row(`<h1 style="margin:0 0 12px;color:${t.buttonText};font-size:26px;font-weight:700;text-align:center;">${copy.h}</h1>
<p style="margin:0;color:${t.buttonText};opacity:0.85;font-size:14px;line-height:1.6;text-align:center;">${copy.sub}</p>`, t.primary, "40px")}
<tr><td style="padding:24px 40px 8px;">
  <div style="background:${t.primaryLight};border-radius:10px;padding:18px;text-align:center;">
    <p style="margin:0;color:${t.text};font-size:14px;font-weight:500;line-height:1.6;">${copy.bonus}</p>
  </div>
</td></tr>
${cta(copy.btn, t, "20px 40px 32px")}
${footer(t, "Need help with your order? Just reply to this email.")}`, t);
}

// ─── Layout 8: New Arrival / Seasonal ───────────────────────────────────────

function layoutSeasonal(t: Theme, v: number): string {
  const copy = [
    { season: "Spring Collection", h: "Fresh Styles Have Arrived 🌸", sub: "Light fabrics, new colors, and everything you need for the new season.", btn: "Shop Spring Arrivals" },
    { season: "Summer Drops", h: "Summer Is Here ☀️", sub: "Bold prints, beachwear, and everything in between. Explore this season's must-haves.", btn: "Shop Summer Now" },
    { season: "Fall Collection", h: "Autumn Vibes Are Here 🍂", sub: "Cozy layers, warm tones, and timeless pieces for the cooler months ahead.", btn: "Shop Fall Favorites" },
    { season: "Winter Essentials", h: "Winter Is Coming ❄️", sub: "Bundle up in style. Our warmest and most elegant winter pieces are now available.", btn: "Shop Winter Edit" },
    { season: "Holiday Special", h: "The Holiday Collection 🎄", sub: "Perfect gifts for everyone on your list. Shop early for the best selection.", btn: "Shop Holiday Gifts" },
  ][v % 5];
  return wrap(`
<tr><td style="height:6px;background:${t.primary};"></td></tr>
<tr><td style="padding:32px 40px 8px;text-align:center;">
  <p style="margin:0 0 6px;color:${t.primary};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;">${copy.season}</p>
  <h1 style="margin:0 0 12px;color:${t.text};font-size:28px;font-weight:800;">${copy.h}</h1>
  <p style="margin:0;color:${t.muted};font-size:15px;line-height:1.6;">${copy.sub}</p>
</td></tr>
${productGrid(t, [
  { label: "New Arrival", price: "$59" },
  { label: "Best Seller", price: "$79" },
  { label: "Staff Pick", price: "$49" },
])}
${cta(copy.btn, t, "20px 40px 36px")}`, t);
}

// ─── Layout 9: VIP / Exclusive ───────────────────────────────────────────────

function layoutVIP(t: Theme, v: number): string {
  const copy = [
    { badge: "EXCLUSIVE OFFER", h: "Your VIP Discount Is Here 💎", sub: "As one of our most valued customers, you get early access and a special discount that nobody else receives.", discount: "20% OFF", code: "VIP20", btn: "Access VIP Sale" },
    { badge: "SUBSCRIBER ONLY", h: "This Offer Is Just For You ⭐", sub: "You subscribed — so you get the perks. Early access and an exclusive discount code.", discount: "15% OFF", code: "SUB15", btn: "Shop My Exclusive Offer" },
    { badge: "EARLY ACCESS", h: "Shop Before Everyone Else 🔓", sub: "Our new collection drops tomorrow — but as a VIP, you get access right now. First pick, best selection.", discount: "EARLY ACCESS", code: "EARLYBIRD", btn: "Shop Early Access" },
    { badge: "LOYALTY REWARD", h: "You've Earned This 🏆", sub: "Your loyalty means everything to us. Here's a reward to say thank you for being part of our community.", discount: "25% OFF", code: "LOYAL25", btn: "Redeem Your Reward" },
    { badge: "MEMBERS ONLY", h: "Exclusive: Members-Only Sale 🔐", sub: "This sale is hidden from the public — it's only for members like you. Don't share the code.", discount: "30% OFF", code: "MEMBER30", btn: "Enter the Members Sale" },
  ][v % 5];
  return wrap(`
${row(`<p style="margin:0;color:${t.surface};font-size:10px;font-weight:700;letter-spacing:3.5px;text-transform:uppercase;text-align:center;">${copy.badge}</p>`, t.text, "10px 40px")}
${row(`<h1 style="margin:0 0 12px;color:${t.buttonText};font-size:26px;font-weight:700;text-align:center;">${copy.h}</h1>
<p style="margin:0;color:${t.buttonText};opacity:0.85;font-size:14px;line-height:1.6;text-align:center;max-width:400px;margin:0 auto;">${copy.sub}</p>`, t.primary, "36px 40px")}
<tr><td style="padding:28px 40px 8px;text-align:center;">
  <p style="margin:0 0 8px;font-size:44px;font-weight:900;color:${t.primary};line-height:1;">${copy.discount}</p>
  <p style="margin:0;color:${t.muted};font-size:13px;">Use code: <strong style="font-family:monospace;background:${t.primaryLight};color:${t.primary};padding:3px 12px;border-radius:5px;">${copy.code}</strong></p>
</td></tr>
${cta(copy.btn, t, "16px 40px 32px")}`, t);
}

// ─── Layout 10: Announcement ─────────────────────────────────────────────────

function layoutAnnouncement(t: Theme, v: number): string {
  const copy = [
    { label: "BIG NEWS", h: "We're Launching Something New 🚀", sub: "We've been working on this for months and we're finally ready to share it. This changes everything about how you shop with us.", items: ["Faster shipping than ever", "Improved product quality", "New exclusive product lines", "Better prices, always"], btn: "See What's New" },
    { label: "ANNOUNCEMENT", h: "A Message From Our Team 💬", sub: "We want to be transparent with you. Here's an update on exciting changes we're making to serve you better.", items: ["Extended return window: 60 days", "Free exchanges on all orders", "New loyalty rewards program", "24/7 customer support"], btn: "Learn More" },
    { label: "MILESTONE", h: "We Hit 10,000 Customers! 🎉", sub: "This milestone means everything to us — and it's all because of incredible customers like you. Thank you.", items: ["10,000 happy customers", "50,000+ orders shipped", "4.9/5 average review score", "Operating in 30+ countries"], btn: "Be Part of the Story" },
    { label: "POLICY UPDATE", h: "Good News: Upgraded Returns 📦", sub: "Based on your feedback, we've made our return policy even better. Here's what changed:", items: ["60-day return window (was 30)", "Free return shipping for all", "Instant refunds on approval", "No questions asked"], btn: "View Updated Policy" },
    { label: "COMING SOON", h: "Something Big Is Coming... 👀", sub: "We can't reveal everything yet, but we wanted you to be the first to know. Join the early access list.", items: ["Early access for subscribers", "Exclusive launch pricing", "Limited founding member spots", "Special thank-you gifts"], btn: "Get Early Access" },
  ][v % 5];
  return wrap(`
${row(`<p style="margin:0;color:${t.buttonText};font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;text-align:center;">${copy.label}</p>`, t.primary, "12px 40px")}
<tr><td style="padding:32px 40px 8px;">
  <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:${t.text};line-height:1.3;">${copy.h}</h1>
  <p style="margin:0 0 20px;color:${t.muted};font-size:15px;line-height:1.7;">${copy.sub}</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    ${checklist(copy.items, t)}
  </table>
</td></tr>
${cta(copy.btn, t, "20px 40px 32px")}
${footer(t)}`, t);
}

// ─── Build catalog ────────────────────────────────────────────────────────────

const layouts: Array<{
  name: string;
  category: string;
  emoji: string;
  fn: (t: Theme, v: number) => string;
}> = [
  { name: "Welcome",       category: "Welcome",       emoji: "👋", fn: layoutWelcome },
  { name: "Product Drop",  category: "Products",      emoji: "🔥", fn: layoutProductDrop },
  { name: "Flash Sale",    category: "Promotions",    emoji: "⚡", fn: layoutFlashSale },
  { name: "Story",         category: "Newsletter",    emoji: "📖", fn: layoutStory },
  { name: "Digest",        category: "Newsletter",    emoji: "📰", fn: layoutDigest },
  { name: "Win-back",      category: "Win-back",      emoji: "💌", fn: layoutWinback },
  { name: "Post-purchase", category: "Post-purchase", emoji: "📦", fn: layoutPostPurchase },
  { name: "Seasonal",      category: "Products",      emoji: "🌸", fn: layoutSeasonal },
  { name: "VIP Exclusive", category: "Promotions",    emoji: "💎", fn: layoutVIP },
  { name: "Announcement",  category: "Announcements", emoji: "📣", fn: layoutAnnouncement },
];

export const EMAIL_TEMPLATES: EmailTemplate[] = [];

layouts.forEach((layout) => {
  themes.forEach((theme, i) => {
    EMAIL_TEMPLATES.push({
      id: `${layout.name.toLowerCase().replace(/\s+/g, "_")}_${theme.name.toLowerCase()}`,
      name: `${layout.emoji} ${layout.name} — ${theme.name}`,
      category: layout.category,
      description: `${layout.name} template with ${theme.name} color scheme`,
      primaryColor: theme.primary,
      html: layout.fn(theme, i),
    });
  });
});

export const TEMPLATE_CATEGORIES = ["All", ...Array.from(new Set(layouts.map(l => l.category)))];

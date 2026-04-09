// app/data/unlayerTemplates.ts
// Unlayer JSON design templates — proper drag-and-drop blocks with image upload, buttons, undo support.

export type UnlayerTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  primaryColor: string;
  design: object; // Unlayer JSON design
  html: string;   // Preview HTML (for gallery thumbnails)
};

function makeDesign(opts: {
  bgColor?: string;
  headerBg: string;
  headerText: string;
  headerSubtext?: string;
  imageUrl?: string;
  bodyText: string;
  buttonText: string;
  buttonColor: string;
  buttonUrl?: string;
  footerText?: string;
}): object {
  const rows: any[] = [];

  // Header row
  rows.push({
    cells: [1],
    columns: [{
      contents: [{
        type: "text",
        values: {
          text: `<h1 style="text-align:center;color:#ffffff;font-size:28px;font-weight:700;">${opts.headerText}</h1>${opts.headerSubtext ? `<p style="text-align:center;color:rgba(255,255,255,0.8);font-size:14px;">${opts.headerSubtext}</p>` : ""}`,
          containerPadding: "40px 30px",
        },
      }],
    }],
    values: { backgroundColor: opts.headerBg },
  });

  // Image row (optional)
  if (opts.imageUrl) {
    rows.push({
      cells: [1],
      columns: [{
        contents: [{
          type: "image",
          values: {
            src: { url: opts.imageUrl, width: 600, height: 220 },
            altText: "Email image",
            action: { name: "web", values: { href: "{{shop_url}}", target: "_blank" } },
            containerPadding: "0px",
            fullWidth: true,
          },
        }],
      }],
      values: { backgroundColor: "#ffffff" },
    });
  }

  // Body text row
  rows.push({
    cells: [1],
    columns: [{
      contents: [{
        type: "text",
        values: {
          text: `<p style="text-align:center;color:#6b7280;font-size:15px;line-height:1.7;">${opts.bodyText}</p>`,
          containerPadding: "28px 40px 8px",
        },
      }],
    }],
    values: { backgroundColor: "#ffffff" },
  });

  // Button row
  rows.push({
    cells: [1],
    columns: [{
      contents: [{
        type: "button",
        values: {
          text: opts.buttonText,
          href: { name: "web", values: { href: opts.buttonUrl || "{{shop_url}}", target: "_blank" } },
          size: { autoWidth: false, width: "50%" },
          textAlign: "center",
          lineHeight: "140%",
          padding: "14px 32px",
          borderRadius: "8px",
          backgroundColor: opts.buttonColor,
          textColor: "#ffffff",
          fontSize: "15px",
          fontWeight: 600,
          containerPadding: "16px 40px 32px",
        },
      }],
    }],
    values: { backgroundColor: "#ffffff" },
  });

  // Footer row with unsubscribe
  rows.push({
    cells: [1],
    columns: [{
      contents: [{
        type: "text",
        values: {
          text: `<p style="text-align:center;color:#9ca3af;font-size:12px;margin:0 0 8px;">${opts.footerText || "Questions? Just reply to this email."}</p><p style="text-align:center;margin:0;"><a href="{{unsubscribe_url}}" style="color:#9ca3af;font-size:11px;text-decoration:underline;">Unsubscribe</a></p>`,
          containerPadding: "20px 40px 24px",
        },
      }],
    }],
    values: { backgroundColor: "#ffffff", borderTop: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "#e5e7eb" } },
  });

  return {
    body: {
      rows,
      values: {
        backgroundColor: opts.bgColor || "#f4f4f4",
        contentWidth: "600px",
        fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" },
      },
    },
  };
}

// Preview HTML generator (simplified for gallery thumbnails)
function previewHtml(opts: { headerBg: string; headerText: string; bodyText: string; buttonText: string; buttonColor: string; imageUrl?: string }): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px 16px;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${opts.headerBg};padding:40px 30px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:28px;">${opts.headerText}</h1></td></tr>
${opts.imageUrl ? `<tr><td><img src="${opts.imageUrl}" width="600" height="200" style="width:100%;height:200px;object-fit:cover;display:block;"></td></tr>` : ""}
<tr><td style="padding:24px 40px;text-align:center;color:#6b7280;font-size:14px;">${opts.bodyText}</td></tr>
<tr><td align="center" style="padding:8px 40px 32px;"><a href="#" style="display:inline-block;background:${opts.buttonColor};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${opts.buttonText}</a></td></tr>
<tr><td style="padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;">Questions? Reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
}

const TEMPLATES: UnlayerTemplate[] = [];

// ── WELCOME ──
TEMPLATES.push({
  id: "u_welcome_classic", name: "Welcome — Classic", category: "Welcome", description: "Clean hero welcome with CTA", primaryColor: "#008060",
  design: makeDesign({ headerBg: "#008060", headerText: "Welcome to the family! 👋", headerSubtext: "WELCOME", imageUrl: "https://picsum.photos/seed/welcome9/600/220", bodyText: "You're in. Thanks for subscribing — we're so glad you're here. Expect early access, exclusive deals, and zero spam.", buttonText: "Explore the store", buttonColor: "#008060" }),
  html: previewHtml({ headerBg: "#008060", headerText: "Welcome to the family! 👋", imageUrl: "https://picsum.photos/seed/welcome9/600/220", bodyText: "You're in. Thanks for subscribing — we're so glad you're here.", buttonText: "Explore the store", buttonColor: "#008060" }),
});

TEMPLATES.push({
  id: "u_welcome_bold", name: "Welcome — Bold", category: "Welcome", description: "High-contrast bold welcome", primaryColor: "#1e293b",
  design: makeDesign({ headerBg: "#1e293b", headerText: "YOU'RE IN.", headerSubtext: "Welcome aboard. Exclusive early access, member deals, and first look at every new drop.", bodyText: "Start browsing our latest collection — picked just for you.", buttonText: "Start exploring", buttonColor: "#f59e0b", bgColor: "#1e293b" }),
  html: previewHtml({ headerBg: "#1e293b", headerText: "YOU'RE IN.", bodyText: "Exclusive early access, member deals, and first look at every new drop.", buttonText: "Start exploring", buttonColor: "#f59e0b" }),
});

TEMPLATES.push({
  id: "u_welcome_discount", name: "Welcome Gift", category: "Welcome", description: "Welcome + 10% discount for new subscribers", primaryColor: "#7c3aed",
  design: makeDesign({ headerBg: "#7c3aed", headerText: "Here's 10% off 🎁", headerSubtext: "A welcome gift just for you", bodyText: "Use code <strong>WELCOME10</strong> at checkout. Valid for 30 days on any order.", buttonText: "Shop now", buttonColor: "#7c3aed" }),
  html: previewHtml({ headerBg: "#7c3aed", headerText: "Here's 10% off 🎁", bodyText: "Use code WELCOME10 at checkout.", buttonText: "Shop now", buttonColor: "#7c3aed" }),
});

// ── PROMOTIONS ──
TEMPLATES.push({
  id: "u_flash_sale", name: "Flash Sale", category: "Promotions", description: "Urgency-driven sale email", primaryColor: "#dc2626",
  design: makeDesign({ headerBg: "#dc2626", headerText: "⚡ FLASH SALE ⚡", headerSubtext: "24 HOURS ONLY", bodyText: "Up to 50% off everything. Don't wait — when it's gone, it's gone.", buttonText: "Shop the sale", buttonColor: "#dc2626" }),
  html: previewHtml({ headerBg: "#dc2626", headerText: "⚡ FLASH SALE ⚡", bodyText: "Up to 50% off everything. 24 hours only.", buttonText: "Shop the sale", buttonColor: "#dc2626" }),
});

TEMPLATES.push({
  id: "u_promo_code", name: "Exclusive Offer", category: "Promotions", description: "Discount code with urgency copy", primaryColor: "#7c3aed",
  design: makeDesign({ headerBg: "#7c3aed", headerText: "Your exclusive code inside", headerSubtext: "FOR VIP SUBSCRIBERS ONLY", bodyText: "Use code <strong>VIP20</strong> for 20% off your next order. Expires in 48 hours.", buttonText: "Redeem now", buttonColor: "#7c3aed" }),
  html: previewHtml({ headerBg: "#7c3aed", headerText: "Your exclusive code inside", bodyText: "Use code VIP20 for 20% off. Expires in 48 hours.", buttonText: "Redeem now", buttonColor: "#7c3aed" }),
});

// ── PRODUCTS ──
TEMPLATES.push({
  id: "u_new_drop", name: "New Drop", category: "Products", description: "New collection launch", primaryColor: "#111827",
  design: makeDesign({ headerBg: "#111827", headerText: "New Collection is Here", headerSubtext: "JUST DROPPED", imageUrl: "https://picsum.photos/seed/newdrop/600/220", bodyText: "Fresh styles just landed. Be the first to shop the new collection before it sells out.", buttonText: "Shop new arrivals", buttonColor: "#111827" }),
  html: previewHtml({ headerBg: "#111827", headerText: "New Collection is Here", imageUrl: "https://picsum.photos/seed/newdrop/600/220", bodyText: "Fresh styles just landed.", buttonText: "Shop new arrivals", buttonColor: "#111827" }),
});

TEMPLATES.push({
  id: "u_back_in_stock", name: "Back in Stock", category: "Products", description: "Urgency email for restocked items", primaryColor: "#16a34a",
  design: makeDesign({ headerBg: "#16a34a", headerText: "It's back! 🎉", headerSubtext: "BACK IN STOCK", bodyText: "The item you've been waiting for is finally available again. Limited quantities — grab yours before it sells out.", buttonText: "Get it now", buttonColor: "#16a34a" }),
  html: previewHtml({ headerBg: "#16a34a", headerText: "It's back! 🎉", bodyText: "The item you've been waiting for is finally available again.", buttonText: "Get it now", buttonColor: "#16a34a" }),
});

// ── NEW PRODUCT ──
TEMPLATES.push({
  id: "u_new_product_hero", name: "New Product — Hero", category: "New Product", description: "Bold hero image with product spotlight", primaryColor: "#111827",
  design: makeDesign({ headerBg: "#111827", headerText: "Just Launched 🚀", headerSubtext: "NEW PRODUCT", imageUrl: "https://picsum.photos/seed/newprod1/600/280", bodyText: "Introducing our newest product — designed for you. Be among the first to try it.", buttonText: "Shop now", buttonColor: "#111827" }),
  html: previewHtml({ headerBg: "#111827", headerText: "Just Launched 🚀", imageUrl: "https://picsum.photos/seed/newprod1/600/280", bodyText: "Introducing our newest product — designed for you.", buttonText: "Shop now", buttonColor: "#111827" }),
});

TEMPLATES.push({
  id: "u_new_product_minimal", name: "New Product — Minimal", category: "New Product", description: "Clean minimal product announcement", primaryColor: "#374151",
  design: makeDesign({ headerBg: "#374151", headerText: "Something new is here", bodyText: "We've been working on something special. Simple, thoughtful, made for everyday use. Take a look.", buttonText: "See the product", buttonColor: "#374151" }),
  html: previewHtml({ headerBg: "#374151", headerText: "Something new is here", bodyText: "Simple, thoughtful, made for everyday use.", buttonText: "See the product", buttonColor: "#374151" }),
});

TEMPLATES.push({
  id: "u_new_product_vibrant", name: "New Product — Vibrant", category: "New Product", description: "Colorful launch announcement with energy", primaryColor: "#7c3aed",
  design: makeDesign({ headerBg: "#7c3aed", headerText: "🎉 It's here!", headerSubtext: "NEW DROP", imageUrl: "https://picsum.photos/seed/newprod2/600/280", bodyText: "The wait is over. Our latest product just dropped and it's everything you've been asking for.", buttonText: "Get it first", buttonColor: "#7c3aed" }),
  html: previewHtml({ headerBg: "#7c3aed", headerText: "🎉 It's here!", imageUrl: "https://picsum.photos/seed/newprod2/600/280", bodyText: "The wait is over. Our latest product just dropped.", buttonText: "Get it first", buttonColor: "#7c3aed" }),
});

TEMPLATES.push({
  id: "u_new_product_premium", name: "New Product — Premium", category: "New Product", description: "Luxury feel for premium product launches", primaryColor: "#92765a",
  design: makeDesign({ headerBg: "#92765a", headerText: "Crafted with care", headerSubtext: "INTRODUCING", bodyText: "Every detail matters. Our newest creation combines quality materials with timeless design. Limited first run available.", buttonText: "Discover", buttonColor: "#92765a", bgColor: "#faf7f2" }),
  html: previewHtml({ headerBg: "#92765a", headerText: "Crafted with care", bodyText: "Quality materials with timeless design. Limited first run.", buttonText: "Discover", buttonColor: "#92765a" }),
});

TEMPLATES.push({
  id: "u_new_product_preorder", name: "New Product — Pre-order", category: "New Product", description: "Build hype with pre-order announcement", primaryColor: "#0891b2",
  design: makeDesign({ headerBg: "#0891b2", headerText: "Coming Soon 👀", headerSubtext: "PRE-ORDER NOW", bodyText: "Be the first to get it. Pre-order today and secure yours before the official launch. Limited quantities available.", buttonText: "Pre-order now", buttonColor: "#0891b2" }),
  html: previewHtml({ headerBg: "#0891b2", headerText: "Coming Soon 👀", bodyText: "Pre-order today and secure yours before launch.", buttonText: "Pre-order now", buttonColor: "#0891b2" }),
});

// ── WIN-BACK ──
TEMPLATES.push({
  id: "u_winback", name: "We Miss You", category: "Win-back", description: "Re-engagement email with discount", primaryColor: "#dc2626",
  design: makeDesign({ headerBg: "#dc2626", headerText: "We miss you! ❤️", bodyText: "It's been a while since your last visit. Here's 15% off to welcome you back. Use code <strong>COMEBACK15</strong>.", buttonText: "Come back & save", buttonColor: "#dc2626" }),
  html: previewHtml({ headerBg: "#dc2626", headerText: "We miss you! ❤️", bodyText: "Here's 15% off to welcome you back.", buttonText: "Come back & save", buttonColor: "#dc2626" }),
});

// ── POST-PURCHASE ──
TEMPLATES.push({
  id: "u_thank_you", name: "Thank You", category: "Post-purchase", description: "Order confirmation with next-step CTA", primaryColor: "#0ea5e9",
  design: makeDesign({ headerBg: "#0ea5e9", headerText: "Thank you for your order! 🙏", bodyText: "Your order is being prepared. We'll notify you when it ships. In the meantime, check out what's trending.", buttonText: "Continue shopping", buttonColor: "#0ea5e9" }),
  html: previewHtml({ headerBg: "#0ea5e9", headerText: "Thank you for your order! 🙏", bodyText: "Your order is being prepared.", buttonText: "Continue shopping", buttonColor: "#0ea5e9" }),
});

TEMPLATES.push({
  id: "u_review_request", name: "Review Request", category: "Post-purchase", description: "Ask for a product review", primaryColor: "#f59e0b",
  design: makeDesign({ headerBg: "#f59e0b", headerText: "How was your order? ⭐", bodyText: "We'd love to hear what you think! Leave a quick review — it only takes a minute and helps other customers.", buttonText: "Write a review", buttonColor: "#f59e0b" }),
  html: previewHtml({ headerBg: "#f59e0b", headerText: "How was your order? ⭐", bodyText: "Leave a quick review — it only takes a minute.", buttonText: "Write a review", buttonColor: "#f59e0b" }),
});

// ── NEWSLETTER ──
TEMPLATES.push({
  id: "u_weekly_digest", name: "Weekly Digest", category: "Newsletter", description: "Weekly content roundup", primaryColor: "#1e40af",
  design: makeDesign({ headerBg: "#1e40af", headerText: "This Week's Highlights", headerSubtext: "WEEKLY DIGEST", bodyText: "Here's what happened this week — new arrivals, top picks, and tips from the team.", buttonText: "Read more", buttonColor: "#1e40af" }),
  html: previewHtml({ headerBg: "#1e40af", headerText: "This Week's Highlights", bodyText: "New arrivals, top picks, and tips from the team.", buttonText: "Read more", buttonColor: "#1e40af" }),
});

// ── ANNOUNCEMENTS ──
TEMPLATES.push({
  id: "u_announcement", name: "Announcement", category: "Announcements", description: "Product or feature announcement", primaryColor: "#7c3aed",
  design: makeDesign({ headerBg: "#7c3aed", headerText: "Big news! 🎉", bodyText: "We've been working on something exciting and can't wait to share it with you.", buttonText: "See what's new", buttonColor: "#7c3aed" }),
  html: previewHtml({ headerBg: "#7c3aed", headerText: "Big news! 🎉", bodyText: "We've been working on something exciting.", buttonText: "See what's new", buttonColor: "#7c3aed" }),
});

export const UNLAYER_TEMPLATES = TEMPLATES;

export const UNLAYER_CATEGORIES = [
  "All",
  ...Array.from(new Set(TEMPLATES.map((t) => t.category))),
];

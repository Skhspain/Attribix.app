// app/services/reviewEmail.server.ts
// Schedules a review request email to be sent N days after an order.
// Uses setTimeout (in-process) — restarts reset the timer, which is acceptable
// for this use case. For production reliability, swap with a proper queue.

import db from "~/db.server";
import { sendEmail } from "~/services/resend.server";

const APP_URL = (process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev").replace(/\/$/, "");
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || "reviews@attribix.com";

export async function scheduleReviewRequest({
  shop,
  orderId,
  payload,
}: {
  shop: string;
  orderId: string | null;
  payload: any;
}) {
  const anyDb = db as any;

  const settings = await anyDb.reviewSettings.findUnique({ where: { shop } });
  if (!settings?.sendRequestEmail) return;

  const customerEmail =
    payload?.email || payload?.customer?.email || null;
  if (!customerEmail) return;

  const customerFirstName =
    payload?.customer?.first_name ||
    payload?.billing_address?.first_name ||
    payload?.shipping_address?.first_name ||
    "there";

  // Get first line item for the product
  const lineItems: any[] = Array.isArray(payload?.line_items) ? payload.line_items : [];
  const firstItem = lineItems[0];
  const productId = firstItem
    ? String(firstItem.product_id || firstItem.variant_id || "unknown")
    : "unknown";
  const productTitle = firstItem?.title || "your recent purchase";

  const delayMs = (settings.requestDelayDays || 7) * 24 * 60 * 60 * 1000;

  console.log(`[reviewEmail] scheduling for shop=${shop} in ${settings.requestDelayDays}d → ${customerEmail}`);

  setTimeout(async () => {
    try {
      const reviewLink =
        `${APP_URL}/reviews/submit/${encodeURIComponent(shop)}/${encodeURIComponent(productId)}` +
        `?order=${encodeURIComponent(orderId || "")}&name=${encodeURIComponent(customerFirstName)}&email=${encodeURIComponent(customerEmail)}&product=${encodeURIComponent(productTitle)}`;

      const shopDisplay = shop.replace(".myshopify.com", "");

      const subject = (settings.emailSubject || "How was your order from {shop}?")
        .replace("{shop}", shopDisplay)
        .replace("{name}", customerFirstName)
        .replace("{product}", productTitle);

      const rawBody = settings.emailBody || "";
      // Substitute variables — works for both plain text and HTML templates
      const replaced = rawBody
        .replace(/\{name\}/g, customerFirstName)
        .replace(/\{shop\}/g, shopDisplay)
        .replace(/\{product\}/g, productTitle)
        .replace(/\{review_link\}/g, reviewLink);

      // If the stored body is already a full HTML document, use it directly
      const html = replaced.trimStart().startsWith("<!DOCTYPE") || replaced.trimStart().startsWith("<html")
        ? replaced
        : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 16px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
<tr><td style="background:#4f46e5;padding:36px 40px;text-align:center;">
  <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">How was your experience?</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
  ${replaced.split("\n").map((line: string) => line.trim() ? `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7;">${line}</p>` : "<br>").join("")}
</td></tr>
<tr><td align="center" style="padding:8px 40px 32px;">
  <a href="${reviewLink}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">Leave a review ★</a>
</td></tr>
<tr><td style="border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
  <p style="margin:0;color:#9ca3af;font-size:12px;">You received this because you placed an order at ${shopDisplay}.</p>
</td></tr>
</table></td></tr></table></body></html>`;

      await sendEmail({
        from: FROM_EMAIL,
        to: customerEmail,
        subject,
        html,
      });

      console.log(`[reviewEmail] sent to ${customerEmail} for shop=${shop}`);
    } catch (err: any) {
      console.error("[reviewEmail] send failed:", err?.message);
    }
  }, delayMs);
}

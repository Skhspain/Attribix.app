// app/routes/reviews.submit.$shop.$productId.tsx
// Public page — no Shopify auth required. Customers land here from review request emails.
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { useState, useRef } from "react";
import db from "../db.server";
import { createReviewDiscountCode } from "~/services/shopifyDiscount.server";
import { getShopPlan, checkReviewsQuota } from "~/services/plan.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const shop = decodeURIComponent(params.shop!);
  const productId = decodeURIComponent(params.productId!);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order") || "";
  const name = url.searchParams.get("name") || "";
  const email = url.searchParams.get("email") || "";
  const productTitle = url.searchParams.get("product") || productId;

  const anyDb = db as any;
  const widgetSettings = await anyDb.reviewWidgetSettings?.findUnique?.({ where: { shop } }).catch(() => null);

  return json({
    shop, productId, productTitle, orderId, name, email,
    allowImages: widgetSettings?.allowImages ?? true,
    primaryColor: widgetSettings?.primaryColor ?? "#4f46e5",
  });
}

export async function action({ params, request }: ActionFunctionArgs) {
  const shop = decodeURIComponent(params.shop!);
  const productId = decodeURIComponent(params.productId!);
  const anyDb = db as any;

  const form = await request.formData();
  const rating = Number(form.get("rating"));
  const title = String(form.get("title") || "").trim();
  const body = String(form.get("body") || "").trim();
  const reviewerName = String(form.get("reviewerName") || "").trim();
  const reviewerEmail = String(form.get("reviewerEmail") || "").trim();
  const orderId = String(form.get("orderId") || "").trim();
  const productTitle = String(form.get("productTitle") || "").trim();
  const newsletterOptIn = form.get("newsletterOptIn") === "true";

  // Collect up to 3 images (base64)
  const images: string[] = [];
  for (let i = 0; i < 3; i++) {
    const img = String(form.get(`image_${i}`) || "").trim();
    if (img && img.startsWith("data:image/")) images.push(img);
  }

  if (!rating || rating < 1 || rating > 5) return json({ error: "Please select a star rating." }, { status: 400 });
  if (!body) return json({ error: "Please write a review." }, { status: 400 });
  if (!reviewerName) return json({ error: "Please enter your name." }, { status: 400 });
  if (!reviewerEmail || !/\S+@\S+\.\S+/.test(reviewerEmail)) return json({ error: "Please enter a valid email." }, { status: 400 });

  const settings = await anyDb.reviewSettings?.findUnique?.({ where: { shop } }).catch(() => null);
  const autoApprove = settings?.autoApprove ?? false;

  // Enforce plan review quota
  const plan = await getShopPlan(shop);
  const quota = await checkReviewsQuota(shop, plan);
  if (!quota.allowed) {
    return json({ error: "This store has reached its monthly review limit. Please contact the store owner." }, { status: 403 });
  }

  await anyDb.review.create({
    data: {
      shop,
      productId,
      productTitle: productTitle || productId,
      orderId: orderId || null,
      reviewerName,
      reviewerEmail,
      rating,
      title: title || null,
      body,
      images: images.length ? JSON.stringify(images) : null,
      status: autoApprove ? "approved" : "pending",
      verifiedPurchase: !!orderId,
    },
  });

  // Newsletter opt-in
  if (newsletterOptIn) {
    const [firstName, ...rest] = reviewerName.split(" ");
    await anyDb.newsletterSubscriber.upsert({
      where: { shop_email: { shop, email: reviewerEmail } },
      create: { shop, email: reviewerEmail, firstName: firstName || null, lastName: rest.join(" ") || null, status: "subscribed", source: "review" },
      update: { status: "subscribed", firstName: firstName || undefined },
    }).catch(() => null);
  }

  // Discount reward
  let discountCode: string | null = null;
  if (settings?.discountEnabled) {
    const session = await anyDb.session?.findFirst?.({ where: { shop }, select: { accessToken: true } }).catch(() => null);
    if (session?.accessToken) {
      discountCode = await createReviewDiscountCode({
        shop,
        accessToken: session.accessToken,
        discountValue: settings.discountValue ?? 10,
        discountType: settings.discountType ?? "percentage",
        expiryDays: settings.discountExpiryDays ?? 30,
      });
    }
  }

  return json({ ok: true, subscribed: newsletterOptIn, discountCode, discountValue: settings?.discountValue, discountType: settings?.discountType });
}

export default function ReviewSubmit() {
  const { shop, productId, productTitle, orderId, name, email, allowImages, primaryColor } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state !== "idle";

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const shopDisplay = shop.replace(".myshopify.com", "");

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 3);
    files.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) return; // skip >5MB
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        // Compress via canvas
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxDim = 1200;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL("image/jpeg", 0.75);
          setImages((prev) => [...prev, compressed].slice(0, 3));
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function removeImage(i: number) {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  if ((actionData as any)?.ok) {
    const dc = (actionData as any).discountCode;
    const dv = (actionData as any).discountValue;
    const dt = (actionData as any).discountType;
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, textAlign: "center" }}>🎉</div>
          <h2 style={{ margin: "12px 0 8px", textAlign: "center", fontSize: 22, fontWeight: 700 }}>Thank you!</h2>
          <p style={{ color: "#6b7280", textAlign: "center", margin: "0 0 16px" }}>
            Your review has been submitted and will appear on our store shortly.
          </p>
          {dc && (
            <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
              <p style={{ margin: "0 0 6px", fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                🎁 Here's {dt === "percentage" ? `${dv}% off` : `${dv} off`} your next order!
              </p>
              <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "0.08em", background: "#fff", border: "1.5px dashed #86efac", borderRadius: 8, padding: "8px 20px", display: "inline-block", margin: "4px 0 8px" }}>
                {dc}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Use this code at checkout. Expires in {(actionData as any).discountExpiryDays ?? 30} days.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{shopDisplay}</div>
          <h1 style={{ margin: "6px 0 4px", fontSize: 22, fontWeight: 800, color: "#111827" }}>Leave a review</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>{productTitle}</p>
        </div>

        {(actionData as any)?.error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#dc2626", fontSize: 14 }}>
            {(actionData as any).error}
          </div>
        )}

        <Form method="post">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="productTitle" value={productTitle} />
          <input type="hidden" name="rating" value={rating} />
          {images.map((img, i) => (
            <input key={i} type="hidden" name={`image_${i}`} value={img} />
          ))}

          {/* Star picker */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "#374151", fontWeight: 600, marginBottom: 8 }}>Your rating *</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 4 }} onMouseLeave={() => setHover(0)}>
              {[1,2,3,4,5].map((n) => (
                <span key={n} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)}
                  style={{ fontSize: 40, cursor: "pointer", color: n <= (hover || rating) ? "#f59e0b" : "#d1d5db", lineHeight: 1, userSelect: "none", transition: "color 0.1s" }}>★</span>
              ))}
            </div>
            {rating > 0 && (
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                {["", "Poor", "Fair", "Good", "Very good", "Excellent"][rating]}
              </div>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Review title</label>
            <input name="title" style={inputStyle} placeholder="Summarise your experience (optional)" />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Your review *</label>
            <textarea name="body" required rows={4} style={{ ...inputStyle, resize: "vertical" }} placeholder="What did you think about the product?" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Name *</label>
              <input name="reviewerName" required defaultValue={name} style={inputStyle} placeholder="Your name" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Email *</label>
              <input name="reviewerEmail" required type="email" defaultValue={email} style={inputStyle} placeholder="your@email.com" />
            </div>
          </div>

          {/* Photo upload */}
          {allowImages && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Add photos (optional, up to 3)</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: images.length < 3 ? 8 : 0 }}>
                {images.map((src, i) => (
                  <div key={i} style={{ position: "relative", width: 80, height: 80 }}>
                    <img src={src} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                    <button type="button" onClick={() => removeImage(i)}
                      style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#ef4444", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                      ×
                    </button>
                  </div>
                ))}
                {images.length < 3 && (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    style={{ width: 80, height: 80, borderRadius: 8, border: "2px dashed #d1d5db", background: "#f9fafb", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "#9ca3af", fontSize: 12, fontWeight: 600 }}>
                    <span style={{ fontSize: 24 }}>+</span>
                    Photo
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImageChange} />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>Max 5 MB per photo · JPEG or PNG</span>
            </div>
          )}

          {/* Newsletter opt-in */}
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20, cursor: "pointer" }}>
            <input type="checkbox" name="newsletterOptIn" value="true" checked={newsletterOptIn} onChange={(e) => setNewsletterOptIn(e.target.checked)}
              style={{ marginTop: 2, accentColor: primaryColor, width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.4 }}>
              Yes, sign me up for news, offers and updates from {shopDisplay}. You can unsubscribe any time.
            </span>
          </label>

          <button type="submit" disabled={submitting || rating === 0}
            style={{ width: "100%", padding: "13px 0", borderRadius: 8, border: "none", background: rating === 0 ? "#e5e7eb" : primaryColor, color: rating === 0 ? "#9ca3af" : "#fff", fontWeight: 700, fontSize: 15, cursor: rating === 0 ? "not-allowed" : "pointer", transition: "background 0.2s" }}>
            {submitting ? "Submitting…" : "Submit review"}
          </button>
        </Form>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center",
  justifyContent: "center", padding: "24px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 480,
  boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
};
const fieldStyle: React.CSSProperties = { marginBottom: 16 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db",
  fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

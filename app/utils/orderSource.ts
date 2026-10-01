// Where an order came from, decided the same way on every report.
//
// Every order lands in exactly one bucket:
//   - a channel ("meta", "google", …) when it carries a campaign tag or click ID
//   - "referral" when we saw the visit and it had a referrer but no campaign
//   - "direct"   when we saw the visit and it had no campaign or referrer
//   - "untracked" when we never saw the buyer's visit at all
// Missing data must never read as direct traffic.

export type OrderLike = {
  utmSource?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  salesChannel?: string | null;
};

// Shopify sales channels that never involve a storefront visit.
const OFFLINE_CHANNELS: Record<string, string> = {
  shopify_draft_order: "Draft order / invoice",
  pos: "In person (POS)",
};

/** True for orders created without a website visit (draft orders, POS). */
export function isOfflineOrder(p: OrderLike): boolean {
  return !!p.salesChannel && p.salesChannel in OFFLINE_CHANNELS;
}

export function offlineChannelLabel(p: OrderLike): string | null {
  return p.salesChannel ? OFFLINE_CHANNELS[p.salesChannel] ?? null : null;
}

export const BUCKET_LABELS: Record<string, string> = {
  offline: "Not an online order",
  direct: "Direct (no referrer)",
  referral: "Referral",
  untracked: "Not tracked (visit unseen)",
  meta: "Meta",
  google: "Google",
  instagram: "Instagram",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  email: "Email",
  sms: "SMS",
  bing: "Bing",
  yahoo: "Yahoo",
};

/** Carries a campaign tag or ad click ID. */
export function hasCampaign(p: OrderLike): boolean {
  return !!(p.utmSource || p.fbclid || p.gclid || p.ttclid || p.msclkid);
}

/** Attribix saw the buyer's visit (or the order carries campaign data). */
export function visitSeen(p: OrderLike): boolean {
  return !!(p.visitorId || p.sessionId || p.landingPage || p.referrer) || hasCampaign(p);
}

/** The channel from campaign tags / click IDs, or null if there are none. */
export function channelFromCampaign(p: OrderLike): string | null {
  const s = String(p.utmSource || "").toLowerCase().trim();
  if (s) {
    if (s === "ig" || s.includes("instagram")) return "instagram";
    if (s.includes("meta") || s.includes("facebook") || s === "fb") return "meta";
    if (s.includes("google") || s.includes("adwords")) return "google";
    if (s.includes("tiktok")) return "tiktok";
    if (s.includes("snapchat")) return "snapchat";
    if (s.includes("email") || s.includes("klaviyo") || s.includes("mailchimp") || s.includes("newsletter")) return "email";
    if (s.includes("sms")) return "sms";
    if (s.includes("bing") || s.includes("microsoft")) return "bing";
    if (s.includes("yahoo")) return "yahoo";
    return s;
  }
  if (p.fbclid) return "meta";
  if (p.gclid) return "google";
  if (p.ttclid) return "tiktok";
  if (p.msclkid) return "bing";
  return null;
}

/** The single bucket an order is reported under. */
export function orderSource(p: OrderLike): string {
  // An offline order with campaign data (e.g. an invoice link tagged with
  // UTMs) still counts for that channel; otherwise it had no visit to see.
  if (isOfflineOrder(p) && !hasCampaign(p)) return "offline";
  if (!visitSeen(p)) return "untracked";
  return channelFromCampaign(p) ?? (p.referrer ? "referral" : "direct");
}

export function bucketLabel(bucket: string): string {
  return BUCKET_LABELS[bucket] ?? bucket.charAt(0).toUpperCase() + bucket.slice(1);
}

/** Channels first, then direct/referral, then untracked, so a gap can't top the list. */
export function bucketRank(bucket: string): number {
  return bucket === "untracked" ? 2 : bucket === "direct" || bucket === "referral" || bucket === "offline" ? 1 : 0;
}

// app/services/trackingNormalizer.server.ts

export type NormalizedTrackedEvent = {
  eventName: string;
  eventTime: number;
  eventId: string | null;

  shop: string | null;

  visitorId: string | null;
  sessionId: string | null;

  url: string | null;
  referrer: string | null;

  ip: string | null;
  userAgent: string | null;

  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;

  fbclid: string | null;
  gclid: string | null;
  ttclid: string | null;
  msclkid: string | null;

  fbp: string | null;
  fbc: string | null;

  value: number | null;
  currency: string | null;

  email: string | null;
  phone: string | null;

  orderId: string | null;
  checkoutId: string | null;
};

function pickFirstString(x: unknown): string | null {
  if (typeof x === "string") {
    const v = x.trim();
    return v.length ? v : null;
  }
  return null;
}

function pickFirstNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;

  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function getUtmFromUrl(url: string | null) {
  try {
    if (!url) return { utmSource: null, utmMedium: null, utmCampaign: null };

    const u = new URL(url);

    return {
      utmSource: u.searchParams.get("utm_source"),
      utmMedium: u.searchParams.get("utm_medium"),
      utmCampaign: u.searchParams.get("utm_campaign"),
    };
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  }
}

function getCheckoutIdFromUrl(url: string | null): string | null {
  try {
    if (!url) return null;
    const u = new URL(url);
    const match = u.pathname.match(/\/checkouts\/(?:cn\/)?([^/]+)/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function normalizeTrackedEvent(input: {
  data: any;
  event: any;
  type: string | null;
  url: string | null;
  referrer: string | null;
  shop: string | null;
  ip: string | null;
  userAgent: string | null;
}): NormalizedTrackedEvent {
  const { data, event, type, url, referrer, shop, ip, userAgent } = input;

  const snapshot = data?.eventSnapshot ?? {};

  const eventName =
    pickFirstString(type) ??
    pickFirstString(snapshot?.name) ??
    pickFirstString(event?.name) ??
    pickFirstString(event?.type) ??
    "unknown";

  const eventId =
    pickFirstString(data?.eventId) ??
    pickFirstString(snapshot?.id) ??
    pickFirstString(event?.eventId) ??
    null;

  const visitorId =
    pickFirstString(data?.visitorId) ??
    null;

  const sessionId =
    pickFirstString(data?.sessionId) ??
    null;

  const clickIds = data?.clickIds ?? {};

  const fbclid =
    pickFirstString(clickIds?.fbclid) ??
    pickFirstString(data?.fbclid) ??
    null;

  const gclid =
    pickFirstString(clickIds?.gclid) ??
    pickFirstString(data?.gclid) ??
    null;

  const ttclid =
    pickFirstString(clickIds?.ttclid) ??
    pickFirstString(data?.ttclid) ??
    null;

  const msclkid =
    pickFirstString(clickIds?.msclkid) ??
    pickFirstString(data?.msclkid) ??
    null;

  const fbp = pickFirstString(data?.fbp);
  const fbc = pickFirstString(data?.fbc);

  const normalizedUrl =
    pickFirstString(data?.url) ??
    pickFirstString(snapshot?.url) ??
    pickFirstString(event?.context?.document?.location?.href) ??
    pickFirstString(event?.data?.context?.document?.location?.href) ??
    null;

  const normalizedReferrer =
    pickFirstString(data?.referrer) ??
    pickFirstString(snapshot?.referrer) ??
    pickFirstString(event?.context?.document?.referrer) ??
    pickFirstString(event?.data?.context?.document?.referrer) ??
    referrer ??
    null;

  const { utmSource, utmMedium, utmCampaign } = getUtmFromUrl(normalizedUrl || url);

  const value =
    pickFirstNumber(snapshot?.totalValue) ??
    pickFirstNumber(snapshot?.value) ??
    pickFirstNumber(data?.totalValue) ??
    pickFirstNumber(data?.value) ??
    pickFirstNumber(event?.value) ??
    pickFirstNumber(event?.data?.totalPrice?.amount) ??
    pickFirstNumber(event?.data?.checkout?.totalPrice?.amount) ??
    pickFirstNumber(event?.data?.totalPrice) ??
    pickFirstNumber(event?.data?.checkout?.totalPrice) ??
    null;

  const currency =
    pickFirstString(snapshot?.currency) ??
    pickFirstString(data?.currency) ??
    pickFirstString(event?.currency) ??
    pickFirstString(event?.data?.currency) ??
    pickFirstString(event?.data?.checkout?.currencyCode) ??
    pickFirstString(event?.data?.checkout?.totalPrice?.currencyCode) ??
    null;

  const email =
    pickFirstString(snapshot?.email) ??
    pickFirstString(data?.email) ??
    pickFirstString(event?.email) ??
    pickFirstString(event?.data?.email) ??
    pickFirstString(event?.data?.checkout?.email) ??
    null;

  const phone =
    pickFirstString(snapshot?.phone) ??
    pickFirstString(data?.phone) ??
    pickFirstString(event?.phone) ??
    pickFirstString(event?.data?.phone) ??
    pickFirstString(event?.data?.checkout?.phone) ??
    null;

  const orderId =
    pickFirstString(snapshot?.orderId) ??
    pickFirstString(data?.orderId) ??
    pickFirstString(event?.orderId) ??
    pickFirstString(event?.data?.orderId) ??
    pickFirstString(event?.data?.order?.id) ??
    pickFirstString(event?.data?.checkout?.order?.id) ??
    null;

  const checkoutId =
    pickFirstString(snapshot?.checkoutId) ??
    pickFirstString(event?.data?.checkout?.id) ??
    pickFirstString(event?.checkout?.id) ??
    getCheckoutIdFromUrl(normalizedUrl || url) ??
    null;

  return {
    eventName,
    eventTime: Math.floor(Date.now() / 1000),
    eventId,

    shop,

    visitorId,
    sessionId,

    url: normalizedUrl || url || null,
    referrer: normalizedReferrer,

    ip,
    userAgent,

    utmSource,
    utmMedium,
    utmCampaign,

    fbclid,
    gclid,
    ttclid,
    msclkid,

    fbp,
    fbc,

    value,
    currency,

    email,
    phone,

    orderId,
    checkoutId,
  };
}
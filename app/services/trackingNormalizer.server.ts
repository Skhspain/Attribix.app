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
    pickFirstString(snapshot?.type) ??
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

  const { utmSource, utmMedium, utmCampaign } = getUtmFromUrl(url);

  const value =
    pickFirstNumber(data?.value) ??
    pickFirstNumber(data?.totalValue) ??
    pickFirstNumber(snapshot?.value) ??
    pickFirstNumber(snapshot?.totalValue) ??
    pickFirstNumber(event?.value) ??
    pickFirstNumber(event?.data?.totalPrice) ??
    pickFirstNumber(event?.data?.checkout?.totalPrice?.amount) ??
    pickFirstNumber(event?.data?.checkout?.totalPrice) ??
    null;

  const currency =
    pickFirstString(data?.currency) ??
    pickFirstString(snapshot?.currency) ??
    pickFirstString(event?.currency) ??
    pickFirstString(event?.data?.currency) ??
    pickFirstString(event?.data?.checkout?.currencyCode) ??
    pickFirstString(event?.data?.checkout?.currency) ??
    null;

  const email =
    pickFirstString(data?.email) ??
    pickFirstString(snapshot?.email) ??
    pickFirstString(event?.email) ??
    pickFirstString(event?.data?.email) ??
    pickFirstString(event?.data?.checkout?.email) ??
    null;

  const phone =
    pickFirstString(data?.phone) ??
    pickFirstString(snapshot?.phone) ??
    pickFirstString(event?.phone) ??
    pickFirstString(event?.data?.phone) ??
    pickFirstString(event?.data?.checkout?.phone) ??
    null;

  const orderId =
    pickFirstString(data?.orderId) ??
    pickFirstString(snapshot?.orderId) ??
    pickFirstString(event?.orderId) ??
    pickFirstString(event?.data?.orderId) ??
    pickFirstString(event?.data?.order?.id) ??
    pickFirstString(event?.data?.checkout?.order?.id) ??
    null;

  return {
    eventName,
    eventTime: Math.floor(Date.now() / 1000),
    eventId,

    shop,

    visitorId,
    sessionId,

    url,
    referrer,

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
  };
}

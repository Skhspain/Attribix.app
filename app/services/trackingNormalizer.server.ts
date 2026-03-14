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

function pickFirstString(...values: unknown[]): string | null {
  for (const x of values) {
    if (typeof x === "string") {
      const v = x.trim();
      if (v.length) return v;
    }
  }
  return null;
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const x of values) {
    if (typeof x === "number" && Number.isFinite(x)) return x;

    if (typeof x === "string") {
      const trimmed = x.trim();
      if (!trimmed) continue;
      const n = Number(trimmed);
      if (Number.isFinite(n)) return n;
    }
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

function extractCheckoutTokenFromUrl(url: string | null): string | null {
  try {
    if (!url) return null;

    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);

    const cnIndex = parts.indexOf("cn");
    if (cnIndex >= 0 && parts[cnIndex + 1]) {
      return `chk_${parts[cnIndex + 1]}`;
    }

    const checkoutsIndex = parts.indexOf("checkouts");
    if (checkoutsIndex >= 0 && parts[checkoutsIndex + 1]) {
      return `chk_${parts[checkoutsIndex + 1]}`;
    }

    return null;
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

  const snapshot = data?.eventSnapshot ?? null;
  const clickIds = data?.clickIds ?? {};

  const resolvedUrl =
    pickFirstString(
      url,
      snapshot?.url,
      data?.url,
      event?.context?.document?.location?.href,
      event?.document?.location?.href,
      event?.data?.context?.document?.location?.href,
      event?.data?.document?.location?.href,
      event?.data?.url,
      event?.url,
    ) ?? null;

  const resolvedReferrer =
    pickFirstString(
      referrer,
      snapshot?.referrer,
      data?.referrer,
      event?.context?.document?.referrer,
      event?.document?.referrer,
      event?.data?.context?.document?.referrer,
      event?.data?.document?.referrer,
      event?.data?.referrer,
      event?.referrer,
    ) ?? null;

  const eventName =
    pickFirstString(
      type,
      snapshot?.name,
      snapshot?.type,
      event?.name,
      event?.type,
    ) ?? "unknown";

  const eventId =
    pickFirstString(
      data?.eventId,
      snapshot?.id,
      event?.eventId,
      event?.id,
    ) ?? null;

  const checkoutDerivedSessionId = extractCheckoutTokenFromUrl(resolvedUrl);

  const sessionId =
    pickFirstString(
      data?.sessionId,
      checkoutDerivedSessionId,
      event?.data?.checkout?.id ? `chk_${event?.data?.checkout?.id}` : null,
      snapshot?.checkoutId ? `chk_${snapshot?.checkoutId}` : null,
    ) ?? null;

  const visitorId =
    pickFirstString(
      data?.visitorId,
      event?.visitorId,
    ) ?? null;

  const fbclid =
    pickFirstString(
      clickIds?.fbclid,
      data?.fbclid,
      event?.fbclid,
      snapshot?.fbclid,
    ) ?? null;

  const gclid =
    pickFirstString(
      clickIds?.gclid,
      data?.gclid,
      event?.gclid,
      snapshot?.gclid,
    ) ?? null;

  const ttclid =
    pickFirstString(
      clickIds?.ttclid,
      data?.ttclid,
      event?.ttclid,
      snapshot?.ttclid,
    ) ?? null;

  const msclkid =
    pickFirstString(
      clickIds?.msclkid,
      data?.msclkid,
      event?.msclkid,
      snapshot?.msclkid,
    ) ?? null;

  const fbp =
    pickFirstString(
      data?.fbp,
      snapshot?.fbp,
      event?.fbp,
    ) ?? null;

  const fbc =
    pickFirstString(
      data?.fbc,
      snapshot?.fbc,
      event?.fbc,
    ) ?? null;

  const { utmSource, utmMedium, utmCampaign } = getUtmFromUrl(resolvedUrl);

  const value =
    pickFirstNumber(
      data?.value,
      data?.totalValue,
      snapshot?.value,
      snapshot?.totalValue,
      event?.value,
      event?.data?.value,
      event?.data?.totalPrice,
      event?.data?.checkout?.totalPrice?.amount,
      event?.data?.checkout?.totalPrice,
      event?.data?.checkout?.totalPriceSet?.shopMoney?.amount,
      event?.data?.order?.currentTotalPriceSet?.shopMoney?.amount,
      event?.data?.order?.totalPriceSet?.shopMoney?.amount,
    ) ?? null;

  const currency =
    pickFirstString(
      data?.currency,
      snapshot?.currency,
      event?.currency,
      event?.data?.currency,
      event?.data?.checkout?.currencyCode,
      event?.data?.checkout?.currency,
      event?.data?.order?.currentTotalPriceSet?.shopMoney?.currencyCode,
      event?.data?.order?.totalPriceSet?.shopMoney?.currencyCode,
    ) ?? null;

  const email =
    pickFirstString(
      data?.email,
      snapshot?.email,
      event?.email,
      event?.data?.email,
      event?.data?.checkout?.email,
      event?.data?.order?.email,
    ) ?? null;

  const phone =
    pickFirstString(
      data?.phone,
      snapshot?.phone,
      event?.phone,
      event?.data?.phone,
      event?.data?.checkout?.phone,
      event?.data?.order?.phone,
    ) ?? null;

  const orderId =
    pickFirstString(
      data?.orderId,
      snapshot?.orderId,
      event?.orderId,
      event?.data?.orderId,
      event?.data?.order?.id,
      event?.data?.checkout?.order?.id,
      event?.data?.checkout?.orderId,
    ) ?? null;

  return {
    eventName,
    eventTime: Math.floor(Date.now() / 1000),
    eventId,

    shop,

    visitorId,
    sessionId,

    url: resolvedUrl,
    referrer: resolvedReferrer,

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
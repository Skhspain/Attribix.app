// app/routes/api.backfill.orders.ts
// Pulls historical Shopify orders into the local purchase table.
// Fetches customerJourneySummary to map Shopify's native referrer attribution
// into utmSource/utmMedium so the Orders chart can break down by channel.
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

const ORDERS_QUERY = `#graphql
  query BackfillOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        legacyResourceId
        name
        totalPriceSet { shopMoney { amount currencyCode } }
        createdAt
        billingAddress { countryCodeV2 city firstName lastName }
        shippingAddress { countryCodeV2 city firstName lastName }
        customerJourneySummary {
          lastVisit {
            utmParameters { source medium campaign }
            referrerUrl
            landingPage
          }
          firstVisit {
            utmParameters { source medium campaign }
            referrerUrl
            landingPage
          }
        }
      }
    }
  }
`;

/**
 * Map Shopify's customerJourney visit data into UTM-style fields.
 * Priority: explicit UTM params > Shopify's inferred source name > referrer URL.
 */
function extractAttribution(journey: any): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPage: string | null;
  referrer: string | null;
} {
  const visit = journey?.lastVisit ?? journey?.firstVisit;
  if (!visit) return { utmSource: null, utmMedium: null, utmCampaign: null, landingPage: null, referrer: null };

  const landingPage = visit.landingPage || null;
  const referrer = visit.referrerUrl || null;

  // 1) Explicit UTM parameters (paid / tagged campaigns)
  if (visit.utmParameters?.source) {
    return {
      utmSource: visit.utmParameters.source || null,
      utmMedium: visit.utmParameters.medium || null,
      utmCampaign: visit.utmParameters.campaign || null,
      landingPage,
      referrer,
    };
  }

  // 2) Fall back to inferring source from referrer URL
  const ref = (referrer || "").toLowerCase();

  let utmSource: string | null = null;
  let utmMedium: string | null = null;

  if (ref.includes("google.com"))    { utmSource = "google";    utmMedium = "organic"; }
  else if (ref.includes("bing.com")) { utmSource = "bing";      utmMedium = "organic"; }
  else if (ref.includes("yahoo.com")){ utmSource = "yahoo";     utmMedium = "organic"; }
  else if (ref.includes("facebook.com") || ref.includes("fb.com") || ref.includes("instagram.com")) {
    utmSource = "facebook"; utmMedium = "social";
  }
  else if (ref.includes("snapchat.com")) { utmSource = "snapchat"; utmMedium = "social"; }
  else if (ref.includes("tiktok.com"))   { utmSource = "tiktok";   utmMedium = "social"; }
  else if (ref.includes("pinterest.com")){ utmSource = "pinterest"; utmMedium = "social"; }
  else if (ref.includes("twitter.com") || ref.includes("x.com")) { utmSource = "twitter"; utmMedium = "social"; }

  return { utmSource, utmMedium, utmCampaign: null, landingPage, referrer };
}

export async function action({ request }: ActionFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { admin, session } = result;
  const shop = session.shop;

  const form = await request.formData().catch(() => new FormData());
  const maxPages = Math.min(parseInt((form.get("maxPages") as string) || "4", 10), 40);

  let cursor: string | null = null;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let page = 0;

  while (page < maxPages) {
    page++;

    let orders: any;
    try {
      const res = await admin.graphql(ORDERS_QUERY, {
        variables: { first: 250, after: cursor ?? undefined },
      });
      const data = await res.json();
      orders = data?.data?.orders;
    } catch (gqlErr: any) {
      // Log the actual GraphQL errors so we can see what field is invalid
      const gqlErrors = gqlErr?.graphQLErrors ?? gqlErr?.response?.errors ?? [];
      console.error("[backfill/orders] GraphQL error:", JSON.stringify(gqlErrors, null, 2));
      return json({ ok: false, error: String(gqlErr?.message || gqlErr), graphQLErrors: gqlErrors }, { status: 500 });
    }
    if (!orders?.nodes?.length) break;

    for (const order of orders.nodes) {
      // The pixel sends the numeric ID; the GID is "gid://shopify/Order/<numeric>".
      // We store the numeric ID so it matches pixel-tracked rows — and check BOTH
      // formats before inserting to avoid duplicates on re-import.
      const gid       = order.id as string;                         // gid://shopify/Order/123
      const numericId = order.legacyResourceId as string;           // "123"
      const orderId   = numericId || gid;                           // prefer numeric

      const totalValue = parseFloat(order.totalPriceSet?.shopMoney?.amount ?? "0");
      const currency   = (order.totalPriceSet?.shopMoney?.currencyCode ?? "USD") as string;
      const country    = order.billingAddress?.countryCodeV2 || order.shippingAddress?.countryCodeV2 || null;
      const city       = order.billingAddress?.city || order.shippingAddress?.city || null;
      const firstName  = order.billingAddress?.firstName || order.shippingAddress?.firstName || null;
      const lastName   = order.billingAddress?.lastName  || order.shippingAddress?.lastName  || null;
      const customerName = firstName || lastName ? `${firstName || ""} ${lastName || ""}`.trim() : null;
      const createdAt  = order.createdAt ? new Date(order.createdAt) : new Date();
      const { utmSource, utmMedium, utmCampaign, landingPage, referrer } =
        extractAttribution(order.customerJourneySummary);

      try {
        // Check both numeric and GID formats — whichever the pixel happened to store
        const existing = await (db.purchase as any).findFirst({
          where: { OR: [{ orderId: numericId }, { orderId: gid }] },
        });

        if (existing) {
          // Patch: only fill in fields that are currently empty
          const needsPatch =
            (!existing.utmSource && utmSource) ||
            (!existing.country && country) ||
            (!existing.city && city) ||
            (!(existing as any).customerName && customerName);

          if (needsPatch) {
            await db.purchase.update({
              where: { id: existing.id },
              data: {
                ...((!existing.utmSource && utmSource) && { utmSource, utmMedium, utmCampaign }),
                ...((!existing.country && country) && { country }),
                ...((!existing.city && city) && { city }),
                ...((!existing.landingPage && landingPage) && { landingPage }),
                ...((!existing.referrer && referrer) && { referrer }),
                ...((!(existing as any).customerName && customerName) && { customerName }),
              },
            });
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        await db.purchase.create({
          data: {
            shop,
            orderId,
            totalValue,
            currency,
            country,
            city,
            createdAt,
            utmSource,
            utmMedium,
            utmCampaign,
            landingPage,
            referrer,
            customerName,
          },
        });
        created++;
      } catch (e: any) {
        if (e?.code === "P2002") { skipped++; continue; }
        console.error("[backfill/orders] row error", e?.message);
      }
    }

    if (!orders.pageInfo.hasNextPage) break;
    cursor = orders.pageInfo.endCursor;
  }

  return json({ ok: true, created, updated, skipped, pages: page });
}

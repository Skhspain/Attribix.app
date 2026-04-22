# Attribix — Reviewer Test Instructions

Draft text to paste into the Shopify App Store listing "Test instructions"
field when it becomes editable (after the current review completes or if the
reviewer asks for updated instructions).

---

## Installation

Install Attribix on any Shopify development store. No credentials are
required on our side — Attribix uses standard Shopify OAuth to authenticate
via the dev store admin.

## Testing core features

1. **Overview Dashboard (`/app`)** — Auto-loads shop attribution data and
   recent purchases. Empty state is expected on fresh installs.

2. **Meta Ads integration (`/app/integrations/meta`)** — Click **Connect
   Meta** and authenticate with any Meta Business account you have access
   to. A reviewer-owned ad account can be used. The app syncs campaign
   spend and ROAS from the connected account.

3. **Google Ads integration (`/app/integrations/google`)** — Same pattern:
   OAuth connect with any Google Ads account. Reviewer-owned accounts
   are fine.

4. **Orders / Attribution** — Place a test order on the dev store (or
   create via Shopify admin). Attribix will ingest it via the
   `ORDERS_CREATE` webhook and display attribution in `/app/orders`.

5. **Newsletter / Reviews / Leads** — Data appears after merchant activity.
   UI is fully functional on install; empty states show when no data.

6. **Pricing** — Managed Pricing is enabled. Select a plan from Shopify's
   pricing UI (App Store listing). 7-day free trial on all plans.

## Known behaviors

- Analytics graphs show empty state until first sync completes (~24h
  on a live store, immediately with manual sync button).
- Meta Pixel only fires after visitor consent via Shopify's Customer
  Privacy API (GDPR/CCPA compliance).
- App handles all mandatory GDPR webhooks (`customers_data_request`,
  `customers_redact`, `shop_redact`) and returns a structured summary of
  stored PII on data request for operator review.

## Technical notes

- **OAuth scopes:** `read_customer_events`, `read_orders`,
  `read_products`, `write_app_proxy`, `write_pixels`, `read_script_tags`,
  `write_script_tags`. All scopes are actively used in-app.
- **Stack:** Remix 2.17 + Polaris + Prisma/Postgres, hosted on Fly.io.
- **Extensions:** Web Pixel (`attribix-pixel`) for consent-gated CAPI
  tracking, Theme App Extension (`attribix-tracker`) for TikTok pixel.

## Support contact

**contact@bevit.no** — we respond within 24h during review.

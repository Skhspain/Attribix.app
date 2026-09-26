// app/email/brand.server.ts
// Reads the store's brand (Settings → Brand) and contact address from Shopify,
// so email templates start with the shop's own logo, colours and footer address.

import type { StoreBrand } from "./blocks";

type Admin = { graphql: (query: string, opts?: any) => Promise<Response> };

const cache = new Map<string, { brand: StoreBrand; at: number }>();
const CACHE_MS = 10 * 60 * 1000;

export async function getStoreBrand(shop: string, admin: Admin): Promise<StoreBrand> {
  const hit = cache.get(shop);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.brand;

  const fallback: StoreBrand = {
    storeName: shop.replace(".myshopify.com", ""),
    storeUrl: `https://${shop}`,
    logoUrl: "",
    primaryColor: null,
    primaryTextColor: null,
    address: "",
  };

  try {
    const res = await admin.graphql(`{
      shop {
        name
        primaryDomain { url }
        brand {
          logo { image { url } }
          squareLogo { image { url } }
          colors { primary { background foreground } }
        }
        billingAddress { address1 city zip country }
      }
    }`);
    const body: any = await res.json();
    const s = body?.data?.shop;
    if (!s) return fallback;

    const primary = s.brand?.colors?.primary?.[0];
    const a = s.billingAddress;
    const brand: StoreBrand = {
      storeName: s.name || fallback.storeName,
      storeUrl: s.primaryDomain?.url || fallback.storeUrl,
      logoUrl: s.brand?.logo?.image?.url || s.brand?.squareLogo?.image?.url || "",
      primaryColor: primary?.background || null,
      primaryTextColor: primary?.foreground || null,
      address: a ? [s.name, a.address1, a.zip && a.city ? `${a.zip} ${a.city}` : a.city, a.country].filter(Boolean).join(", ") : "",
    };
    cache.set(shop, { brand, at: Date.now() });
    return brand;
  } catch (e: any) {
    console.error("[email brand] lookup failed:", e?.message ?? e);
    return fallback;
  }
}

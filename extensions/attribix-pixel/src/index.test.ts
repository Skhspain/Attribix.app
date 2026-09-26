import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Fake Shopify web-pixel runtime: capture the register callback's subscriptions
// and every body the pixel beacons to /api/track.
const handlers: Record<string, (e: any) => void> = {};
const posts: any[] = [];
// The strict sandbox has no document.cookie / localStorage — only the async
// `browser` API, so that's all the fake runtime provides.
const cookies: Record<string, string> = { _fbp: "fb.1.111.222", _fbc: "fb.1.333.COOKIEFBC" };
const store: Record<string, string> = {};

vi.mock("@shopify/web-pixels-extension", () => ({
  register: (fn: any) =>
    fn({
      settings: { accountID: "londondiamonds.myshopify.com" },
      init: {
        data: {
          customer: {
            id: "gid://shopify/Customer/9",
            email: "jane@example.com",
            phone: "+447700900123",
            firstName: "Jane",
            lastName: "Doe",
          },
        },
      },
      analytics: { subscribe: (name: string, cb: any) => (handlers[name] = cb) },
      browser: {
        cookie: { get: async (name: string) => cookies[name] ?? "" },
        localStorage: {
          getItem: async (k: string) => store[k] ?? null,
          setItem: async (k: string, v: string) => void (store[k] = String(v)),
        },
      },
    }),
}));

beforeAll(async () => {
  vi.stubGlobal("navigator", {
    sendBeacon: (_url: string, blob: Blob) => {
      blob.text().then((t) => posts.push(JSON.parse(t)));
      return true;
    },
  });
  vi.stubGlobal("location", { href: "https://londondiamonds.com/products/x?fbclid=ABC" });
  vi.spyOn(console, "log").mockImplementation(() => {});

  await import("./index");
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function fire(name: string, event: any) {
  handlers[name](event);
  await vi.waitFor(() => expect(posts.some((p) => p.type === name)).toBe(true));
  return posts.find((p) => p.type === name);
}

describe("attribix web pixel", () => {
  it("forwards AddToCart with Shopify's event id and logged-in customer details", async () => {
    const body = await fire("product_added_to_cart", {
      id: "sh-d822af00-EAB8-411D-0EAA-05C7647EBE3C",
      clientId: "client-abc",
      name: "product_added_to_cart",
      data: { cartLine: { merchandise: { id: "gid://shopify/ProductVariant/45933892534429" }, quantity: 1 } },
    });

    expect(body.event.id).toBe("sh-d822af00-EAB8-411D-0EAA-05C7647EBE3C");
    expect(body.eventSnapshot).toMatchObject({
      email: "jane@example.com",
      phone: "+447700900123",
      firstName: "Jane",
      lastName: "Doe",
      customerId: "gid://shopify/Customer/9",
    });
    expect(body.visitorId).toBe("v_client-abc");
    expect(body.fbp).toBe("fb.1.111.222");
    expect(body.fbc).toBe("fb.1.333.COOKIEFBC");
  });

  it("takes name and address from the checkout, falling back to the customer's email", async () => {
    const body = await fire("checkout_started", {
      id: "sh-11111111-2222",
      name: "checkout_started",
      data: {
        checkout: {
          id: "c1",
          email: null,
          phone: null,
          billingAddress: {
            firstName: "Mary",
            lastName: "Smith",
            city: "London",
            zip: "SW1A 1AA",
            provinceCode: "ENG",
            countryCode: "GB",
            phone: "+44 20 7946 0000",
          },
        },
      },
    });

    // Same browser → same visitor id, even though this event has no clientId.
    expect(body.visitorId).toBe("v_client-abc");
    expect(body.eventSnapshot).toMatchObject({
      firstName: "Mary",
      lastName: "Smith",
      city: "London",
      zip: "SW1A 1AA",
      state: "ENG",
      country: "GB",
      phone: "+44 20 7946 0000",
      email: "jane@example.com",
    });
  });

  it("builds fbc from an fbclid once and reuses it on later pages", async () => {
    delete cookies._fbc;
    const landing = await fire("product_viewed", {
      id: "sh-pv-1",
      context: { document: { location: { href: "https://londondiamonds.com/products/y?fbclid=XYZ" } } },
      data: { productVariant: { id: "gid://shopify/ProductVariant/1" } },
    });
    expect(landing.fbc).toMatch(/^fb\.1\.\d+\.XYZ$/);

    const later = await fire("search_submitted", {
      id: "sh-s-1",
      context: { document: { location: { href: "https://londondiamonds.com/search?q=ring" } } },
      data: { searchResult: { query: "ring" } },
    });
    expect(later.fbc).toBe(landing.fbc);
  });
});

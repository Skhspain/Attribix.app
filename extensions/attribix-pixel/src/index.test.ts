import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Fake Shopify web-pixel runtime: capture the register callback's subscriptions
// and every body the pixel beacons to /api/track.
const handlers: Record<string, (e: any) => void> = {};
const posts: any[] = [];

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
    }),
}));

beforeAll(async () => {
  const store: Record<string, string> = {};
  vi.stubGlobal("navigator", {
    sendBeacon: (_url: string, blob: Blob) => {
      blob.text().then((t) => posts.push(JSON.parse(t)));
      return true;
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => (store[k] = String(v)),
  });
  vi.stubGlobal("document", { cookie: "_fbp=fb.1.111.222", referrer: "" });
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
    expect(body.visitorId).toMatch(/^v_/);
    expect(body.fbp).toBe("fb.1.111.222");
    expect(body.fbc).toMatch(/^fb\.1\.\d+\.ABC$/);
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
});

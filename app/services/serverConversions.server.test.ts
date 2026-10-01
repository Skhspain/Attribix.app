import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendServerConversions } from "./serverConversions.server";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

let metaBodies: any[];

beforeEach(() => {
  metaBodies = [];
  vi.stubGlobal("fetch", async (url: string, init: any) => {
    if (String(url).includes("graph.facebook.com")) metaBodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ events_received: 1 }) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const creds = { shopPixelId: "123", shopToken: "tok" };

async function sendAndGetEvent(input: Parameters<typeof sendServerConversions>[0]) {
  await sendServerConversions(input);
  expect(metaBodies).toHaveLength(1);
  return metaBodies[0].data[0];
}

describe("sendServerConversions → Meta CAPI", () => {
  it("passes the Shopify event id through unchanged so Meta can dedup", async () => {
    const ev = await sendAndGetEvent({
      eventName: "AddToCart",
      eventId: "sh-d822af00-EAB8-411D-0EAA-05C7647EBE3C",
      ...creds,
    });
    expect(ev.event_name).toBe("AddToCart");
    expect(ev.event_id).toBe("sh-d822af00-EAB8-411D-0EAA-05C7647EBE3C");
  });

  it("sends only the known custom_data params for AddToCart", async () => {
    const ev = await sendAndGetEvent({
      eventName: "AddToCart",
      value: 2350,
      currency: "GBP",
      contentIds: ["45933892534429"],
      numItems: 1,
      ...creds,
    });
    expect(ev.custom_data).toEqual({
      value: 2350,
      currency: "GBP",
      content_ids: ["45933892534429"],
      content_type: "product",
      num_items: 1,
    });
  });

  it("normalizes match keys before hashing", async () => {
    const ev = await sendAndGetEvent({
      eventName: "InitiateCheckout",
      email: "  Jane.Doe@Example.com ",
      phone: "+44 7700 900-123",
      firstName: "Mary-Jane",
      lastName: "O'Brien",
      city: "St. Albans",
      zip: "SW1A 1AA",
      state: "ENG",
      country: "GB",
      externalId: "v_abc",
      fbp: "fb.1.1.1",
      ...creds,
    });
    const u = ev.user_data;
    expect(u.em).toEqual([sha("jane.doe@example.com")]);
    expect(u.ph).toEqual([sha("447700900123")]);
    expect(u.fn).toEqual([sha("maryjane")]);
    expect(u.ln).toEqual([sha("obrien")]);
    expect(u.ct).toEqual([sha("stalbans")]);
    expect(u.zp).toEqual([sha("sw1a1aa")]);
    expect(u.st).toEqual([sha("eng")]);
    expect(u.country).toEqual([sha("gb")]);
    expect(u.external_id).toEqual([sha("v_abc")]);
    expect(u.fbp).toBe("fb.1.1.1");
  });

  it("omits match keys that are blank after normalization", async () => {
    const ev = await sendAndGetEvent({
      eventName: "AddToCart",
      phone: "   ",
      firstName: "--",
      ...creds,
    });
    expect(ev.user_data.ph ?? []).toHaveLength(0);
    expect(ev.user_data.fn ?? []).toHaveLength(0);
  });
});

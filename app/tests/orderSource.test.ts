import { describe, expect, it } from "vitest";
import { bucketRank, orderSource, visitSeen } from "~/utils/orderSource";

describe("order source buckets", () => {
  it("never calls an order we didn't see 'direct'", () => {
    expect(orderSource({})).toBe("untracked");
    expect(visitSeen({})).toBe(false);
  });

  it("splits seen visits without a campaign into direct and referral", () => {
    expect(orderSource({ visitorId: "v1" })).toBe("direct");
    expect(orderSource({ sessionId: "s1", referrer: "https://blog.example" })).toBe("referral");
  });

  it("attributes campaign tags and click IDs to their channel", () => {
    expect(orderSource({ utmSource: "facebook" })).toBe("meta");
    expect(orderSource({ utmSource: "ig" })).toBe("instagram");
    expect(orderSource({ gclid: "abc" })).toBe("google");
    expect(orderSource({ msclkid: "abc" })).toBe("bing");
    expect(orderSource({ ttclid: "abc", visitorId: "v1" })).toBe("tiktok");
  });

  it("sorts untracked after every real source", () => {
    const sorted = ["untracked", "direct", "meta"].sort((a, b) => bucketRank(a) - bucketRank(b));
    expect(sorted).toEqual(["meta", "direct", "untracked"]);
  });
});

describe("offline orders", () => {
  it("keeps draft orders and POS sales out of the tracking gap", () => {
    expect(orderSource({ salesChannel: "shopify_draft_order" })).toBe("offline");
    expect(orderSource({ salesChannel: "pos" })).toBe("offline");
    expect(orderSource({ salesChannel: "web" })).toBe("untracked");
  });

  it("still credits an offline order that carries campaign data", () => {
    expect(orderSource({ salesChannel: "shopify_draft_order", utmSource: "facebook" })).toBe("meta");
  });
});

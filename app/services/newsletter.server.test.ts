import { describe, expect, it, vi } from "vitest";

vi.mock("~/db.server", () => ({ default: {}, db: {} }));

const {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  personalize,
  ensureUnsubscribeFooter,
  senderFor,
  trackLinks,
  verifyClickSignature,
  listUnsubscribeHeaders,
} = await import("./newsletter.server");

describe("unsubscribe tokens", () => {
  it("round-trip and reject tampering", () => {
    const token = generateUnsubscribeToken("shop.myshopify.com", "Jane@Example.com");
    expect(verifyUnsubscribeToken(token)).toEqual({ shop: "shop.myshopify.com", email: "jane@example.com" });

    const forged = Buffer.from("shop.myshopify.com:victim@example.com:deadbeef").toString("base64url");
    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });
});

describe("email preparation", () => {
  it("fills new and old merge tags", () => {
    const html = personalize("Hi {{first_name}} / {name} — {{shop}} <a href=\"{{unsubscribe_url}}\">x</a>", {
      shop: "londondiamonds.myshopify.com",
      email: "a@b.com",
      firstName: "Sam",
      unsubscribeUrl: "https://u",
    });
    expect(html).toBe('Hi Sam / Sam — londondiamonds <a href="https://u">x</a>');
  });

  it("adds a footer only when the design has no unsubscribe link", () => {
    expect(ensureUnsubscribeFooter("<body>x {{unsubscribe_url}}</body>")).toBe("<body>x {{unsubscribe_url}}</body>");
    expect(ensureUnsubscribeFooter("<body>x</body>")).toContain("{{unsubscribe_url}}");
  });

  it("uses the merchant address as From only when their domain is verified", () => {
    const unverified = senderFor({ fromName: "LD", merchantEmail: "hi@ld.com", verifiedDomain: null, shop: "ld.myshopify.com" });
    expect(unverified.from).not.toContain("hi@ld.com");
    expect(unverified.replyTo).toBe("hi@ld.com");

    const verified = senderFor({ fromName: "LD", merchantEmail: "hi@LD.com", verifiedDomain: "ld.com", shop: "ld.myshopify.com" });
    expect(verified.from).toBe("LD <hi@LD.com>");
  });

  it("never sends From an address on a different domain than the verified one", () => {
    const other = senderFor({ fromName: "LD", merchantEmail: "hi@gmail.com", verifiedDomain: "ld.com", shop: "ld.myshopify.com" });
    expect(other.from).not.toContain("gmail.com");
    expect(other.replyTo).toBe("hi@gmail.com");

    // A subdomain or look-alike isn't the verified domain either.
    expect(senderFor({ merchantEmail: "hi@mail.ld.com", verifiedDomain: "ld.com", shop: "ld.myshopify.com" }).from).not.toContain("mail.ld.com");
    expect(senderFor({ merchantEmail: "hi@notld.com", verifiedDomain: "ld.com", shop: "ld.myshopify.com" }).from).not.toContain("notld.com");
  });

  it("sets one-click unsubscribe headers", () => {
    expect(listUnsubscribeHeaders("https://u")).toEqual({
      "List-Unsubscribe": "<https://u>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});

describe("click tracking", () => {
  it("signs links, adds campaign UTMs and leaves unsubscribe links alone", () => {
    const html = trackLinks('<a href="https://ld.com/rings?x=1&amp;y=2">a</a><a href="https://api.attribix.app/newsletter/unsubscribe?token=t">u</a>', "cmp1");
    const tracked = /href="([^"]+)"/.exec(html)![1].replace(/&amp;/g, "&");
    const u = new URL(tracked);
    const dest = u.searchParams.get("url")!;

    expect(dest).toContain("utm_medium=email");
    expect(dest).toContain("utm_campaign=cmp1");
    expect(dest).toContain("x=1&y=2");
    expect(verifyClickSignature("cmp1", dest, u.searchParams.get("sig")!)).toBe(true);
    expect(verifyClickSignature("cmp1", "https://evil.example", u.searchParams.get("sig")!)).toBe(false);
    expect(html).toContain('href="https://api.attribix.app/newsletter/unsubscribe?token=t"');
  });
});

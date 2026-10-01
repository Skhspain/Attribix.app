import { describe, expect, it } from "vitest";
import { createBlock, formatInline, isEmailDoc, renderEmail, withFooter, EMAIL_DOC_FORMAT, DEFAULT_THEME, type EmailDoc } from "./blocks";
import { STARTER_TEMPLATES } from "./templates";

const brand = {
  storeName: "London Diamonds",
  storeUrl: "https://londondiamonds.com",
  logoUrl: "https://cdn.shopify.com/logo.png",
  primaryColor: "#0b3d2e",
  primaryTextColor: null,
  address: "London Diamonds, 1 Hatton Garden, EC1N 8AA London, United Kingdom",
};

function doc(blocks: EmailDoc["blocks"]): EmailDoc {
  return { format: EMAIL_DOC_FORMAT, theme: { ...DEFAULT_THEME }, blocks };
}

describe("renderEmail", () => {
  it("always ends with exactly one footer carrying the unsubscribe placeholder", () => {
    const html = renderEmail(doc([createBlock("heading"), createBlock("footer"), createBlock("text")]));
    expect(html.match(/\{\{unsubscribe_url\}\}/g)).toHaveLength(1);
    expect(withFooter([createBlock("text")]).at(-1)?.type).toBe("footer");
  });

  it("fills the unsubscribe link when given one", () => {
    const html = renderEmail(doc([]), { unsubscribeUrl: "https://api.attribix.app/newsletter/unsubscribe?token=abc" });
    expect(html).toContain('href="https://api.attribix.app/newsletter/unsubscribe?token=abc"');
    expect(html).not.toContain("{{unsubscribe_url}}");
  });

  it("escapes merchant text so it can't inject HTML", () => {
    const h = { ...createBlock("heading"), text: '<script>alert(1)</script>' } as any;
    const html = renderEmail(doc([h]));
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops unsafe link schemes", () => {
    const b = { ...createBlock("button"), href: "javascript:alert(1)" } as any;
    expect(renderEmail(doc([b]))).not.toContain("javascript:");
  });

  it("puts the preview text in a hidden preheader", () => {
    expect(renderEmail(doc([]), { previewText: "New rings inside" })).toMatch(/display:none[^>]*>New rings inside/);
  });

  it("tags block rows only in annotate mode", () => {
    const d = doc([createBlock("text")]);
    expect(renderEmail(d)).not.toContain("data-ax-block");
    expect(renderEmail(d, { annotate: true })).toContain(`data-ax-block="${d.blocks[0].id}"`);
  });
});

describe("formatInline", () => {
  it("supports bold, italic and links", () => {
    const out = formatInline("**Big** *news* [shop](https://x.com/a?b=1&c=2)", "#000");
    expect(out).toContain("<strong>Big</strong>");
    expect(out).toContain("<em>news</em>");
    expect(out).toContain('href="https://x.com/a?b=1&amp;c=2"');
  });
});

describe("starter templates", () => {
  it("build valid documents in the store's colours with its address in the footer", () => {
    for (const t of STARTER_TEMPLATES) {
      const d = t.build(brand);
      expect(isEmailDoc(d)).toBe(true);
      expect(d.theme.brandColor).toBe("#0b3d2e");
      const footer = d.blocks.at(-1);
      expect(footer?.type).toBe("footer");
      expect((footer as any).address).toContain("Hatton Garden");
      expect(renderEmail(d)).toContain("cdn.shopify.com/logo.png");
    }
  });

  it("work without a brand", () => {
    for (const t of STARTER_TEMPLATES) expect(isEmailDoc(t.build(null))).toBe(true);
  });
});

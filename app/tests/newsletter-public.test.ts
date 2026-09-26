import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/db.server", () => ({ default: {}, db: {} }));

const { verifySvixSignature } = await import("~/routes/webhooks.resend");
const { confirmUrlFor, verifyConfirmToken } = await import("~/services/newsletter.server");
const widget = await import("~/routes/scripts.newsletter-widget[.js]");

function svixHeaders(secret: string, body: string, ts = Math.floor(Date.now() / 1000)) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = crypto.createHmac("sha256", key).update(`msg_1.${ts}.${body}`).digest("base64");
  return new Headers({ "svix-id": "msg_1", "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` });
}

describe("Resend webhook signature", () => {
  const secret = `whsec_${Buffer.from("super-secret-key").toString("base64")}`;
  const body = JSON.stringify({ type: "email.bounced", data: { email_id: "abc" } });

  it("accepts a correctly signed event", () => {
    expect(verifySvixSignature(secret, svixHeaders(secret, body), body)).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets and old timestamps", () => {
    expect(verifySvixSignature(secret, svixHeaders(secret, body), body.replace("abc", "xyz"))).toBe(false);
    expect(verifySvixSignature(`whsec_${Buffer.from("other").toString("base64")}`, svixHeaders(secret, body), body)).toBe(false);
    expect(verifySvixSignature(secret, svixHeaders(secret, body, Math.floor(Date.now() / 1000) - 3600), body)).toBe(false);
  });
});

describe("double opt-in tokens", () => {
  it("round-trip and can't be forged", () => {
    const token = new URL(confirmUrlFor("ld.myshopify.com", "a@b.com")).searchParams.get("token")!;
    expect(verifyConfirmToken(token)).toEqual({ shop: "ld.myshopify.com", email: "a@b.com" });
    const forged = Buffer.from(`confirm:ld.myshopify.com:x@y.com:${Date.now()}:00`).toString("base64url");
    expect(verifyConfirmToken(forged)).toBeNull();
  });
});

describe("storefront signup widget", () => {
  it("serves valid JavaScript", async () => {
    const res: Response = await (widget as any).loader({ request: new Request("https://api.attribix.app/scripts/newsletter-widget.js"), params: {}, context: {} });
    const js = await res.text();
    expect(() => new Function(js)).not.toThrow();
    expect(js).toContain("Check your inbox to confirm");
  });
});

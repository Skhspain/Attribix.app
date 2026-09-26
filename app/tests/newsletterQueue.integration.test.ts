// Runs the real queue against a throwaway SQLite database (QUEUE_TEST_DB),
// with only the email provider faked. Skipped when no test database is set.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const DB = process.env.QUEUE_TEST_DB;
const sent: any[] = [];
let failNext = 0;

vi.mock("~/services/resend.server", async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    sendBatch: vi.fn(async (emails: any[]) =>
      emails.map((e) => {
        if (failNext > 0) {
          failNext--;
          return { ok: false, error: "rate limited" };
        }
        sent.push(e);
        return { ok: true, id: `re_${sent.length}` };
      }),
    ),
  };
});

describe.skipIf(!DB)("newsletter queue (integration)", () => {
  let db: any;
  let q: typeof import("~/services/newsletterQueue.server");
  const shop = "queue-test.myshopify.com";

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    db = (await import("~/db.server")).default;
    q = await import("~/services/newsletterQueue.server");
    await db.newsletterSend.deleteMany({});
    await db.newsletterCampaign.deleteMany({});
    await db.newsletterSubscriber.deleteMany({});
    await db.newsletterSubscriber.createMany({
      data: [
        ...Array.from({ length: 150 }, (_, i) => ({ shop, email: `s${i}@example.com`, firstName: `S${i}`, status: "subscribed", source: i < 10 ? "popup" : "import" })),
        { shop, email: "gone@example.com", status: "unsubscribed" },
        { shop, email: "waiting@example.com", status: "pending" },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("sends every subscriber exactly once, skips late unsubscribes, and finishes the campaign", async () => {
    const c = await db.newsletterCampaign.create({
      data: { shop, name: "T", subject: "Hi {{first_name}}", status: "draft", htmlContent: '<html><body><a href="https://shop.test/x">x</a><a href="{{unsubscribe_url}}">u</a></body></html>' },
    });

    const r = await q.enqueueCampaign(c.id);
    expect(r).toMatchObject({ ok: true, queued: 150 });
    // A second click must not queue it again.
    expect((await q.enqueueCampaign(c.id)).ok).toBe(false);

    // Someone unsubscribes after the campaign was queued.
    await db.newsletterSubscriber.update({ where: { shop_email: { shop, email: "s149@example.com" } }, data: { status: "unsubscribed" } });

    await q.processNewsletterQueue();

    const recipients = sent.map((e) => e.to);
    expect(new Set(recipients).size).toBe(recipients.length);
    expect(recipients).toHaveLength(149);
    expect(recipients).not.toContain("s149@example.com");
    expect(recipients).not.toContain("gone@example.com");
    expect(recipients).not.toContain("waiting@example.com");

    const one = sent.find((e) => e.to === "s1@example.com");
    expect(one.subject).toBe("Hi S1");
    expect(one.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(one.html).toMatch(/sid=c[a-z0-9]+/); // per-recipient tracking id filled in
    expect(one.html).not.toContain("{{");

    const done = await db.newsletterCampaign.findUnique({ where: { id: c.id } });
    expect(done.status).toBe("sent");
    expect(done.deliveredCount).toBe(149);
    expect(await q.campaignProgress(c.id)).toMatchObject({ total: 150, done: 150, sent: 149, skipped: 1 });
  });

  it("retries a failed batch later instead of dropping it", async () => {
    sent.length = 0;
    const c = await db.newsletterCampaign.create({
      data: { shop, name: "Segment", subject: "S", status: "draft", htmlContent: "<p>x {{unsubscribe_url}}</p>", segmentFilter: { source: "popup" } },
    });
    await q.enqueueCampaign(c.id);
    failNext = 10; // the whole first batch fails
    await q.processNewsletterQueue();
    expect(sent).toHaveLength(0);
    expect((await db.newsletterCampaign.findUnique({ where: { id: c.id } })).status).toBe("sending");

    // Pretend the retry delay has passed.
    await db.newsletterSend.updateMany({ where: { campaignId: c.id }, data: { claimedAt: new Date(Date.now() - 120_000) } });
    await q.processNewsletterQueue();
    expect(sent.map((e) => e.to).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `s${i}@example.com`).sort());
    expect((await db.newsletterCampaign.findUnique({ where: { id: c.id } })).status).toBe("sent");
  });

  it("starts scheduled campaigns when they're due, not before", async () => {
    sent.length = 0;
    const later = await db.newsletterCampaign.create({
      data: { shop, name: "Later", subject: "L", status: "scheduled", scheduledAt: new Date(Date.now() + 3600_000), htmlContent: "<p>{{unsubscribe_url}}</p>", segmentFilter: { source: "popup" } },
    });
    const due = await db.newsletterCampaign.create({
      data: { shop, name: "Due", subject: "D", status: "scheduled", scheduledAt: new Date(Date.now() - 1000), htmlContent: "<p>{{unsubscribe_url}}</p>", segmentFilter: { source: "popup" } },
    });
    await q.processNewsletterQueue();
    await q.processNewsletterQueue();
    expect((await db.newsletterCampaign.findUnique({ where: { id: due.id } })).status).toBe("sent");
    expect((await db.newsletterCampaign.findUnique({ where: { id: later.id } })).status).toBe("scheduled");
    expect(sent).toHaveLength(10);
  });

  it("counts each recipient's open once and suppresses bounced addresses", async () => {
    const send = await db.newsletterSend.findFirst({ where: { email: "s3@example.com", status: "sent" }, orderBy: { createdAt: "asc" } });
    const track = await import("~/routes/api.newsletter.track");
    const open = () => track.loader({ request: new Request(`https://x/api/newsletter/track?type=open&cid=${send.campaignId}&sid=${send.id}`), params: {}, context: {} } as any);
    await open();
    await open();
    await new Promise((r) => setTimeout(r, 200));
    const c = await db.newsletterCampaign.findUnique({ where: { id: send.campaignId } });
    expect(c.openCount).toBe(1);

    // Signed bounce webhook for that message.
    const crypto = await import("node:crypto");
    const secret = `whsec_${Buffer.from("k").toString("base64")}`;
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const body = JSON.stringify({ type: "email.bounced", data: { email_id: send.providerId, to: ["s3@example.com"], bounce: { type: "Permanent" } } });
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac("sha256", Buffer.from("k")).update(`m.${ts}.${body}`).digest("base64");
    const hook = await import("~/routes/webhooks.resend");
    const res = await hook.action({
      request: new Request("https://x/webhooks/resend", { method: "POST", body, headers: { "svix-id": "m", "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` } }),
      params: {},
      context: {},
    } as any);
    expect(res.status).toBe(200);
    expect((await db.newsletterSubscriber.findUnique({ where: { shop_email: { shop, email: "s3@example.com" } } })).status).toBe("bounced");
    expect((await db.newsletterCampaign.findUnique({ where: { id: send.campaignId } })).bounceCount).toBe(1);
  });
});

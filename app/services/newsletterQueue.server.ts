// app/services/newsletterQueue.server.ts
// Background sending for newsletter campaigns.
//
// Sending a campaign only creates one NewsletterSend row per recipient; this
// worker then sends them in batches of 100 (one Resend API call each), so a
// big list never runs inside a web request, survives restarts, and works with
// several server machines (each batch is claimed before it's sent).

import crypto from "node:crypto";
import db from "~/db.server";
import { sendBatch } from "~/services/resend.server";
import {
  buildCampaignEmail,
  getSubscribersForSegment,
  prepareCampaign,
  type PreparedCampaign,
} from "~/services/newsletter.server";

const BATCH_SIZE = 100;
const TICK_MS = 15_000;
const MAX_BATCHES_PER_TICK = 20; // ~2,000 emails per tick, well inside Resend's rate limit
const STALE_CLAIM_MS = 10 * 60 * 1000;
const MAX_ATTEMPT_ERRORS = 3;
const RETRY_DELAY_MS = 60_000;

const anyDb = db as any;
const workerId = `w_${crypto.randomUUID().slice(0, 8)}`;
let started = false;
let running = false;

// ─── Enqueue ─────────────────────────────────────────────────────────────────

/** Snapshot the segment into send rows and mark the campaign as sending. */
export async function enqueueCampaign(campaignId: string): Promise<{ ok: boolean; queued: number; error?: string }> {
  // Claim the campaign first so a double click can't queue it twice.
  const claim = await anyDb.newsletterCampaign.updateMany({
    where: { id: campaignId, status: { in: ["draft", "scheduled"] } },
    data: { status: "sending" },
  });
  if (claim.count === 0) return { ok: false, queued: 0, error: "This newsletter is already sending or sent." };

  const campaign = await anyDb.newsletterCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign?.htmlContent) {
    await anyDb.newsletterCampaign.update({ where: { id: campaignId }, data: { status: "draft" } });
    return { ok: false, queued: 0, error: "The newsletter has no content yet." };
  }

  const subscribers = await getSubscribersForSegment(campaign.shop, campaign.segmentFilter ?? {});
  for (let i = 0; i < subscribers.length; i += 1000) {
    await anyDb.newsletterSend.createMany({
      data: subscribers.slice(i, i + 1000).map((s) => ({
        campaignId,
        shop: campaign.shop,
        email: s.email,
        firstName: s.firstName,
      })),
    });
  }

  await anyDb.newsletterCampaign.update({
    where: { id: campaignId },
    data: { recipientCount: subscribers.length, ...(subscribers.length === 0 && { status: "sent", sentAt: new Date() }) },
  });

  // Start right away instead of waiting for the next tick.
  setTimeout(() => void processNewsletterQueue(), 200);
  return { ok: true, queued: subscribers.length };
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export async function processNewsletterQueue() {
  if (running) return;
  running = true;
  try {
    await startDueScheduledCampaigns();
    await releaseStaleClaims();

    const prepared = new Map<string, PreparedCampaign | null>();
    for (let i = 0; i < MAX_BATCHES_PER_TICK; i++) {
      const sent = await sendOneBatch(prepared);
      if (!sent) break;
      await new Promise((r) => setTimeout(r, 600)); // Resend: 2 requests/second
    }

    await finishCompletedCampaigns();
  } catch (e: any) {
    console.error("[newsletter queue] error:", e?.message ?? e);
  } finally {
    running = false;
  }
}

async function startDueScheduledCampaigns() {
  const due = await anyDb.newsletterCampaign.findMany({
    where: { status: "scheduled", scheduledAt: { lte: new Date() } },
    select: { id: true },
    take: 10,
  });
  for (const c of due) {
    const r = await enqueueCampaign(c.id);
    console.log(`[newsletter queue] scheduled campaign ${c.id} started: ${r.queued} recipients`);
  }
}

/** Rows claimed by a machine that died mid-batch go back in the queue (only if never handed to Resend). */
async function releaseStaleClaims() {
  await anyDb.newsletterSend.updateMany({
    where: { status: "sending", providerId: null, claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    data: { status: "queued", claimedBy: null, claimedAt: null },
  });
}

async function sendOneBatch(prepared: Map<string, PreparedCampaign | null>): Promise<boolean> {
  // Retries wait a minute (claimedAt doubles as "not before" for queued rows).
  const candidates = await anyDb.newsletterSend.findMany({
    where: { status: "queued", OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - RETRY_DELAY_MS) } }] },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });
  if (!candidates.length) return false;

  const token = `${workerId}_${Date.now()}`;
  await anyDb.newsletterSend.updateMany({
    where: { id: { in: candidates.map((c: any) => c.id) }, status: "queued" },
    data: { status: "sending", claimedBy: token, claimedAt: new Date() },
  });
  const rows = await anyDb.newsletterSend.findMany({ where: { claimedBy: token, status: "sending" } });
  if (!rows.length) return true; // another machine took them; try again

  // People who unsubscribed (or bounced) after the campaign was queued are skipped.
  const stillSubscribed = new Set<string>(
    (
      await anyDb.newsletterSubscriber.findMany({
        where: { status: "subscribed", OR: rows.map((r: any) => ({ shop: r.shop, email: r.email })) },
        select: { shop: true, email: true },
      })
    ).map((s: any) => `${s.shop}|${s.email}`),
  );

  const toSend: any[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    if (!stillSubscribed.has(`${row.shop}|${row.email}`)) {
      skipped.push(row.id);
      continue;
    }
    if (!prepared.has(row.campaignId)) {
      const campaign = await anyDb.newsletterCampaign.findUnique({ where: { id: row.campaignId } });
      prepared.set(row.campaignId, campaign ? await prepareCampaign(campaign) : null);
    }
    if (!prepared.get(row.campaignId)) {
      skipped.push(row.id);
      continue;
    }
    toSend.push(row);
  }

  if (skipped.length) {
    await anyDb.newsletterSend.updateMany({ where: { id: { in: skipped } }, data: { status: "skipped" } });
  }
  if (!toSend.length) return true;

  const emails = toSend.map((row) =>
    buildCampaignEmail(prepared.get(row.campaignId)!, { email: row.email, firstName: row.firstName, sendId: row.id }),
  );
  const results = await sendBatch(emails);

  const now = new Date();
  await Promise.all(
    toSend.map((row, i) => {
      const r = results[i];
      if (r?.ok) {
        return anyDb.newsletterSend.update({ where: { id: row.id }, data: { status: "sent", providerId: r.id, sentAt: now, error: null } });
      }
      // Temporary failure (rate limit, network): retry a few times, then give up.
      const attempts = (row.error?.match(/\|/g)?.length ?? 0) + 1;
      const error = `${row.error ? `${row.error}|` : ""}${(r as any)?.error ?? "unknown error"}`.slice(-500);
      return anyDb.newsletterSend.update({
        where: { id: row.id },
        data: attempts >= MAX_ATTEMPT_ERRORS
          ? { status: "failed", error }
          : { status: "queued", claimedBy: null, claimedAt: now, error },
      });
    }),
  );
  return true;
}

async function finishCompletedCampaigns() {
  const sending = await anyDb.newsletterCampaign.findMany({ where: { status: "sending" }, select: { id: true } });
  for (const { id } of sending) {
    const open = await anyDb.newsletterSend.count({ where: { campaignId: id, status: { in: ["queued", "sending"] } } });
    if (open > 0) continue;
    const [sent, failed] = await Promise.all([
      anyDb.newsletterSend.count({ where: { campaignId: id, status: { in: ["sent", "bounced", "complained"] } } }),
      anyDb.newsletterSend.count({ where: { campaignId: id, status: "failed" } }),
    ]);
    await anyDb.newsletterCampaign.updateMany({
      where: { id, status: "sending" },
      data: { status: sent === 0 && failed > 0 ? "failed" : "sent", sentAt: new Date(), deliveredCount: sent },
    });
    console.log(`[newsletter queue] campaign ${id} finished: ${sent} sent, ${failed} failed`);
  }
}

// ─── Progress for the UI ─────────────────────────────────────────────────────

export async function campaignProgress(campaignId: string) {
  const rows = await anyDb.newsletterSend.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } });
  const by: Record<string, number> = {};
  for (const r of rows) by[r.status] = r._count._all;
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  const done = total - (by.queued ?? 0) - (by.sending ?? 0);
  return { total, done, sent: (by.sent ?? 0) + (by.bounced ?? 0) + (by.complained ?? 0), failed: by.failed ?? 0, skipped: by.skipped ?? 0, bounced: by.bounced ?? 0 };
}

export function startNewsletterWorker() {
  if (started) return;
  started = true;
  setInterval(() => void processNewsletterQueue(), TICK_MS);
  setTimeout(() => void processNewsletterQueue(), 10_000);
  console.log("[newsletter queue] worker started");
}

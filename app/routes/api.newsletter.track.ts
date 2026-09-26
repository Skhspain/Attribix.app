// app/routes/api.newsletter.track.ts
// Open-pixel and click-redirect tracking for newsletter campaigns.
// Public endpoint — no auth required.

import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";
import { verifyClickSignature } from "~/services/newsletter.server";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * Counts unique opens/clicks: the campaign counter only goes up the first time
 * a recipient opens (or clicks). A click also counts as an open, since many
 * mail apps block the open pixel. Emails sent before per-recipient tracking
 * have no send id and just increment the counter.
 */
async function recordEvent(campaignId: string, sendId: string | null, kind: "open" | "click") {
  const anyDb = db as any;
  const counter = kind === "open" ? "openCount" : "clickCount";
  if (!sendId) {
    await anyDb.newsletterCampaign.update({ where: { id: campaignId }, data: { [counter]: { increment: 1 } } });
    return;
  }
  const now = new Date();
  const field = kind === "open" ? "openedAt" : "clickedAt";
  const first = await anyDb.newsletterSend.updateMany({ where: { id: sendId, campaignId, [field]: null }, data: { [field]: now } });
  if (first.count) await anyDb.newsletterCampaign.update({ where: { id: campaignId }, data: { [counter]: { increment: 1 } } });
  if (kind === "click") {
    const opened = await anyDb.newsletterSend.updateMany({ where: { id: sendId, campaignId, openedAt: null }, data: { openedAt: now } });
    if (opened.count) await anyDb.newsletterCampaign.update({ where: { id: campaignId }, data: { openCount: { increment: 1 } } });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const campaignId = url.searchParams.get("cid");

  if (!campaignId) {
    return new Response(GIF, {
      status: 200,
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
    });
  }

  const anyDb = db as any;
  const sendId = url.searchParams.get("sid") || null;

  if (type === "open") {
    recordEvent(campaignId, sendId, "open").catch(console.error);

    return new Response(GIF, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  }

  if (type === "click") {
    const destination = url.searchParams.get("url");
    const sig = url.searchParams.get("sig") || "";

    // Only redirect to links that really are in this campaign. New emails carry
    // a signature; emails sent before signing existed are checked against the
    // campaign's stored HTML. Anything else would make this an open redirect.
    let allowed = false;
    if (destination && /^https?:\/\//i.test(destination)) {
      if (sig) {
        allowed = verifyClickSignature(campaignId, destination, sig);
      } else {
        const campaign = await anyDb.newsletterCampaign
          .findUnique({ where: { id: campaignId }, select: { htmlContent: true } })
          .catch(() => null);
        const html: string = campaign?.htmlContent ?? "";
        allowed = html.includes(destination) || html.includes(destination.replace(/&/g, "&amp;"));
      }
    }

    if (allowed && destination) {
      recordEvent(campaignId, sendId, "click").catch(console.error);
      return redirect(destination);
    }
    return new Response("Link not found", { status: 404 });
  }

  // Fallback — return transparent pixel
  return new Response(GIF, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
  });
}

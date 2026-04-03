// app/routes/api.newsletter.track.ts
// Open-pixel and click-redirect tracking for newsletter campaigns.
// Public endpoint — no auth required.

import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

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

  if (type === "open") {
    // Fire-and-forget increment
    anyDb.newsletterCampaign
      .update({
        where: { id: campaignId },
        data: { openCount: { increment: 1 } },
      })
      .catch(console.error);

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
    const encodedUrl = url.searchParams.get("url");
    const destination = encodedUrl ? decodeURIComponent(encodedUrl) : null;

    // Fire-and-forget increment
    anyDb.newsletterCampaign
      .update({
        where: { id: campaignId },
        data: { clickCount: { increment: 1 } },
      })
      .catch(console.error);

    if (destination) {
      return redirect(destination);
    }
  }

  // Fallback — return transparent pixel
  return new Response(GIF, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
  });
}

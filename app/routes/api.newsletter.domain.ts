// app/routes/api.newsletter.domain.ts
// POST /api/newsletter/domain
// Manages Resend domain verification for a merchant's sending domain.
// Requires Shopify admin session.
// Body: { intent: "register" | "verify" | "remove" }

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  createResendDomain,
  getResendDomain,
  verifyResendDomain,
  deleteResendDomain,
} from "~/services/resend-api.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));
  const { intent } = body as { intent: string };

  const settings = await anyDb.newsletterSettings?.findUnique?.({ where: { shop } }).catch(() => null);

  if (intent === "register") {
    const fromEmail: string = body.fromEmail || settings?.fromEmail || "";
    if (!fromEmail || !fromEmail.includes("@")) {
      return json({ ok: false, error: "Enter a valid From email address first." }, { status: 400 });
    }
    const domain = fromEmail.split("@")[1].toLowerCase();

    // If already registered for same domain, just return current state
    if (settings?.resendDomainId) {
      const existing = await getResendDomain(settings.resendDomainId);
      if (existing.ok && existing.domain.name === domain) {
        return json({ ok: true, domain: existing.domain });
      }
      // Different domain — delete old one first
      await deleteResendDomain(settings.resendDomainId).catch(() => null);
    }

    const result = await createResendDomain(domain);
    if (!result.ok) return json({ ok: false, error: result.error }, { status: 400 });

    await anyDb.newsletterSettings?.upsert?.({
      where: { shop },
      create: {
        shop,
        fromEmail: settings?.fromEmail ?? "",
        fromName: settings?.fromName ?? "",
        replyTo: settings?.replyTo ?? "",
        footerText: settings?.footerText ?? "",
        resendDomainId: result.domain.id,
        resendDomainStatus: result.domain.status,
        resendDomainRecords: result.domain.records,
      },
      update: {
        resendDomainId: result.domain.id,
        resendDomainStatus: result.domain.status,
        resendDomainRecords: result.domain.records,
      },
    }).catch(() => null);

    return json({ ok: true, domain: result.domain });
  }

  if (intent === "verify") {
    if (!settings?.resendDomainId) {
      return json({ ok: false, error: "No domain registered yet." }, { status: 400 });
    }
    const result = await verifyResendDomain(settings.resendDomainId);
    if (!result.ok) return json({ ok: false, error: result.error }, { status: 400 });

    await anyDb.newsletterSettings?.update?.({
      where: { shop },
      data: {
        resendDomainStatus: result.domain.status,
        resendDomainRecords: result.domain.records,
      },
    }).catch(() => null);

    return json({ ok: true, domain: result.domain });
  }

  if (intent === "remove") {
    if (settings?.resendDomainId) {
      await deleteResendDomain(settings.resendDomainId).catch(() => null);
    }
    await anyDb.newsletterSettings?.update?.({
      where: { shop },
      data: { resendDomainId: null, resendDomainStatus: null, resendDomainRecords: null },
    }).catch(() => null);

    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
}

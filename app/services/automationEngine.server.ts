// app/services/automationEngine.server.ts
// Automation flow engine — enroll contacts and process the send queue.

import db from "~/db.server";
import { sendEmail } from "~/services/resend.server";
import {
  ensureUnsubscribeFooter,
  listUnsubscribeHeaders,
  personalize,
  senderFor,
  unsubscribeUrlFor,
} from "~/services/newsletter.server";

let processorStarted = false;

// ─── Enroll ───────────────────────────────────────────────────────────────────

export async function enrollInFlows({
  shop,
  trigger,
  email,
  firstName,
  triggeredBy,
}: {
  shop: string;
  trigger: string;
  email: string;
  firstName?: string;
  triggeredBy?: string;
}) {
  const anyDb = db as any;
  try {
    const flows = await anyDb.automationFlow.findMany({
      where: { shop, trigger, enabled: true },
      include: { steps: { orderBy: { position: "asc" } } },
    });

    for (const flow of flows) {
      if (!flow.steps.length) continue;
      const firstStep = flow.steps[0];
      const delayMs = ((firstStep.delayDays ?? 0) * 24 * 60 + (firstStep.delayHours ?? 0) * 60) * 60 * 1000;
      const nextSendAt = new Date(Date.now() + delayMs);

      await anyDb.automationEnrollment.upsert({
        where: { flowId_email: { flowId: flow.id, email } },
        create: { shop, flowId: flow.id, email, firstName: firstName ?? null, currentStep: 0, nextSendAt, status: "active", triggeredBy: triggeredBy ?? null },
        update: { status: "active", currentStep: 0, nextSendAt },
      }).catch(() => null);
    }
  } catch (e: any) {
    console.error("[automation] enroll error:", e?.message);
  }
}

// ─── Process queue ────────────────────────────────────────────────────────────

export async function processAutomationQueue() {
  const anyDb = db as any;
  try {
    const due = await anyDb.automationEnrollment.findMany({
      where: { status: "active", nextSendAt: { lte: new Date() } },
      include: { flow: { include: { steps: { orderBy: { position: "asc" } } } } },
      take: 50,
    });

    for (const enrollment of due) {
      // Claim the send: with several server machines running this queue, only
      // the one that flips nextSendAt first sends the email.
      const claim = await anyDb.automationEnrollment.updateMany({
        where: { id: enrollment.id, status: "active", nextSendAt: enrollment.nextSendAt },
        data: { nextSendAt: null },
      });
      if (claim.count === 0) continue;

      const steps = enrollment.flow?.steps ?? [];
      const step = steps[enrollment.currentStep];
      if (!step) {
        await anyDb.automationEnrollment.update({ where: { id: enrollment.id }, data: { status: "completed" } });
        continue;
      }

      // Never email someone who has unsubscribed, bounced or complained.
      const subscriber = await anyDb.newsletterSubscriber
        .findUnique({ where: { shop_email: { shop: enrollment.shop, email: enrollment.email.toLowerCase() } }, select: { status: true, createdAt: true } })
        .catch(() => null);
      if (subscriber?.status === "pending") {
        // Waiting for double opt-in: check again in an hour, give up after 14 days.
        const expired = Date.now() - new Date(subscriber.createdAt).getTime() > 14 * 24 * 60 * 60 * 1000;
        await anyDb.automationEnrollment.update({
          where: { id: enrollment.id },
          data: expired ? { status: "cancelled" } : { nextSendAt: new Date(Date.now() + 60 * 60 * 1000) },
        });
        continue;
      }
      if (subscriber && subscriber.status !== "subscribed") {
        await anyDb.automationEnrollment.update({ where: { id: enrollment.id }, data: { status: "cancelled" } });
        continue;
      }

      const settings = await anyDb.newsletterSettings?.findUnique?.({ where: { shop: enrollment.shop } }).catch(() => null);
      const sender = senderFor({
        fromName: settings?.fromName,
        merchantEmail: settings?.fromEmail,
        replyTo: settings?.replyTo,
        domainVerified: settings?.resendDomainStatus === "verified",
        shop: enrollment.shop,
      });

      const unsubUrl = unsubscribeUrlFor(enrollment.shop, enrollment.email);
      const vars = { shop: enrollment.shop, email: enrollment.email, firstName: enrollment.firstName, unsubscribeUrl: unsubUrl };
      const subject = personalize(step.subject || "", vars);
      const baseHtml = step.htmlContent
        ? ensureUnsubscribeFooter(step.htmlContent, settings?.footerText)
        : ensureUnsubscribeFooter(buildFallbackHtml({ subject, shopDisplay: enrollment.shop.replace(".myshopify.com", ""), firstName: enrollment.firstName || "there" }));
      const html = personalize(baseHtml, vars);

      const result = await sendEmail({
        from: sender.from,
        replyTo: sender.replyTo,
        to: enrollment.email,
        subject,
        html,
        headers: listUnsubscribeHeaders(unsubUrl),
        tags: [{ name: "shop", value: enrollment.shop }, { name: "flow_id", value: enrollment.flowId }],
      }).catch((e: any) => ({ ok: false as const, error: e?.message ?? "send failed" }));
      if (!result.ok) console.error("[automation] send failed:", enrollment.id, (result as any).error);

      // Advance to next step
      const nextStepIdx = enrollment.currentStep + 1;
      const nextStep = steps[nextStepIdx];
      if (nextStep) {
        const delayMs = ((nextStep.delayDays ?? 0) * 24 * 60 + (nextStep.delayHours ?? 0) * 60) * 60 * 1000;
        await anyDb.automationEnrollment.update({ where: { id: enrollment.id }, data: { currentStep: nextStepIdx, nextSendAt: new Date(Date.now() + delayMs) } });
      } else {
        await anyDb.automationEnrollment.update({ where: { id: enrollment.id }, data: { status: "completed", nextSendAt: null } });
      }
    }
  } catch (e: any) {
    console.error("[automation] queue error:", e?.message);
  }
}

function buildFallbackHtml({ subject, shopDisplay, firstName }: { subject: string; shopDisplay: string; firstName: string }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px 16px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#4f46e5;padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${subject}</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">Hi ${firstName},</p>
<p style="margin:16px 0 0;color:#374151;font-size:15px;line-height:1.7;">This is an automated message from ${shopDisplay}.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ─── Background processor ─────────────────────────────────────────────────────

export function startAutomationProcessor() {
  if (processorStarted) return;
  processorStarted = true;
  // Run every 5 minutes
  setInterval(() => { processAutomationQueue(); }, 5 * 60 * 1000);
  // Also run once shortly after boot
  setTimeout(() => { processAutomationQueue(); }, 15_000);
  console.log("[automation] processor started");
}

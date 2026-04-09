// app/routes/api.standalone.newsletter.flows.ts
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

const TEMPLATES = [
  { id: "welcome", name: "Welcome Series", description: "Send a welcome email when someone subscribes", trigger: "subscriber_new", steps: [{ delayHours: 0, subject: "Welcome to {shop}!", body: "Hi {name},\n\nWelcome! We're glad you're here.\n\nBrowse our latest products: {shop_url}" }, { delayHours: 72, subject: "Here's 10% off your first order", body: "Hi {name},\n\nAs a thank you for subscribing, here's 10% off: {discount_code}" }] },
  { id: "post_purchase", name: "Post-Purchase", description: "Follow up after a purchase", trigger: "order_created", steps: [{ delayHours: 24, subject: "Thank you for your order!", body: "Hi {name},\n\nThank you for your order #{order_id}!\n\nWe'll notify you when it ships." }, { delayHours: 168, subject: "How was your order?", body: "Hi {name},\n\nWe hope you're enjoying your purchase. Leave a review: {review_link}" }] },
  { id: "winback", name: "Win-Back", description: "Re-engage customers who haven't purchased in 60 days", trigger: "customer_inactive_60d", steps: [{ delayHours: 0, subject: "We miss you!", body: "Hi {name},\n\nIt's been a while! Here's a special offer just for you." }] },
  { id: "abandoned_cart", name: "Abandoned Cart", description: "Remind customers about items left in cart", trigger: "cart_abandoned", steps: [{ delayHours: 1, subject: "You left something behind!", body: "Hi {name},\n\nYou have items waiting in your cart. Complete your purchase: {cart_url}" }, { delayHours: 24, subject: "Your cart is about to expire", body: "Hi {name},\n\nDon't miss out! Your cart items: {cart_url}" }] },
  { id: "vip", name: "VIP Rewards", description: "Reward your best customers", trigger: "customer_vip", steps: [{ delayHours: 0, subject: "You're a VIP!", body: "Hi {name},\n\nThank you for being one of our best customers. Enjoy exclusive access and rewards." }] },
  { id: "birthday", name: "Birthday", description: "Send birthday greetings with a special offer", trigger: "customer_birthday", steps: [{ delayHours: 0, subject: "Happy Birthday, {name}! 🎂", body: "Hi {name},\n\nHappy Birthday! Enjoy a special birthday discount: {discount_code}" }] },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, flows: [], templates: TEMPLATES }));

  const flows = await db.automationFlow.findMany({
    where: { shop: { in: auth.shops } },
    include: { steps: { orderBy: { position: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  // Count enrollments per flow
  const flowsWithCounts = await Promise.all(flows.map(async (f) => {
    const enrollmentCount = await db.automationEnrollment.count({ where: { flowId: f.id } });
    return { ...f, enrollmentCount };
  }));

  return standaloneCors(request, json({ ok: true, flows: flowsWithCounts, templates: TEMPLATES }));
}

export async function action({ request }: ActionFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  const shop = auth.shops[0];
  if (!shop) return standaloneCors(request, json({ ok: false, error: "No shop" }, { status: 400 }));

  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (action === "create_from_template") {
    const template = TEMPLATES.find((t) => t.id === body.templateId);
    if (!template) return standaloneCors(request, json({ ok: false, error: "Invalid template" }, { status: 400 }));

    const flow = await db.automationFlow.create({
      data: {
        shop, name: template.name, description: template.description,
        trigger: template.trigger, enabled: false,
        steps: { create: template.steps.map((s, i) => ({ position: i, delayHours: s.delayHours, subject: s.subject, body: s.body })) },
      },
      include: { steps: true },
    });
    return standaloneCors(request, json({ ok: true, flow }));
  }

  if (action === "toggle") {
    const flow = await db.automationFlow.findUnique({ where: { id: body.id } });
    if (!flow || !auth.shops.includes(flow.shop)) return standaloneCors(request, json({ ok: false, error: "Not found" }, { status: 404 }));
    const updated = await db.automationFlow.update({ where: { id: body.id }, data: { enabled: !flow.enabled } });
    return standaloneCors(request, json({ ok: true, flow: updated }));
  }

  return standaloneCors(request, json({ ok: false, error: "Invalid action" }, { status: 400 }));
}

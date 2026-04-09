// app/routes/webhooks.meta.leadgen.tsx
// Receives Meta Lead Ads webhooks and auto-creates leads.
//
// Meta setup:
//  1. In Meta App dashboard → Webhooks → Subscribe to "leadgen" events on your Page
//  2. Callback URL: https://attribix-app.fly.dev/webhooks/meta/leadgen?shop=YOUR_SHOP
//  3. Verify token: value of META_LEAD_VERIFY_TOKEN env var (set in Fly secrets)

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { getShopPlan, checkLeadsQuota } from "~/services/plan.server";

// ── Meta Graph API helper ──────────────────────────────────────────────────────

async function fetchLeadgenData(leadgenId: string, accessToken: string) {
  const url = new URL(`https://graph.facebook.com/v20.0/${leadgenId}`);
  url.searchParams.set("fields", "field_data,created_time,ad_id,form_id,campaign_id");
  url.searchParams.set("access_token", accessToken);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return await res.json() as {
      id: string;
      field_data?: Array<{ name: string; values: string[] }>;
      created_time?: string;
      ad_id?: string;
      form_id?: string;
      campaign_id?: string;
    };
  } catch {
    return null;
  }
}

function parseFieldData(fields: Array<{ name: string; values: string[] }>) {
  const get = (...names: string[]) => {
    for (const n of names) {
      const f = fields.find(f => f.name.toLowerCase().replace(/[\s_]/g, "") === n.toLowerCase().replace(/[\s_]/g, ""));
      if (f?.values?.[0]) return f.values[0];
    }
    return null;
  };

  const fullName = get("full_name", "fullname", "name");
  let firstName: string | null = null;
  let lastName: string | null = null;
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts[0] ?? null;
    lastName = parts.slice(1).join(" ") || null;
  }
  firstName = get("first_name", "firstname") ?? firstName;
  lastName  = get("last_name", "lastname")   ?? lastName;

  return {
    email:     get("email", "e_mail", "email_address"),
    firstName,
    lastName,
    phone:     get("phone_number", "phone", "mobile", "mobile_number"),
    company:   get("company_name", "company", "organisation", "organization"),
  };
}

// ── GET — webhook verification ─────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mode      = url.searchParams.get("hub.mode");
  const token     = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.META_LEAD_VERIFY_TOKEN || "attribix_lead_verify";

  if (mode === "subscribe" && token === verifyToken && challenge) {
    console.log("[meta.leadgen] Webhook verified ✓");
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return json({ error: "Invalid verification token" }, { status: 403 });
}

// ── POST — receive lead notification ──────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return json({ ok: false }, { status: 405 });

  const url  = new URL(request.url);
  const shop = url.searchParams.get("shop");

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Bad JSON" }, { status: 400 }); }

  const anyDb = db as any;

  // Collect all leadgen_ids from the payload
  const leadgenIds: Array<{ leadgenId: string; adId?: string; campaignId?: string }> = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field === "leadgen" && change?.value?.leadgen_id) {
        leadgenIds.push({
          leadgenId: change.value.leadgen_id,
          adId:      change.value.ad_id,
          campaignId: change.value.campaign_id,
        });
      }
    }
  }

  if (leadgenIds.length === 0) return json({ ok: true, processed: 0 });

  // Find the MetaConnection for this shop (or search all if no shop param)
  let connections: Array<{ shop: string; accessToken: string }> = [];
  if (shop) {
    const conn = await db.metaConnection.findUnique({ where: { shop }, select: { shop: true, accessToken: true } }).catch(() => null);
    if (conn) connections = [conn];
  } else {
    // Try all connections (app-level webhook, not per-shop)
    connections = await db.metaConnection.findMany({ select: { shop: true, accessToken: true }, take: 50 }).catch(() => []);
  }

  if (connections.length === 0) {
    console.warn("[meta.leadgen] No MetaConnection found for shop:", shop);
    return json({ ok: true, processed: 0, warn: "No Meta connection found" });
  }

  let processed = 0;

  for (const { leadgenId, adId, campaignId } of leadgenIds) {
    for (const conn of connections) {
      const data = await fetchLeadgenData(leadgenId, conn.accessToken);
      if (!data?.field_data) continue;

      const { email, firstName, lastName, phone, company } = parseFieldData(data.field_data);
      if (!email) continue;

      try {
        // Enforce plan lead quota
        const plan = await getShopPlan(conn.shop);
        const quota = await checkLeadsQuota(conn.shop, plan);
        if (!quota.allowed) {
          console.log(`[meta.leadgen] Lead quota exceeded for ${conn.shop} (${quota.used}/${quota.limit})`);
          continue;
        }

        await anyDb.lead?.upsert?.({
          where: { shop_email: { shop: conn.shop, email: email.toLowerCase().trim() } },
          create: {
            shop: conn.shop,
            email: email.toLowerCase().trim(),
            firstName: firstName ?? null,
            lastName:  lastName  ?? null,
            phone:     phone     ?? null,
            company:   company   ?? null,
            source: "meta_ad",
            status: "new",
            notes: [
              adId       ? `Ad ID: ${adId}`       : null,
              campaignId ? `Campaign: ${campaignId}` : null,
            ].filter(Boolean).join("\n") || null,
          },
          update: {
            firstName: firstName ?? undefined,
            lastName:  lastName  ?? undefined,
            phone:     phone     ?? undefined,
            company:   company   ?? undefined,
          },
        });
        processed++;
        console.log(`[meta.leadgen] Lead created: ${email} for ${conn.shop}`);
      } catch (e: any) {
        console.error("[meta.leadgen] upsert error:", e?.message);
      }
      break; // Only process once per leadgen_id (first matching connection)
    }
  }

  return json({ ok: true, processed });
}

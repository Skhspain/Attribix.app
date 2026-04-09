// api/leads/webhook — Generic lead webhook for Google Forms, Typeform, etc.
// URL: https://api.attribix.app/api/leads/webhook?shop=SHOP&token=SECRET
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import db from "~/db.server";

// GET — health check / verification
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const token = url.searchParams.get("token");
  if (!shop || !token) {
    return json({ ok: false, error: "Missing shop or token" }, { status: 400 });
  }

  const settings = await (db as any).trackingSettings?.findUnique?.({ where: { shop } });
  if (!settings || settings.leadWebhookToken !== token) {
    return json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  return json({ ok: true, message: "Webhook is active", shop });
}

// POST — receive lead data
export async function action({ request }: ActionFunctionArgs) {
  // CORS headers for cross-origin POST (e.g., from Apps Script)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const token = url.searchParams.get("token");

  if (!shop || !token) {
    return json({ ok: false, error: "Missing shop or token" }, { status: 400, headers: cors() });
  }

  const settings = await (db as any).trackingSettings?.findUnique?.({ where: { shop } });
  if (!settings || settings.leadWebhookToken !== token) {
    return json({ ok: false, error: "Invalid token" }, { status: 401, headers: cors() });
  }

  let body: any;
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else if (contentType.includes("form")) {
      const formData = await request.formData();
      body = Object.fromEntries(formData);
    } else {
      body = await request.json().catch(async () => {
        const text = await request.text();
        try { return JSON.parse(text); } catch { return {}; }
      });
    }
  } catch {
    return json({ ok: false, error: "Invalid request body" }, { status: 400, headers: cors() });
  }

  // Flexible field mapping — handles variations from Google Forms, Typeform, etc.
  const email = normalizeField(body, ["email", "e-mail", "e_mail", "Email", "EMAIL", "email_address", "emailAddress"]);
  if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return json({ ok: false, error: "Valid email is required" }, { status: 400, headers: cors() });
  }

  const firstName = normalizeField(body, ["firstName", "first_name", "firstname", "First Name", "first", "given_name", "givenName"]);
  const lastName = normalizeField(body, ["lastName", "last_name", "lastname", "Last Name", "last", "family_name", "familyName"]);
  const fullName = normalizeField(body, ["name", "full_name", "fullName", "Name", "Full Name"]);
  const phone = normalizeField(body, ["phone", "phone_number", "phoneNumber", "Phone", "telephone", "tel", "mobile"]);
  const company = normalizeField(body, ["company", "company_name", "companyName", "Company", "organization", "org"]);
  const source = normalizeField(body, ["source", "form_source", "formSource"]) || "google_form";
  const notes = normalizeField(body, ["notes", "message", "comment", "comments", "Notes", "Message"]);

  // Split full name if first/last not provided
  let resolvedFirst = firstName;
  let resolvedLast = lastName;
  if (!resolvedFirst && fullName) {
    const parts = fullName.trim().split(/\s+/);
    resolvedFirst = parts[0];
    resolvedLast = parts.slice(1).join(" ") || undefined;
  }

  try {
    const lead = await (db as any).lead.upsert({
      where: { shop_email: { shop, email } },
      create: {
        shop,
        email,
        firstName: resolvedFirst || null,
        lastName: resolvedLast || null,
        phone: phone || null,
        company: company || null,
        source,
        status: "new",
        notes: notes || null,
      },
      update: {
        firstName: resolvedFirst || undefined,
        lastName: resolvedLast || undefined,
        phone: phone || undefined,
        company: company || undefined,
        notes: notes ? notes : undefined,
      },
    });

    return json({ ok: true, lead: { id: lead.id, email: lead.email } }, { headers: cors() });
  } catch (e: any) {
    console.error("[webhook] lead upsert error:", e.message);
    return json({ ok: false, error: "Failed to create lead" }, { status: 500, headers: cors() });
  }
}

function normalizeField(body: any, keys: string[]): string | undefined {
  for (const key of keys) {
    if (body[key] && typeof body[key] === "string" && body[key].trim()) {
      return body[key].trim();
    }
  }
  return undefined;
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

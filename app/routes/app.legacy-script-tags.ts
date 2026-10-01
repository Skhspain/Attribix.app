// app/routes/app.legacy-script-tags.ts
// POST: switches the shop off its legacy Attribix ScriptTags once the
// "Attribix Widgets" app embed is on (see LegacyScriptTagBanner in app.jsx).
//   intent=check  — only removes the tags if the embed is live on the storefront
//   (default)     — merchant says it's enabled; remove the tags regardless
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { needsEmbedMigration, removeLegacyScriptTags } from "~/services/themeEditor.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  try {
    if (form.get("intent") === "check") {
      const pending = await needsEmbedMigration(session.shop, admin, { fresh: true });
      return json({ ok: !pending, intent: "check" });
    }
    const removed = await removeLegacyScriptTags(session.shop, admin);
    return json({ ok: true, removed });
  } catch (e: any) {
    console.error("[legacy-script-tags] error:", e?.message ?? e);
    return json({ ok: false }, { status: 500 });
  }
}

// app/routes/app.legacy-script-tags.ts
// POST: deletes the shop's legacy Attribix ScriptTags once the merchant has
// enabled the "Attribix Widgets" app embed (see LegacyScriptTagBanner in app.jsx).
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { removeLegacyScriptTags } from "~/services/themeEditor.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  try {
    const removed = await removeLegacyScriptTags(session.shop, admin);
    return json({ ok: true, removed });
  } catch (e: any) {
    console.error("[legacy-script-tags] delete error:", e?.message ?? e);
    return json({ ok: false }, { status: 500 });
  }
}

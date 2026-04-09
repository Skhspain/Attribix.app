// app/routes/api.standalone.newsletter.templates.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { UNLAYER_TEMPLATES, UNLAYER_CATEGORIES } from "~/data/unlayerTemplates";
import { standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const templates = UNLAYER_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    primaryColor: t.primaryColor,
    html: t.html,
    design: t.design,
  }));

  return standaloneCors(request, json({
    ok: true,
    templates,
    categories: UNLAYER_CATEGORIES,
  }));
}

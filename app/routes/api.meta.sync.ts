// app/routes/api.meta.sync.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { syncMetaAds } from "~/services/metaSync.server";

// Shared secret – must match REPORTS_API_KEY on Fly
const EXPECTED_KEY = process.env.REPORTS_API_KEY ?? "changeme-secret";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Simple auth using header
  const providedKey = request.headers.get("x-attribix-key");
  if (!providedKey || providedKey !== EXPECTED_KEY) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Optional ?days=30 override (defaults to 7)
  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  let days = 7;
  if (daysParam) {
    const n = Number(daysParam);
    if (!Number.isNaN(n) && n > 0) {
      // clamp just so nobody asks for like 10 years
      days = Math.max(1, Math.min(90, n));
    }
  }

  const result = await syncMetaAds(days);

  return json(result, {
    status: result.ok ? 200 : 400,
  });
}

// app/routes/api.export.customer-list.$platform.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { corsHeaders, assertApiKey, corsPreflight } from "~/utils/http.server";
import { db as prisma } from "~/utils/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const pre = corsPreflight(request);
  if (pre) return pre;

  try {
    assertApiKey(request);
    // Return empty file (you can wire actual Prisma rows later).
    const csv = "customerEmailHash\n";
    return new Response(csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="customers.csv"`,
      },
    });
  } catch (err: any) {
    return new Response(String(err?.message ?? "Error"), { status: 500, headers: corsHeaders });
  }
}

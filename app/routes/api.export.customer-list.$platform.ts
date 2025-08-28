import { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { assertApiKey, corsHeaders } from "~/utils/http.server";

// Minimal: export email hashes only, one per line per platform requirements.
// For Meta/Google, SHA-256 hashes are accepted. :contentReference[oaicite:4]{index=4}

export async function loader({ params, request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  try {
    assertApiKey(request);
  } catch (e: any) {
    return e;
  }

  const platform = (params.platform || "").toLowerCase();
  if (!["meta", "google"].includes(platform)) {
    return new Response("Bad platform", { status: 400, headers: corsHeaders() });
  }

  // Export unique email hashes of customers who consented to advertising/marketing
  const rows = await prisma.purchase.findMany({
    where: {
      customerEmailHash: { not: null },
      session: {
        OR: [{ consentAdvertising: true }, { consentMarketing: true }],
      },
    },
    select: { customerEmailHash: true },
    distinct: ["customerEmailHash"],
    take: 200000,
  });

  const csv = rows.map(r => r.customerEmailHash).filter(Boolean).join("\n") + "\n";

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="attribix_${platform}_customers.csv"`,
      ...corsHeaders(),
    },
  });
}

export function action() {
  return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
}

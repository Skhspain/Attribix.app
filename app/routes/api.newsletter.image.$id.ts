// app/routes/api.newsletter.image.$id.ts
// Publicly serves a newsletter image by ID.
// No authentication required — email clients must be able to load these URLs.

import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/db.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const { id } = params;
  if (!id) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const anyDb = db as any;
    const record = await anyDb.newsletterImage.findUnique({ where: { id } });

    if (!record) {
      return new Response("Not found", { status: 404 });
    }

    const buffer = Buffer.from(record.data, "base64");

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": record.mimeType,
        "Content-Length": String(buffer.length),
        // Cache aggressively — images don't change
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    console.error("[newsletter-image] serve error:", err?.message);
    return new Response("Error", { status: 500 });
  }
}

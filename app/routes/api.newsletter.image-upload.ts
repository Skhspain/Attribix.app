// app/routes/api.newsletter.image-upload.ts
// Receives an image upload from the Unlayer editor, stores it in the DB,
// and returns the public URL so Unlayer can embed it in the email.

import type { ActionFunctionArgs } from "@remix-run/node";
import {
  json,
  unstable_parseMultipartFormData,
  unstable_createMemoryUploadHandler,
} from "@remix-run/node";
import { db } from "~/db.server";
import shopify from "~/shopify.server";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

export async function action({ request }: ActionFunctionArgs) {
  try {
    // Authenticate — works for both embedded app requests and direct fetch with session
    const { session } = await shopify.authenticate.admin(request);
    const shop = session.shop;

    const uploadHandler = unstable_createMemoryUploadHandler({
      maxPartSize: MAX_SIZE,
    });

    const formData = await unstable_parseMultipartFormData(request, uploadHandler);
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return json({ error: "No file provided" }, { status: 400 });
    }

    const mimeType = ALLOWED_TYPES[file.type];
    if (!mimeType) {
      return json({ error: "Unsupported file type. Use JPEG, PNG, GIF or WebP." }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return json({ error: "File too large. Maximum size is 5 MB." }, { status: 400 });
    }

    // Convert to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const anyDb = db as any;
    const record = await anyDb.newsletterImage.create({
      data: {
        shop,
        filename: file.name || "image",
        mimeType,
        data: base64,
        size: file.size,
      },
    });

    // Return the public URL Unlayer will embed in the email HTML
    const appUrl = process.env.SHOPIFY_APP_URL || process.env.APP_URL || "";
    const url = `${appUrl}/api/newsletter/image/${record.id}`;

    return json({ url });
  } catch (err: any) {
    console.error("[image-upload] error:", err?.message);
    return json({ error: String(err?.message ?? "Upload failed") }, { status: 500 });
  }
}

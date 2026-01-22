import type { LoaderFunctionArgs } from "@remix-run/node";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import path from "node:path";
import { authenticate } from "../shopify.server";

async function fileExists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const file = params.file;

  // Only serve pixel.js from this route
  if (file !== "pixel.js") {
    return new Response("Not found", { status: 404 });
  }

  // IMPORTANT:
  // App Proxy requests SHOULD include signature params,
  // but when you test by opening the URL directly, they often won't.
  // So: validate when possible, but never throw.
  try {
    await authenticate.public.appProxy(request);
  } catch (err) {
    // Don't crash — Shopify shows "There was an error in the third-party application"
    // for non-200 responses. We'll still serve JS.
    console.warn("[app-proxy] appProxy auth failed (serving JS anyway):", err);
  }

  const jsPath = path.resolve(
    process.cwd(),
    "extensions",
    "attribix-pixel",
    "dist",
    "main.js",
  );

  // If the built JS file is missing, still return 200 with a safe stub
  // (prevents Shopify error page + gives you a console hint)
  if (!(await fileExists(jsPath))) {
    const stub = `console.warn("[Attribix] pixel.js not found at: ${jsPath}");`;
    return new Response(stub, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const js = await readFile(jsPath, "utf-8");

  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

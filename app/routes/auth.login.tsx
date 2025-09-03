import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

function extractShopFromFormData(fd: FormData): string {
  return String(fd.get("shop") ?? "").trim();
}

function isValidShopDomain(s: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(s);
}

export async function action({ request }: ActionFunctionArgs) {
  let shop = "";

  // Try formData first (works for application/x-www-form-urlencoded & multipart)
  try {
    const fd = await request.formData();
    shop = extractShopFromFormData(fd);
  } catch {
    // As a fallback, try parsing raw text (in case something odd posts text)
    const raw = await request.text().catch(() => "");
    if (raw && !shop) {
      const params = new URLSearchParams(raw);
      shop = String(params.get("shop") ?? "").trim();
    }
  }

  if (!shop || !isValidShopDomain(shop)) {
    return new Response("Missing or invalid shop", { status: 400 });
  }

  const redirectTo = `/auth?shop=${encodeURIComponent(shop)}`;

  // Always set the header so Remix fetchers can read it
  const headers = new Headers({ "X-Redirect": redirectTo });

  // For normal document POSTs, do a regular HTTP redirect
  // For Remix fetcher/data requests, return 204 + X-Redirect header
  const isDataRequest =
    new URL(request.url).searchParams.has("_data") ||
    request.headers.get("X-Remix-Fetch") === "true";

  if (isDataRequest) {
    return new Response(null, { status: 204, headers });
  }
  return redirect(redirectTo, { headers });
}

// Render nothing at this route
export default function AuthLogin() {
  return null;
}

// app/routes/auth.login.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import shopify from "~/shopify.server";

function htmlPage(title: string, body: string) {
  return new Response(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; line-height: 1.4; }
      .card { max-width: 780px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
      .muted { color: #6b7280; }
      a { color: #2563eb; }
    </style>
  </head>
  <body>
    <h1>Attribix</h1>
    <div class="card">
      ${body}
    </div>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

// Start OAuth from /auth/login
export async function loader({ request }: LoaderFunctionArgs) {
  // ✅ Some clients/monitors do HEAD requests. Never run OAuth logic on HEAD.
  if (request.method === "HEAD") {
    return new Response(null, { status: 200 });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");

  /**
   * ✅ Critical: Do NOT start OAuth without `shop`.
   * If someone opens attribix-app.fly.dev/auth/login directly (top-level),
   * Shopify context is missing => loops/blank pages.
   */
  if (!shop) {
    return htmlPage(
      "Open from Shopify Admin",
      `
        <p class="muted">
          This page must be opened from inside Shopify Admin (so we get the <code>shop</code> param).
        </p>
        <p>
          Go back to Shopify Admin and open the app from <strong>Apps → Attribix</strong>.
        </p>
      `
    );
  }

  // If we're already in embedded context, we can optionally send people to /app first
  // (this avoids a "blank page" perception if the OAuth helper throws)
  // NOTE: We only do this if host+embedded are present.
  if (host && embedded === "1") {
    // If you want to ensure embedded shell loads first, uncomment this:
    // return redirect(`/app?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}&embedded=1`);
  }

  // Prefer new helper if available, fall back to authenticate.admin on older builds
  const anyShopify = shopify as any;

  try {
    if (typeof anyShopify.login === "function") {
      return anyShopify.login(request);
    }
    // Old API: calling authenticate.admin on login path kicks off OAuth
    return anyShopify.authenticate.admin(request);
  } catch (err: any) {
    const message =
      typeof err?.message === "string" ? err.message : "Unknown error starting Shopify OAuth";

    // ✅ No more white screen: show a useful page.
    return htmlPage(
      "Login error",
      `
        <p><strong>Could not start Shopify login.</strong></p>
        <p class="muted">Error:</p>
        <p><code>${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></p>
        <p class="muted">
          Try opening the app again from Shopify Admin: <strong>Apps → Attribix</strong>.
        </p>
        ${
          host
            ? `<p><a href="/app?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(
                host
              )}&embedded=1">Go back to app</a></p>`
            : ""
        }
      `
    );
  }
}

// Some Shopify flows POST to /auth/login as well
export const action = loader;

// No UI
export default function AuthLogin() {
  return null;
}

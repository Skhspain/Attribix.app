// app/routes/auth.session-token.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import React from "react";

/**
 * This route is used by Shopify App Bridge to fetch a session token (JWT)
 * and then reload the app back into the embedded context.
 *
 * We return a small HTML/JS page that forces a top-level navigation to the
 * provided shopify-reload URL (or fallback to /app).
 */

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Shopify sends this when it wants us to reload back into embedded context
  const reload =
    url.searchParams.get("shopify-reload") ||
    url.searchParams.get("returnTo") ||
    "/app";

  return json({ reload });
}

export default function AuthSessionToken() {
  const { reload } = useLoaderData<typeof loader>();

  React.useEffect(() => {
    // Break out of iframe and reload top-level
    if (typeof window === "undefined") return;

    // App Bridge-compatible top-level redirect. Using window.open with _top
    // target works even when third-party cookies are blocked, which direct
    // topWindow.location.href assignment does not.
    try {
      window.open(reload, "_top");
    } catch {
      window.location.href = reload;
    }
  }, [reload]);

  // No UI needed
  return null;
}

// app/routes/auth.callback.tsx
import { redirect, json, type LoaderFunctionArgs } from "@remix-run/node";
import shopify from "~/shopify.server";

// OPTIONAL: if you want to register webhooks right after install, import here.
// import { registerWebhooks } from "~/utils/webhooks.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const anyShopify = shopify as any;

  // Handle both API surfaces:
  // - New: shopify.callback(request)
  // - Old: shopify.authenticate.admin(request) (returns { admin, session })
  let session: any;

  if (typeof anyShopify.callback === "function") {
    const result = await anyShopify.callback(request);
    // result: { session, shop, isOnline } in new helper
    session = result?.session ?? result;
  } else if (anyShopify.authenticate?.admin) {
    const result = await anyShopify.authenticate.admin(request);
    // result: { admin, payload?, session? } – keep session if present
    session = result?.session;
  } else {
    // Nothing matched: hard fail with detail for logs
    throw json(
      { error: "No compatible Shopify auth handler found (callback/admin)." },
      { status: 500 }
    );
  }

  if (!session) {
    // Defensive: make it obvious in logs if the session didn’t come back
    throw json({ error: "Auth callback returned no session" }, { status: 500 });
  }

  // Optional: do any after-install work here
  // try {
  //   await registerWebhooks(session);
  // } catch (err) {
  //   console.warn("[webhooks] registration failed:", err);
  // }

  // Send merchant into your embedded app UI
  return redirect("/app");
}

export default function AuthCallback() {
  return null;
}

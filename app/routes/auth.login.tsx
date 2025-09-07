// app/routes/auth.login.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import shopify from "~/shopify.server";

// Start OAuth from /auth/login
export async function loader({ request }: LoaderFunctionArgs) {
  // Prefer new helper if available, fall back to authenticate.admin on older builds
  const anyShopify = shopify as any;
  if (typeof anyShopify.login === "function") {
    return anyShopify.login(request);
  }
  // Old API: calling authenticate.admin on login path kicks off OAuth
  return anyShopify.authenticate.admin(request);
}

// Some Shopify flows POST to /auth/login as well
export const action = loader;

// No UI
export default function AuthLogin() {
  return null;
}

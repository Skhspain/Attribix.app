// app/routes/auth.login/route.jsx

import shopify from "~/shopify.server";

/**
 * This route is used by Shopify's embedded auth flow.
 * We must return the result of `shopify.login(request)` directly so that
 * Shopify can handle redirects and frame-busting correctly.
 */

export async function loader({ request }) {
  return shopify.login(request);
}

export async function action({ request }) {
  return shopify.login(request);
}

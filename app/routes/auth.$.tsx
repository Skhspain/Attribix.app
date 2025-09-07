// app/routes/auth.$.tsx
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import shopify from "~/shopify.server";

// Handles the OAuth callback + any follow-up requests.
// Export both in case Shopify calls POST.
export async function loader({ request }: LoaderFunctionArgs) {
  return shopify.authenticate.admin(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return shopify.authenticate.admin(request);
}

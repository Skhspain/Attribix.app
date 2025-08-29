import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { shopify } from "~/shopify.server";

/**
 * Handles Shopify's OAuth callback and then redirects into your app.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { redirect } = await shopify.authenticate.callback(request);
  return redirect;
}

export async function action({ request }: ActionFunctionArgs) {
  const { redirect } = await shopify.authenticate.callback(request);
  return redirect;
}

export default function AuthCallback() {
  return null;
}

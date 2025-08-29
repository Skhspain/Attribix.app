import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { shopify } from "~/shopify.server";

/**
 * Kicks off OAuth (or redirects to the app if already installed).
 * You can POST to this route from your index page, or just hit it directly.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { redirect } = await shopify.authenticate.public(request);
  return redirect;
}

export async function action({ request }: ActionFunctionArgs) {
  const { redirect } = await shopify.authenticate.public(request);
  return redirect;
}

// No UI needed here – the loader/action will redirect.
export default function AuthLogin() {
  return null;
}

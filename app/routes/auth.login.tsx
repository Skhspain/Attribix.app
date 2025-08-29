import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import shopify from "~/shopify.server";

// /auth/login starts the OAuth flow
export async function loader({ request }: LoaderFunctionArgs) {
  return shopify.login(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return shopify.login(request);
}

// No UI
export default function AuthLogin() {
  return null;
}

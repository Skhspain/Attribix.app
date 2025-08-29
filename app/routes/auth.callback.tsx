import type { LoaderFunctionArgs } from "@remix-run/node";
import shopify from "~/shopify.server";

// Finishes OAuth
export async function loader({ request }: LoaderFunctionArgs) {
  return shopify.authenticate.admin(request);
}

export default function AuthCallback() {
  return null;
}

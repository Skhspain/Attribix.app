import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Handles /auth and any /auth/* (including /auth/callback)
export async function loader({ request }: LoaderFunctionArgs) {
  // This will begin OAuth when needed OR handle the callback when Shopify calls back
  return authenticate.admin(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return authenticate.admin(request);
}

export default function AuthBoundary() {
  return null;
}

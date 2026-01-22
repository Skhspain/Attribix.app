import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

// Shopify will POST webhooks here
export async function action({ request }: ActionFunctionArgs) {
  // Verify HMAC + parse webhook
  await authenticate.webhook(request);
  return new Response("ok", { status: 200 });
}

// Optional: block GET requests
export async function loader({}: LoaderFunctionArgs) {
  return new Response("Method Not Allowed", { status: 405 });
}

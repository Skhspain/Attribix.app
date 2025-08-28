import { authenticate } from "~/shopify.server";

// JS users: change signature to `export const action = async ({ request }) => {`
export const action = async ({ request }: { request: Request }) => {
  // Verifies HMAC & parses headers (gives you {topic, shop} if needed)
  await authenticate.webhook(request);

  // If you need to queue redaction work, do it here.
  return new Response("OK");
};

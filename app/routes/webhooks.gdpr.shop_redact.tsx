import { authenticate } from "~/shopify.server";

// JS users: `export const action = async ({ request }) => {`
export const action = async ({ request }: { request: Request }) => {
  await authenticate.webhook(request);
  return new Response("OK");
};

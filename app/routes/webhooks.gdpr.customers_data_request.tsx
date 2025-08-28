import { authenticate } from "~/shopify.server";

// JS users: `export const action = async ({ request }) => {`
export const action = async ({ request }: { request: Request }) => {
  await authenticate.webhook(request);

  // Optionally enqueue a data export task here.
  return new Response("OK");
};

// app/routes/webhooks.app.scopes_update.jsx
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log("[webhook] scopes_update", { shop, topic });
  return new Response("OK");
};

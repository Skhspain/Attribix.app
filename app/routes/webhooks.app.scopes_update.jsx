// app/routes/webhooks.app.scopes_update.jsx
import shopify from "../shopify.server";

export const action = async ({ request }) => {
  await shopify.authenticate.webhook(request);
  return new Response(null, { status: 200 });
};

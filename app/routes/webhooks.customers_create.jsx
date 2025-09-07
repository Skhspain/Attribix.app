// app/routes/webhooks.customers_create.jsx
import shopify from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await shopify.authenticate.webhook(request);
  // TODO: handle payload
  return new Response(JSON.stringify({ ok: true, topic, shop }), {
    headers: { "content-type": "application/json" },
  });
};

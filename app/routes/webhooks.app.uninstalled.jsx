// app/routes/webhooks.app.uninstalled.jsx
import shopify from "../shopify.server";

export const action = async ({ request }) => {
  const { shop /*, payload */ } = await shopify.authenticate.webhook(request);
  // TODO: clean up sessions/data for `shop` if desired
  return new Response(null, { status: 200 });
};

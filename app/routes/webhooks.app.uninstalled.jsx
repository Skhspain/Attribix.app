import { authenticate } from "~/shopify.server";
import db from "~/utils/db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // session may already be gone; delete by shop just in case
  try {
    await db.session.deleteMany({ where: { shop } });
  } catch (e) {
    console.warn("Session cleanup warning:", e?.message);
  }
  return new Response();
};

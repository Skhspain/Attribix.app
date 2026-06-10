// app/routes/app.integrations._index.jsx
// Redirect /app/integrations → /app/integrations/meta (the first tab).
// Without this file, navigating to /integrations renders a blank page because
// only child routes (meta, google, tiktok) exist — no index route.
import { redirect } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export async function loader({ request }) {
  await authenticate.admin(request);
  return redirect("/app/integrations/meta");
}

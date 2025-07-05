// app/routes/api.settings.tracking.jsx
import { json } from "@remix-run/node";

let settings = {
  pixelId: "",
  enabled: false,
};

/** 
 * GET  /api/settings/tracking
 */
export async function loader() {
  return json(settings);
}

/** 
 * POST /api/settings/tracking
 */
export async function action({ request }) {
  const data = await request.json();
  settings.pixelId = data.pixelId ?? "";
  settings.enabled = data.enabled ?? false;
  return json({ success: true });
}
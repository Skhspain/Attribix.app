// app/routes/api/settings/tracking.jsx
import { json } from "@remix-run/node";

// In-memory store for demo purposes.
// Swap this out for a real database if you like.
let settings = {
  pixelId: "",
  enabled: false,
};

export const loader = () => {
  // GET  /api/settings/tracking
  return json(settings);
};

export const action = async ({ request }) => {
  // POST /api/settings/tracking
  const data = await request.json();
  settings.pixelId = data.pixelId ?? "";
  settings.enabled = data.enabled ?? false;
  return json({ success: true });
};

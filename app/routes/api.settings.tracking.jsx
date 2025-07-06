// app/routes/api.settings.tracking.jsx
import { json } from "@remix-run/node";

// In-memory demo store (swap for Prisma/etc later)
let settings = {
  pixelId: "",
  enabled: false,
};

export const loader = () => {
  // GET /api/settings/tracking
  return json(settings);
};

export const action = async ({ request }) => {
  // POST /api/settings/tracking
  const data = await request.json();
  settings.pixelId = data.pixelId || "";
  settings.enabled = !!data.enabled;
  return json({ success: true });
};

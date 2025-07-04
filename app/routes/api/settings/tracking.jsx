import { json } from "@remix-run/node";

let settings = {
  pixelId: "",
  enabled: false,
};

export const loader = async () => {
  return json(settings);
};

export const action = async ({ request }) => {
  const data = await request.json();
  settings.pixelId = data.pixelId || "";
  settings.enabled = data.enabled || false;
  return json({ success: true });
};
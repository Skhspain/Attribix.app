import { json } from "@remix-run/node";

let settings = { pixelId: "", enabled: false };

export const loader = () => json(settings);

export const action = async ({ request }) => {
  const data = await request.json();
  settings = {
    pixelId: data.pixelId || "",
    enabled: !!data.enabled,
  };
  return json({ success: true });
};
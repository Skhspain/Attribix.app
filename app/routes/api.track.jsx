// app/routes/api.track.jsx
import { json } from "@remix-run/node";

export const action = async ({ request }) => {
  try {
    const form = await request.formData();
    const event = form.get("event") || "unknown";
    const payload = Object.fromEntries(form.entries());
    // TODO: Persist to Prisma if/when you want
    return json({ ok: true, event, payload });
  } catch {
    return json({ ok: false }, { status: 400 });
  }
};

export default function Route() {
  return null;
}

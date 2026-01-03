import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  try {
    return json({ ok: true });
  } catch {
    return json({ ok: true });
  }
}

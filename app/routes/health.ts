// app/routes/health.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export async function loader(_args: LoaderFunctionArgs) {
  return json({ status: "ok" });
}

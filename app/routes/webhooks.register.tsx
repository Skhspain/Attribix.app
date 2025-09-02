import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_args: LoaderFunctionArgs) =>
  new Response(null, { status: 204 });

export default function RegisterWebhooks() {
  return null;
}

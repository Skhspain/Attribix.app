import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return json({
    ok: true,
    now: new Date().toISOString(),
    host: url.host,
    path: url.pathname,
  });
}

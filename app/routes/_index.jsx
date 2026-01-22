// app/routes/_index.jsx
import { redirect } from "@remix-run/node";

export async function loader({ request }) {
  // Keep Shopify query params (shop, host, etc.)
  const url = new URL(request.url);
  const qs = url.search ? url.search : "";

  // Always send embedded entrypoint to /app
  return redirect(`/app${qs}`);
}

export default function Index() {
  return null;
}

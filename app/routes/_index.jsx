// app/routes/_index.jsx
import { redirect } from "@remix-run/node";
import { useFetcher, useSearchParams } from "@remix-run/react";

export async function loader({ request }) {
  const url = new URL(request.url);
  // If Admin is embedding us, send the iframe to /app which handles embedded auth
  if (url.searchParams.get("embedded") === "1") {
    const shop = url.searchParams.get("shop");
    const qs = shop ? `?shop=${encodeURIComponent(shop)}&embedded=1` : "?embedded=1";
    return redirect(`/app${qs}`);
  }
  return null;
}

export default function PublicLanding() {
  const [params] = useSearchParams();
  const fetcher = useFetcher();
  const shopParam = params.get("shop") ?? "";

  // Public login form triggers the POST /auth/login flow (safe for top-level, non-embedded use)
  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <input
        id="shop"
        defaultValue={shopParam}
        placeholder="my-shop-domain.myshopify.com"
        style={{ padding: 6, marginRight: 8, width: 280 }}
      />
      <fetcher.Form method="post" action="/auth/login" style={{ display: "inline" }}>
        <input type="hidden" name="shop" value={shopParam} />
        <button type="submit">Log in</button>
      </fetcher.Form>
    </div>
  );
}

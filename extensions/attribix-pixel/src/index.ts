import { register } from "@shopify/web-pixels-extension";

export default register(({ analytics }) => {
  const ENDPOINT = "https://attribix-app.fly.dev/api/track";

  const post = async (type: string, event: unknown) => {
    try {
      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, event }),
      });
    } catch {
      // ignore client-side network errors
    }
  };

  // Forward full event objects (avoids typing mismatches)
  analytics.subscribe("page_viewed",      (event) => post("page_viewed", event));
  analytics.subscribe("product_viewed",   (event) => post("product_viewed", event));
  analytics.subscribe("collection_viewed",(event) => post("collection_viewed", event));
  analytics.subscribe("search_submitted", (event) => post("search_submitted", event));
  analytics.subscribe("checkout_started", (event) => post("checkout_started", event));
});

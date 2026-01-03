import { useEffect } from "react";

type TrackPayload = {
  event: string;
  payload: Record<string, unknown>;
};

export default function Tracking() {
  useEffect(() => {
    const body: TrackPayload = {
      event: "page_view",
      payload: {
        url: window.location.href,
        path: window.location.pathname + window.location.search,
        href: window.location.href,
        userAgent: window.navigator.userAgent,
        timestamp: Date.now(),
      },
    };

    // Fire-and-forget; blokker ikke navigasjon
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  }, []);

  return null;
}

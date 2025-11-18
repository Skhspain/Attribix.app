import { useEffect } from "react";

type Payload = {
  event: string;
  path: string;
  href: string;
  ts: string; // send as string for URLSearchParams
};

export default function Tracking() {
  useEffect(() => {
    const payload: Payload = {
      event: "page_view",
      path: window.location.pathname + window.location.search,
      href: window.location.href,
      ts: String(Date.now()),
    };

    // Fire-and-forget; don’t block navigation
    fetch("/api/track", {
      method: "POST",
      body: new URLSearchParams(payload as Record<string, string>),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      keepalive: true,
    }).catch(() => {});
  }, []);

  return null;
}

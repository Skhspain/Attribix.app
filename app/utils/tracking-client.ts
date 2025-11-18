// app/utils/tracking-client.ts
export type TrackPayload = Record<string, unknown>;

export async function track(event: string, payload: TrackPayload = {}) {
  try {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
      credentials: "same-origin",
    });
  } catch {
    // ignore network errors — never crash UI because of tracking
  }
}

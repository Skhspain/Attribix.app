// app/utils/tracking.js
export async function trigger(eventName, data = {}) {
  try {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventName,
        data,
        timestamp: Date.now(),
      }),
    });
  } catch (err) {
    console.error("Tracking error:", err);
  }
}

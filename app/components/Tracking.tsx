import { useEffect } from "react";

const Tracking = {
  trigger: async (eventName: string, data: Record<string, unknown> = {}) => {
    try {
      await fetch("/api/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: eventName,
          data,
          timestamp: Date.now(),
        }),
      });
    } catch (err) {
      console.error("Tracking error:", err);
    }
  },
};

export default Tracking;
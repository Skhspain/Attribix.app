// app/components/Tracking.tsx
import { useEffect } from "react";
import { trigger } from "../utils/tracking";

export default function TrackingInit() {
  useEffect(() => {
    // Fire a simple event on mount so you can verify tracking is working
    trigger("app_loaded");
  }, []);

  return null;
}

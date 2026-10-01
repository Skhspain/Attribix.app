// The report period the merchant picked, shared by every report page so
// switching pages doesn't jump between 7 and 30 days. Defaults to 30 days
// (what Overview and Customer journeys show). Stored per browser only.
import { useCallback, useEffect, useState } from "react";

const KEY = "attribix.reportPeriod";
const DEFAULT = "30";

export function useReportPeriod<T extends string>(allowed: readonly T[]): [T, (p: T) => void] {
  const fallback = (allowed.includes(DEFAULT as T) ? DEFAULT : allowed[0]) as T;
  const [period, setPeriodState] = useState<T>(fallback);

  // Read after mount so server and first client render match.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY) as T | null;
      if (saved && allowed.includes(saved)) setPeriodState(saved);
    } catch {
      // Storage unavailable (private mode etc.): keep the default.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPeriod = useCallback((p: T) => {
    setPeriodState(p);
    try { window.localStorage.setItem(KEY, p); } catch { /* ignore */ }
  }, []);

  return [period, setPeriod];
}

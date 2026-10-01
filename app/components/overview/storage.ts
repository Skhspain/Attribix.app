// Per-browser memory for Overview: dismissed cards, tools set aside, whether
// the tour was seen, tips on/off. Never needed for the numbers to be right, so
// any storage failure (private mode, blocked storage) just falls back to defaults.
import { useCallback, useEffect, useState } from "react";

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/** A stored value, read after mount so server and first client render match. */
export function useStored<T>(key: string, fallback: T): [T, (v: T) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setValue(readStored(key, fallback));
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((v: T) => { setValue(v); writeStored(key, v); }, [key]);
  return [value, set, loaded];
}

export const VISITED_TOOLS_KEY = "attribix.visitedTools";

/** Called by the app layout on every page change, so Overview knows which tools were opened. */
export function rememberVisitedPath(pathname: string) {
  const visited = readStored<string[]>(VISITED_TOOLS_KEY, []);
  const tool = pathname.replace(/\/+$/, "").split("/").slice(0, 3).join("/");
  if (!tool.startsWith("/app/") || visited.includes(tool)) return;
  writeStored(VISITED_TOOLS_KEY, [...visited, tool].slice(-50));
}

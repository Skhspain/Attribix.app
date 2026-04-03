export function getOrCreateVisitorId(): string {
  try {
    const key = "attribix_visitor_id";
    let id = window.localStorage.getItem(key);

    if (!id) {
      id = "v_" + crypto.randomUUID();
      window.localStorage.setItem(key, id);
    }

    return id;
  } catch {
    return "v_fallback_" + Math.random().toString(36).slice(2);
  }
}

export function getOrCreateSessionId(): string {
  try {
    const key = "attribix_session_id";
    let id = window.sessionStorage.getItem(key);

    if (!id) {
      id = "s_" + crypto.randomUUID();
      window.sessionStorage.setItem(key, id);
    }

    return id;
  } catch {
    return "s_fallback_" + Math.random().toString(36).slice(2);
  }
}

export function setSessionId(sessionId: string) {
  try {
    window.sessionStorage.setItem("attribix_session_id", sessionId);
  } catch {}
}
// app/utils/log.server.ts
import crypto from "crypto";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLevel(): LogLevel {
  const raw = String(process.env.LOG_LEVEL || "").toLowerCase().trim();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel) {
  return LEVELS[level] >= LEVELS[envLevel()];
}

function nowIso() {
  return new Date().toISOString();
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}

/**
 * Redact secrets + PII-ish fields from objects before logging.
 * - Removes access tokens, auth headers, cookies, secrets, etc.
 * - Removes direct customer identifiers (email, phone, address, names)
 * - Keeps non-sensitive debug fields
 */
export function redactDeep(input: any, depth = 0): any {
  if (input == null) return input;
  if (depth > 6) return "[max-depth]";

  if (typeof input === "string") {
    // Hide long token-like strings
    if (input.length > 80) return "***redacted***";
    return input;
  }

  if (typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input.slice(0, 20).map((v) => redactDeep(v, depth + 1));
  }

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    const key = k.toLowerCase();

    // Hard-redact secrets
    if (
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("password") ||
      key.includes("authorization") ||
      key.includes("cookie") ||
      key.includes("session") ||
      key.includes("hmac") ||
      key.includes("signature") ||
      key === "access_token"
    ) {
      out[k] = "***redacted***";
      continue;
    }

    // Hard-redact customer PII fields (raw)
    if (
      key === "email" ||
      key === "phone" ||
      key.includes("address") ||
      key.includes("firstname") ||
      key.includes("lastname") ||
      key.includes("name") ||
      key.includes("city") ||
      key.includes("zip") ||
      key.includes("postal") ||
      key.includes("province") ||
      key.includes("country")
    ) {
      out[k] = "***redacted***";
      continue;
    }

    // Meta CAPI user_data can contain identifiers (even hashed) – don’t log it.
    if (key === "user_data") {
      out[k] = "***redacted***";
      continue;
    }

    out[k] = redactDeep(v, depth + 1);
  }
  return out;
}

/**
 * Create a stable, non-reversible “fingerprint” for correlation without leaking.
 * Useful to correlate a specific order/customer across logs without storing PII.
 */
export function fingerprint(value?: string | null) {
  if (!value) return undefined;
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 12);
}

function baseLine(level: LogLevel, msg: string, data?: unknown) {
  const line = {
    ts: nowIso(),
    level,
    msg,
    ...(data !== undefined ? { data: redactDeep(data) } : {}),
  };
  return safeJson(line);
}

export function logDebug(msg: string, data?: unknown) {
  if (!shouldLog("debug")) return;
  console.log(baseLine("debug", msg, data));
}

export function logInfo(msg: string, data?: unknown) {
  if (!shouldLog("info")) return;
  console.log(baseLine("info", msg, data));
}

export function logWarn(msg: string, data?: unknown) {
  if (!shouldLog("warn")) return;
  console.warn(baseLine("warn", msg, data));
}

export function logError(msg: string, data?: unknown) {
  if (!shouldLog("error")) return;
  console.error(baseLine("error", msg, data));
}

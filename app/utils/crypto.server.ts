import crypto from "crypto";

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input.trim().toLowerCase()).digest("hex");
}

// Normalize E.164-ish then hash
export function hashPhone(phone?: string | null) {
  if (!phone) return null;
  const justDigits = phone.replace(/[^\d]/g, "");
  return sha256(justDigits);
}

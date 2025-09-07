// app/utils/crypto.server.ts
import crypto from "node:crypto";

export function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function hmacSHA256Hex(secret: string, payload: string) {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

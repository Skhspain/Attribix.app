// app/utils/tracking.server.ts
import { sha256Hex } from "./crypto.server";

export type ServerTrackInput = {
  name: string;
  email?: string;
  fbp?: string;
  fbc?: string;
  url?: string;
  referrer?: string;
  [k: string]: unknown;
};

export async function serverTrack(input: ServerTrackInput) {
  const payload = {
    ...input,
    emailHash: input.email
      ? sha256Hex(input.email.trim().toLowerCase())
      : undefined,
    ts: Date.now()
  };

  // For now just log; you can persist to Prisma later.
  console.log("[track]", payload.name, payload);

  return { ok: true };
}

export default serverTrack;

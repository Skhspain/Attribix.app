// app/services/resend-api.server.ts
// Resend REST API client for domain management.
// Uses RESEND_API_KEY env var (falls back to SMTP_PASS which is the same key when using Resend SMTP).

const BASE = "https://api.resend.com";

function getApiKey(): string {
  return process.env.RESEND_API_KEY || process.env.SMTP_PASS || "";
}

async function resendFetch(path: string, options: RequestInit = {}) {
  const key = getApiKey();
  if (!key) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json };
}

export type ResendDomainRecord = {
  record: string;      // "SPF" | "DKIM" | "DMARC" | "MX"
  name: string;        // DNS name/host
  type: string;        // "TXT" | "MX" | "CNAME"
  ttl: string;
  status: string;      // "not_started" | "pending" | "verified" | "failed"
  value: string;
  priority?: number;
};

export type ResendDomain = {
  id: string;
  name: string;
  status: string;      // "not_started" | "pending" | "verified" | "failed"
  records: ResendDomainRecord[];
  createdAt: string;
};

export async function createResendDomain(name: string): Promise<
  { ok: true; domain: ResendDomain } | { ok: false; error: string }
> {
  try {
    const { ok, data } = await resendFetch("/domains", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!ok) return { ok: false, error: data?.message ?? data?.name ?? "Failed to create domain" };
    return { ok: true, domain: data as ResendDomain };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function getResendDomain(id: string): Promise<
  { ok: true; domain: ResendDomain } | { ok: false; error: string }
> {
  try {
    const { ok, data } = await resendFetch(`/domains/${id}`);
    if (!ok) return { ok: false, error: data?.message ?? "Domain not found" };
    return { ok: true, domain: data as ResendDomain };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function verifyResendDomain(id: string): Promise<
  { ok: true; domain: ResendDomain } | { ok: false; error: string }
> {
  try {
    // Trigger verification check
    await resendFetch(`/domains/${id}/verify`, { method: "POST" });
    // Then fetch updated status
    return getResendDomain(id);
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function deleteResendDomain(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { ok, data } = await resendFetch(`/domains/${id}`, { method: "DELETE" });
    if (!ok) return { ok: false, error: data?.message ?? "Failed to delete domain" };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

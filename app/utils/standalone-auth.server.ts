// app/utils/standalone-auth.server.ts
// Verifies Clerk JWTs for standalone dashboard API requests.

import { db } from "~/db.server";

const CLERK_JWKS_URL = process.env.CLERK_JWKS_URL || "";
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "";

let cachedJwks: any = null;
let jwksCachedAt = 0;
const JWKS_CACHE_MS = 60 * 60 * 1000; // 1 hour

async function getJwks() {
  if (cachedJwks && Date.now() - jwksCachedAt < JWKS_CACHE_MS) return cachedJwks;

  // Derive JWKS URL from the publishable key domain or use env var
  let jwksUrl = CLERK_JWKS_URL;
  if (!jwksUrl) {
    // Fallback: use Clerk's backend API
    const res = await fetch("https://api.clerk.com/v1/jwks", {
      headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
    });
    if (!res.ok) throw new Error("Failed to fetch JWKS from Clerk");
    cachedJwks = await res.json();
    jwksCachedAt = Date.now();
    return cachedJwks;
  }

  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error("Failed to fetch JWKS");
  cachedJwks = await res.json();
  jwksCachedAt = Date.now();
  return cachedJwks;
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJwtPayload(token: string): any {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
}

async function importJwk(jwk: any): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

async function verifyJwt(token: string): Promise<any> {
  const jwks = await getJwks();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  const kid = header.kid;

  const key = (jwks.keys || []).find((k: any) => k.kid === kid);
  if (!key) throw new Error("No matching key found in JWKS");

  const cryptoKey = await importJwk(key);
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);

  const sigBuffer = new Uint8Array(signature).buffer;
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sigBuffer, data);
  if (!valid) throw new Error("Invalid JWT signature");

  const payload = decodeJwtPayload(token);

  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("JWT expired");
  }

  return payload;
}

export type StandaloneAuth = {
  clerkUserId: string;
  email: string | null;
  orgId: string;
  shops: string[];
  accountId: string;
};

/**
 * Authenticate a standalone dashboard API request.
 * Extracts Bearer token, verifies with Clerk, resolves org + shops.
 */
export async function authenticateStandalone(request: Request): Promise<StandaloneAuth> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7);

  let payload: any;
  try {
    payload = await verifyJwt(token);
  } catch (err: any) {
    throw new Response(JSON.stringify({ error: "Invalid token", detail: err.message }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clerkUserId = payload.sub;
  const email =
    payload.email_addresses?.[0]?.email_address ||
    payload.email ||
    payload.primary_email_address ||
    null;

  // Find or create Org for this Clerk user
  let org = await db.org.findFirst({ where: { clerkUserId } });

  if (!org) {
    org = await db.org.create({
      data: {
        name: email ? email.split("@")[0] : "My Org",
        ownerEmail: email || "unknown",
        clerkUserId,
      },
    });
  }

  // Get linked shops
  const orgStores = await db.orgStore.findMany({
    where: { orgId: org.id },
    select: { shop: true },
  });

  const shops = orgStores.map((s) => s.shop);

  return {
    clerkUserId,
    email,
    orgId: org.id,
    shops,
    accountId: org.id,
  };
}

/**
 * CORS helper for standalone API routes.
 */
export function standaloneCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");

  const allowedOrigins = [
    "https://attribix.app",
    "https://www.attribix.app",
    "https://attribix.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  } else {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigins[0]);
  }

  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}

export function standaloneOptions(request: Request): Response | null {
  if (request.method.toUpperCase() === "OPTIONS") {
    return standaloneCors(request, new Response(null, { status: 204 }));
  }
  return null;
}

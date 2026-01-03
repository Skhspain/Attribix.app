// app/routes/api.facebook.connect.ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";

// Shared secret – must match REPORTS_API_KEY on Fly
const EXPECTED_KEY = process.env.REPORTS_API_KEY ?? "attribix-super-secret-KEY-987asf987asf";

// Optional loader so hitting this in the browser doesn't explode
export async function loader(_args: LoaderFunctionArgs) {
  return json(
    {
      ok: true,
      message:
        "Attribix Facebook connect endpoint. Use POST with header `x-attribix-key` and body { accessToken }.",
    },
    { status: 200 }
  );
}

// This is what your Next.js site calls with POST
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // 1) Simple auth using header
  const providedKey = request.headers.get("x-attribix-key");
  if (!providedKey || providedKey !== EXPECTED_KEY) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) Parse JSON body
  let payload: {
    accessToken?: string;
    fbUserId?: string;
    shopId?: string;
    accountsJson?: unknown;
  };

  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { accessToken, accountsJson } = payload;

  if (!accessToken) {
    return json({ error: "Missing accessToken" }, { status: 400 });
  }

  // 3) Store/update in Prisma
  try {
    const existing = await prisma.facebookConnection.findFirst();

    if (existing) {
      await prisma.facebookConnection.update({
        where: { id: existing.id },
        data: {
          accessToken,
          accountsJson: accountsJson as any,
        },
      });
    } else {
      await prisma.facebookConnection.create({
        data: {
          accessToken,
          accountsJson: accountsJson as any,
        },
      });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("Error saving Facebook connection:", err);
    return json({ error: "Failed to store connection" }, { status: 500 });
  }
}

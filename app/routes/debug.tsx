// app/routes/debug.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// Hvis noen går til /debug, send dem videre til /app/debug
export async function loader({}: LoaderFunctionArgs) {
  return redirect("/app/debug");
}

// Blir aldri rendret, fordi loader alltid redirecter
export default function DebugRedirect() {
  return null;
}

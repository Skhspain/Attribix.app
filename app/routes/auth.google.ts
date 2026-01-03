// app/routes/auth.google.ts
import { redirect } from "@remix-run/node";
import { buildGoogleAuthUrl } from "../utils/googleAuth.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);

  // Optional: pass shop so we can return user to correct embedded admin view
  const shop = url.searchParams.get("shop") || "";
  const returnTo = url.searchParams.get("returnTo") || "/app";

  const authUrl = buildGoogleAuthUrl({ shop, returnTo });
  return redirect(authUrl);
}

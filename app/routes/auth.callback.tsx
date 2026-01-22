// app/routes/auth.callback.tsx
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import shopify from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Complete OAuth and establish session
  await shopify.authenticate.admin(request);

  // After successful auth, send merchant into the embedded app
  return redirect("/app");
}

// app/routes/api.standalone.provision.ts
// Called after signup to get/create the user's org and return their accountId.
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  authenticateStandalone,
  standaloneCors,
  standaloneOptions,
} from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);

  return standaloneCors(
    request,
    json({
      ok: true,
      accountId: auth.accountId,
      orgId: auth.orgId,
      shops: auth.shops,
      email: auth.email,
    })
  );
}

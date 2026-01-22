// app/routes/api.meta.oauth.start.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { getMetaOAuthUrl } from "~/services/metaGraph.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { session } = result;
  const shop = session.shop;

  // simple state token stored in DB via MetaConnection row
  const state = crypto.randomUUID();

  await (db as any).metaConnection.upsert({
    where: { shop },
    create: { shop, accessToken: "__PENDING__", tokenType: null, expiresAt: null, adAccountId: null },
    update: { tokenType: state }, // temporary: store state in tokenType until we store real tokenType
  });

  return redirect(getMetaOAuthUrl(state));
}

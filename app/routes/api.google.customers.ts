import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { listAccessibleCustomers } from "~/services/googleAds.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const customerIds = await listAccessibleCustomers(shop);
  return json({ customerIds });
}

export default function Route() {
  return null;
}

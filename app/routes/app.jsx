// app/routes/app.jsx
import { json } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { Page, Card, BlockStack, Text } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { ensureAttribixWebPixel } from "~/services/webPixel.server";

export async function loader({ request }) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;
  return json({ ok: true });
}

export async function action({ request }) {
  console.log("[webPixel] ACTION START");

  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { admin, session } = result;

  const form = await request.formData();
  const accountID = String(form.get("accountID") || "");

  console.log("[webPixel] FORM DATA", { shop: session.shop, accountID });

  try {
    const res = await ensureAttribixWebPixel(admin, accountID);
    console.log("[webPixel] ENSURE OK");
    return json({ ok: true, res });
  } catch (e) {
    console.log("[webPixel] ENSURE ERROR", e);
    return json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export default function AppLayout() {
  return (
    <Page>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Attribix App
            </Text>
            <Text as="p" tone="subdued">
              Shell loaded. Use routes like <code>/app/analytics</code>.
            </Text>
          </BlockStack>
        </Card>

        <Outlet />
      </BlockStack>
    </Page>
  );
}

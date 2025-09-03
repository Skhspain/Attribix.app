// app/routes/app.jsx
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";

// Loader ensures an Admin session; if missing, it triggers the proper top-level OAuth dance.
export async function loader({ request }) {
  await authenticate.admin(request);
  return json({ ok: true });
}

export default function AppRoute() {
  useLoaderData(); // just to hook loader errors
  return (
    <Page title="Attribix">
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="p">✅ App is embedded and authenticated.</Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

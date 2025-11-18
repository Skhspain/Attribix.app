// app/routes/app.reports.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
} from "@shopify/polaris";

import { authenticate } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // ✅ Verify admin session only – no redirects to admin.shopify.com.
  const { session } = await authenticate.admin(request);

  return json({
    shop: session.shop,
  });
}

export default function ReportsPage() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <Page title="Attribix reports">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Reports
              </Text>
              <Text as="p" variant="bodyMd">
                Reports for <b>{shop}</b> will show here.
              </Text>
              <Text as="p" variant="bodyMd">
                For now, this is just a placeholder so the route loads correctly
                in the embedded app.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  return (
    <Page title="Attribix reports">
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="p" variant="bodyMd">
              Something went wrong loading the reports page.
            </Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

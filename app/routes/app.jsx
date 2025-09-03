// app/routes/app.jsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack, InlineGrid } from "@shopify/polaris";
import { authenticate, shopify } from "../shopify.server";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  // Basic shop info from GraphQL
  const gqlRes = await admin.graphql(`
    query ShopInfo {
      shop {
        name
        myshopifyDomain
        email
        primaryDomain { url }
        plan { displayName partnerDevelopment }
      }
    }
  `);
  const { data } = await gqlRes.json();

  // Counts via REST
  const rest = new shopify.clients.Rest({ session });
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [productsCount, customersCount, ordersWeek] = await Promise.all([
    rest.get({ path: "products/count.json" }).then(r => r.body?.count ?? 0).catch(() => 0),
    rest.get({ path: "customers/count.json" }).then(r => r.body?.count ?? 0).catch(() => 0),
    rest.get({
      path: "orders/count.json",
      query: { status: "any", created_at_min: sevenDaysAgo },
    }).then(r => r.body?.count ?? 0).catch(() => 0),
  ]);

  return json({
    shop: {
      name: data?.shop?.name ?? session.shop,
      domain: data?.shop?.primaryDomain?.url ?? `https://${session.shop}`,
      myshopifyDomain: data?.shop?.myshopifyDomain ?? session.shop,
      email: data?.shop?.email ?? null,
      plan: data?.shop?.plan?.displayName ?? null,
    },
    metrics: { productsCount, customersCount, ordersWeek },
  });
}

export default function AppDashboard() {
  const { shop, metrics } = useLoaderData();

  return (
    <Page title="Attribix">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingLg">Welcome, {shop.name}</Text>
              <Text as="p" variant="bodyMd">
                Store: {shop.myshopifyDomain} • Plan: {shop.plan ?? "—"} • Email: {shop.email ?? "—"}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
            <Stat title="Products" value={metrics.productsCount} />
            <Stat title="Customers" value={metrics.customersCount} />
            <Stat title="Orders (7d)" value={metrics.ordersWeek} />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Next steps</Text>
              <Text as="p">This is a starter dashboard. Add your KPIs or actions here.</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function Stat({ title, value }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">{title}</Text>
        <Text as="h3" variant="heading2xl">{value}</Text>
      </BlockStack>
    </Card>
  );
}

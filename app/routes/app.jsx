import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Text, Card, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

function toHost(shop) {
  // Shopify "host" is base64 of `${shop}/admin`
  return Buffer.from(`${shop}/admin`).toString("base64");
}

/**
 * Ensure redirects use the public URL (Fly/Proxy) not the internal URL.
 * This prevents Location: http://... when the real public URL is https://...
 */
function getPublicUrl(request) {
  const url = new URL(request.url);

  const xfProto = request.headers.get("x-forwarded-proto");
  const xfHost = request.headers.get("x-forwarded-host");

  const proto = xfProto?.split(",")[0]?.trim();
  const host = xfHost?.split(",")[0]?.trim();

  if (proto) url.protocol = `${proto}:`;
  if (host) url.host = host;

  return url;
}

export const loader = async ({ request }) => {
  const url = getPublicUrl(request);

  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  // If Shopify hits /app?shop=... without host, generate it and redirect back.
  if (shop && !host) {
    url.searchParams.set("host", toHost(shop));
    throw redirect(url.toString());
  }

  // Still require shop param
  if (!shop) {
    return json(
      {
        ok: false,
        error: "Missing `shop` parameter.",
        hint: "Open from Shopify Admin so the URL includes ?shop=...&host=...",
      },
      { status: 400 }
    );
  }

  // Still require host after the patch (embedded auth expects it)
  if (!url.searchParams.get("host")) {
    return json(
      {
        ok: false,
        error: "Missing `host` parameter.",
        hint:
          "Open from Shopify Admin, or include host=base64(`${shop}/admin`) in the URL.",
      },
      { status: 400 }
    );
  }

  const { session } = await authenticate.admin(request);

  return json({ shop: session.shop });
};

export default function App() {
  const { shop } = useLoaderData();

  return (
    <Page>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  App template
                </Text>
                <Text as="p" variant="bodyMd">
                  Shop: {shop}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

import { Page, Layout, Card, Text, BlockStack, List } from "@shopify/polaris";

export default function AdditionalPage() {
  return (
    <Page title="Additional page">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                This is an additional page.
              </Text>

              <List type="bullet">
                <List.Item>Example item 1</List.Item>
                <List.Item>Example item 2</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

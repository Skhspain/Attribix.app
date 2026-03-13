// app/routes/app._index.jsx
import React from "react";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";

export default function AppIndex() {
  return (
    <Page title="Overview">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Welcome
              </Text>
              <Text as="p" variant="bodyMd">
                Your app is installed and running.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
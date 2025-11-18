import { useState } from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Box,
  Button,
} from "@shopify/polaris";

export default function TrackingWidget() {
  const [sending, setSending] = useState(false);

  const sendTest = async () => {
    try {
      setSending(true);
      await fetch("/api.track", { method: "POST" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Send a test event
          </Text>
          <Text as="p" tone="subdued">
            Fire a quick client + server test event to verify ingestion.
          </Text>
          <InlineStack>
            <Button onClick={sendTest} loading={sending} variant="primary">
              Send test event
            </Button>
          </InlineStack>
        </BlockStack>
      </Box>
    </Card>
  );
}

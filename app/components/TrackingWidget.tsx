// app/components/TrackingWidget.tsx
import * as React from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Box,
} from "@shopify/polaris";

type Props = {
  shopDomain?: string;
};

type Status = "idle" | "sending" | "success" | "error";

export default function TrackingWidget({ shopDomain }: Props) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleSendTest() {
    setStatus("sending");
    setMessage(null);

    try {
      const res = await fetch("/api/debug-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "debug-page-test" }),
      });

      if (!res.ok) {
        setStatus("error");
        setMessage(
          `Request sent, but HTTP status was ${res.status}. Check Fly logs.`
        );
        return;
      }

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // If response is not JSON, we still treat it as success
      }

      if (data && data.ok === true) {
        setStatus("success");
        setMessage(
          "Test event stored. It should appear in the list below in a moment."
        );
      } else {
        setStatus("success");
        setMessage(
          "Request sent. Even if the response body wasn’t perfect, check the event list below."
        );
      }
    } catch (error: any) {
      console.error("Debug test event error:", error);
      setStatus("error");
      setMessage("Request failed. See browser console and Fly logs for details.");
    }
  }

  const tone =
    status === "success" ? "success" : status === "error" ? "critical" : undefined;

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <BlockStack gap="100">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Send a test event
              </Text>
              {shopDomain && (
                <Badge tone="attention" size="small">
                  {shopDomain}
                </Badge>
              )}
            </InlineStack>

            <Text as="p" tone="subdued">
              Fire a quick client → server test event to verify ingestion into Attribix.
            </Text>
          </BlockStack>

          <InlineStack gap="200" align="start">
            <Button onClick={handleSendTest} loading={status === "sending"}>
              Send test event
            </Button>
            {message && (
              <Text as="span" tone={tone}>
                {message}
              </Text>
            )}
          </InlineStack>

          <Text as="p" tone="subdued">
            After a successful request, a <code>debug_test_event</code> should show up
            in “Latest tracked events” below.
          </Text>
        </BlockStack>
      </Box>
    </Card>
  );
}

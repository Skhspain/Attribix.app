// The one set of words every report uses for where orders came from.
import { Text } from "@shopify/polaris";

export const SOURCE_TERMS = {
  attributed: "linked to a channel by an ad click, campaign tags or a referring site",
  direct: "Attribix saw the visit, with no campaign or referrer",
  notTracked: "Attribix never saw the visit, so the source is unknown",
  offline: "draft orders, invoices and POS sales",
};

export function SourceDefinitions() {
  return (
    <Text as="p" variant="bodySm" tone="subdued">
      <strong>Attributed</strong>: {SOURCE_TERMS.attributed}. <strong>Direct</strong>: {SOURCE_TERMS.direct}.{" "}
      <strong>Not tracked</strong>: {SOURCE_TERMS.notTracked}. <strong>Offline</strong>: {SOURCE_TERMS.offline}.{" "}
      Revenue and order totals include every order.
    </Text>
  );
}

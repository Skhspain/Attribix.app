// The small "i" next to a number: what it means and how it's calculated.
import { useState } from "react";
import { BlockStack, Popover, Text } from "@shopify/polaris";

export const GLOSSARY = {
  revenue: {
    title: "Sales",
    body: "The total value of the orders Attribix received in this period, after discounts.",
    note: "Includes every order, whether or not we know where it came from.",
  },
  orders: {
    title: "Orders",
    body: "The number of orders placed in this period.",
    note: "Draft orders, invoices and POS sales count too. They just can't be linked to a channel.",
  },
  roas: {
    title: "ROAS (return on ad spend)",
    body: "Sales ÷ ad spend, as a percentage. 100% means your sales matched what you spent on ads.",
    note: "This uses all sales, not only those from ads, and it's sales, not profit: product costs, shipping and fees aren't subtracted. Many stores aim for 300% or more, depending on their margins.",
  },
  aov: {
    title: "Average order value",
    body: "Sales ÷ orders: how much a customer spends per order.",
    note: "A higher average order makes every krone of ad spend go further.",
  },
} as const;

export function InfoPopover({ term }: { term: keyof typeof GLOSSARY }) {
  const [open, setOpen] = useState(false);
  const g = GLOSSARY[term];
  return (
    <Popover
      active={open}
      onClose={() => setOpen(false)}
      preferredAlignment="left"
      activator={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`What is ${g.title}?`}
          aria-expanded={open}
          style={{
            width: 18, height: 18, borderRadius: "50%", border: "1px solid #d4d4d4", background: "#f7f7f7",
            color: "#616161", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, lineHeight: "16px",
          }}
        >
          i
        </button>
      }
    >
      <div style={{ padding: 14, maxWidth: 300 }}>
        <BlockStack gap="150">
          <Text as="p" variant="headingSm">{g.title}</Text>
          <Text as="p" variant="bodySm">{g.body}</Text>
          <Text as="p" variant="bodySm" tone="subdued">{g.note}</Text>
        </BlockStack>
      </div>
    </Popover>
  );
}

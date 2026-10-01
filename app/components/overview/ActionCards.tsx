// "What to do next" on Overview. The rules live in utils/overviewActions.
import { useState } from "react";
import { useNavigate } from "@remix-run/react";
import { BlockStack, Button, Card, InlineStack, Text } from "@shopify/polaris";
import type { OverviewAction } from "~/utils/overviewActions";
import { useStored } from "./storage";

const CHIP: Record<OverviewAction["kind"], { bg: string; fg: string }> = {
  fix: { bg: "#fde8e6", fg: "#b42318" },
  grow: { bg: "#e3f4ea", fg: "#1a7f4b" },
  data: { bg: "#fdf1d8", fg: "#8a5a00" },
  tool: { bg: "#e8eefb", fg: "#2b59c3" },
};
const SHOWN = 3;

export function ActionCards({ actions, showHints }: { actions: OverviewAction[]; showHints: boolean }) {
  const navigate = useNavigate();
  // Dismissed as id → signature: a card comes back when its numbers change.
  const [dismissed, setDismissed] = useStored<Record<string, string>>("attribix.dismissedActions", {});
  const [why, setWhy] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);

  const open = actions.filter((a) => dismissed[a.id] !== a.signature);
  const visible = showAll ? open : open.slice(0, SHOWN);

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" gap="200">
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">What to do next</Text>
            <Text as="p" variant="bodySm" tone="subdued">Things we noticed in your data, most important first.</Text>
          </BlockStack>
          {open.length > 0 && <Text as="p" variant="bodySm" tone="subdued">{open.length} open</Text>}
        </InlineStack>

        {open.length === 0 ? (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "#f6f7f9" }}>
            <Text as="p" variant="bodySm" tone="subdued">
              Nothing needs your attention right now. We check your campaigns and tracking every day and will list anything worth acting on here.
            </Text>
          </div>
        ) : (
          <BlockStack gap="200">
            {visible.map((a) => (
              <div key={a.id} style={{ border: "1px solid #e3e3e3", borderRadius: 10, padding: "12px 14px" }}>
                <BlockStack gap="150">
                  <InlineStack gap="200" blockAlign="center" wrap>
                    <span style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase",
                      padding: "2px 8px", borderRadius: 999, background: CHIP[a.kind].bg, color: CHIP[a.kind].fg,
                    }}>{a.chip}</span>
                    <Text as="h3" variant="headingSm">{a.title}</Text>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">{a.body}</Text>
                  <InlineStack gap="200" blockAlign="center" wrap>
                    <Button size="slim" variant="primary" onClick={() => navigate(a.cta.url)}>{a.cta.label}</Button>
                    <Button size="slim" onClick={() => setDismissed({ ...dismissed, [a.id]: a.signature })}>Mark as done</Button>
                    <Button size="slim" variant="plain" onClick={() => setWhy({ ...why, [a.id]: !why[a.id] })}>
                      {why[a.id] ? "Hide reason" : "Why am I seeing this?"}
                    </Button>
                  </InlineStack>
                  {why[a.id] && (
                    <div style={{ background: "#f6f7f9", borderRadius: 8, padding: "8px 10px" }}>
                      <Text as="p" variant="bodySm" tone="subdued">{a.why}</Text>
                    </div>
                  )}
                </BlockStack>
              </div>
            ))}
          </BlockStack>
        )}

        {open.length > SHOWN && (
          <InlineStack>
            <Button variant="plain" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : `Show ${open.length - SHOWN} more suggestion${open.length - SHOWN === 1 ? "" : "s"}`}
            </Button>
          </InlineStack>
        )}
        {showHints && open.length > 0 && (
          <Text as="p" variant="bodySm" tone="subdued">
            “Mark as done” hides a card until its numbers change. Every card says why it appeared.
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}

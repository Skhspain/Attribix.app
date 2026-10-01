// "Get more from Attribix": every tool in the plan, untried first, each with a
// short "how it works" so merchants can see what it does before setting it up.
import { useState } from "react";
import { useNavigate } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineStack, Text } from "@shopify/polaris";
import { useStored, VISITED_TOOLS_KEY } from "./storage";

type Tool = {
  id: string; url: string; group: string; icon: string; name: string; outcome: string;
  steps: [string, string, string]; example: string;
};

const TOOLS: Tool[] = [
  { id: "analytics", url: "/app/analytics", group: "Understand your sales", icon: "▤", name: "Analytics",
    outcome: "See which channels and campaigns bring in sales, side by side",
    steps: ["Pick a period at the top.", "Compare sales, ad spend and ROAS for every channel in one table.", "Open a channel or campaign to see the orders behind it."],
    example: "Example: Google Ads brought 18% of sales on 30% of ad spend." },
  { id: "journeys", url: "/app/journey", group: "Understand your sales", icon: "↝", name: "Customer journeys",
    outcome: "See the steps customers took before they bought",
    steps: ["Attribix records the visits a customer makes before an order.", "The page shows the most common paths, like Instagram ad → Google search → purchase.", "Use it to see which channels start sales and which ones finish them."],
    example: "Example: many buyers first came from a Meta ad, then returned through Google search." },
  { id: "meta", url: "/app/meta-ads", group: "Understand your sales", icon: "M", name: "Meta Ads",
    outcome: "Find your best and worst Facebook and Instagram ads",
    steps: ["Connect your Meta ad account once.", "See every ad and campaign with spend, purchases and ROAS.", "Set a target ROAS and see which ads hit it."],
    example: "Example: 3 of your 14 ads bring in most of your Meta sales." },
  { id: "google", url: "/app/google-ads", group: "Understand your sales", icon: "G", name: "Google Ads",
    outcome: "See which Google campaigns pay off",
    steps: ["Connect your Google Ads account once.", "Compare campaigns by spend, conversions and ROAS.", "Check Google's numbers against the orders Attribix tracked."],
    example: "Example: Shopping campaigns at 410% ROAS, Search at 160%." },
  { id: "orders", url: "/app/orders", group: "Understand your sales", icon: "#", name: "Orders",
    outcome: "See where each order came from",
    steps: ["Every order is listed with its source and campaign.", "Filter by channel to see the orders behind a number.", "Open any order in Shopify with one click."],
    example: "Example: an order that came from an Instagram story campaign." },
  { id: "newsletter", url: "/app/newsletter", group: "Sell more to customers you have", icon: "✉", name: "Newsletter",
    outcome: "Email past customers and see the sales each email brings in",
    steps: ["Write an email with the block editor, or start from a template.", "Send it to your subscribers.", "Sales from each email show up in Analytics as Email."],
    example: "Example: a monthly email to everyone who bought in the last year." },
  { id: "leads", url: "/app/leads", group: "Sell more to customers you have", icon: "@", name: "Lead Center",
    outcome: "Keep every lead in one place, from ads, forms and lists",
    steps: ["Sync leads from your Meta lead forms, or import a CSV.", "Connect contact forms like Typeform or Google Forms.", "Follow up, and see when a lead becomes a customer."],
    example: "Example: leads from a Meta lead form, with the ones that became customers marked." },
  { id: "reviews", url: "/app/reviews", group: "Sell more to customers you have", icon: "★", name: "Reviews",
    outcome: "Collect product reviews and show them on your store",
    steps: ["Attribix emails customers after purchase and asks for a review.", "Reviews appear on your product pages, styled to match your store.", "Send them to Google Shopping to get star ratings in search results."],
    example: "Example: a best seller with 9 reviews after its first month." },
  { id: "seo", url: "/app/seo", group: "Get found", icon: "⌕", name: "SEO Audit",
    outcome: "Find and fix what keeps your products from ranking on Google",
    steps: ["Attribix scans your product pages and gives each one a score.", "It lists the issues with the biggest impact first.", "Open a product to see its issues and quick fixes."],
    example: "Example: 12 products with no description, 30 images with no alt text." },
  { id: "feeds", url: "/app/feeds", group: "Get found", icon: "≡", name: "Product feeds",
    outcome: "Get your products and review stars into Google Shopping and Meta",
    steps: ["Attribix creates a product feed URL for your store.", "Add it in Google Merchant Center. Meta accepts the same feed.", "Add the reviews feed to show star ratings in Google Shopping."],
    example: "Example: your whole catalog live in Google Shopping with star ratings." },
];

/** Tools known to be in use from the store's own data (connections, sends, reviews…). */
export type ToolUsage = Partial<Record<string, boolean>>;

export function ToolsCard({ usage, showHints }: { usage: ToolUsage; showHints: boolean }) {
  const navigate = useNavigate();
  const [visited] = useStored<string[]>(VISITED_TOOLS_KEY, []);
  const [hidden, setHidden] = useStored<string[]>("attribix.hiddenTools", []);
  const [showUsed, setShowUsed] = useState(false);
  const [explain, setExplain] = useState<string | null>(null);

  const inUse = (t: Tool) => !!usage[t.id] || visited.includes(t.url);
  const used = TOOLS.filter(inUse).length;
  const visible = TOOLS.filter((t) => (showUsed ? true : !inUse(t)) && !hidden.includes(t.id));
  const groups = [...new Set(TOOLS.map((t) => t.group))];

  return (
    <Card>
      <BlockStack gap="300">
        <BlockStack gap="050">
          <Text as="h2" variant="headingMd">Get more from Attribix</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            You're using {used} of {TOOLS.length} tools in your plan. Click “Show me” to see how any of them works.
          </Text>
        </BlockStack>
        <div style={{ height: 6, borderRadius: 999, background: "#f1f2f4", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(used / TOOLS.length) * 100}%`, background: "#1a7f4b" }} />
        </div>

        {visible.length === 0 && !showUsed && (
          <Text as="p" variant="bodySm" tone="subdued">You've tried every tool. Nice.</Text>
        )}

        {groups.map((g) => {
          const tools = visible.filter((t) => t.group === g);
          if (!tools.length) return null;
          return (
            <BlockStack key={g} gap="200">
              <Text as="h3" variant="headingXs" tone="subdued">{g.toUpperCase()}</Text>
              {tools.map((t) => {
                const using = inUse(t);
                return (
                  <div key={t.id} style={{ border: "1px solid #e3e3e3", borderRadius: 10, padding: "12px 14px", display: "grid", gridTemplateColumns: "36px minmax(0,1fr)", gap: "0 12px" }}>
                    <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 9, background: "#e8eefb", color: "#2b59c3", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 15 }}>{t.icon}</div>
                    <BlockStack gap="150">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="h4" variant="headingSm">{t.name}</Text>
                        {using && <Badge tone="success">In use</Badge>}
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">{t.outcome}</Text>
                      <InlineStack gap="200" wrap>
                        <Button size="slim" variant={using || explain === t.id ? undefined : "primary"} onClick={() => setExplain(explain === t.id ? null : t.id)}>
                          {explain === t.id ? "Hide" : "Show me"}
                        </Button>
                        <Button size="slim" onClick={() => navigate(t.url)}>{using ? "Open" : "Set up"}</Button>
                        {!using && <Button size="slim" variant="plain" onClick={() => setHidden([...hidden, t.id])}>Not now</Button>}
                      </InlineStack>
                      {explain === t.id && (
                        <div style={{ background: "#f6f7f9", borderRadius: 8, padding: "10px 12px" }}>
                          <BlockStack gap="150">
                            <Text as="p" variant="bodySm" fontWeight="semibold">How it works</Text>
                            <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                              {t.steps.map((s) => <li key={s}><Text as="span" variant="bodySm">{s}</Text></li>)}
                            </ol>
                            <div style={{ borderLeft: "3px solid #2b59c3", paddingLeft: 10 }}>
                              <Text as="p" variant="bodySm" tone="subdued">{t.example}</Text>
                            </div>
                          </BlockStack>
                        </div>
                      )}
                    </BlockStack>
                  </div>
                );
              })}
            </BlockStack>
          );
        })}

        <InlineStack gap="400" wrap>
          {used > 0 && (
            <Button variant="plain" onClick={() => setShowUsed(!showUsed)}>
              {showUsed ? "Hide tools you already use" : `Show tools you already use (${used})`}
            </Button>
          )}
          {hidden.length > 0 && (
            <Button variant="plain" onClick={() => setHidden([])}>{`Show ${hidden.length} hidden tool${hidden.length === 1 ? "" : "s"}`}</Button>
          )}
        </InlineStack>
        {showHints && (
          <Text as="p" variant="bodySm" tone="subdued">
            Tools you haven't tried come first. “Not now” hides a tool here; it stays in the menu.
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}

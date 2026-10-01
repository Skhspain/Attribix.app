// app/routes/app.newsletter.campaigns.new.tsx
// Step 1 of 2: pick a starting template. Templates are built from the store's
// Shopify brand, so the previews already show the shop's logo and colours.

import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useNavigation, useSubmit } from "@remix-run/react";
import { BlockStack, Box, Button, Card, InlineGrid, InlineStack, Page, Text } from "@shopify/polaris";
import { useMemo, useState } from "react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { isEmailDoc, renderEmail, type EmailDoc } from "~/email/blocks";
import { STARTER_TEMPLATES, findTemplate } from "~/email/templates";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const { getStoreBrand } = await import("~/email/brand.server");

  const [brand, saved] = await Promise.all([
    getStoreBrand(shop, admin),
    (db as any).newsletterCampaign
      .findMany({
        where: { shop, status: "template" },
        select: { id: true, name: true, subject: true, designJson: true },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => []),
  ]);

  // Only templates made with the block editor can be edited further.
  const savedTemplates = (saved as any[]).filter((t) => isEmailDoc(t.designJson));
  return json({ brand, savedTemplates });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const form = await request.formData();
  const templateId = String(form.get("templateId") || "blank");
  const savedId = form.get("savedId") ? String(form.get("savedId")) : null;

  let doc: EmailDoc;
  let subject = "";
  if (savedId) {
    const saved = await anyDb.newsletterCampaign.findFirst({ where: { id: savedId, shop, status: "template" } });
    if (!saved || !isEmailDoc(saved.designJson)) throw new Response("Template not found", { status: 404 });
    doc = saved.designJson as EmailDoc;
    subject = saved.subject || "";
  } else {
    const { getStoreBrand } = await import("~/email/brand.server");
    const template = findTemplate(templateId);
    doc = template.build(await getStoreBrand(shop, admin));
    subject = template.subject;
  }

  const settings = await anyDb.newsletterSettings?.findUnique?.({ where: { shop } }).catch(() => null);
  const campaign = await anyDb.newsletterCampaign.create({
    data: {
      shop,
      name: "Untitled newsletter",
      subject,
      status: "draft",
      designJson: doc,
      htmlContent: renderEmail(doc),
      fromName: settings?.fromName || null,
      fromEmail: settings?.fromEmail || null,
      replyTo: settings?.replyTo || null,
    },
  });

  return redirect(`/app/newsletter/campaigns/${campaign.id}`);
}

export default function NewCampaign() {
  const { brand, savedTemplates } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [chosen, setChosen] = useState<string | null>(null);

  const starters = useMemo(
    () => STARTER_TEMPLATES.map((t) => ({ key: `t:${t.id}`, id: t.id, name: t.name, description: t.description, html: renderEmail(t.build(brand)) })),
    [brand],
  );
  const saved = useMemo(
    () => savedTemplates.map((t: any) => ({ key: `s:${t.id}`, id: t.id, name: t.name, description: "Your saved template", html: renderEmail(t.designJson as EmailDoc) })),
    [savedTemplates],
  );

  const choose = (key: string) => {
    setChosen(key);
    const [kind, id] = [key.slice(0, 1), key.slice(2)];
    submit(kind === "s" ? { savedId: id } : { templateId: id }, { method: "post" });
  };

  const grid = (items: typeof starters) => (
    <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
      {items.map((t) => (
        <Card key={t.key} padding="0">
          <Box background="bg-surface-secondary" padding="300">
            <TemplateThumb html={t.html} />
          </Box>
          <Box padding="400">
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">{t.name}</Text>
              <Text as="p" tone="subdued">{t.description}</Text>
              <InlineStack>
                <Button onClick={() => choose(t.key)} loading={navigation.state !== "idle" && chosen === t.key} disabled={navigation.state !== "idle"}>
                  Use template
                </Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>
      ))}
    </InlineGrid>
  );

  return (
    <Page
      title="New newsletter"
      subtitle="Pick a starting point. You can change everything afterwards."
      backAction={{ content: "Newsletters", onAction: () => navigate("/app/newsletter/campaigns") }}
    >
      <BlockStack gap="600">
        {saved.length > 0 && (
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Your templates</Text>
            {grid(saved)}
          </BlockStack>
        )}
        <BlockStack gap="300">
          {saved.length > 0 && <Text as="h2" variant="headingMd">Starter templates</Text>}
          {grid(starters)}
        </BlockStack>
      </BlockStack>
    </Page>
  );
}

// A 600px-wide email scaled down into the card.
function TemplateThumb({ html }: { html: string }) {
  const scale = 0.42;
  return (
    <div style={{ height: 300, overflow: "hidden", position: "relative", borderRadius: 8 }}>
      <iframe
        title="Template preview"
        srcDoc={html.replace(/\{\{first_name\}\}/gi, "Alex")}
        sandbox=""
        tabIndex={-1}
        scrolling="no"
        style={{ width: 650, height: 300 / scale, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
      />
    </div>
  );
}

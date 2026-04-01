// app/routes/app.newsletter.subscribers.tsx
// Subscriber list with attribution breakdown + CSV export.
// NEW FILE.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Card,
  DataTable,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Select,
  TextField,
  Filters,
  Pagination,
} from "@shopify/polaris";
import { useState } from "react";
import { unsubscribeEmail } from "~/services/newsletter.server";

const PAGE_SIZE = 50;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const status = url.searchParams.get("status") || "subscribed";
  const source = url.searchParams.get("source") || "";
  const search = url.searchParams.get("q") || "";

  const where: any = { shop };
  if (status) where.status = status;
  if (source) where.source = source;
  if (search) where.email = { contains: search.toLowerCase() };

  const [subscribers, total] = await Promise.all([
    db.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.newsletterSubscriber.count({ where }),
  ]);

  // Source options for filter
  const sourceCounts = await db.newsletterSubscriber.groupBy({
    by: ["source"],
    where: { shop },
    _count: { source: true },
  });

  return json({ subscribers, total, page, status, source, search, sourceCounts });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "unsubscribe") {
    const email = form.get("email") as string;
    await unsubscribeEmail(shop, email);
    return json({ ok: true });
  }

  return json({ ok: false }, { status: 400 });
}

export default function SubscriberList() {
  const { subscribers, total, page, status, source, search, sourceCounts } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const rows = subscribers.map((s) => [
    s.email,
    s.firstName ? `${s.firstName} ${s.lastName || ""}`.trim() : "—",
    <Badge tone={s.status === "subscribed" ? "success" : "critical"}>{s.status}</Badge>,
    s.source || "—",
    s.utmSource ? `${s.utmSource}/${s.utmMedium || ""}` : "—",
    new Date(s.createdAt).toLocaleDateString(),
    s.status === "subscribed" ? (
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="unsubscribe" />
        <input type="hidden" name="email" value={s.email} />
        <Button variant="plain" tone="critical" submit>Remove</Button>
      </fetcher.Form>
    ) : "—",
  ]);

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingSm">{total.toLocaleString()} subscribers</Text>
            <Button
              variant="plain"
              url={`/api/newsletter/export?shop=${encodeURIComponent(subscribers[0]?.shop || "")}&status=${status}`}
              external
            >
              Export CSV
            </Button>
          </InlineStack>

          <DataTable
            columnContentTypes={["text","text","text","text","text","text","text"]}
            headings={["Email","Name","Status","Source","UTM","Joined","Action"]}
            rows={rows}
            footerContent={`Page ${page} of ${totalPages}`}
          />

          {totalPages > 1 && (
            <InlineStack align="center">
              <Pagination
                hasPrevious={page > 1}
                onPrevious={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("page", String(page - 1));
                  window.location.href = url.toString();
                }}
                hasNext={page < totalPages}
                onNext={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("page", String(page + 1));
                  window.location.href = url.toString();
                }}
              />
            </InlineStack>
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

// app/routes/app.social.calendar.tsx
// Content calendar — month view showing scheduled and published posts.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { Card, BlockStack, InlineStack, Text, Button, Badge, Modal } from "@shopify/polaris";
import { useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const url = new URL(request.url);
  const year  = parseInt(url.searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month = parseInt(url.searchParams.get("month") ?? String(new Date().getMonth()));

  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 0, 23, 59, 59);

  let posts: any[] = [];
  try {
    posts = await anyDb.socialPost.findMany({
      where: {
        shop,
        OR: [
          { scheduledAt: { gte: start, lte: end } },
          { publishedAt: { gte: start, lte: end } },
          { createdAt:   { gte: start, lte: end }, status: "draft" },
        ],
      },
      orderBy: { scheduledAt: "asc" },
    });
  } catch {}

  return json({ posts, year, month });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body  = await request.json().catch(() => ({}));

  if (body.intent === "delete") {
    await anyDb.socialPost?.delete?.({ where: { id: body.id, shop } }).catch(() => null);
    return json({ ok: true });
  }
  if (body.intent === "reschedule") {
    await anyDb.socialPost?.update?.({
      where: { id: body.id },
      data: { scheduledAt: new Date(body.scheduledAt) },
    }).catch(() => null);
    return json({ ok: true });
  }
  return json({ ok: false });
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const STATUS_COLOR: Record<string, string> = {
  scheduled:  "#3b82f6",
  published:  "#008060",
  draft:      "#9ca3af",
  failed:     "#ef4444",
  publishing: "#f59e0b",
};

function postDate(p: any): Date {
  return new Date(p.scheduledAt ?? p.publishedAt ?? p.createdAt);
}

export default function SocialCalendar() {
  const { posts, year, month } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();

  const today = new Date();
  const [viewYear,  setViewYear]  = useState(year);
  const [viewMonth, setViewMonth] = useState(month);
  const [selected,  setSelected]  = useState<any>(null);
  const [rescheduleVal, setRescheduleVal] = useState("");

  function nav(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setViewMonth(m);
    setViewYear(y);
    window.location.href = `/app/social/calendar?year=${y}&month=${m}`;
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  // Index posts by day
  const byDay: Record<number, any[]> = {};
  for (const p of posts) {
    const d = postDate(p).getDate();
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(p);
  }

  function deletePost() {
    if (!selected) return;
    fetcher.submit({ intent: "delete", id: selected.id }, { method: "post", encType: "application/json" });
    setSelected(null);
  }

  function reschedulePost() {
    if (!selected || !rescheduleVal) return;
    fetcher.submit({ intent: "reschedule", id: selected.id, scheduledAt: rescheduleVal }, { method: "post", encType: "application/json" });
    setSelected(null);
  }

  const platforms: string[] = (() => { try { return JSON.parse(selected?.platforms ?? "[]"); } catch { return []; } })();

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">

          {/* Month nav */}
          <InlineStack align="space-between" blockAlign="center">
            <Button variant="plain" onClick={() => nav(-1)}>← Prev</Button>
            <Text as="h2" variant="headingMd">{MONTH_NAMES[viewMonth]} {viewYear}</Text>
            <Button variant="plain" onClick={() => nav(1)}>Next →</Button>
          </InlineStack>

          {/* Legend */}
          <InlineStack gap="300">
            {Object.entries(STATUS_COLOR).map(([s, c]) => (
              <InlineStack key={s} gap="100" blockAlign="center">
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: "inline-block" }} />
                <Text as="span" variant="bodySm" tone="subdued">{s}</Text>
              </InlineStack>
            ))}
          </InlineStack>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {DAY_NAMES.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#6b7280", padding: "4px 0" }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} style={{ minHeight: 90, background: "#f9fafb", borderRadius: 6 }} />;
              const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
              const dayPosts = byDay[day] ?? [];
              return (
                <div
                  key={i}
                  style={{
                    minHeight: 90, borderRadius: 6, padding: "6px 8px",
                    background: isToday ? "#f0fdf4" : "#fff",
                    border: `1.5px solid ${isToday ? "#86efac" : "#f3f4f6"}`,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? "#008060" : "#374151", marginBottom: 4 }}>
                    {day}
                  </div>
                  {dayPosts.slice(0, 3).map((p: any) => (
                    <div
                      key={p.id}
                      onClick={() => setSelected(p)}
                      style={{
                        fontSize: 10, padding: "2px 5px", borderRadius: 4, marginBottom: 3,
                        background: STATUS_COLOR[p.status] + "22",
                        color: STATUS_COLOR[p.status],
                        fontWeight: 600, cursor: "pointer",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        border: `1px solid ${STATUS_COLOR[p.status]}44`,
                      }}
                      title={p.content?.slice(0, 100)}
                    >
                      {p.content?.slice(0, 30) || "(no caption)"}
                    </div>
                  ))}
                  {dayPosts.length > 3 && (
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>+{dayPosts.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </div>

        </BlockStack>
      </Card>

      {/* Post detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Post details"
        secondaryActions={[{ content: "Close", onAction: () => setSelected(null) }]}
      >
        {selected && (
          <Modal.Section>
            <BlockStack gap="400">
              <InlineStack gap="200">
                <Badge tone={selected.status === "published" ? "success" : selected.status === "scheduled" ? "info" : "critical"}>
                  {selected.status}
                </Badge>
                {platforms.map((p: string) => (
                  <Badge key={p}>{p}</Badge>
                ))}
              </InlineStack>

              <div style={{
                background: "#f9fafb", borderRadius: 8, padding: "12px 14px",
                fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {selected.content || "(no caption)"}
              </div>

              {selected.scheduledAt && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Scheduled: {new Date(selected.scheduledAt).toLocaleString()}
                </Text>
              )}
              {selected.publishedAt && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Published: {new Date(selected.publishedAt).toLocaleString()}
                </Text>
              )}
              {selected.errorMsg && (
                <Banner tone="critical">{selected.errorMsg}</Banner>
              )}

              {/* Reschedule */}
              {selected.status === "scheduled" && (
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Reschedule</Text>
                  <InlineStack gap="200">
                    <input
                      type="datetime-local"
                      value={rescheduleVal}
                      onChange={(e) => setRescheduleVal(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      style={{ padding: "8px 10px", border: "1.5px solid #c9cccf", borderRadius: 6, fontSize: 13, fontFamily: "inherit" }}
                    />
                    <Button onClick={reschedulePost} disabled={!rescheduleVal}>Update</Button>
                  </InlineStack>
                </BlockStack>
              )}

              <InlineStack gap="200">
                <Button tone="critical" onClick={deletePost} loading={fetcher.state !== "idle"}>Delete post</Button>
              </InlineStack>
            </BlockStack>
          </Modal.Section>
        )}
      </Modal>
    </BlockStack>
  );
}

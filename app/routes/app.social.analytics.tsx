// app/routes/app.social.analytics.tsx
// Social analytics — engagement overview + per-post breakdown.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { Card, BlockStack, InlineStack, Text, Badge, Divider } from "@shopify/polaris";
import { syncEngagement } from "~/services/social.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  // Background engagement sync
  syncEngagement(shop).catch(() => {});

  let posts: any[] = [];
  try {
    posts = await anyDb.socialPost.findMany({
      where: { shop, status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });
  } catch {}

  // Aggregate totals
  const totals = posts.reduce((acc, p) => ({
    reach:    acc.reach    + (p.fbReach    + p.igReach),
    likes:    acc.likes    + (p.fbLikes    + p.igLikes),
    comments: acc.comments + (p.fbComments + p.igComments),
    shares:   acc.shares   + p.fbShares,
    posts:    acc.posts    + 1,
  }), { reach: 0, likes: 0, comments: 0, shares: 0, posts: 0 });

  const engagementRate = totals.reach > 0
    ? (((totals.likes + totals.comments + totals.shares) / totals.reach) * 100).toFixed(1)
    : "0.0";

  // Best post by total engagement
  const bestPost = posts.length > 0
    ? posts.reduce((a, b) =>
        (a.fbLikes + a.igLikes + a.fbComments + a.igComments) >
        (b.fbLikes + b.igLikes + b.fbComments + b.igComments) ? a : b)
    : null;

  return json({ posts, totals, engagementRate, bestPost });
}

const PLATFORM_COLOR: Record<string, string> = {
  facebook:  "#1877F2",
  instagram: "#E1306C",
};

export default function SocialAnalytics() {
  const { posts, totals, engagementRate, bestPost } = useLoaderData<typeof loader>();

  const kpis = [
    { label: "Published posts", value: totals.posts },
    { label: "Total reach",    value: totals.reach.toLocaleString() },
    { label: "Total likes",    value: totals.likes.toLocaleString() },
    { label: "Comments",       value: totals.comments.toLocaleString() },
    { label: "Shares",         value: totals.shares.toLocaleString() },
    { label: "Engagement rate",value: `${engagementRate}%` },
  ];

  return (
    <BlockStack gap="500">

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 16 }}>
        {kpis.map(k => (
          <Card key={k.label}>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">{k.label}</Text>
              <Text as="p" variant="headingLg">{k.value}</Text>
            </BlockStack>
          </Card>
        ))}
      </div>

      {/* Best post */}
      {bestPost && (
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">Best performing post</Text>
              <Badge tone="success">Top</Badge>
            </InlineStack>
            <Divider />
            <PostRow post={bestPost} highlight />
          </BlockStack>
        </Card>
      )}

      {/* All posts */}
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingSm">Published posts</Text>
          <Divider />
          {posts.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center" }}>
              <Text as="p" tone="subdued">No published posts yet. Create your first post in the Compose tab.</Text>
            </div>
          ) : (
            posts.map((p, i) => (
              <div key={p.id}>
                <PostRow post={p} />
                {i < posts.length - 1 && <Divider />}
              </div>
            ))
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function PostRow({ post, highlight = false }: { post: any; highlight?: boolean }) {
  const platforms: string[] = (() => { try { return JSON.parse(post.platforms ?? "[]"); } catch { return []; } })();
  const images: string[] = (() => { try { return JSON.parse(post.imageUrls ?? "[]"); } catch { return []; } })();
  const totalLikes    = post.fbLikes    + post.igLikes;
  const totalComments = post.fbComments + post.igComments;
  const totalReach    = post.fbReach    + post.igReach;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "60px 1fr auto",
      gap: 14, alignItems: "start", padding: "8px 0",
      background: highlight ? "#f0fdf4" : "transparent",
      borderRadius: 6, paddingLeft: highlight ? 10 : 0,
    }}>
      {/* Thumbnail */}
      <div style={{
        width: 60, height: 60, borderRadius: 8, overflow: "hidden",
        background: "#f3f4f6", flexShrink: 0,
      }}>
        {images[0]
          ? <img src={images[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📝</div>
        }
      </div>

      {/* Content */}
      <BlockStack gap="100">
        <div style={{ fontSize: 13, lineHeight: 1.4, color: "#111827", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
          {post.content || "(no caption)"}
        </div>
        <InlineStack gap="200">
          {platforms.map((p: string) => (
            <span key={p} style={{
              fontSize: 10, padding: "1px 7px", borderRadius: 10,
              background: (PLATFORM_COLOR[p] ?? "#6b7280") + "20",
              color: PLATFORM_COLOR[p] ?? "#6b7280",
              fontWeight: 600,
            }}>{p}</span>
          ))}
          {post.publishedAt && (
            <Text as="span" variant="bodySm" tone="subdued">
              {new Date(post.publishedAt).toLocaleDateString()}
            </Text>
          )}
        </InlineStack>
      </BlockStack>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,54px)", gap: 4, textAlign: "center" }}>
        {[
          { label: "Reach",    value: totalReach },
          { label: "Likes",    value: totalLikes },
          { label: "Comments", value: totalComments },
          { label: "Shares",   value: post.fbShares },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{s.value.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: "#9ca3af" }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

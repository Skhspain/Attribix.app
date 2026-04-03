// app/services/social.server.ts
// Meta Graph API posting + engagement sync for Social Media feature.

import db from "~/db.server";

const GRAPH = "https://graph.facebook.com/v19.0";

// ─── Facebook Pages ───────────────────────────────────────────────────────────

export async function fetchFacebookPages(userToken: string) {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,picture.type(small)&access_token=${userToken}`
  );
  const data = await res.json();
  return (data.data ?? []) as Array<{
    id: string;
    name: string;
    access_token: string;
    picture?: { data: { url: string } };
  }>;
}

// ─── Instagram Business Account ───────────────────────────────────────────────

export async function fetchInstagramAccount(pageId: string, pageToken: string) {
  const res = await fetch(
    `${GRAPH}/${pageId}?fields=instagram_business_account{id,name,username,profile_picture_url}&access_token=${pageToken}`
  );
  const data = await res.json();
  return (data.instagram_business_account ?? null) as {
    id: string;
    name?: string;
    username?: string;
    profile_picture_url?: string;
  } | null;
}

// ─── Post to Facebook Page ────────────────────────────────────────────────────

export async function postToFacebook(
  content: string,
  imageUrls: string[],
  pageId: string,
  pageToken: string
): Promise<{ id?: string; error?: string }> {
  try {
    if (imageUrls.length > 0) {
      // Photo post
      const params = new URLSearchParams({
        caption: content,
        url: imageUrls[0],
        access_token: pageToken,
      });
      const res = await fetch(`${GRAPH}/${pageId}/photos`, {
        method: "POST",
        body: params,
      });
      const data = await res.json();
      if (data.error) return { error: data.error.message };
      return { id: data.post_id ?? data.id };
    } else {
      // Text post
      const params = new URLSearchParams({
        message: content,
        access_token: pageToken,
      });
      const res = await fetch(`${GRAPH}/${pageId}/feed`, {
        method: "POST",
        body: params,
      });
      const data = await res.json();
      if (data.error) return { error: data.error.message };
      return { id: data.id };
    }
  } catch (e: any) {
    return { error: e.message };
  }
}

// ─── Post to Instagram ────────────────────────────────────────────────────────

export async function postToInstagram(
  content: string,
  imageUrls: string[],
  igAccountId: string,
  pageToken: string
): Promise<{ id?: string; error?: string }> {
  if (imageUrls.length === 0) {
    return { error: "Instagram requires at least one image." };
  }
  try {
    // Step 1: Create media container
    const containerParams = new URLSearchParams({
      caption: content,
      image_url: imageUrls[0],
      access_token: pageToken,
    });
    const containerRes = await fetch(`${GRAPH}/${igAccountId}/media`, {
      method: "POST",
      body: containerParams,
    });
    const container = await containerRes.json();
    if (!container.id) {
      return { error: container.error?.message ?? "Failed to create Instagram media container." };
    }

    // Step 2: Publish
    const publishParams = new URLSearchParams({
      creation_id: container.id,
      access_token: pageToken,
    });
    const publishRes = await fetch(`${GRAPH}/${igAccountId}/media_publish`, {
      method: "POST",
      body: publishParams,
    });
    const published = await publishRes.json();
    if (published.error) return { error: published.error.message };
    return { id: published.id };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ─── Publish a SocialPost record ─────────────────────────────────────────────

export async function publishSocialPost(postId: string) {
  const anyDb = db as any;
  const post = await anyDb.socialPost?.findUnique?.({ where: { id: postId } });
  if (!post) return { ok: false, error: "Post not found" };

  const platforms: string[] = (() => { try { return JSON.parse(post.platforms); } catch { return []; } })();
  const imageUrls: string[] = (() => { try { return JSON.parse(post.imageUrls || "[]"); } catch { return []; } })();

  // Get social accounts for shop
  const accounts: any[] = await anyDb.socialAccount?.findMany?.({
    where: { shop: post.shop, connected: true },
  }) ?? [];

  const fbAccount = accounts.find((a: any) => a.platform === "facebook");
  const igAccount = accounts.find((a: any) => a.platform === "instagram");

  let facebookPostId: string | undefined;
  let instagramPostId: string | undefined;
  const errors: string[] = [];

  // Publish to Facebook
  if (platforms.includes("facebook") && fbAccount) {
    const result = await postToFacebook(post.content, imageUrls, fbAccount.accountId, fbAccount.pageToken);
    if (result.id) facebookPostId = result.id;
    else errors.push(`Facebook: ${result.error}`);
  }

  // Publish to Instagram
  if (platforms.includes("instagram") && igAccount) {
    const result = await postToInstagram(post.content, imageUrls, igAccount.accountId, igAccount.pageToken ?? fbAccount?.pageToken ?? "");
    if (result.id) instagramPostId = result.id;
    else errors.push(`Instagram: ${result.error}`);
  }

  const success = (platforms.includes("facebook") ? !!facebookPostId : true) &&
    (platforms.includes("instagram") ? !!instagramPostId : true);

  await anyDb.socialPost?.update?.({
    where: { id: postId },
    data: {
      status: success ? "published" : errors.length < platforms.length ? "published" : "failed",
      publishedAt: success ? new Date() : undefined,
      facebookPostId: facebookPostId ?? undefined,
      instagramPostId: instagramPostId ?? undefined,
      errorMsg: errors.length > 0 ? errors.join("; ") : null,
    },
  });

  return { ok: success, errors };
}

// ─── Publish all due scheduled posts ─────────────────────────────────────────

export async function publishDuePosts() {
  const anyDb = db as any;
  const due = await anyDb.socialPost?.findMany?.({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
    },
  }) ?? [];

  const results = await Promise.allSettled(due.map((p: any) => publishSocialPost(p.id)));
  return results;
}

// ─── Sync engagement from Meta ────────────────────────────────────────────────

export async function syncEngagement(shop: string) {
  const anyDb = db as any;
  const posts = await anyDb.socialPost?.findMany?.({
    where: { shop, status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 20,
  }) ?? [];

  const accounts: any[] = await anyDb.socialAccount?.findMany?.({
    where: { shop, connected: true },
  }) ?? [];
  const fbAccount = accounts.find((a: any) => a.platform === "facebook");
  if (!fbAccount) return;

  for (const post of posts) {
    if (post.facebookPostId) {
      try {
        const res = await fetch(
          `${GRAPH}/${post.facebookPostId}?fields=reactions.summary(true),comments.summary(true),shares&access_token=${fbAccount.pageToken}`
        );
        const data = await res.json();
        await anyDb.socialPost?.update?.({
          where: { id: post.id },
          data: {
            fbLikes: data.reactions?.summary?.total_count ?? post.fbLikes,
            fbComments: data.comments?.summary?.total_count ?? post.fbComments,
            fbShares: data.shares?.count ?? post.fbShares,
          },
        });
      } catch { /* ignore */ }
    }
  }
}

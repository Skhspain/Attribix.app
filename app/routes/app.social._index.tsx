// app/routes/app.social._index.tsx
// Post composer — write content, pick platforms, add images, schedule or post now.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, useRouteError, Link } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { Card, BlockStack, InlineStack, Text, TextField, Button, Banner, Divider, Badge, Thumbnail } from "@shopify/polaris";
import { useState, useRef } from "react";
import { publishSocialPost } from "~/services/social.server";

// Platform config
const PLATFORMS = [
  { id: "facebook",  label: "Facebook",  color: "#1877F2", limit: 63206, icon: "f" },
  { id: "instagram", label: "Instagram", color: "#E1306C", limit: 2200,  icon: "ig" },
  { id: "tiktok",    label: "TikTok",    color: "#010101", limit: 2200,  icon: "tt", comingSoon: true },
  { id: "x",         label: "X (Twitter)", color: "#000000", limit: 280, icon: "x", comingSoon: true },
  { id: "pinterest", label: "Pinterest", color: "#E60023", limit: 500,   icon: "pi", comingSoon: true },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  let accounts: any[] = [], recentProducts: any[] = [], recentPosts: any[] = [];
  try {
    [accounts, recentProducts, recentPosts] = await Promise.all([
      anyDb.socialAccount.findMany({ where: { shop, connected: true } }),
      anyDb.productFeedItem.findMany({ where: { shop }, orderBy: { updatedAt: "desc" }, take: 20 }),
      anyDb.socialPost.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);
  } catch {}

  return json({ accounts, recentProducts, recentPosts });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));
  const intent = body.intent as string;

  if (intent === "save" || intent === "schedule" || intent === "publish") {
    const post = await anyDb.socialPost?.create?.({
      data: {
        shop,
        content: body.content ?? "",
        imageUrls: JSON.stringify(body.imageUrls ?? []),
        platforms: JSON.stringify(body.platforms ?? []),
        status: intent === "schedule" ? "scheduled" : intent === "publish" ? "publishing" : "draft",
        scheduledAt: intent === "schedule" ? new Date(body.scheduledAt) : null,
        productId: body.productId ?? null,
        productTitle: body.productTitle ?? null,
        productUrl: body.productUrl ?? null,
      },
    });

    if (intent === "publish" && post) {
      const result = await publishSocialPost(post.id);
      return json({ ok: true, postId: post.id, published: true, errors: result.errors });
    }

    return json({ ok: true, postId: post?.id, intent });
  }

  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
}

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <div style={{ padding: 24, fontFamily: "monospace" }}>
      <h2 style={{ color: "#ef4444" }}>Compose — Render Error</h2>
      <pre style={{ background: "#fef2f2", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12 }}>
        {error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error)}
      </pre>
    </div>
  );
}

export default function SocialCompose() {
  const { accounts, recentProducts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();
  const navigate = useNavigate();

  const connectedPlatformIds = (accounts as any[]).map((a: any) => a.platform);

  const [content, setContent] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    connectedPlatformIds.filter((p: string) => ["facebook", "instagram"].includes(p))
  );
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageInput, setImageInput] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [linkedProduct, setLinkedProduct] = useState<any>(null);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  const activePlatform = PLATFORMS.find(p => selectedPlatforms[0] === p.id);
  const charLimit = activePlatform?.limit ?? 2200;
  const overLimit = content.length > charLimit;

  function togglePlatform(id: string) {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  function addImage() {
    const url = imageInput.trim();
    if (url && !imageUrls.includes(url)) {
      setImageUrls(prev => [...prev, url]);
      setImageInput("");
    }
  }

  function pickProductImage(product: any) {
    const images: string[] = (() => { try { return JSON.parse(product.imagesJson || "[]"); } catch { return []; } })();
    if (images[0] && !imageUrls.includes(images[0])) {
      setImageUrls(prev => [...prev, images[0]]);
    }
    setLinkedProduct(product);
    setShowProductPicker(false);
  }

  function submit(intent: "save" | "schedule" | "publish") {
    fetcher.submit(
      {
        intent,
        content,
        imageUrls,
        platforms: selectedPlatforms,
        scheduledAt: intent === "schedule" ? scheduledAt : null,
        productId: linkedProduct?.productId ?? null,
        productTitle: linkedProduct?.title ?? null,
        productUrl: linkedProduct?.handle ? `https://attribix-app.fly.dev/products/${linkedProduct.handle}` : null,
      },
      { method: "post", encType: "application/json" }
    );
  }

  const isSaving = fetcher.state !== "idle";
  const result = fetcher.data;

  // Platform character counts
  const platformsToShow = PLATFORMS.filter(p => selectedPlatforms.includes(p.id));

  return (
    <BlockStack gap="500">
      {result?.ok && result?.published && (
        <Banner tone="success" title="Post published!">
          {result.errors?.length > 0 && (
            <Text as="p">Some platforms had errors: {result.errors.join(", ")}</Text>
          )}
        </Banner>
      )}
      {result?.ok && result?.intent === "schedule" && (
        <Banner tone="info">Post scheduled successfully.</Banner>
      )}
      {result?.ok && result?.intent === "save" && (
        <Banner tone="info">Draft saved.</Banner>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>

        {/* ── Left: Composer ── */}
        <BlockStack gap="400">

          {/* ── Turn data into content ── */}
          <div style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            borderRadius: 12, padding: "20px 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          }}>
            <BlockStack gap="100">
              <Text as="p" variant="headingSm" tone="text-inverse">Turn your store data into content</Text>
              <Text as="p" variant="bodySm" tone="text-inverse">Your best-performing products are ready to promote</Text>
            </BlockStack>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(recentProducts as any[]).slice(0, 1).map((p: any) => {
                const imgs: string[] = (() => { try { return JSON.parse(p.imagesJson || "[]"); } catch { return []; } })();
                return (
                  <button
                    key={p.productId}
                    onClick={() => {
                      setContent(`This product is flying off the shelves 🔥\n\n${p.title}\n\nHere's why our customers love it…\n\n👉 Shop now`);
                      if (imgs[0]) setImageUrls([imgs[0]]);
                      setLinkedProduct(p);
                    }}
                    style={{
                      padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                      background: "#008060", color: "#fff", border: "none",
                      fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                    }}
                  >
                    Promote {p.title?.slice(0, 20)}{(p.title?.length || 0) > 20 ? "…" : ""}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  setContent(`Our best-performing campaign is live 🚀\n\nDon't miss out — limited time only.\n\n👉 Shop now`);
                }}
                style={{
                  padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                  background: "rgba(255,255,255,0.15)", color: "#fff",
                  border: "1px solid rgba(255,255,255,0.3)",
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                }}
              >
                Share winning campaign
              </button>
            </div>
          </div>

          {/* Platform selection */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Platforms</Text>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {PLATFORMS.map(p => {
                  const isConnected = connectedPlatformIds.includes(p.id);
                  const isSelected = selectedPlatforms.includes(p.id);
                  const disabled = p.comingSoon || !isConnected;
                  return (
                    <button
                      key={p.id}
                      onClick={() => !disabled && togglePlatform(p.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 16px", borderRadius: 20, cursor: disabled ? "not-allowed" : "pointer",
                        border: `2px solid ${isSelected && !disabled ? p.color : "#e1e3e5"}`,
                        background: isSelected && !disabled ? p.color + "15" : "#fff",
                        color: disabled ? "#9ca3af" : "#111",
                        fontSize: 14, fontWeight: isSelected ? 600 : 400,
                        opacity: disabled ? 0.5 : 1,
                        fontFamily: "inherit",
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: disabled ? "#e5e7eb" : p.color,
                        color: "#fff", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 10, fontWeight: 700,
                      }}>
                        {p.icon.toUpperCase()}
                      </span>
                      {p.label}
                      {p.comingSoon && <span style={{ fontSize: 10, color: "#9ca3af" }}>Soon</span>}
                      {!p.comingSoon && !isConnected && <span style={{ fontSize: 10, color: "#9ca3af" }}>Connect</span>}
                    </button>
                  );
                })}
              </div>
              {connectedPlatformIds.length === 0 && (
                <Banner tone="warning">
                  Connect your social accounts to turn your best products into content that drives sales.{" "}
                  <Link to="/app/social/accounts" style={{ color: "#008060" }}>Connect accounts →</Link>
                </Banner>
              )}
            </BlockStack>
          </Card>

          {/* Content */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingSm">Caption</Text>
                <Text as="p" variant="bodySm" tone={overLimit ? "critical" : "subdued"}>
                  {content.length.toLocaleString()} / {charLimit.toLocaleString()}
                </Text>
              </InlineStack>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your caption here…"
                rows={8}
                style={{
                  width: "100%", padding: "10px 12px", fontSize: 14,
                  border: `1.5px solid ${overLimit ? "#ef4444" : "#c9cccf"}`,
                  borderRadius: 8, resize: "vertical", fontFamily: "inherit",
                  lineHeight: 1.6, boxSizing: "border-box",
                }}
              />
              {/* Per-platform char counts */}
              {platformsToShow.length > 0 && (
                <InlineStack gap="300" wrap>
                  {platformsToShow.map(p => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: "50%", background: p.color,
                        display: "inline-block",
                      }} />
                      <Text as="span" variant="bodySm" tone={content.length > p.limit ? "critical" : "subdued"}>
                        {p.label}: {content.length}/{p.limit}
                      </Text>
                    </div>
                  ))}
                </InlineStack>
              )}
            </BlockStack>
          </Card>

          {/* Images */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm">Images</Text>
                <Button variant="plain" onClick={() => setShowProductPicker(v => !v)}>
                  Pick from products
                </Button>
              </InlineStack>

              {/* Product picker */}
              {showProductPicker && (
                <div style={{
                  maxHeight: 240, overflowY: "auto", border: "1px solid #e1e3e5",
                  borderRadius: 8, padding: 8, display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(100px,1fr))", gap: 8,
                }}>
                  {(recentProducts as any[]).map((p: any) => {
                    const imgs: string[] = (() => { try { return JSON.parse(p.imagesJson || "[]"); } catch { return []; } })();
                    if (!imgs[0]) return null;
                    return (
                      <button
                        key={p.productId}
                        onClick={() => pickProductImage(p)}
                        style={{ border: "none", background: "none", cursor: "pointer", padding: 4, borderRadius: 6, textAlign: "center" }}
                        title={p.title}
                      >
                        <img src={imgs[0]} alt={p.title} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6 }} />
                        <div style={{ fontSize: 10, marginTop: 4, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.title}
                        </div>
                      </button>
                    );
                  })}
                  {(recentProducts as any[]).length === 0 && (
                    <Text as="p" variant="bodySm" tone="subdued">No products synced yet. Sync your product feed first.</Text>
                  )}
                </div>
              )}

              {/* URL input */}
              <InlineStack gap="200">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Image URL"
                    labelHidden
                    value={imageInput}
                    onChange={setImageInput}
                    placeholder="https://example.com/image.jpg"
                    autoComplete="off"
                    connectedRight={
                      <Button onClick={addImage} disabled={!imageInput.trim()}>Add</Button>
                    }
                  />
                </div>
              </InlineStack>

              {/* Image previews */}
              {imageUrls.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {imageUrls.map((url, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={url} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid #e1e3e5" }} />
                      <button
                        onClick={() => setImageUrls(prev => prev.filter((_, j) => j !== i))}
                        style={{
                          position: "absolute", top: -6, right: -6,
                          background: "#ef4444", color: "#fff", border: "none",
                          borderRadius: "50%", width: 20, height: 20, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 700, lineHeight: 1,
                        }}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}

              {linkedProduct && (
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="info">Linked: {linkedProduct.title}</Badge>
                  <Button variant="plain" onClick={() => setLinkedProduct(null)}>Remove link</Button>
                </InlineStack>
              )}
            </BlockStack>
          </Card>

          {/* Schedule */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Scheduling</Text>
              <InlineStack gap="300">
                <button
                  onClick={() => setScheduleMode(false)}
                  style={{
                    padding: "8px 16px", borderRadius: 6, cursor: "pointer",
                    border: `2px solid ${!scheduleMode ? "#008060" : "#e1e3e5"}`,
                    background: !scheduleMode ? "#f0fdf4" : "#fff",
                    fontWeight: !scheduleMode ? 600 : 400, fontFamily: "inherit", fontSize: 14,
                  }}
                >
                  Post now
                </button>
                <button
                  onClick={() => setScheduleMode(true)}
                  style={{
                    padding: "8px 16px", borderRadius: 6, cursor: "pointer",
                    border: `2px solid ${scheduleMode ? "#008060" : "#e1e3e5"}`,
                    background: scheduleMode ? "#f0fdf4" : "#fff",
                    fontWeight: scheduleMode ? 600 : 400, fontFamily: "inherit", fontSize: 14,
                  }}
                >
                  Schedule for later
                </button>
              </InlineStack>
              {scheduleMode && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  style={{ padding: "8px 12px", border: "1.5px solid #c9cccf", borderRadius: 6, fontSize: 14, fontFamily: "inherit" }}
                />
              )}
            </BlockStack>
          </Card>

          {/* Actions */}
          <InlineStack gap="300">
            <Button
              variant="primary"
              loading={isSaving}
              disabled={!content.trim() || selectedPlatforms.length === 0 || overLimit}
              onClick={() => submit(scheduleMode ? "schedule" : "publish")}
            >
              {scheduleMode ? "Schedule post" : "Publish & drive traffic"}
            </Button>
            <Button variant="plain" onClick={() => submit("save")} loading={isSaving}>
              Save draft
            </Button>
          </InlineStack>

        </BlockStack>

        {/* ── Right: Preview ── */}
        <div>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Preview</Text>
              <Divider />

              {/* Facebook preview */}
              {selectedPlatforms.includes("facebook") && (
                <div>
                  <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Facebook</Text>
                  <div style={{
                    border: "1px solid #e1e3e5", borderRadius: 10, overflow: "hidden",
                    marginTop: 8, background: "#fff",
                  }}>
                    <div style={{ padding: "12px 14px", display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1877F2", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>P</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>Your Page</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>Just now · 🌍</div>
                      </div>
                    </div>
                    {content && (
                      <div style={{ padding: "0 14px 12px", fontSize: 13, lineHeight: 1.5, color: "#1c1e21", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {content.slice(0, 300)}{content.length > 300 ? "…" : ""}
                      </div>
                    )}
                    {imageUrls[0] && (
                      <img src={imageUrls[0]} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover" }} />
                    )}
                    <div style={{ padding: "8px 14px", borderTop: "1px solid #e1e3e5", display: "flex", gap: 16 }}>
                      {["👍 Like", "💬 Comment", "↗️ Share"].map(a => (
                        <span key={a} style={{ fontSize: 12, color: "#9ca3af" }}>{a}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Instagram preview */}
              {selectedPlatforms.includes("instagram") && (
                <div style={{ marginTop: selectedPlatforms.includes("facebook") ? 16 : 0 }}>
                  <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Instagram</Text>
                  <div style={{
                    border: "1px solid #e1e3e5", borderRadius: 10, overflow: "hidden",
                    marginTop: 8, background: "#fff",
                  }}>
                    <div style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>P</div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>your_handle</div>
                    </div>
                    {imageUrls[0] ? (
                      <img src={imageUrls[0]} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", aspectRatio: "1", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Text as="p" variant="bodySm" tone="subdued">Add an image</Text>
                      </div>
                    )}
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                        {["❤️", "💬", "↗️"].map(i => <span key={i} style={{ fontSize: 18 }}>{i}</span>)}
                      </div>
                      {content && (
                        <div style={{ fontSize: 12, lineHeight: 1.5, color: "#1c1e21" }}>
                          <strong>your_handle</strong> {content.slice(0, 150)}{content.length > 150 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {selectedPlatforms.length === 0 && (
                <Text as="p" variant="bodySm" tone="subdued">Select platforms to see a preview.</Text>
              )}
            </BlockStack>
          </Card>
        </div>
      </div>
    </BlockStack>
  );
}

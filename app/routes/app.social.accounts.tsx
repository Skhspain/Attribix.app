// app/routes/app.social.accounts.tsx
// Connect/manage social accounts — Meta (Facebook + Instagram) live, others coming soon.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { Card, BlockStack, InlineStack, Text, Button, Badge, Banner, Divider, Select } from "@shopify/polaris";
import { useState } from "react";
import { fetchFacebookPages, fetchInstagramAccount } from "~/services/social.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  let metaConn: any = null, accounts: any[] = [];
  try {
    [metaConn, accounts] = await Promise.all([
      anyDb.metaConnection.findUnique({ where: { shop } }),
      anyDb.socialAccount.findMany({ where: { shop } }),
    ]);
  } catch {}

  // Fetch available Facebook pages if Meta is connected
  let facebookPages: any[] = [];
  if (metaConn?.accessToken) {
    facebookPages = await fetchFacebookPages(metaConn.accessToken).catch(() => []);
  }

  return json({ metaConnected: !!metaConn, facebookPages, accounts });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));
  const intent = body.intent as string;

  if (intent === "connect-facebook") {
    const { pageId, pageName, pageToken, avatarUrl } = body;
    if (!pageId || !pageToken) return json({ ok: false, error: "Missing page data" });

    // Save Facebook page account
    await anyDb.socialAccount?.upsert?.({
      where: { shop_platform_accountId: { shop, platform: "facebook", accountId: pageId } },
      create: { shop, platform: "facebook", accountId: pageId, accountName: pageName, pageToken, avatarUrl: avatarUrl ?? null, connected: true },
      update: { accountName: pageName, pageToken, avatarUrl: avatarUrl ?? null, connected: true },
    });

    // Auto-link Instagram Business Account
    const igAccount = await fetchInstagramAccount(pageId, pageToken).catch(() => null);
    if (igAccount) {
      await anyDb.socialAccount?.upsert?.({
        where: { shop_platform_accountId: { shop, platform: "instagram", accountId: igAccount.id } },
        create: {
          shop, platform: "instagram", accountId: igAccount.id,
          accountName: igAccount.name ?? null,
          accountHandle: igAccount.username ? `@${igAccount.username}` : null,
          avatarUrl: igAccount.profile_picture_url ?? null,
          pageToken, // Instagram uses the page token
          connected: true,
        },
        update: {
          accountName: igAccount.name ?? null,
          accountHandle: igAccount.username ? `@${igAccount.username}` : null,
          avatarUrl: igAccount.profile_picture_url ?? null,
          pageToken,
          connected: true,
        },
      });
    }

    return json({ ok: true, hasInstagram: !!igAccount });
  }

  if (intent === "disconnect") {
    const { platform, accountId } = body;
    await anyDb.socialAccount?.updateMany?.({
      where: { shop, platform, accountId },
      data: { connected: false },
    });
    return json({ ok: true });
  }

  return json({ ok: false });
}

const COMING_SOON = [
  { id: "tiktok",   label: "TikTok",   color: "#010101", desc: "Short-form video for product showcases" },
  { id: "x",        label: "X (Twitter)", color: "#000", desc: "Real-time updates and promotions" },
  { id: "pinterest",label: "Pinterest", color: "#E60023", desc: "Visual discovery for lifestyle brands" },
];

export default function SocialAccounts() {
  const { metaConnected, facebookPages, accounts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();

  const [selectedPage, setSelectedPage] = useState(facebookPages[0]?.id ?? "");

  const fbAccount  = (accounts as any[]).find((a: any) => a.platform === "facebook"  && a.connected);
  const igAccount  = (accounts as any[]).find((a: any) => a.platform === "instagram" && a.connected);

  const pageOptions = facebookPages.map((p: any) => ({ label: p.name, value: p.id }));

  function connectFacebook() {
    const page = facebookPages.find((p: any) => p.id === selectedPage);
    if (!page) return;
    fetcher.submit({
      intent: "connect-facebook",
      pageId: page.id,
      pageName: page.name,
      pageToken: page.access_token,
      avatarUrl: page.picture?.data?.url ?? null,
    }, { method: "post", encType: "application/json" });
  }

  function disconnect(platform: string, accountId: string) {
    fetcher.submit({ intent: "disconnect", platform, accountId }, { method: "post", encType: "application/json" });
  }

  const isSaving = fetcher.state !== "idle";

  return (
    <BlockStack gap="500">

      {fetcher.data?.ok && fetcher.data?.hasInstagram !== undefined && (
        <Banner tone="success">
          Facebook page connected{fetcher.data.hasInstagram ? " and Instagram Business account linked automatically!" : ". No Instagram Business account found on this page."}
        </Banner>
      )}

      {/* Meta (Facebook + Instagram) */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="300" blockAlign="center">
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #1877F2, #E1306C)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>M</span>
              </div>
              <BlockStack gap="050">
                <Text as="h2" variant="headingSm">Meta — Facebook & Instagram</Text>
                <Text as="p" variant="bodySm" tone="subdued">Post to your Facebook Page and Instagram Business account</Text>
              </BlockStack>
            </InlineStack>
            {metaConnected
              ? <Badge tone="success">Meta connected</Badge>
              : <Badge tone="warning">Not connected</Badge>
            }
          </InlineStack>

          {!metaConnected && (
            <Banner tone="warning">
              Connect your Meta account in <a href="/app/ads" style={{ color: "#008060" }}>Integrations</a> first to enable Facebook and Instagram posting.
            </Banner>
          )}

          {metaConnected && (
            <>
              <Divider />

              {/* Facebook */}
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">Facebook Page</Text>
                {fbAccount ? (
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      {fbAccount.avatarUrl && (
                        <img src={fbAccount.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                      )}
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">{fbAccount.accountName}</Text>
                        <Badge tone="success">Connected</Badge>
                      </BlockStack>
                    </InlineStack>
                    <Button tone="critical" variant="plain" onClick={() => disconnect("facebook", fbAccount.accountId)} loading={isSaving}>
                      Disconnect
                    </Button>
                  </InlineStack>
                ) : facebookPages.length > 0 ? (
                  <InlineStack gap="300" blockAlign="end">
                    <div style={{ flex: 1 }}>
                      <Select
                        label="Select a Facebook Page"
                        options={pageOptions}
                        value={selectedPage}
                        onChange={setSelectedPage}
                      />
                    </div>
                    <Button variant="primary" onClick={connectFacebook} loading={isSaving}>
                      Connect page
                    </Button>
                  </InlineStack>
                ) : (
                  <Banner tone="warning">
                    No Facebook Pages found on your Meta account. Make sure you are an admin of a Facebook Page.
                  </Banner>
                )}
              </BlockStack>

              {/* Instagram */}
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">Instagram Business Account</Text>
                {igAccount ? (
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      {igAccount.avatarUrl && (
                        <img src={igAccount.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                      )}
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">{igAccount.accountHandle ?? igAccount.accountName}</Text>
                        <Badge tone="success">Auto-linked from Facebook Page</Badge>
                      </BlockStack>
                    </InlineStack>
                    <Button tone="critical" variant="plain" onClick={() => disconnect("instagram", igAccount.accountId)} loading={isSaving}>
                      Disconnect
                    </Button>
                  </InlineStack>
                ) : (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {fbAccount
                      ? "No Instagram Business account found linked to this Facebook Page. Make sure your Instagram account is set as a Business account and linked to your Page in Meta Business Suite."
                      : "Connect a Facebook Page first — Instagram will be linked automatically."
                    }
                  </Text>
                )}
              </BlockStack>
            </>
          )}
        </BlockStack>
      </Card>

      {/* Coming soon platforms */}
      <Text as="h2" variant="headingSm">More platforms coming soon</Text>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
        {COMING_SOON.map(p => (
          <Card key={p.id}>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: p.color, display: "flex", alignItems: "center",
                  justifyContent: "center",
                }}>
                  <span style={{ color: p.id === "x" ? "#fff" : "#fff", fontWeight: 800, fontSize: 14 }}>
                    {p.label[0]}
                  </span>
                </div>
                <BlockStack gap="050">
                  <Text as="p" fontWeight="semibold">{p.label}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{p.desc}</Text>
                </BlockStack>
              </InlineStack>
              <Badge tone="attention">Soon</Badge>
            </InlineStack>
          </Card>
        ))}
      </div>

    </BlockStack>
  );
}

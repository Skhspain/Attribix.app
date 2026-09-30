import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

// Each step is "done" only when it's verifiably working, with a reason when
// it isn't — connecting an account isn't the same as data arriving.
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const DAY = 24 * 3600e3;
  const [meta, google, tracking, lastTrackedOrder, lastSentOrder] = await Promise.all([
    db.metaConnection.findUnique({ where: { shop } }).catch(() => null),
    db.googleConnection.findUnique({ where: { shop } }).catch(() => null),
    db.trackingSettings.findUnique({ where: { shop } }).catch(() => null),
    db.purchase.findFirst({ where: { shop, visitorId: { not: null } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
    db.purchase.findFirst({ where: { shop, capiSentAt: { not: null } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
  ]);
  const { isWidgetsEmbedLive, appEmbedUrl } = await import("~/services/themeEditor.server");
  const widgetsLive = await Promise.race([isWidgetsEmbedLive(shop), new Promise((r) => setTimeout(() => r(null), 2500))]).catch(() => null);

  const recent = (d, days) => !!d && Date.now() - new Date(d).getTime() < days * DAY;
  const metaTokenOk = !!(meta?.accessToken && meta.accessToken !== "__PENDING__");
  const googleTokenOk = !!(google?.accessToken && google.accessToken !== "__PENDING__");

  const steps = {
    meta: !metaTokenOk
      ? { done: false, detail: "Not connected." }
      : !meta.adAccountId
        ? { done: false, detail: "Connected, but no ad account chosen yet." }
        : recent(meta.lastSyncedAt, 2)
          ? { done: true, detail: `Spend last synced ${new Date(meta.lastSyncedAt).toLocaleString()}.` }
          : { done: false, detail: meta.lastSyncedAt ? `Last sync ${new Date(meta.lastSyncedAt).toLocaleString()} — more than 2 days ago.` : "Connected, but spend hasn't synced yet." },
    google: !googleTokenOk
      ? { done: false, detail: "Not connected." }
      : !google.adCustomerId
        ? { done: false, detail: "Connected, but no ad account chosen yet." }
        : google.lastSyncError
          ? { done: false, detail: `Connected, but spend isn't syncing: ${google.lastSyncError}` }
          : recent(google.lastSyncedAt, 2)
            ? { done: true, detail: `Spend last synced ${new Date(google.lastSyncedAt).toLocaleString()}.` }
            : { done: false, detail: "Connected, but spend hasn't synced yet." },
    tracking: !tracking?.trackingEnabled
      ? { done: false, detail: "Tracking is switched off in Tracking & Attribution settings." }
      : recent(tracking?.pixelLastSeenAt, 2)
        ? { done: true, detail: `Last storefront event ${new Date(tracking.pixelLastSeenAt).toLocaleString()}.` }
        : { done: false, detail: tracking?.pixelLastSeenAt ? `No storefront events since ${new Date(tracking.pixelLastSeenAt).toLocaleString()}.` : "No storefront events received yet." },
    conversions: recent(lastTrackedOrder?.createdAt, 30)
      ? { done: true, detail: `Last order with a tracked visit: ${new Date(lastTrackedOrder.createdAt).toLocaleString()}.${lastSentOrder ? ` Last purchase sent to ad platforms: ${new Date(lastSentOrder.createdAt).toLocaleString()}.` : ""}` }
      : { done: false, detail: "No order with a tracked visit in the last 30 days yet." },
    widgets: widgetsLive === null
      ? { done: false, detail: "Couldn't check your storefront right now.", unknown: true }
      : widgetsLive
        ? { done: true, detail: "The Attribix Widgets app embed is on in your live theme." }
        : { done: false, detail: "The Attribix Widgets app embed isn't on in your live theme, so reviews and newsletter forms won't show." },
  };

  steps.meta.connected = metaTokenOk;
  steps.google.connected = googleTokenOk;
  return json({ shop, steps, embedUrl: appEmbedUrl(shop) });
}

function StepHeader({ number, title, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: done ? "#00A47C" : "#F6F6F7",
        border: done ? "none" : "2px solid #C9CED4",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {done
          ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : <span style={{ fontSize: 13, fontWeight: 700, color: "#6D7175" }}>{number}</span>
        }
      </div>
      <span style={{ fontSize: 17, fontWeight: 700, color: "#202223" }}>{title}</span>
      {done && <span style={{ fontSize: 12, background: "#F1FBF8", color: "#008060", borderRadius: 20, padding: "2px 10px", border: "1px solid #B5E9D8", fontWeight: 600 }}>Complete</span>}
    </div>
  );
}

function FeatureList({ items }) {
  return (
    <ul style={{ margin: "8px 0 16px", padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
      {items.map(item => (
        <li key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#202223" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="7" fill="#F1FBF8" /><path d="M4 7.5l2 2L10 5.5" stroke="#00A47C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function SetupGuide() {
  const data = useLoaderData();
  const navigate = useNavigate();

  return (
    <div style={{ padding: "20px 20px 60px", maxWidth: 820, margin: "0 auto", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => navigate("/app/integrations")} style={{ background: "none", border: "none", cursor: "pointer", color: "#6D7175", fontSize: 13, padding: 0, marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>
          ← Back to Integrations
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#202223", margin: "0 0 6px" }}>Setup guide</h1>
        <p style={{ color: "#6D7175", fontSize: 15, margin: 0 }}>Follow these steps to get the most accurate attribution and ad data.</p>
      </div>

      {/* Progress bar */}
      {(() => {
        const steps = Object.values(data.steps).filter((st) => !st.unknown).map((st) => st.done);
        const done = steps.filter(Boolean).length;
        const pct = Math.round((done / steps.length) * 100);
        return (
          <div style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 10, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#202223" }}>{done} of {steps.length} steps complete</span>
                <span style={{ fontSize: 13, color: "#6D7175" }}>{pct}%</span>
              </div>
              <div style={{ background: "#F6F6F7", borderRadius: 8, height: 8, overflow: "hidden" }}>
                <div style={{ background: "#008060", height: "100%", width: `${pct}%`, borderRadius: 8, transition: "width 0.3s" }} />
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Step 1: Meta */}
        <div style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 12, padding: 24 }}>
          <StepHeader number={1} title="Connect Meta" done={data.steps.meta.done} />
          <StepDetail step={data.steps.meta} />
          <p style={{ color: "#6D7175", fontSize: 14, margin: "0 0 4px", lineHeight: 1.6 }}>
            Connecting Meta enables server-side Conversions API (CAPI) tracking, ad spend import from Facebook and Instagram, and reliable attribution even with ad blockers or iOS restrictions.
          </p>
          <FeatureList items={["Import Facebook & Instagram spend", "Server-side CAPI events", "Attribution without browser pixels", "Cross-device tracking"]} />
          <div style={{ background: "#FFF9E6", border: "1px solid #FFE4A0", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#7C5C00" }}>
            <strong>You'll need:</strong> A Meta Business account with admin access to your ad account and a Facebook pixel already set up.
          </div>
          <button
            onClick={() => navigate("/app/integrations/meta")}
            style={{ background: data.steps.meta.done ? "#F6F6F7" : "#008060", color: data.steps.meta.done ? "#202223" : "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {data.steps.meta.connected ? "Manage Meta →" : "Connect Meta →"}
          </button>
        </div>

        {/* Step 2: Google Ads */}
        <div style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 12, padding: 24 }}>
          <StepHeader number={2} title="Connect Google Ads" done={data.steps.google.done} />
          <StepDetail step={data.steps.google} />
          <p style={{ color: "#6D7175", fontSize: 14, margin: "0 0 4px", lineHeight: 1.6 }}>
            Connect your Google Ads account to sync daily spend, view campaign-level ROAS, and automatically upload offline conversions — improving Smart Bidding signals without relying on browser pixels.
          </p>
          <FeatureList items={["Sync Google Ads spend daily", "Upload offline conversions", "ROAS per campaign", "Works with P-Max & Search"]} />
          <div style={{ background: "#FFF9E6", border: "1px solid #FFE4A0", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#7C5C00" }}>
            <strong>You'll need:</strong> A Google Ads account with manager access. Make sure Enhanced Conversions is enabled in your Google Ads settings.
          </div>
          <button
            onClick={() => navigate("/app/integrations/google")}
            style={{ background: data.steps.google.done ? "#F6F6F7" : "#008060", color: data.steps.google.done ? "#202223" : "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {data.steps.google.connected ? "Manage Google Ads →" : "Connect Google Ads →"}
          </button>
        </div>

        {/* Step 3: Store tracking */}
        <div style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 12, padding: 24 }}>
          <StepHeader number={3} title="Verify store tracking" done={data.steps.tracking.done} />
          <StepDetail step={data.steps.tracking} />
          <p style={{ color: "#6D7175", fontSize: 14, margin: "0 0 12px", lineHeight: 1.6 }}>
            Attribix tracks orders using a lightweight web pixel extension installed directly in your Shopify store. Once active, it records the ad click or referral source for orders whose visits it can see. Some orders will still show as not tracked, for example when a buyer declines cookies or uses an ad blocker.
          </p>
          <div style={{ background: "#F6F6F7", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#202223", marginBottom: 8 }}>How to verify</div>
            <ol style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "#6D7175", lineHeight: 1.8 }}>
              <li>Go to your Shopify Admin → <strong>Online Store → Customer events</strong></li>
              <li>Look for the <strong>Attribix</strong> pixel and confirm it shows as Active</li>
              <li>Place a test order — the pixel status in Attribix should update within minutes</li>
            </ol>
          </div>
          <button
            onClick={() => navigate("/app/settings")}
            style={{ background: "#F6F6F7", color: "#202223", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            View tracking settings →
          </button>
        </div>

        {/* Step 4: Verify conversions */}
        <div style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 12, padding: 24 }}>
          <StepHeader number={4} title="Verify conversion events" done={data.steps.conversions.done} />
          <StepDetail step={data.steps.conversions} />
          <p style={{ color: "#6D7175", fontSize: 14, margin: "0 0 12px", lineHeight: 1.6 }}>
            Once all integrations are set up, verify that conversion events are being sent correctly to Meta and Google Ads. Your attribution dashboard will show the first events within a few minutes of a purchase.
          </p>
          <div style={{ background: "#F6F6F7", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#202223", marginBottom: 8 }}>How to verify</div>
            <ol style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "#6D7175", lineHeight: 1.8 }}>
              <li>Place a real or test order in your store</li>
              <li>Check <strong>Meta Events Manager</strong> → test events should appear within 5 min</li>
              <li>Check <strong>Google Ads → Conversions</strong> → offline conversion should be uploaded within 24h</li>
              <li>Your Attribix analytics page will show the matched conversion immediately</li>
            </ol>
          </div>
          <button
            onClick={() => navigate("/app/analytics")}
            style={{ background: "#F6F6F7", color: "#202223", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            View analytics →
          </button>
        </div>

        {/* Step 5: Storefront widgets */}
        <div style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 12, padding: 24 }}>
          <StepHeader number={5} title="Turn on storefront widgets" done={data.steps.widgets.done} />
          <StepDetail step={data.steps.widgets} />
          <p style={{ color: "#6D7175", fontSize: 14, margin: "0 0 12px", lineHeight: 1.6 }}>
            Reviews and newsletter sign-up forms appear on your store through the Attribix Widgets app embed. Open the theme editor, make sure it's switched on, and click Save.
          </p>
          <a
            href={data.embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", background: data.steps.widgets.done ? "#F6F6F7" : "#008060", color: data.steps.widgets.done ? "#202223" : "#fff", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
          >
            Open theme editor ↗
          </a>
        </div>

      </div>
    </div>
  );
}

function StepDetail({ step }) {
  return (
    <p style={{ fontSize: 13, margin: "0 0 12px", lineHeight: 1.5, color: step.done ? "#006e52" : step.unknown ? "#6D7175" : "#8a5300" }}>
      {step.detail}
    </p>
  );
}

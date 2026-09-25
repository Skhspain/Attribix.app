import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }) {
  const result = await authenticate.admin(request);

  if (
    result &&
    typeof result === "object" &&
    typeof result.status === "number" &&
    result.headers &&
    typeof result.headers.get === "function"
  ) {
    return result;
  }

  const shop = result.session.shop;

  const [metaConn, googleConn, tracking] = await Promise.all([
    db.metaConnection.findUnique({ where: { shop } }).catch(() => null),
    db.googleConnection.findUnique({ where: { shop } }).catch(() => null),
    db.trackingSettings.findUnique({ where: { shop } }).catch(() => null),
  ]);

  return json({
    metaConnected: !!(metaConn && metaConn.accessToken && metaConn.accessToken !== "__PENDING__"),
    googleConnected: !!(googleConn && googleConn.accessToken && googleConn.accessToken !== "__PENDING__"),
    storeTrackingActive: !!(tracking?.trackingEnabled && tracking?.pixelLastSeenAt),
    conversionEventsVerified: !!(tracking?.lastEventAt),
  });
}

function CheckIcon({ done, partial }) {
  if (done) return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#00A47C" />
      <path d="M6 10.5l2.5 2.5L14 7.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (partial) return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="#8C9196" strokeWidth="2" strokeDasharray="4 3" />
    </svg>
  );
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="#C9CED4" strokeWidth="2" />
    </svg>
  );
}

function StatusDot({ connected }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: connected ? "#F1FBF8" : "#FFF4E5",
      color: connected ? "#008060" : "#B98900",
      borderRadius: 20, padding: "2px 10px 2px 6px",
      fontSize: 13, fontWeight: 600, border: `1px solid ${connected ? "#B5E9D8" : "#FFD79D"}`,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: connected ? "#00A47C" : "#FFC453", display: "inline-block"
      }} />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

export default function IntegrationsIndex() {
  const { metaConnected, googleConnected, storeTrackingActive, conversionEventsVerified } = useLoaderData();
  const navigate = useNavigate();

  const checklist = [
    { label: "Meta connected", done: metaConnected, href: "/app/integrations/meta" },
    { label: "Google Ads connected", done: googleConnected, href: "/app/integrations/google" },
    { label: "Store tracking active", done: storeTrackingActive, href: "/app/settings" },
    { label: "Conversion events verified", done: conversionEventsVerified, partial: !conversionEventsVerified, href: "/app/analytics" },
  ];

  return (
    <div style={{ padding: "20px 20px 40px", maxWidth: 1100, margin: "0 auto", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #1a1f36 0%, #2d3561 100%)",
        borderRadius: 12, padding: "32px 40px", marginBottom: 24,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        overflow: "hidden", position: "relative",
      }}>
        <div style={{ zIndex: 1 }}>
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 700, margin: "0 0 8px" }}>
            Connect your marketing platforms
          </h1>
          <p style={{ color: "#a0aec0", fontSize: 15, margin: 0, maxWidth: 420 }}>
            Sync ad spend, track conversions, and send better data back to Meta and Google.
          </p>
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center", zIndex: 1 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Meta_Platforms_Inc._logo.svg/120px-Meta_Platforms_Inc._logo.svg.png" alt="Meta" style={{ width: 40, objectFit: "contain" }} />
          </div>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Google_Ads_logo.svg/120px-Google_Ads_logo.svg.png" alt="Google Ads" style={{ width: 40, objectFit: "contain" }} />
          </div>
        </div>
      </div>

      {/* Status row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Meta", status: metaConnected, desc: metaConnected ? "Server-side tracking active" : "Connect to enable Meta CAPI" },
          { label: "Google Ads", status: googleConnected, desc: googleConnected ? "Spend syncing active" : "Connect to sync spend and conversions" },
          { label: "Attribution ready", status: storeTrackingActive, desc: "Orders can be matched to campaigns" },
        ].map((item) => (
          <div key={item.label} style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: item.status ? "#F1FBF8" : "#FFF4E5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {item.status
                ? <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="9" fill="#00A47C" /><path d="M5.5 9.5l2 2L12.5 7" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                : <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#FFC453" strokeWidth="2" /><path d="M9 5.5V9.5M9 11.5v.5" stroke="#FFC453" strokeWidth="1.8" strokeLinecap="round" /></svg>
              }
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#202223", marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "#6D7175" }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main content + sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Meta card */}
          <div style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 12, padding: 28, display: "flex", gap: 24, alignItems: "flex-start" }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: "#F2F4FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Meta_Platforms_Inc._logo.svg/120px-Meta_Platforms_Inc._logo.svg.png" alt="Meta" style={{ width: 36, objectFit: "contain" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#202223" }}>Meta</span>
                <StatusDot connected={metaConnected} />
              </div>
              <p style={{ color: "#6D7175", fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 }}>
                Sync Facebook and Instagram Ads, import campaign spend, and send server-side conversion events through Meta CAPI.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
                {["Tracks ad spend", "Supports Meta CAPI", "Improves attribution", "Lead Ads syncing"].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#202223" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="7" fill="#F1FBF8" /><path d="M4 7.5l2 2L10 5.5" stroke="#00A47C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate("/app/integrations/meta")}
                style={{ background: metaConnected ? "#F6F6F7" : "#008060", color: metaConnected ? "#202223" : "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                {metaConnected ? "Manage" : "Connect Meta"}
              </button>
            </div>
            <div style={{ background: "#F6F6F7", borderRadius: 10, padding: "14px 18px", minWidth: 120, textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: "#6D7175", marginBottom: 4 }}>Conversions</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#008060" }}>+128</div>
              <svg width="80" height="30" viewBox="0 0 80 30" fill="none" style={{ marginTop: 6 }}>
                <polyline points="0,25 15,20 30,15 45,10 60,8 80,3" stroke="#00A47C" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Google Ads card */}
          <div style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 12, padding: 28, display: "flex", gap: 24, alignItems: "flex-start" }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: "#FFF8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Google_Ads_logo.svg/120px-Google_Ads_logo.svg.png" alt="Google Ads" style={{ width: 36, objectFit: "contain" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#202223" }}>Google Ads</span>
                <StatusDot connected={googleConnected} />
              </div>
              <p style={{ color: "#6D7175", fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 }}>
                Connect Google Ads to sync daily spend, track ROAS, and upload conversion data for better optimization.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
                {["Syncs campaign spend", "Uploads conversions", "Tracks Google ROAS", "Supports P-Max and Search"].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#202223" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="7" fill="#F1FBF8" /><path d="M4 7.5l2 2L10 5.5" stroke="#00A47C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate("/app/integrations/google")}
                style={{ background: googleConnected ? "#F6F6F7" : "#008060", color: googleConnected ? "#202223" : "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                {googleConnected ? "Manage" : "Connect Google Ads"}
              </button>
            </div>
            <div style={{ background: "#F6F6F7", borderRadius: 10, padding: "14px 18px", minWidth: 120, textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: "#6D7175", marginBottom: 4 }}>ROAS</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#008060" }}>4.2x</div>
              <svg width="80" height="30" viewBox="0 0 80 30" fill="none" style={{ marginTop: 6 }}>
                <polyline points="0,28 15,22 30,18 45,12 60,9 80,4" stroke="#00A47C" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Help card */}
          <div style={{ background: "#F9FAFB", border: "1px solid #E4E5E7", borderRadius: 12, padding: "22px 28px", display: "flex", alignItems: "center", gap: 20 }}>
            <span style={{ fontSize: 36 }}>🎓</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#202223", marginBottom: 4 }}>Need help setting up?</div>
              <div style={{ fontSize: 13, color: "#6D7175" }}>Follow our step-by-step guides to connect your accounts and get the most out of Attribix.</div>
            </div>
            <button
              onClick={() => navigate("/app/setup")}
              style={{ background: "#fff", color: "#202223", border: "1px solid #C9CED4", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              View setup guides →
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 12, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>🚀</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#202223" }}>Why integrations matter</span>
            </div>
            <p style={{ fontSize: 13, color: "#6D7175", lineHeight: 1.6, margin: "0 0 12px" }}>
              Attribix uses these connections to combine your ad spend, orders, leads, and conversion events in one place. This gives you better ROAS reporting and helps ad platforms optimize with cleaner data.
            </p>
            <span onClick={() => navigate("/app/analytics")} style={{ fontSize: 13, color: "#2563EB", fontWeight: 500, textDecoration: "none", cursor: "pointer" }}>Learn more →</span>
          </div>

          <div style={{ background: "#fff", border: "1px solid #E4E5E7", borderRadius: 12, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#202223" }}>Setup checklist</div>
              <span onClick={() => navigate("/app/setup")} style={{ fontSize: 12, color: "#2563EB", textDecoration: "none", fontWeight: 500, cursor: "pointer" }}>View guide →</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {checklist.map((item) => (
                <div key={item.label} onClick={() => navigate(item.href)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 7, cursor: "pointer", background: "transparent", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F6F6F7"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <CheckIcon done={item.done} partial={item.partial} />
                  <span style={{ fontSize: 13, color: item.done ? "#202223" : "#6D7175", fontWeight: item.done ? 500 : 400, flex: 1 }}>{item.label}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6l-3.5 3.5" stroke="#C9CED4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

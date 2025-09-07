// app/routes/app.settings.jsx
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import * as React from "react";

// Helper to get the current shop. Replace with your real session/shop logic.
async function getCurrentShop(request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("shop");
  if (fromQuery) return fromQuery;
  return "attribix-com.myshopify.com";
}

export const loader = async ({ request }) => {
  const shop = await getCurrentShop(request);
  const { getTrackingSettings } = await import("../models/trackingSettings.server.ts");
  const settings = await getTrackingSettings(shop);
  return json({ shop, settings });
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const shop = formData.get("shop");
  if (!shop || typeof shop !== "string") {
    return json({ ok: false, error: "Missing shop" }, { status: 400 });
  }

  const input = {
    ga4Id: (formData.get("ga4Id") || "").toString().trim() || null,
    ga4Secret: (formData.get("ga4Secret") || "").toString().trim() || null,
    fbPixelId: (formData.get("fbPixelId") || "").toString().trim() || null,
    fbToken: (formData.get("fbToken") || "").toString().trim() || null,
  };

  const { upsertTrackingSettings } = await import("../models/trackingSettings.server.ts");
  await upsertTrackingSettings(shop, input);
  return redirect(`/app/settings?shop=${encodeURIComponent(shop)}`);
};

export default function AppSettingsRoute() {
  // ✅ no generic here in .jsx
  const { shop, settings } = useLoaderData();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1>Tracking Settings</h1>
      <p style={{ color: "#666", marginTop: 6 }}>
        Set your Google Analytics 4 and Meta Pixel credentials. These are stored per shop and used by the tracking API.
      </p>

      <Form method="post" style={{ marginTop: 24 }}>
        <input type="hidden" name="shop" value={shop} />

        <fieldset style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <legend style={{ padding: "0 8px" }}>Google Analytics 4</legend>
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              <div>Measurement ID (e.g. G-XXXX)</div>
              <input name="ga4Id" defaultValue={settings?.ga4Id ?? ""} style={{ width: "100%", padding: 8 }} />
            </label>
            <label>
              <div>API Secret</div>
              <input name="ga4Secret" defaultValue={settings?.ga4Secret ?? ""} style={{ width: "100%", padding: 8 }} />
            </label>
          </div>
        </fieldset>

        <fieldset style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <legend style={{ padding: "0 8px" }}>Meta Pixel (Conversions API)</legend>
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              <div>Pixel ID</div>
              <input name="fbPixelId" defaultValue={settings?.fbPixelId ?? ""} style={{ width: "100%", padding: 8 }} />
            </label>
            <label>
              <div>Access Token</div>
              <input name="fbToken" defaultValue={settings?.fbToken ?? ""} style={{ width: "100%", padding: 8 }} />
            </label>
          </div>
        </fieldset>

        <button type="submit" disabled={busy} style={{ padding: "10px 16px" }}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </Form>
    </div>
  );
}

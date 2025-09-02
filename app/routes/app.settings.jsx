import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import * as React from "react";

/**
 * UI route for /app/settings
 * - No server modules at the top level.
 * - We dynamically import ../settings.server.js inside loader/action.
 */

export const loader = async ({ request }) => {
  // server-only dynamic import (note the relative path + .js)
  const { getSettings } = await import("../settings.server.js");

  // If you have shop info in session/cookies, read it here.
  // For now, just use a placeholder shop id:
  const shopId = "default-shop";

  const settings = await getSettings(shopId);
  return json({ settings, shopId });
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const { saveSettings } = await import("../settings.server.js");

  const shopId = formData.get("shopId") || "default-shop";
  const payload = {
    // add your fields here; a couple of examples:
    storeName: formData.get("storeName") ?? "",
    emailReports: formData.get("emailReports") === "on",
  };

  await saveSettings(shopId, payload);
  return redirect("/app/settings");
};

export default function AppSettingsRoute() {
  const { settings, shopId } = useLoaderData();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h1>Settings</h1>

      <Form method="post">
        <input type="hidden" name="shopId" value={shopId} />

        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Store name</label>
          <input
            name="storeName"
            defaultValue={settings?.storeName ?? ""}
            style={{ width: "100%", padding: 8, marginTop: 6 }}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              name="emailReports"
              defaultChecked={!!settings?.emailReports}
            />
            Email weekly reports
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          style={{ marginTop: 24, padding: "10px 16px" }}
        >
          {busy ? "Saving..." : "Save settings"}
        </button>
      </Form>
    </div>
  );
}

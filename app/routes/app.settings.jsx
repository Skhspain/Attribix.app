// app/routes/app.settings.jsx
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";

const ACTION_PATH = "/app/settings";
const ACTION_COOLDOWN_MS = 1200;

// Helper to get the current shop. Replace with your real session/shop logic.
async function getCurrentShop(request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("shop");
  if (fromQuery) return fromQuery;
  return "attribix-com.myshopify.com";
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function buildFormState(settings) {
  return {
    ga4Id: settings?.ga4Id ?? "",
    ga4Secret: settings?.ga4Secret ?? "",
    fbPixelId: settings?.fbPixelId ?? "",
    fbToken: settings?.fbToken ?? "",
    trackingEnabled: settings?.trackingEnabled !== false,
    attributionModel: settings?.attributionModel ?? "last_touch",
    attributionWindowDays: String(settings?.attributionWindowDays ?? "7"),
  };
}

function getSettingsSignature(settings) {
  return JSON.stringify({
    ga4Id: settings?.ga4Id ?? "",
    ga4Secret: settings?.ga4Secret ?? "",
    fbPixelId: settings?.fbPixelId ?? "",
    fbToken: settings?.fbToken ?? "",
    trackingEnabled: settings?.trackingEnabled !== false,
    trackingKey: settings?.trackingKey ?? null,
    pixelLastSeenAt: settings?.pixelLastSeenAt ?? null,
    lastEventAt: settings?.lastEventAt ?? null,
    attributionModel: settings?.attributionModel ?? "last_touch",
    attributionWindowDays: settings?.attributionWindowDays ?? 7,
  });
}

export const loader = async ({ request }) => {
  const shop = await getCurrentShop(request);
  const { getTrackingSettings } = await import("../models/trackingSettings.server.ts");
  const settings = await getTrackingSettings(shop);

  return json({
    shop,
    settings: settings ?? null,
  });
};

export const action = async ({ request }) => {
  console.log("[app.settings] action hit");

  const formData = await request.formData();
  const shop = formData.get("shop");

  if (!shop || typeof shop !== "string") {
    console.error("[app.settings] missing shop");
    return json({ ok: false, error: "Missing shop" }, { status: 400 });
  }

  const actionType = (formData.get("_action") || "save").toString();

  console.log("[app.settings] incoming", {
    shop,
    actionType,
  });

  const settingsModule = await import("../models/trackingSettings.server.ts");

  if (actionType === "generateTrackingKey") {
    console.log("[app.settings] generating tracking key for", shop);

    const key = await settingsModule.ensureTrackingKey(shop);
    const settings = await settingsModule.getTrackingSettings(shop);

    console.log("[app.settings] tracking key generated", key);

    return json({
      ok: true,
      action: actionType,
      trackingKey: key,
      settings: settings ?? null,
      message: "Tracking key generated",
    });
  }

  if (actionType === "rotateTrackingKey") {
    console.log("[app.settings] rotating tracking key for", shop);

    const key = await settingsModule.rotateTrackingKey(shop);
    const settings = await settingsModule.getTrackingSettings(shop);

    console.log("[app.settings] tracking key rotated", key);

    return json({
      ok: true,
      action: actionType,
      trackingKey: key,
      settings: settings ?? null,
      message: "Tracking key rotated",
    });
  }

  const input = {
    ga4Id: (formData.get("ga4Id") || "").toString().trim() || null,
    ga4Secret: (formData.get("ga4Secret") || "").toString().trim() || null,
    fbPixelId: (formData.get("fbPixelId") || "").toString().trim() || null,
    fbToken: (formData.get("fbToken") || "").toString().trim() || null,
    trackingEnabled: formData.get("trackingEnabled") === "on",
    attributionModel: (formData.get("attributionModel") || "last_touch").toString().trim(),
    attributionWindowDays: Math.max(1, Math.min(90, Number(formData.get("attributionWindowDays") || "7") || 7)),
  };

  console.log("[app.settings] saving settings", { shop, input });

  await settingsModule.upsertTrackingSettings(shop, input);
  await settingsModule.ensureTrackingKey(shop);

  const settings = await settingsModule.getTrackingSettings(shop);

  console.log("[app.settings] settings saved");

  return json({
    ok: true,
    action: actionType,
    settings: settings ?? null,
    message: "Settings saved",
  });
};

/**
 * We already return the fresh updated settings directly from the action.
 * Re-running this route loader immediately after each fetcher mutation is
 * unnecessary and is the most likely source of the lingering spinner feel.
 */
export function shouldRevalidate({
  formAction,
  formMethod,
  actionResult,
  defaultShouldRevalidate,
}) {
  const normalizedMethod =
    typeof formMethod === "string" ? formMethod.toUpperCase() : "";
  const isSettingsPost =
    normalizedMethod === "POST" &&
    typeof formAction === "string" &&
    formAction.includes("/app/settings");

  if (isSettingsPost && actionResult?.ok) {
    return false;
  }

  return defaultShouldRevalidate;
}

export default function AppSettingsRoute() {
  const { shop, settings: loaderSettings } = useLoaderData();

  const keyFetcher = useFetcher();
  const saveFetcher = useFetcher();

  const latestSettings =
    saveFetcher.data?.settings ??
    keyFetcher.data?.settings ??
    loaderSettings;

  const [trackingKeyText, setTrackingKeyText] = React.useState(
    latestSettings?.trackingKey ?? null,
  );

  const [formState, setFormState] = React.useState(() =>
    buildFormState(loaderSettings),
  );

  const [pendingAction, setPendingAction] = React.useState(null);
  const [cooldownUntil, setCooldownUntil] = React.useState(0);
  const [keyActionMessage, setKeyActionMessage] = React.useState("");
  const [settingsSignature, setSettingsSignature] = React.useState(() =>
    getSettingsSignature(loaderSettings),
  );

  const cooldownTimerRef = React.useRef(null);

  const now = Date.now();
  const isCoolingDown = cooldownUntil > now;

  React.useEffect(() => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }

    if (cooldownUntil > Date.now()) {
      cooldownTimerRef.current = setTimeout(() => {
        setCooldownUntil(0);
      }, Math.max(0, cooldownUntil - Date.now()));
    }

    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [cooldownUntil]);

  React.useEffect(() => {
    if (keyFetcher.data?.trackingKey) {
      setTrackingKeyText(keyFetcher.data.trackingKey);
    } else {
      setTrackingKeyText(latestSettings?.trackingKey ?? null);
    }
  }, [keyFetcher.data, latestSettings?.trackingKey]);

  React.useEffect(() => {
    const nextSignature = getSettingsSignature(latestSettings);

    if (nextSignature !== settingsSignature) {
      setFormState(buildFormState(latestSettings));
      setSettingsSignature(nextSignature);
    }
  }, [latestSettings, settingsSignature]);

  React.useEffect(() => {
    if (keyFetcher.data?.ok && keyFetcher.data?.action) {
      setPendingAction(null);
      setCooldownUntil(Date.now() + ACTION_COOLDOWN_MS);
      setKeyActionMessage(keyFetcher.data?.message || "");
    }
  }, [keyFetcher.data]);

  React.useEffect(() => {
    if (saveFetcher.data?.ok && saveFetcher.data?.action === "save") {
      setPendingAction(null);
    }
  }, [saveFetcher.data]);

  React.useEffect(() => {
    if (keyFetcher.data?.error || saveFetcher.data?.error) {
      setPendingAction(null);
      setCooldownUntil(0);
    }
  }, [keyFetcher.data, saveFetcher.data]);

  React.useEffect(() => {
    if (
      pendingAction === "generateTrackingKey" &&
      keyFetcher.state === "idle" &&
      keyFetcher.data?.action === "generateTrackingKey"
    ) {
      setPendingAction(null);
    }

    if (
      pendingAction === "rotateTrackingKey" &&
      keyFetcher.state === "idle" &&
      keyFetcher.data?.action === "rotateTrackingKey"
    ) {
      setPendingAction(null);
    }

    if (
      pendingAction === "save" &&
      saveFetcher.state === "idle" &&
      saveFetcher.data?.action === "save"
    ) {
      setPendingAction(null);
    }
  }, [pendingAction, keyFetcher.state, keyFetcher.data, saveFetcher.state, saveFetcher.data]);

  const isGenerating =
    pendingAction === "generateTrackingKey" ||
    (keyFetcher.state !== "idle" &&
      keyFetcher.formData?.get("_action") === "generateTrackingKey");

  const isRotating =
    pendingAction === "rotateTrackingKey" ||
    (keyFetcher.state !== "idle" &&
      keyFetcher.formData?.get("_action") === "rotateTrackingKey");

  const isSaving =
    pendingAction === "save" ||
    (saveFetcher.state !== "idle" &&
      saveFetcher.formData?.get("_action") === "save");

  const anyBusy =
    isGenerating ||
    isRotating ||
    isSaving ||
    keyFetcher.state !== "idle" ||
    saveFetcher.state !== "idle";

  function submitTrackingAction(actionName) {
    if (anyBusy || isCoolingDown) return;

    console.log("[app.settings] client submitTrackingAction", actionName);

    setPendingAction(actionName);
    setKeyActionMessage("");

    const fd = new FormData();
    fd.set("shop", shop);
    fd.set("_action", actionName);

    keyFetcher.submit(fd, {
      method: "post",
      action: ACTION_PATH,
    });
  }

  function onFieldChange(event) {
    const { name, type, checked, value } = event.target;

    setFormState((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function onSaveSubmit() {
    if (anyBusy) return;
    setPendingAction("save");
  }

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h1>Tracking Settings</h1>

      <p style={{ color: "#666", marginTop: 6 }}>
        Set your Google Analytics 4 and Meta Pixel credentials. These are stored
        per shop and used by the tracking API.
      </p>

      <div
        style={{
          marginTop: 20,
          marginBottom: 20,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          background: "#fafafa",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Tracking API</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <strong>Tracking shop:</strong> {shop}
          </div>

          <div>
            <strong>Tracking enabled:</strong>{" "}
            {latestSettings?.trackingEnabled === false ? "No" : "Yes"}
          </div>

          <div>
            <strong>Tracking key:</strong>{" "}
            <code style={{ wordBreak: "break-all" }}>
              {trackingKeyText || "Not generated yet"}
            </code>
          </div>

          <div>
            <strong>Pixel last seen:</strong>{" "}
            {formatDate(latestSettings?.pixelLastSeenAt)}
          </div>

          <div>
            <strong>Last event received:</strong>{" "}
            {formatDate(latestSettings?.lastEventAt)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          {!trackingKeyText ? (
            <button
              type="button"
              onClick={() => submitTrackingAction("generateTrackingKey")}
              disabled={anyBusy || isCoolingDown}
              style={{ padding: "10px 16px" }}
            >
              {isGenerating ? "Working…" : "Generate tracking key"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submitTrackingAction("rotateTrackingKey")}
              disabled={anyBusy || isCoolingDown}
              style={{ padding: "10px 16px" }}
            >
              {isRotating ? "Working…" : "Rotate tracking key"}
            </button>
          )}
        </div>

        {keyFetcher.data?.error ? (
          <p style={{ color: "crimson", marginTop: 12 }}>
            {String(keyFetcher.data.error)}
          </p>
        ) : null}

        {!keyFetcher.data?.error && keyActionMessage ? (
          <p style={{ color: "green", marginTop: 12 }}>
            {keyActionMessage}
          </p>
        ) : null}

        <p style={{ color: "#666", marginTop: 14, marginBottom: 0 }}>
          Use this tracking key in your storefront tracking payload. For a proper
          multi-shop SaaS setup, the pixel should send both the shop and the tracking key.
        </p>
      </div>

      {saveFetcher.data?.error ? (
        <p style={{ color: "crimson", marginBottom: 12 }}>
          {String(saveFetcher.data.error)}
        </p>
      ) : null}

      {saveFetcher.data?.ok && saveFetcher.data?.action === "save" ? (
        <p style={{ color: "green", marginBottom: 12 }}>
          {saveFetcher.data?.message || "Settings saved"}
        </p>
      ) : null}

      <saveFetcher.Form
        method="post"
        action={ACTION_PATH}
        style={{ marginTop: 24 }}
        onSubmit={onSaveSubmit}
      >
        <input type="hidden" name="shop" value={shop} />
        <input type="hidden" name="_action" value="save" />

        <fieldset
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <legend style={{ padding: "0 8px" }}>Google Analytics 4</legend>
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              <div>Measurement ID (e.g. G-XXXX)</div>
              <input
                name="ga4Id"
                value={formState.ga4Id}
                onChange={onFieldChange}
                style={{ width: "100%", padding: 8 }}
              />
            </label>

            <label>
              <div>API Secret</div>
              <input
                name="ga4Secret"
                value={formState.ga4Secret}
                onChange={onFieldChange}
                style={{ width: "100%", padding: 8 }}
              />
            </label>
          </div>
        </fieldset>

        <fieldset
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <legend style={{ padding: "0 8px" }}>Meta Pixel (Conversions API)</legend>
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              <div>Pixel ID</div>
              <input
                name="fbPixelId"
                value={formState.fbPixelId}
                onChange={onFieldChange}
                style={{ width: "100%", padding: 8 }}
              />
            </label>

            <label>
              <div>Access Token</div>
              <input
                name="fbToken"
                value={formState.fbToken}
                onChange={onFieldChange}
                style={{ width: "100%", padding: 8 }}
              />
            </label>
          </div>
        </fieldset>

        <fieldset
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <legend style={{ padding: "0 8px" }}>Tracking Control</legend>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              name="trackingEnabled"
              checked={formState.trackingEnabled}
              onChange={onFieldChange}
            />
            Enable tracking for this shop
          </label>
        </fieldset>

        <fieldset
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <legend style={{ padding: "0 8px" }}>Attribution</legend>
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              <div style={{ marginBottom: 4 }}>Attribution model</div>
              <select
                name="attributionModel"
                value={formState.attributionModel}
                onChange={onFieldChange}
                style={{ width: "100%", padding: 8 }}
              >
                <option value="last_touch">Last touch (default)</option>
                <option value="first_touch">First touch</option>
              </select>
            </label>
            <label>
              <div style={{ marginBottom: 4 }}>Attribution window (days, 1–90)</div>
              <input
                type="number"
                name="attributionWindowDays"
                value={formState.attributionWindowDays}
                onChange={onFieldChange}
                min={1}
                max={90}
                style={{ width: "100%", padding: 8 }}
              />
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={anyBusy}
          style={{ padding: "10px 16px" }}
        >
          {isSaving ? "Saving…" : "Save settings"}
        </button>
      </saveFetcher.Form>
    </div>
  );
}
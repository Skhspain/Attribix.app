import React, { useState, useEffect } from "react";

export default function Settings() {
  const [pixelId, setPixelId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/settings/tracking");
        if (res.ok) {
          const data = await res.json();
          setPixelId(data.pixelId || "");
          setEnabled(data.enabled || false);
        }
      } catch (e) {
        console.error("Failed to load settings", e);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const isValidPixelId = (id) => /^[0-9]+$/.test(id); // simple numeric check

  async function saveSettings() {
    if (!pixelId || !isValidPixelId(pixelId)) {
      setSaveStatus("Please enter a valid numeric Pixel ID.");
      return;
    }
    setSaveStatus("Saving...");
    try {
      const res = await fetch("/api/settings/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixelId, enabled }),
      });
      if (res.ok) {
        setSaveStatus("Settings saved!");
      } else {
        setSaveStatus("Failed to save settings.");
      }
    } catch (e) {
      console.error("Save error", e);
      setSaveStatus("Error saving settings.");
    }
  }

  if (loading) return <div>Loading settings...</div>;

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h2>Tracking Settings</h2>

      <label style={{ display: "block", marginBottom: "1rem" }}>
        Facebook Pixel ID:
        <input
          type="text"
          value={pixelId}
          onChange={(e) => setPixelId(e.target.value)}
          placeholder="Enter Facebook Pixel ID"
          style={{ width: "100%", padding: "8px", marginTop: "0.5rem" }}
          disabled={!enabled}
        />
      </label>

      <label style={{ display: "block", marginBottom: "1rem" }}>
        Enable Facebook Pixel Tracking:
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ marginLeft: "0.5rem" }}
        />
      </label>

      <button onClick={saveSettings} style={{ padding: "8px 16px" }}>
        Save Settings
      </button>

      {saveStatus && <p style={{ marginTop: "1rem" }}>{saveStatus}</p>}
    </div>
  );
}
// app/routes/app.reports.jsx
import React from "react";

export default function AppReports() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Reports (App)</h1>
      <p style={{ color: "#64748b" }}>
        This placeholder removes <strong>recharts</strong> usage in the app. Use the new
        <code style={{ marginLeft: 6, background: "#f1f5f9", padding: "2px 6px", borderRadius: 6 }}>
          /analytics
        </code>{" "}
        route for live KPIs.
      </p>
    </div>
  );
}

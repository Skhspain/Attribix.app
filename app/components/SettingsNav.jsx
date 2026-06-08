// app/components/SettingsNav.jsx
// Left-sidebar navigation shared across all /app/settings/* pages.
import { useLocation } from "@remix-run/react";

const ITEMS = [
  { label: "General",                href: "/app/settings/general",       match: "prefix" },
  { label: "Tracking & Attribution", href: "/app/settings",               match: "exact"  },
  { label: "Integrations",           href: "/app/integrations/meta",      match: "prefix" },
  { label: "Notifications",          href: "/app/settings/notifications",  match: "prefix" },
  { label: "Billing",                href: "/app/billing",                match: "prefix" },
];

export function SettingsNav() {
  const { pathname } = useLocation();

  return (
    <nav style={{
      width: 192,
      flexShrink: 0,
      marginRight: 32,
      paddingTop: 2,
    }}>
      <p style={{
        margin: "0 0 8px 0",
        padding: "0 10px",
        fontSize: 11,
        fontWeight: 700,
        color: "#9ca3af",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
      }}>
        Settings
      </p>
      {ITEMS.map(({ label, href, match }) => {
        const isActive =
          match === "exact"
            ? pathname === href || pathname === `${href}/`
            : pathname.startsWith(href);
        return (
          <a
            key={href}
            href={href}
            style={{
              display: "block",
              padding: "8px 10px",
              paddingLeft: isActive ? 7 : 10,
              borderLeft: `3px solid ${isActive ? "#4f46e5" : "transparent"}`,
              borderRadius: "0 7px 7px 0",
              fontSize: 13.5,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "#111827" : "#4b5563",
              background: isActive ? "#f3f4f6" : "transparent",
              textDecoration: "none",
              marginBottom: 2,
            }}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}

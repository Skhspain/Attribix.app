// app/components/SettingsNav.jsx
// Left-sidebar navigation shared across all /app/settings/* pages.
import { useLocation, Link } from "@remix-run/react";

const ITEMS = [
  { label: "General",                href: "/app/settings/general",       match: "prefix" },
  { label: "Tracking & Attribution", href: "/app/settings",               match: "exact"  },
  { label: "Integrations",           href: "/app/integrations",           match: "prefix" },
  { label: "Notifications",          href: "/app/settings/notifications",  match: "prefix" },
  { label: "Billing",                href: "/app/billing",                match: "prefix" },
];

export function SettingsNav() {
  const { pathname } = useLocation();

  return (
    <nav className="ax-settings-nav" aria-label="Settings">
      {/* Side column on desktop; a scrollable row above the content on phones. */}
      <style>{`
        .ax-settings-layout { display: flex; align-items: flex-start; }
        .ax-settings-layout > :last-child { flex: 1; min-width: 0; }
        .ax-settings-nav { width: 192px; flex-shrink: 0; margin-right: 32px; padding-top: 2px; }
        @media (max-width: 720px) {
          .ax-settings-layout { flex-direction: column; align-items: stretch; }
          .ax-settings-nav { width: auto; margin: 0 0 16px; display: flex; gap: 4px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .ax-settings-nav > p { display: none; }
          .ax-settings-nav > a { flex: none; white-space: nowrap; }
        }
      `}</style>
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
          <Link
            key={href}
            to={href}
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
          </Link>
        );
      })}
    </nav>
  );
}

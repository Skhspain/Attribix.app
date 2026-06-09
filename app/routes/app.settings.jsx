// app/routes/app.settings.jsx — Layout shell for all /app/settings/* pages.
// This file MUST stay a bare Outlet; the actual index content is in
// app.settings._index.jsx.  Without an Outlet here, Remix silently drops
// every child route and renders a blank page.
import { Outlet } from "@remix-run/react";

export default function SettingsLayout() {
  return <Outlet />;
}

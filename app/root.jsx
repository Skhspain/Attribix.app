// app/root.jsx
import { Links, LiveReload, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";
import stylesHref from "./styles/app.css?url";

export const links = () => [{ rel: "stylesheet", href: stylesHref }];
export const meta = () => [{ title: "Attribix App" }];

export default function App() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

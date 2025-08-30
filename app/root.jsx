import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import stylesHref from "./styles/app.css?url";

export const links = () => [{ rel: "stylesheet", href: stylesHref }];

export const meta = () => ([
  { charSet: "utf-8" },
  { title: "Attribix" },
  { name: "viewport", content: "width=device-width,initial-scale=1" },
]);

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

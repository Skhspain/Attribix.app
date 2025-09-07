// app/routes/app.jsx
import { json } from "@remix-run/node";
import {
  Outlet,
  useLoaderData,
  useNavigation,
  Link,
} from "@remix-run/react";
// ⬇️ change named import -> default import
import shopify from "../shopify.server";

// ALWAYS return JSON or a redirect so useLoaderData() is never null
export async function loader({ request }) {
  await shopify.authenticate.admin(request); // ensures embedded Admin auth
  return json({ ok: true });
}

export default function App() {
  const data = useLoaderData();
  // ...rest of your component; `data.ok` is available if you need it
  return <Outlet />;
}

// app/routes/_index.tsx (or wherever your splash is)
import { Form } from "@remix-run/react";

export default function Index() {
  return (
    <main>
      {/* ...heading, copy, etc... */}
      <Form method="post" action="/auth/login">
        <input
          name="shop"
          type="text"
          placeholder="my-shop-domain.myshopify.com"
          required
        />
        <button type="submit">Log in</button>
      </Form>
    </main>
  );
}

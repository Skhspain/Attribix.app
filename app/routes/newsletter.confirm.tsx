// app/routes/newsletter.confirm.tsx
// Public double opt-in page, linked from the confirmation email.
// Confirming needs a click on the button (POST), so link scanners that open
// every URL in an email can't confirm subscriptions on someone's behalf.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { confirmSubscription, verifyConfirmToken } from "~/services/newsletter.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const parsed = verifyConfirmToken(token);
  return json({ valid: !!parsed, email: parsed?.email ?? "", token, done: false });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const parsed = verifyConfirmToken(token);
  if (!parsed) return json({ valid: false, email: "", token, done: false });

  const ip = request.headers.get("fly-client-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ok = await confirmSubscription(parsed.shop, parsed.email, ip);
  return json({ valid: ok, email: parsed.email, token, done: ok });
}

export default function ConfirmPage() {
  const loaderData = useLoaderData<typeof loader>();
  const data = (useActionData<typeof action>() as typeof loaderData | undefined) ?? loaderData;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {!data.valid ? (
          <>
            <h1 style={styles.title}>This link has expired</h1>
            <p style={styles.body}>Sign up again on the store's website and we'll send you a new confirmation email.</p>
          </>
        ) : data.done ? (
          <>
            <h1 style={styles.title}>You're subscribed</h1>
            <p style={styles.body}>
              Thanks — <strong>{data.email}</strong> will now receive our emails. You can unsubscribe at any time from the link at the bottom of every email.
            </p>
          </>
        ) : (
          <>
            <h1 style={styles.title}>Confirm your subscription</h1>
            <p style={styles.body}>
              Subscribe <strong>{data.email}</strong> to our newsletter?
            </p>
            <Form method="post">
              <input type="hidden" name="token" value={data.token} />
              <button type="submit" style={styles.button}>Yes, subscribe me</button>
            </Form>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: 16 },
  card: { background: "#fff", borderRadius: 12, padding: "40px 32px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,.08)", maxWidth: 440, width: "100%" },
  title: { fontSize: 22, fontWeight: 600, color: "#1a1a1a", margin: "0 0 12px" },
  body: { color: "#4b5563", fontSize: 15, lineHeight: 1.6, margin: "0 0 24px" },
  button: { background: "#111827", color: "#fff", border: "none", padding: "12px 28px", borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: "pointer" },
};

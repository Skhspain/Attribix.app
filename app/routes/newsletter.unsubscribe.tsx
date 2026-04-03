// app/routes/newsletter.unsubscribe.tsx
// Public unsubscribe page — linked from every newsletter email footer.
// NEW FILE.

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { verifyUnsubscribeToken, unsubscribeEmail } from "~/services/newsletter.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const parsed = verifyUnsubscribeToken(token);

  return json({
    valid: !!parsed,
    email: parsed?.email ?? "",
    token,
    done: false,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const token = form.get("token") as string;

  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) {
    return json({ valid: false, email: "", token, done: false });
  }

  await unsubscribeEmail(parsed.shop, parsed.email);
  return json({ valid: true, email: parsed.email, token, done: true });
}

export default function UnsubscribePage() {
  const data = useLoaderData<typeof loader>();

  if (!data.valid) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.icon}>❌</div>
          <h1 style={styles.title}>Invalid Link</h1>
          <p style={styles.body}>This unsubscribe link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  if (data.done) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.icon}>✅</div>
          <h1 style={styles.title}>Unsubscribed</h1>
          <p style={styles.body}>
            <strong>{data.email}</strong> has been removed from our mailing list.
            You won't receive any further newsletters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.icon}>📧</div>
        <h1 style={styles.title}>Unsubscribe</h1>
        <p style={styles.body}>
          Do you want to unsubscribe <strong>{data.email}</strong> from our mailing list?
        </p>
        <Form method="post">
          <input type="hidden" name="token" value={data.token} />
          <button type="submit" style={styles.button}>
            Yes, unsubscribe me
          </button>
        </Form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f6f6f7",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: "40px 48px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,.08)",
    maxWidth: 440,
    width: "90%",
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 },
  body: { color: "#6d7175", fontSize: 15, lineHeight: 1.6, marginBottom: 24 },
  button: {
    display: "inline-block",
    background: "#dc2626",
    color: "#fff",
    border: "none",
    padding: "12px 28px",
    borderRadius: 8,
    fontWeight: 500,
    fontSize: 15,
    cursor: "pointer",
  },
};

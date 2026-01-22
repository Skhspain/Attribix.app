// app/routes/api/settings/tracking.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../../../shopify.server";

const NAMESPACE = "attribix";
const KEY_PIXEL_ID = "meta_pixel_id";
const KEY_ACCESS_TOKEN = "meta_access_token";

async function readTrackingMetafields(admin) {
  const query = `
    query TrackingMetafields {
      shop {
        pixel: metafield(namespace: "${NAMESPACE}", key: "${KEY_PIXEL_ID}") { value }
        token: metafield(namespace: "${NAMESPACE}", key: "${KEY_ACCESS_TOKEN}") { value }
      }
    }
  `;

  const res = await admin.graphql(query);
  const payload = await res.json();

  if (payload?.errors?.length) {
    const msg = payload.errors.map((e) => e.message).join(" | ");
    throw new Error(msg || "Shopify GraphQL error");
  }

  return {
    metaPixelId: payload?.data?.shop?.pixel?.value ?? "",
    metaAccessToken: payload?.data?.shop?.token?.value ?? "",
  };
}

async function writeTrackingMetafields(admin, { metaPixelId, metaAccessToken }) {
  const mutation = `
    mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }
  `;

  const metafields = [
    {
      namespace: NAMESPACE,
      key: KEY_PIXEL_ID,
      type: "single_line_text_field",
      value: String(metaPixelId ?? ""),
    },
    {
      namespace: NAMESPACE,
      key: KEY_ACCESS_TOKEN,
      type: "single_line_text_field",
      value: String(metaAccessToken ?? ""),
    },
  ];

  const res = await admin.graphql(mutation, { variables: { metafields } });
  const payload = await res.json();

  if (payload?.errors?.length) {
    const msg = payload.errors.map((e) => e.message).join(" | ");
    throw new Error(msg || "Shopify GraphQL error");
  }

  const userErrors = payload?.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length) {
    const msg = userErrors.map((e) => e?.message).filter(Boolean).join(" | ");
    throw new Error(msg || "Failed to save metafields");
  }

  return true;
}

export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const settings = await readTrackingMetafields(admin);
    return json(settings);
  } catch (e) {
    console.error("[/api/settings/tracking] loader error:", e);
    return json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);

    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const metaPixelId = String(body?.metaPixelId || "").trim();
    const metaAccessToken = String(body?.metaAccessToken || "").trim();

    if (metaPixelId && !/^\d+$/.test(metaPixelId)) {
      return json({ ok: false, error: "Meta Pixel ID must be numbers only." }, { status: 400 });
    }

    await writeTrackingMetafields(admin, { metaPixelId, metaAccessToken });

    return json({ ok: true });
  } catch (e) {
    console.error("[/api/settings/tracking] action error:", e);
    return json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

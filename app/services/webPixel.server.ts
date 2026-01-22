// app/services/webPixel.server.ts
type AdminApi = {
  graphql: (query: string, options?: { variables?: Record<string, any> }) => Promise<any>;
};

type EnsureResult = {
  action: "created" | "updated";
  webPixelId?: string;
  userErrors?: Array<{ field?: string[] | null; message: string }>;
  raw?: any;
};

function asString(x: any) {
  return typeof x === "string" ? x : "";
}

async function gql(admin: AdminApi, query: string, variables?: Record<string, any>) {
  const res = await admin.graphql(query, { variables });
  // In the Shopify Remix template, graphql returns a Response-like object you .json()
  if (typeof (res as any)?.json === "function") return (res as any).json();
  return res;
}

function pickUserErrors(obj: any): Array<{ field?: string[] | null; message: string }> {
  const ue = obj?.userErrors;
  if (Array.isArray(ue)) return ue.map((e) => ({ field: e?.field ?? null, message: asString(e?.message) }));
  return [];
}

/**
 * Ensure the Attribix web pixel exists for this shop and has the latest settings.
 * - If a pixel exists -> update it
 * - Otherwise -> create it
 */
export async function ensureAttribixWebPixel(admin: AdminApi, accountID: string): Promise<EnsureResult> {
  console.log("[webPixel] ensureAttribixWebPixel start", { accountID });

  // 1) Try to find an existing pixel (first one for this app)
  // The "settings" come from pixel configuration in Shopify; we set it here.
  const FIND = `#graphql
    query FindWebPixels {
      webPixels(first: 25) {
        edges {
          node {
            id
            settings
          }
        }
      }
    }
  `;

  let existingId: string | null = null;

  try {
    const found = await gql(admin, FIND);
    const edges = found?.data?.webPixels?.edges ?? [];
    if (Array.isArray(edges) && edges.length > 0) {
      // If multiple exist, we pick the first. (We can refine later by matching settings/app if needed.)
      existingId = edges?.[0]?.node?.id ?? null;
    }
    console.log("[webPixel] find result", { existingId, count: Array.isArray(edges) ? edges.length : 0 });
  } catch (e) {
    console.log("[webPixel] find query failed (continuing to create)", String((e as any)?.message || e));
    existingId = null;
  }

  const settings = {
    accountID: accountID || "",
  };

  // 2) Update if exists
  if (existingId) {
    const UPDATE = `#graphql
      mutation WebPixelUpdate($id: ID!, $settings: JSON!) {
        webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
          webPixel {
            id
            settings
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updated = await gql(admin, UPDATE, { id: existingId, settings });
    const payload = updated?.data?.webPixelUpdate;
    const userErrors = pickUserErrors(payload);

    console.log("[webPixel] update result", { id: existingId, userErrors });

    return {
      action: "updated",
      webPixelId: payload?.webPixel?.id ?? existingId,
      userErrors,
      raw: updated,
    };
  }

  // 3) Otherwise create
  const CREATE = `#graphql
    mutation WebPixelCreate($settings: JSON!) {
      webPixelCreate(webPixel: { settings: $settings }) {
        webPixel {
          id
          settings
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const created = await gql(admin, CREATE, { settings });
  const payload = created?.data?.webPixelCreate;
  const userErrors = pickUserErrors(payload);

  console.log("[webPixel] create result", {
    id: payload?.webPixel?.id,
    userErrors,
  });

  return {
    action: "created",
    webPixelId: payload?.webPixel?.id ?? undefined,
    userErrors,
    raw: created,
  };
}

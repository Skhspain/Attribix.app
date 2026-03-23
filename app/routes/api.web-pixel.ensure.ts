// app/routes/api.web-pixel.ensure.ts
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

type EnsureResult =
  | {
      ok: true;
      shop: string;
      accountID: string;
      action: "created" | "updated";
      webPixelId?: string;
      browserScriptTagId?: string;
      ms: number;
      note?: string;
    }
  | {
      ok: false;
      shop?: string;
      accountID?: string;
      error: string;
      hint?: string;
      stack?: string;
      authRedirect?: string;
      ms: number;
    };

type ScriptTagEnsureResult = {
  ok: boolean;
  action: "created" | "updated" | "unchanged" | "skipped";
  id?: string;
  src?: string;
  error?: string;
};

function msSince(t0: number) {
  return Date.now() - t0;
}

function noStoreHeaders(extra?: HeadersInit) {
  return {
    "Cache-Control": "no-store",
    ...(extra ?? {}),
  };
}

function isResponseLike(e: unknown): e is Response {
  return (
    !!e &&
    typeof e === "object" &&
    typeof (e as any).status === "number" &&
    typeof (e as any).headers?.get === "function"
  );
}

async function readAccountIDFromRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let accountID = "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    accountID = String(form.get("accountID") || "");
  } else if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    accountID = String((body as any)?.accountID || "");
  } else {
    const form = await request.formData().catch(() => null);
    if (form) accountID = String(form.get("accountID") || "");
  }

  return accountID.trim();
}

function readAccountIDFromUrl(request: Request) {
  try {
    const url = new URL(request.url);
    return (url.searchParams.get("accountID") || "").trim();
  } catch {
    return "";
  }
}

/**
 * Shopify expects `settings` to be a JSON OBJECT matching the Pixel extension settings schema.
 * Do NOT stringify it.
 */
function settingsObject(accountID: string) {
  return { accountID };
}

async function runGraphql(admin: any, query: string, variables?: any) {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const data = await res.json();

  const topErrors = data?.errors?.map((e: any) => e?.message).filter(Boolean);
  const topErrorText = Array.isArray(topErrors) && topErrors.length ? topErrors.join(" | ") : "";

  return { data, topErrorText };
}

const META_NAMESPACE = "attribix";
const META_KEY = "web_pixel_id";

function getAppOrigin(request: Request) {
  try {
    if (process.env.APP_URL?.trim()) {
      return process.env.APP_URL.trim().replace(/\/$/, "");
    }

    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://attribix-app.fly.dev";
  }
}

function getBrowserTrackScriptSrc(request: Request) {
  const origin = getAppOrigin(request);
  return `${origin}/attribix/browser-track`;
}

async function ensureBrowserContextScriptTag(
  admin: any,
  request: Request,
  shop: string,
): Promise<ScriptTagEnsureResult> {
  try {
    const desiredSrc = getBrowserTrackScriptSrc(request);

    const LIST_QUERY = `#graphql
      query ScriptTagsForAttribix {
        scriptTags(first: 50) {
          edges {
            node {
              id
              src
              displayScope
            }
          }
        }
      }
    `;

    const listRes = await runGraphql(admin, LIST_QUERY);

    if (listRes.topErrorText) {
      console.error("[webPixel] scriptTags query error", listRes.topErrorText);
      return {
        ok: false,
        action: "skipped",
        error: listRes.topErrorText,
      };
    }

    const nodes =
      listRes.data?.data?.scriptTags?.edges?.map((edge: any) => edge?.node).filter(Boolean) ?? [];

    const existing = nodes.find((node: any) => {
      const src = String(node?.src || "");
      return (
        src === desiredSrc ||
        src.startsWith(`${desiredSrc}?`) ||
        src.includes("/attribix/browser-track")
      );
    });

    if (existing) {
      const currentSrc = String(existing.src || "");
      const currentScope = String(existing.displayScope || "");

      if (currentSrc === desiredSrc && currentScope === "ONLINE_STORE") {
        console.log("[webPixel] browser ScriptTag unchanged", {
          shop,
          id: existing.id,
          src: existing.src,
          displayScope: existing.displayScope,
        });

        return {
          ok: true,
          action: "unchanged",
          id: existing.id,
          src: existing.src,
        };
      }

      const UPDATE_MUTATION = `#graphql
        mutation ScriptTagUpdate($id: ID!, $input: ScriptTagInput!) {
          scriptTagUpdate(id: $id, input: $input) {
            scriptTag {
              id
              src
              displayScope
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const upd = await runGraphql(admin, UPDATE_MUTATION, {
        id: existing.id,
        input: {
          src: desiredSrc,
          displayScope: "ONLINE_STORE",
          cache: false,
        },
      });

      if (upd.topErrorText) {
        console.error("[webPixel] scriptTagUpdate top-level error", upd.topErrorText);
        return {
          ok: false,
          action: "skipped",
          error: upd.topErrorText,
        };
      }

      const userErrors = upd.data?.data?.scriptTagUpdate?.userErrors ?? [];
      if (userErrors.length) {
        const text = userErrors.map((e: any) => e?.message).filter(Boolean).join(" | ");
        console.error("[webPixel] scriptTagUpdate userErrors", userErrors);
        return {
          ok: false,
          action: "skipped",
          error: text || "scriptTagUpdate returned userErrors",
        };
      }

      const updated = upd.data?.data?.scriptTagUpdate?.scriptTag;

      console.log("[webPixel] browser ScriptTag updated", {
        shop,
        id: updated?.id || existing.id,
        src: updated?.src || desiredSrc,
        displayScope: updated?.displayScope || "ONLINE_STORE",
      });

      return {
        ok: true,
        action: "updated",
        id: updated?.id || existing.id,
        src: updated?.src || desiredSrc,
      };
    }

    const CREATE_MUTATION = `#graphql
      mutation ScriptTagCreate($input: ScriptTagInput!) {
        scriptTagCreate(input: $input) {
          scriptTag {
            id
            src
            displayScope
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const crt = await runGraphql(admin, CREATE_MUTATION, {
      input: {
        src: desiredSrc,
        displayScope: "ONLINE_STORE",
        cache: false,
      },
    });

    if (crt.topErrorText) {
      console.error("[webPixel] scriptTagCreate top-level error", crt.topErrorText);
      return {
        ok: false,
        action: "skipped",
        error: crt.topErrorText,
      };
    }

    const userErrors = crt.data?.data?.scriptTagCreate?.userErrors ?? [];
    if (userErrors.length) {
      const text = userErrors.map((e: any) => e?.message).filter(Boolean).join(" | ");
      console.error("[webPixel] scriptTagCreate userErrors", userErrors);
      return {
        ok: false,
        action: "skipped",
        error: text || "scriptTagCreate returned userErrors",
      };
    }

    const created = crt.data?.data?.scriptTagCreate?.scriptTag;

    console.log("[webPixel] browser ScriptTag created", {
      shop,
      id: created?.id,
      src: created?.src || desiredSrc,
      displayScope: created?.displayScope || "ONLINE_STORE",
    });

    return {
      ok: true,
      action: "created",
      id: created?.id,
      src: created?.src || desiredSrc,
    };
  } catch (e: any) {
    const message = e?.message || String(e);
    console.error("[webPixel] ensureBrowserContextScriptTag unexpected error", message);

    return {
      ok: false,
      action: "skipped",
      error: message,
    };
  }
}

/**
 * IMPORTANT CHANGE:
 * If auth fails and Remix throws a redirect Response, we return JSON (401) instead of throwing.
 * That prevents the UI from getting HTML and “hanging”.
 */
async function ensureWebPixel(request: Request, accountID: string) {
  const t0 = Date.now();
  console.log("[webPixel] ENSURE HIT (start)");

  try {
    let session: any;
    let admin: any;

    try {
      const auth = await authenticate.admin(request);
      session = auth.session;
      admin = auth.admin;
    } catch (e: any) {
      if (isResponseLike(e)) {
        const loc = e.headers.get("Location") || "/auth/login";
        console.log("[webPixel] auth redirect intercepted -> returning JSON", {
          status: e.status,
          location: loc,
        });

        return json<EnsureResult>(
          {
            ok: false,
            error: "AUTH_REQUIRED",
            hint:
              "This endpoint must be called from inside Shopify Admin (embedded app). PowerShell/cURL will redirect to login.",
            authRedirect: loc,
            ms: msSince(t0),
          },
          {
            status: 401,
            headers: noStoreHeaders({ "X-Auth-Redirect": loc }),
          }
        );
      }

      throw e;
    }

    const shop = session.shop;

    if (!accountID) {
      return json<EnsureResult>(
        { ok: false, shop, accountID, error: "Missing accountID", ms: msSince(t0) },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    console.log("[webPixel] ensure payload", { shop, accountID, ms: msSince(t0) });

    // 1) Read currentAppInstallation + stored metafield pixel id
    const APP_INSTALL_QUERY = `#graphql
      query AppInstallWithMetafield($ns: String!, $key: String!) {
        currentAppInstallation {
          id
          metafield(namespace: $ns, key: $key) {
            id
            value
          }
        }
      }
    `;

    const appInstallRes = await runGraphql(admin, APP_INSTALL_QUERY, {
      ns: META_NAMESPACE,
      key: META_KEY,
    });

    if (appInstallRes.topErrorText) {
      console.log("[webPixel] currentAppInstallation query errors", appInstallRes.topErrorText);
      return json<EnsureResult>(
        {
          ok: false,
          shop,
          accountID,
          error: appInstallRes.topErrorText,
          hint: "Failed to read currentAppInstallation. Check app scopes and API version.",
          ms: msSince(t0),
        },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    const appInstallationId = appInstallRes.data?.data?.currentAppInstallation?.id as string | undefined;

    const storedWebPixelIdRaw = appInstallRes.data?.data?.currentAppInstallation?.metafield?.value as
      | string
      | undefined;

    const storedWebPixelId = storedWebPixelIdRaw?.trim() ? storedWebPixelIdRaw.trim() : null;

    if (!appInstallationId) {
      return json<EnsureResult>(
        {
          ok: false,
          shop,
          accountID,
          error: "Missing currentAppInstallation.id",
          hint: "Shopify did not return currentAppInstallation. Verify admin auth and scopes.",
          ms: msSince(t0),
        },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    console.log("[webPixel] app installation", { appInstallationId, storedWebPixelId });

    const desiredSettings = settingsObject(accountID);

    let finalAction: "created" | "updated" = "updated";
    let webPixelId: string | undefined;
    let note = "";

    // 2) UPDATE if stored pixel id exists
    if (storedWebPixelId) {
      const UPDATE_MUTATION_V2 = `#graphql
        mutation WebPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
          webPixelUpdate(id: $id, webPixel: $webPixel) {
            webPixel { id }
            userErrors { field message }
          }
        }
      `;

      const UPDATE_MUTATION_V1 = `#graphql
        mutation WebPixelUpdate($id: ID!, $settings: JSON!) {
          webPixelUpdate(id: $id, settings: $settings) {
            webPixel { id }
            userErrors { field message }
          }
        }
      `;

      let upd = await runGraphql(admin, UPDATE_MUTATION_V2, {
        id: storedWebPixelId,
        webPixel: { settings: desiredSettings },
      });

      if (
        upd.topErrorText &&
        /missing required arguments: webPixel|Unknown argument "webPixel"|argument "webPixel"/i.test(
          upd.topErrorText
        )
      ) {
        upd = await runGraphql(admin, UPDATE_MUTATION_V1, {
          id: storedWebPixelId,
          settings: desiredSettings,
        });
      }

      if (upd.topErrorText) {
        console.log("[webPixel] update top-level errors", upd.topErrorText);
        return json<EnsureResult>(
          {
            ok: false,
            shop,
            accountID,
            error: upd.topErrorText,
            hint: "Update failed. Most commonly settings schema mismatch or missing scopes.",
            ms: msSince(t0),
          },
          { status: 500, headers: noStoreHeaders() }
        );
      }

      const userErrors = upd.data?.data?.webPixelUpdate?.userErrors ?? [];
      if (userErrors.length) {
        console.log("[webPixel] update userErrors", userErrors);
        return json<EnsureResult>(
          {
            ok: false,
            shop,
            accountID,
            error: "Shopify webPixelUpdate returned userErrors",
            hint: JSON.stringify(userErrors),
            ms: msSince(t0),
          },
          { status: 400, headers: noStoreHeaders() }
        );
      }

      webPixelId = upd.data?.data?.webPixelUpdate?.webPixel?.id ?? storedWebPixelId;
      finalAction = "updated";
      note = "Updated Web Pixel settings.";
      console.log("[webPixel] ENSURE HIT (updated)", { webPixelId, ms: msSince(t0) });
    } else {
      // 3) CREATE otherwise
      const CREATE_MUTATION_V2 = `#graphql
        mutation WebPixelCreate($webPixel: WebPixelInput!) {
          webPixelCreate(webPixel: $webPixel) {
            webPixel { id }
            userErrors { field message }
          }
        }
      `;

      const CREATE_MUTATION_V1 = `#graphql
        mutation WebPixelCreate($settings: JSON!) {
          webPixelCreate(settings: $settings) {
            webPixel { id }
            userErrors { field message }
          }
        }
      `;

      let crt = await runGraphql(admin, CREATE_MUTATION_V2, {
        webPixel: { settings: desiredSettings },
      });

      if (
        crt.topErrorText &&
        /missing required arguments: webPixel|Unknown argument "webPixel"|argument "webPixel"/i.test(
          crt.topErrorText
        )
      ) {
        crt = await runGraphql(admin, CREATE_MUTATION_V1, { settings: desiredSettings });
      }

      if (crt.topErrorText) {
        console.log("[webPixel] create top-level errors", crt.topErrorText);
        return json<EnsureResult>(
          {
            ok: false,
            shop,
            accountID,
            error: crt.topErrorText,
            hint: "Create failed. Most commonly settings schema mismatch or missing scopes.",
            ms: msSince(t0),
          },
          { status: 500, headers: noStoreHeaders() }
        );
      }

      const createErrors = crt.data?.data?.webPixelCreate?.userErrors ?? [];
      if (createErrors.length) {
        console.log("[webPixel] create userErrors", createErrors);
        return json<EnsureResult>(
          {
            ok: false,
            shop,
            accountID,
            error: "Shopify webPixelCreate returned userErrors",
            hint: JSON.stringify(createErrors),
            ms: msSince(t0),
          },
          { status: 400, headers: noStoreHeaders() }
        );
      }

      webPixelId = crt.data?.data?.webPixelCreate?.webPixel?.id as string | undefined;

      if (!webPixelId) {
        return json<EnsureResult>(
          {
            ok: false,
            shop,
            accountID,
            error: "webPixelCreate returned no webPixel.id",
            hint: "Unexpected Shopify response shape.",
            ms: msSince(t0),
          },
          { status: 500, headers: noStoreHeaders() }
        );
      }

      // 4) Store pixel id in metafield (best-effort)
      const METAFIELDS_SET = `#graphql
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id namespace key value }
            userErrors { field message }
          }
        }
      `;

      const mf = await runGraphql(admin, METAFIELDS_SET, {
        metafields: [
          {
            ownerId: appInstallationId,
            namespace: META_NAMESPACE,
            key: META_KEY,
            type: "single_line_text_field",
            value: webPixelId,
          },
        ],
      });

      finalAction = "created";

      if (mf.topErrorText) {
        console.log("[webPixel] metafieldsSet top errors", mf.topErrorText);
        note =
          "Created Web Pixel, but failed to store ID in metafield (pixel still exists).";
      } else {
        const mfErrors = mf.data?.data?.metafieldsSet?.userErrors ?? [];
        if (mfErrors.length) {
          console.log("[webPixel] metafieldsSet userErrors", mfErrors);
          note =
            "Created Web Pixel, but metafield store returned userErrors (pixel still exists).";
        } else {
          note = "Created Web Pixel + stored ID.";
        }
      }

      console.log("[webPixel] ENSURE HIT (created)", { webPixelId, ms: msSince(t0) });
    }

    // 5) Ensure storefront browser helper script
    const browserScript = await ensureBrowserContextScriptTag(admin, request, shop);

    if (browserScript.ok) {
      if (browserScript.action === "created") {
        note += " Browser helper ScriptTag created.";
      } else if (browserScript.action === "updated") {
        note += " Browser helper ScriptTag updated.";
      } else if (browserScript.action === "unchanged") {
        note += " Browser helper ScriptTag already present.";
      }
    } else {
      note += ` Browser helper ScriptTag was not ensured: ${browserScript.error || "unknown error"}`;
    }

    return json<EnsureResult>(
      {
        ok: true,
        shop,
        accountID,
        action: finalAction,
        webPixelId,
        browserScriptTagId: browserScript.id,
        ms: msSince(t0),
        note,
      },
      { headers: noStoreHeaders() }
    );
  } catch (e: any) {
    if (isResponseLike(e)) throw e;

    const message = e?.message || String(e);
    const stack = e?.stack ? String(e.stack).slice(0, 2000) : undefined;

    console.log("[webPixel] ENSURE HIT (error)", { message });

    return json<EnsureResult>(
      {
        ok: false,
        error: message,
        hint: "Unexpected server error.",
        stack,
        ms: msSince(t0),
      },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}

/**
 * GET /api/web-pixel/ensure?accountID=1
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const accountID = readAccountIDFromUrl(request);
  return ensureWebPixel(request, accountID);
};

/**
 * POST /api/web-pixel/ensure
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const accountID = await readAccountIDFromRequest(request);
  return ensureWebPixel(request, accountID);
};
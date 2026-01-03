// app/routes/internal.sync.ad-platforms.tsx

import { json } from "@remix-run/node";

type LoaderArgsLike = {
  request: Request;
};

/**
 * Internal ad-platform sync route.
 *
 * For now this is intentionally a no-op stub so the build
 * doesn't fail on missing exports in metaSync.server.ts.
 *
 * When we want background sync per connection later, we can
 * wire this up to a proper service function.
 */
export async function loader({ request }: LoaderArgsLike) {
  return json(
    {
      ok: false,
      error: "internal.sync.ad-platforms is not implemented on this build",
    },
    { status: 501 },
  );
}

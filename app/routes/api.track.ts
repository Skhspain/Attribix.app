import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  return new Response("Method not allowed", { status: 405, headers: CORS });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const buf = await request.arrayBuffer();
    const text = new TextDecoder("utf-8").decode(buf);
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // ignore – will fail validation below
    }

    if (!data || typeof data !== "object") {
      console.error("[/api/track] invalid json:", text);
      return new Response("invalid json", { status: 400, headers: CORS });
    }

    const type = typeof data.type === "string" ? data.type : "unknown";
    const accountID = data.accountID ?? null;
    const event = data.event ?? null;

    // 🔧 place to persist / queue / forward if you want
    console.log("[/api/track]", { type, accountID, hasEvent: !!event });

    return new Response(null, { status: 204, headers: CORS });
  } catch (err) {
    console.error("[/api/track] error:", err);
    return new Response("error", { status: 500, headers: CORS });
  }
}
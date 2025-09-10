import type {ActionFunctionArgs, LoaderFunctionArgs} from "@remix-run/node";

// CORS preflight support
export async function loader({request}: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }
  return new Response("Method not allowed", {status: 405});
}

export async function action({request}: ActionFunctionArgs) {
  try {
    const body = await request.json(); // { type, event }

    // TODO: persist or forward
    // e.g.
    // await db.event.create({
    //   data: {
    //     type: body.type,
    //     payload: JSON.stringify(body.event),
    //   }
    // });

    return new Response(null, {
      status: 204,
      headers: {"Access-Control-Allow-Origin": "*"},
    });
  } catch {
    return new Response("bad request", {
      status: 400,
      headers: {"Access-Control-Allow-Origin": "*"},
    });
  }
}

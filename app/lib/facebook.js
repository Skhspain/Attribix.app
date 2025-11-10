// app/lib/facebook.js
// No node-fetch needed. Uses global fetch available in Node 18+.
// Guarded by FB_ENABLED so you can safely deploy with it off.

const FB_ENDPOINT = "https://graph.facebook.com/v19.0"; // or latest you use

export async function sendFacebookEvent({ pixelId, accessToken, event, data }) {
  const enabled = String(process.env.FB_ENABLED || "0") === "1";
  const PIXEL = pixelId || process.env.FB_PIXEL_ID;
  const TOKEN = accessToken || process.env.FB_ACCESS_TOKEN;

  if (!enabled || !PIXEL || !TOKEN) {
    return { ok: true, skipped: "facebook_disabled_or_no_creds" };
  }

  try {
    const body = {
      data: [
        {
          event_name: event || "CustomEvent",
          event_time: Math.floor(Date.now() / 1000),
          event_source_url: data?.event_source_url || undefined,
          custom_data: data || {},
          action_source: data?.action_source || "website",
        },
      ],
      access_token: TOKEN,
    };

    const url = `${FB_ENDPOINT}/${encodeURIComponent(PIXEL)}/events`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, error: text };
    }

    const json = await res.json();
    return { ok: true, response: json };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

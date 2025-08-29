import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const { FB_PIXEL_ID, FB_ACCESS_TOKEN } = process.env;

/**
 * Send an event to the Facebook Conversion API
 * @param {Object} params
 * @param {string} params.eventName
 * @param {Date|string|number} params.eventTime
 * @param {string} [params.email]
 * @param {string} [params.phone]
 * @param {number} [params.value]
 * @param {string} [params.currency]
 * @param {string} [params.clientIp]
 * @param {string} [params.userAgent]
 * @param {string} [params.url]
 */
export async function sendFacebookEvent({
  eventName,
  eventTime,
  email,
  phone,
  value,
  currency,
  clientIp,
  userAgent,
  url,
}) {
  if (!FB_PIXEL_ID || !FB_ACCESS_TOKEN) {
    console.warn('FB_PIXEL_ID or FB_ACCESS_TOKEN missing');
    return;
  }

  let fetchFn = globalThis.fetch;
  if (!fetchFn) {
    const mod = await import('node-fetch');
    fetchFn = mod.default;
  }

  const hash = (str) =>
    createHash('sha256').update(str.trim().toLowerCase()).digest('hex');

  const user_data = {};
  if (email) user_data.em = hash(email);
  if (phone) user_data.ph = hash(phone);
  if (clientIp) user_data.client_ip_address = clientIp;
  if (userAgent) user_data.client_user_agent = userAgent;

  const eventPayload = {
    event_name: eventName,
    event_time: Math.floor(new Date(eventTime).getTime() / 1000),
    action_source: 'website',
    user_data,
  };

  if (process.env.NODE_ENV === 'development') {
    console.log(
      'Sending FB CAPI event:',
      JSON.stringify({ data: [eventPayload] }, null, 2)
    );
  }

  if (url) eventPayload.event_source_url = url;
  const customData = {};
  if (value !== undefined) customData.value = value;
  if (currency) customData.currency = currency;
  if (Object.keys(customData).length > 0) {
    eventPayload.custom_data = customData;
  }

  try {
    const res = await fetchFn(
      `https://graph.facebook.com/v17.0/${FB_PIXEL_ID}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: FB_ACCESS_TOKEN,
          data: [eventPayload],
        }),
      }
    );

    const responseText = await res.text();
    if (!res.ok) {
      console.error('Facebook CAPI error:', res.status, responseText);
    } else if (process.env.NODE_ENV === 'development') {
      console.log('Facebook CAPI response:', responseText);
    }
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error('Failed to send Facebook event:', err);
    return { ok: false, status: 500 };
  }
}

async function testSendFacebookEvent() {
  const result = await sendFacebookEvent({
    eventName: 'TestEvent',
    eventTime: new Date(),
    email: 'test@example.com',
    phone: '+1234567890',
    value: 1,
    currency: 'USD',
    clientIp: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    url: 'https://example.com/test',
  });
  console.log('Test result:', result);
}

if (
  process.env.NODE_ENV === 'development' &&
  process.argv[1] === fileURLToPath(import.meta.url)
) {
  testSendFacebookEvent();
}

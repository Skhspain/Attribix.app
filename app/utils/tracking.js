export function trackEvent(eventName, payload = {}) {
  const data = {
    eventName,
    ...payload,
    url: window.location.href,
    utmSource: new URLSearchParams(window.location.search).get('utm_source'),
    utmMedium: new URLSearchParams(window.location.search).get('utm_medium'),
    utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign'),
  };

  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (typeof window.fbq === 'function') {
    fbq('track', eventName, payload);
  }
}
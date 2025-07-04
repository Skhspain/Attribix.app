// app/components/Tracking.tsx

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
  }
}

const Tracking = {
  init(pixelId: string) {
    if (typeof window === 'undefined') return;

    if (typeof window.fbq === 'function') {
      console.warn('Facebook Pixel already loaded; skipping init');
      return;
    }

    // Load Facebook Pixel script
    const fbScript = document.createElement('script');
    fbScript.async = true;
    fbScript.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(fbScript, firstScript);
    }

    // Stub for fbq
    const fbq: any = function (...args: any[]) {
      (fbq.q = fbq.q || []).push(args);
    };
    fbq.q = fbq.q || [];
    fbq.loaded = true;
    fbq.version = '2.0';

    window.fbq = fbq;

    // ✅ Safe invocation with optional chaining
    window.fbq?.('init', pixelId);
    window.fbq?.('track', 'PageView');
  },

  async trigger(eventName: string, data: Record<string, unknown> = {}) {
    // Send to server API
    try {
      await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName,
          ...data,
          timestamp: Date.now(),
        }),
      });
    } catch (err) {
      console.error('API tracking failed:', err);
    }

    // Also send to Facebook Pixel if loaded
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq?.('track', eventName, data);
    } else {
      console.warn('Facebook Pixel not initialized');
    }
  },
};

export default Tracking;
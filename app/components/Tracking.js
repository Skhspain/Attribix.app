const Tracking = {
  trigger(event, params = {}) {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', event, params);
    } else {
      console.warn('Facebook Pixel is not initialized');
    }
  }
};

export default Tracking;
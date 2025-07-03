const Tracking = {
  init(id) {
    if (typeof window === 'undefined') return;
    if (window.fbq) {
      const ver = window.fbq.version || 'unknown';
      console.warn(`Facebook pixel already loaded (v${ver}); skipping init`);
      return;
    }
    /* eslint-disable */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = (f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', id);
    window.fbq('track', 'PageView');
  },

  trigger(event, params = {}) {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', event, params);
    } else {
      console.warn('Facebook Pixel is not initialized');
    }
  }
};
export default Tracking;
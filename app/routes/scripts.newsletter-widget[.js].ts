// app/routes/scripts.newsletter-widget[.js].ts
// Public JS served at /scripts/newsletter-widget.js
// Auto-injected via ScriptTag into merchant storefronts.

import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader(_: LoaderFunctionArgs) {
  const APP_URL = process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev";

  const js = `
(function() {
  'use strict';
  if (typeof window === 'undefined' || !window.Shopify || !window.Shopify.shop) return;

  var SHOP = window.Shopify.shop;
  var API  = '${APP_URL}';

  fetch(API + '/api/newsletter/widget-config?shop=' + encodeURIComponent(SHOP), { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(cfg) {
      if (!cfg || !cfg.enabled) return;

      // ── Page targeting ────────────────────────────────────────────
      var targeting = cfg.pageTargeting || ['all'];
      if (targeting.indexOf('all') < 0) {
        var path = window.location.pathname;
        var pageType = (window.meta && window.meta.page && window.meta.page.pageType) || '';
        var matched = false;
        if (targeting.indexOf('homepage') >= 0 && (path === '/' || pageType === 'index')) matched = true;
        if (targeting.indexOf('product') >= 0 && (path.indexOf('/products/') >= 0 || pageType === 'product')) matched = true;
        if (targeting.indexOf('collection') >= 0 && (path.indexOf('/collections/') >= 0 || pageType === 'collection')) matched = true;
        if (targeting.indexOf('cart') >= 0 && (path === '/cart' || pageType === 'cart')) matched = true;
        if (targeting.indexOf('blog') >= 0 && (path.indexOf('/blogs/') >= 0 || pageType === 'article')) matched = true;
        if (!matched) return;
      }

      var type = cfg.templateType || 'popup';
      // Inline always injects immediately (no trigger needed)
      if (type === 'inline') { renderInline(cfg); return; }

      // ── Trigger logic ─────────────────────────────────────────────
      var trigger = cfg.triggerType || 'timer';

      function show() {
        if (!shouldShow(cfg)) return; // frequency cap reached
        if (type === 'popup')    renderPopup(cfg);
        else if (type === 'slide-in') renderSlidein(cfg);
        else if (type === 'banner')   renderBanner(cfg);
      }

      if (trigger === 'immediate') {
        show();
      } else if (trigger === 'timer') {
        setTimeout(show, (cfg.triggerDelay || 5) * 1000);
      } else if (trigger === 'exit_intent') {
        var fired = false;
        document.addEventListener('mouseleave', function(e) {
          if (fired || e.clientY > 20) return;
          fired = true;
          show();
        });
      } else if (trigger === 'scroll') {
        var depth = cfg.scrollDepth || 50;
        var scrollFired = false;
        window.addEventListener('scroll', function() {
          if (scrollFired) return;
          var scrolled = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
          if (scrolled >= depth) { scrollFired = true; show(); }
        }, { passive: true });
      }
    })
    .catch(function() {});

  // ── Dismissal / frequency capping ────────────────────────────────
  var LS_KEY = 'atbx_dismiss_' + SHOP;

  function getDismissData() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
  }

  function shouldShow(cfg) {
    var limit = cfg.dismissLimit || 0;
    if (limit === 0) return true; // unlimited

    var period = cfg.dismissPeriod || 'month';
    if (period === 'forever') {
      // Never reset — check total count
      var d = getDismissData();
      return (d.count || 0) < limit;
    }

    var d = getDismissData();
    var now = Date.now();
    var last = d.periodStart || 0;
    var ms = { session: 0, day: 86400000, week: 604800000, month: 2592000000 }[period] || 2592000000;

    // Reset if period has elapsed
    if (period === 'session' || (now - last) > ms) {
      d = { count: 0, periodStart: now };
      try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {}
    }

    return (d.count || 0) < limit;
  }

  function recordDismiss(cfg) {
    var period = cfg.dismissPeriod || 'month';
    if (period === 'session') return; // sessionStorage already guards this
    var d = getDismissData();
    d.count = (d.count || 0) + 1;
    if (!d.periodStart) d.periodStart = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {}
  }

  function sub(email, source, cb) {
    fetch(API + '/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: SHOP, email: email, source: source }),
    }).then(cb).catch(cb);
  }

  function style(css) {
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function renderPopup(cfg) {
    if (document.getElementById('atbx-popup')) return;
    var r = cfg.borderRadius + 'px';
    var btn = cfg.buttonColor; var btnT = cfg.textColor; var ff = cfg.fontFamily;
    style('#atbx-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center}#atbx-overlay.open{display:flex}#atbx-popup{background:#fff;border-radius:' + r + ';padding:32px 24px;max-width:400px;width:90%;text-align:center;font-family:' + ff + ';position:relative}');
    var el = document.createElement('div');
    el.id = 'atbx-overlay';
    el.innerHTML = '<div id="atbx-popup"><span id="atbx-close" style="position:absolute;top:12px;right:16px;cursor:pointer;font-size:18px;color:#9ca3af;">\u00d7</span><p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;">Newsletter</p><h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#111827;">Stay in the loop</h2><p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.5;">Get exclusive deals and first look at new arrivals.</p><input id="atbx-email" type="email" placeholder="Your email address" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:' + r + ';font-size:14px;margin-bottom:10px;outline:none;"><button id="atbx-btn" style="width:100%;background:' + btn + ';color:' + btnT + ';border:none;border-radius:' + r + ';padding:11px;font-size:14px;font-weight:700;cursor:pointer;">' + (cfg.btnLabel||'Subscribe') + '</button><p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">No spam. Unsubscribe any time.</p></div>';
    document.body.appendChild(el);
    document.getElementById('atbx-close').onclick = function(){ el.classList.remove('open'); recordDismiss(cfg); };
    el.addEventListener('click', function(e){ if(e.target===el){ el.classList.remove('open'); recordDismiss(cfg); } });
    document.getElementById('atbx-btn').onclick = function() {
      var email = document.getElementById('atbx-email').value;
      if (!email) return;
      sub(email, 'popup', function() {
        document.getElementById('atbx-popup').innerHTML = '<p style="font-size:16px;font-weight:700;color:#008060;">\u2713 You\\'re subscribed!</p>';
        setTimeout(function(){ el.classList.remove('open'); }, 2000);
      });
    };
    // Show (session guard so it doesn't re-appear on every page)
    if (!sessionStorage.getItem('atbx_shown')) {
      el.classList.add('open');
      sessionStorage.setItem('atbx_shown', '1');
    }
  }

  function renderSlidein(cfg) {
    if (document.getElementById('atbx-slidein')) return;
    var r = cfg.borderRadius + 'px';
    var btn = cfg.buttonColor; var btnT = cfg.textColor; var ff = cfg.fontFamily;
    style('#atbx-slidein{position:fixed;bottom:24px;right:24px;z-index:9999;width:300px;background:#fff;border-radius:' + r + ';box-shadow:0 8px 40px rgba(0,0,0,0.22);transform:translateX(360px);transition:transform 0.4s ease;font-family:' + ff + ';}#atbx-slidein.open{transform:translateX(0);}');
    var el = document.createElement('div');
    el.id = 'atbx-slidein';
    el.innerHTML = '<div style="background:' + btn + ';padding:16px 20px;border-radius:' + r + ' ' + r + ' 0 0;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:17px;font-weight:800;color:' + btnT + ';">Stay in the know</span><span id="atbx-si-close" style="cursor:pointer;font-size:18px;color:' + btnT + ';opacity:0.7;">\u00d7</span></div><div style="padding:18px 20px;"><p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Get deals and new drops first.</p><input id="atbx-si-email" type="email" placeholder="Your email" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:' + r + ';font-size:13px;margin-bottom:8px;outline:none;"><button id="atbx-si-btn" style="width:100%;background:' + btn + ';color:' + btnT + ';border:none;border-radius:' + r + ';padding:10px;font-size:13px;font-weight:700;cursor:pointer;">' + (cfg.btnLabel||'Subscribe') + '</button></div>';
    document.body.appendChild(el);
    document.getElementById('atbx-si-close').onclick = function(){ el.classList.remove('open'); recordDismiss(cfg); };
    document.getElementById('atbx-si-btn').onclick = function() {
      var email = document.getElementById('atbx-si-email').value;
      if (!email) return;
      sub(email, 'slide_in', function() {
        el.innerHTML = '<div style="padding:24px;text-align:center;"><p style="font-size:16px;font-weight:700;color:#008060;">\u2713 Subscribed!</p></div>';
        setTimeout(function(){ el.classList.remove('open'); }, 2000);
      });
    };
    if (!sessionStorage.getItem('atbx_si_shown')) {
      el.classList.add('open');
      sessionStorage.setItem('atbx_si_shown', '1');
    }
  }

  function renderBanner(cfg) {
    if (document.getElementById('atbx-banner')) return;
    var r = cfg.borderRadius + 'px';
    var btn = cfg.buttonColor; var btnT = cfg.textColor; var ff = cfg.fontFamily;
    var pos = (cfg.templateId||'').indexOf('bottom') >= 0 ? 'bottom:0' : 'top:0';
    style('#atbx-banner{position:fixed;' + pos + ';left:0;right:0;z-index:9999;background:' + btn + ';padding:10px 24px;display:flex;align-items:center;gap:16px;font-family:' + ff + ';}');
    var el = document.createElement('div');
    el.id = 'atbx-banner';
    el.innerHTML = '<p style="margin:0;font-size:13px;font-weight:600;color:' + btnT + ';white-space:nowrap;flex:0 0 auto;">\uD83D\uDCE2 Join our newsletter</p><input id="atbx-bn-email" type="email" placeholder="Your email" style="flex:1;max-width:280px;padding:7px 12px;border:none;border-radius:' + r + ';font-size:13px;outline:none;"><button id="atbx-bn-btn" style="background:#fff;color:' + btn + ';border:none;border-radius:' + r + ';padding:7px 18px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">' + (cfg.btnLabel||'Subscribe') + '</button><span id="atbx-bn-close" style="color:' + btnT + ';opacity:0.6;cursor:pointer;font-size:18px;margin-left:8px;">\u00d7</span>';
    document.body.appendChild(el);
    document.getElementById('atbx-bn-close').onclick = function(){ el.style.display='none'; recordDismiss(cfg); };
    document.getElementById('atbx-bn-btn').onclick = function() {
      var email = document.getElementById('atbx-bn-email').value;
      if (!email) return;
      sub(email, 'banner', function() {
        el.innerHTML = '<p style="margin:0 auto;font-size:14px;font-weight:700;color:' + btnT + ';">\u2713 You\\'re subscribed! Thank you.</p>';
        setTimeout(function(){ el.style.display='none'; }, 3000);
      });
    };
  }

  function renderInline(cfg) {
    // Find common newsletter section anchors and inject inline form
    var anchors = ['[data-section-type="newsletter"]', '#newsletter', '.newsletter', '.newsletter-section', 'footer'];
    var container = null;
    for (var i = 0; i < anchors.length; i++) {
      container = document.querySelector(anchors[i]);
      if (container) break;
    }
    if (!container) return; // no suitable insertion point
    if (container.querySelector('#atbx-inline')) return;
    var r = cfg.borderRadius + 'px';
    var btn = cfg.buttonColor; var btnT = cfg.textColor; var ff = cfg.fontFamily;
    var el = document.createElement('div');
    el.id = 'atbx-inline';
    el.style.cssText = 'padding:20px;background:#fff;border-radius:' + r + ';font-family:' + ff + ';';
    el.innerHTML = '<h3 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#111827;">Get the good stuff</h3><p style="margin:0 0 14px;font-size:13px;color:#6b7280;">New arrivals, exclusive offers, and stories worth reading.</p><div style="display:flex;gap:8px;"><input id="atbx-il-email" type="email" placeholder="Your email" style="flex:1;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:' + r + ';font-size:14px;outline:none;"><button id="atbx-il-btn" style="background:' + btn + ';color:' + btnT + ';border:none;border-radius:' + r + ';padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer;">' + (cfg.btnLabel||'Subscribe') + '</button></div><p id="atbx-il-msg" style="margin:8px 0 0;font-size:12px;color:#6b7280;"></p>';
    container.prepend(el);
    document.getElementById('atbx-il-btn').onclick = function() {
      var email = document.getElementById('atbx-il-email').value;
      if (!email) return;
      sub(email, 'inline_form', function() {
        document.getElementById('atbx-il-msg').textContent = '\u2713 Subscribed! Thank you.';
        document.getElementById('atbx-il-msg').style.color = '#008060';
        document.getElementById('atbx-il-email').value = '';
      });
    };
  }

})();
`.trim();

  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// app/routes/scripts.buy-now[.js].ts
// Public JS served at /scripts/buy-now.js — auto-injected via ScriptTag into merchant stores.

import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader(_: LoaderFunctionArgs) {
  const APP_URL = process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev";

  const js = `
(function() {
  'use strict';

  // Only run in a Shopify storefront context
  if (typeof window === 'undefined' || !window.Shopify || !window.Shopify.shop) return;

  var SHOP = window.Shopify.shop;
  var API  = '${APP_URL}';

  function isProductPage() {
    // Dawn and most modern themes expose Shopify.designMode or have form[action="/cart/add"]
    return !!(
      document.querySelector('form[action*="/cart/add"]') ||
      document.querySelector('[data-product-id]') ||
      document.querySelector('.product-form') ||
      document.querySelector('#product_form') ||
      (window.meta && window.meta.page && window.meta.page.pageType === 'product')
    );
  }

  function getVariantId() {
    var selectors = [
      'input[name="id"]',
      'select[name="id"]',
      '[name="id"]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.value) return el.value;
    }
    return null;
  }

  function injectButton(cfg) {
    if (document.getElementById('attribix-buy-now')) return; // already injected

    var btn = document.createElement('button');
    btn.id   = 'attribix-buy-now';
    btn.type = 'button';
    btn.textContent = cfg.buttonText || 'Buy Now';

    var pad = cfg.size === 'large' ? '14px 28px' : cfg.size === 'small' ? '8px 16px' : '11px 22px';
    var fz  = cfg.size === 'large' ? '17px'      : cfg.size === 'small' ? '13px'      : '15px';

    btn.setAttribute('style', [
      'display:block',
      'width:100%',
      'background:' + (cfg.buttonColor || '#008060'),
      'color:' + (cfg.textColor || '#ffffff'),
      'border:none',
      'border-radius:' + (cfg.borderRadius || 4) + 'px',
      'padding:' + pad,
      'font-size:' + fz,
      'font-weight:600',
      'cursor:pointer',
      'margin-top:10px',
      'font-family:inherit',
      'transition:opacity 0.15s',
    ].join(';'));

    btn.addEventListener('mouseover',  function() { btn.style.opacity = '0.88'; });
    btn.addEventListener('mouseout',   function() { btn.style.opacity = '1'; });
    btn.addEventListener('click', function() {
      var variantId = getVariantId();

      // Track the click (fire-and-forget)
      try {
        fetch(API + '/api/buy-now/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop: SHOP,
            productId: variantId,
            variantId: variantId,
            url: window.location.href,
            referrer: document.referrer,
            utmSource: new URLSearchParams(window.location.search).get('utm_source') || undefined,
            utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign') || undefined,
          }),
        });
      } catch(e) {}

      var action = cfg.action || 'checkout';
      if (action === 'cart') {
        if (variantId) {
          fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: variantId, quantity: 1 }),
          }).then(function() { window.location.href = '/cart'; }).catch(function() {
            window.location.href = '/cart';
          });
        } else {
          window.location.href = '/cart';
        }
      } else {
        // Direct checkout
        if (variantId) {
          window.location.href = '/cart/' + variantId + ':1/checkout';
        } else {
          window.location.href = '/checkout';
        }
      }
    });

    // Find the best insertion point
    var addToCartBtn = (
      document.querySelector('button[name="add"]') ||
      document.querySelector('[data-testid="Checkout-button"]') ||
      document.querySelector('.product-form__submit') ||
      document.querySelector('#AddToCart') ||
      document.querySelector('button[type="submit"][form]')
    );

    if (addToCartBtn && addToCartBtn.parentNode) {
      addToCartBtn.parentNode.insertBefore(btn, addToCartBtn.nextSibling);
    } else {
      var form = document.querySelector('form[action*="/cart/add"]');
      if (form) form.appendChild(btn);
    }
  }

  function init() {
    if (!isProductPage()) return;

    fetch(API + '/api/buy-now/config?shop=' + encodeURIComponent(SHOP), { cache: 'no-store' })
      .then(function(r) { return r.json(); })
      .then(function(cfg) {
        if (!cfg || !cfg.enabled) return;
        injectButton(cfg);
      })
      .catch(function() {});
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also re-run on Shopify section:load (theme editor) and history navigation
  document.addEventListener('shopify:section:load', init);
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

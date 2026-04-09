// app/routes/reviews.widget[.js].tsx
// Serves the embeddable widget JS at /reviews/widget.js
import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const appUrl = process.env.APP_PUBLIC_URL || "https://api.attribix.app";

  const js = `
(function() {
  var script = document.currentScript || (function() {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var shop = (script && script.getAttribute('data-shop'))
    || (typeof Shopify !== 'undefined' && Shopify.shop)
    || null;
  if (!shop) return;

  var productId = (typeof ShopifyAnalytics !== 'undefined' && ShopifyAnalytics.meta && ShopifyAnalytics.meta.product)
    ? ShopifyAnalytics.meta.product.id
    : null;
  if (!productId) {
    var meta = document.querySelector('meta[property="og:type"]');
    if (meta && meta.content === 'product') {
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) {
        var m = canonical.href.match(/\\/products\\/([^?#]+)/);
        if (m) productId = m[1];
      }
    }
  }
  if (!productId) return;

  var container = document.getElementById('attribix-reviews');
  if (!container) {
    // Auto-create container — inject after product description or form
    var targets = [
      'div.product__description',
      '.product-single__description',
      '.product__info-container',
      '.product-form',
      '[data-product-description]',
      '.product__content',
      'form[action*="/cart/add"]',
      '.product-single',
      'main .shopify-section:first-child',
    ];
    var anchor = null;
    for (var i = 0; i < targets.length; i++) {
      anchor = document.querySelector(targets[i]);
      if (anchor) break;
    }
    if (!anchor) {
      // Last resort: append to main content
      anchor = document.querySelector('main') || document.querySelector('#MainContent') || document.body;
    }
    container = document.createElement('div');
    container.id = 'attribix-reviews';
    container.style.cssText = 'max-width:800px;margin:40px auto;padding:24px 16px;clear:both;position:relative;z-index:10;';
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(container, anchor.nextSibling);
    } else {
      document.body.appendChild(container);
    }
  }

  // Detect store theme styles
  var bodyStyle = window.getComputedStyle(document.body);
  var themeFont = bodyStyle.fontFamily || 'inherit';
  var themeBg = bodyStyle.backgroundColor || '#ffffff';
  var themeText = bodyStyle.color || '#111827';
  var btnEl = document.querySelector('.shopify-payment-button button, .product-form__submit, button[name="add"], form[action*="/cart"] button[type="submit"]');
  var themeBtnBg = btnEl ? window.getComputedStyle(btnEl).backgroundColor : null;
  var themeBtnColor = btnEl ? window.getComputedStyle(btnEl).color : null;
  var themeBtnRadius = btnEl ? window.getComputedStyle(btnEl).borderRadius : '8px';

  var apiUrl = '${appUrl}/reviews/api/' + encodeURIComponent(shop) + '/' + encodeURIComponent(productId);
  var submitUrl = '${appUrl}/reviews/submit-api/' + encodeURIComponent(shop) + '/' + encodeURIComponent(productId);

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function stars(rating, color, size) {
    size = size || 16;
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<span style="color:' + (i <= rating ? color : '#d1d5db') + ';font-size:' + size + 'px;line-height:1;">&#9733;</span>';
    }
    return html;
  }

  // Translate text using Google Translate free endpoint
  function translate(texts, targetLang, cb) {
    if (!targetLang || !texts.length) { cb(texts); return; }
    var combined = texts.join('\\n|||\\n');
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + encodeURIComponent(targetLang) + '&dt=t&q=' + encodeURIComponent(combined);
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var translated = '';
        if (Array.isArray(data[0])) {
          data[0].forEach(function(part) { if (part[0]) translated += part[0]; });
        }
        cb(translated.split('\\n|||\\n'));
      })
      .catch(function() { cb(texts); });
  }

  fetch(apiUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var reviews = data.reviews || [];
      var avg = data.avg;
      var count = data.count;
      var s = data.settings || {};

      var primaryColor = s.primaryColor || '#4f46e5';
      var starColor = s.starColor || '#f59e0b';
      var bgColor = s.backgroundColor || '#ffffff';
      var borderColor = s.borderColor || '#e5e7eb';
      var layout = s.layout || 'list';
      var showVerified = s.showVerifiedBadge !== false;
      var allowPublicReviews = s.allowPublicReviews !== false;
      var showName = s.showReviewerName !== false;
      var showDate = s.showDate !== false;
      var showImages = s.allowImages !== false;
      var translateTo = s.translateTo || null;

      // Use detected theme or fallback to settings
      var autoDetect = s.autoDetectTheme !== false;
      var btnBg = (autoDetect && themeBtnBg) ? themeBtnBg : primaryColor;
      var btnColor = (autoDetect && themeBtnColor) ? themeBtnColor : '#fff';
      var btnRadius = (autoDetect && themeBtnRadius) ? themeBtnRadius : '8px';
      var fontFamily = (autoDetect && themeFont) ? themeFont : '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
      var textColor = (autoDetect && themeText) ? themeText : '#111827';
      var inputStyle = 'width:100%;padding:10px 12px;border:1px solid ' + borderColor + ';border-radius:' + btnRadius + ';margin-bottom:10px;font-size:14px;box-sizing:border-box;font-family:' + fontFamily + ';color:' + textColor + ';';
      var btnStyle = 'padding:10px 24px;background:' + btnBg + ';color:' + btnColor + ';border:none;border-radius:' + btnRadius + ';font-size:14px;font-weight:600;cursor:pointer;font-family:' + fontFamily + ';';

      function renderWidget(translatedBodies) {
        var html = '<div style="font-family:' + fontFamily + ';background:' + bgColor + ';padding:8px 0;color:' + textColor + ';">';

        // Header
        html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap;">';
        html += '<h3 style="margin:0;font-size:18px;font-weight:700;color:' + textColor + ';">Customer Reviews</h3>';
        if (avg) {
          html += '<div style="display:flex;align-items:center;gap:6px;">';
          html += stars(Math.round(avg), starColor, 16);
          html += '<span style="font-weight:600;font-size:15px;color:#111827;">' + avg.toFixed(1) + '</span>';
          html += '<span style="color:#6b7280;font-size:14px;">(' + count + ' review' + (count !== 1 ? 's' : '') + ')</span>';
          html += '</div>';
        }
        if (allowPublicReviews) {
          html += '<button onclick="document.getElementById(\\'attribix-review-form\\').style.display=document.getElementById(\\'attribix-review-form\\').style.display===\\'none\\'?\\'block\\':\\'none\\'" style="margin-left:auto;' + btnStyle + '">Write a review</button>';
        }
        html += '</div>';

        // Inline review form (hidden by default)
        if (allowPublicReviews) {
          html += '<div id="attribix-review-form" style="display:none;border:1px solid ' + borderColor + ';border-radius:' + btnRadius + ';padding:24px;margin-bottom:20px;background:' + bgColor + ';">';
          html += '<h4 style="margin:0 0 16px;font-size:16px;font-weight:700;font-family:' + fontFamily + ';color:' + textColor + ';">Write a Review</h4>';
          html += '<div id="attribix-form-msg" style="display:none;padding:12px;border-radius:' + btnRadius + ';margin-bottom:12px;font-size:14px;"></div>';
          html += '<div style="display:flex;gap:4px;margin-bottom:12px;" id="attribix-stars">';
          for (var si = 1; si <= 5; si++) {
            html += '<span data-rating="' + si + '" style="font-size:28px;cursor:pointer;color:#d1d5db;" onmouseover="this.style.color=\\'' + starColor + '\\'" onmouseout="if(!this.dataset.selected)this.style.color=\\'#d1d5db\\'" onclick="document.querySelectorAll(\\'#attribix-stars span\\').forEach(function(s){s.dataset.selected=\\'\\';s.style.color=\\'#d1d5db\\'});for(var j=1;j<=' + si + ';j++){var el=document.querySelector(\\'#attribix-stars span[data-rating=\\\\\\'\\'+j+\\'\\\\\\']\\');if(el){el.style.color=\\'' + starColor + '\\';el.dataset.selected=\\'1\\'}};document.getElementById(\\'attribix-rating-val\\').value=' + si + '">&#9733;</span>';
          }
          html += '</div>';
          html += '<input type="hidden" id="attribix-rating-val" value="5">';
          html += '<input placeholder="Your name" id="attribix-rev-name" style="' + inputStyle + '">';
          html += '<input placeholder="Email (optional)" id="attribix-rev-email" style="' + inputStyle + '">';
          html += '<input placeholder="Review title" id="attribix-rev-title" style="' + inputStyle + '">';
          html += '<textarea placeholder="Write your review..." id="attribix-rev-body" rows="4" style="' + inputStyle + 'resize:vertical;"></textarea>';
          if (showImages) {
            html += '<div style="margin-bottom:12px;">';
            html += '<label style="display:inline-block;padding:8px 16px;border:1px dashed ' + borderColor + ';border-radius:8px;cursor:pointer;font-size:13px;color:#6b7280;">📷 Add photos <input type="file" id="attribix-rev-photos" accept="image/*" multiple style="display:none;"></label>';
            html += '<span id="attribix-photo-count" style="margin-left:8px;font-size:12px;color:#9ca3af;"></span>';
            html += '</div>';
          }
          html += '<button id="attribix-submit-btn" style="' + btnStyle + '">Submit Review</button>';
          html += '</div>';
        }

        if (reviews.length === 0) {
          html += '<p style="color:#6b7280;">No reviews yet. Be the first!</p>';
        } else {
          var isGrid = layout === 'grid';
          if (isGrid) html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;">';

          reviews.forEach(function(r, idx) {
            var bodyText = (translatedBodies && translatedBodies[idx]) ? translatedBodies[idx] : r.body;
            if (isGrid) {
              html += '<div style="border:1px solid ' + borderColor + ';border-radius:12px;padding:16px;background:#fff;">';
            } else {
              html += '<div style="border-top:1px solid ' + borderColor + ';padding:16px 0;">';
            }

            html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
            html += stars(r.rating, starColor, 14);
            if (showVerified && r.verifiedPurchase) html += '<span style="font-size:11px;background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:99px;font-weight:600;">Verified</span>';
            html += '</div>';

            if (r.title) html += '<div style="font-weight:600;font-size:15px;margin-bottom:4px;color:#111827;">' + escHtml(r.title) + '</div>';
            html += '<div style="color:#374151;font-size:14px;line-height:1.6;margin-bottom:8px;">' + escHtml(bodyText) + '</div>';

            // Photos
            if (showImages && r.images && r.images.length) {
              html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">';
              r.images.forEach(function(imgSrc) {
                html += '<img src="' + escHtml(imgSrc) + '" onclick="var o=document.createElement(\\'div\\');o.style.cssText=\\'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;\\';o.onclick=function(){o.remove()};var i=document.createElement(\\'img\\');i.src=this.src;i.style.cssText=\\'max-width:90vw;max-height:90vh;border-radius:8px;\\';o.appendChild(i);document.body.appendChild(o)" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid ' + borderColor + ';cursor:zoom-in;" />';
              });
              html += '</div>';
            }

            var meta = [];
            if (showName) meta.push(escHtml(r.reviewerName));
            if (showDate) meta.push(new Date(r.createdAt).toLocaleDateString());
            if (meta.length) html += '<div style="color:#9ca3af;font-size:12px;">' + meta.join(' &middot; ') + '</div>';

            if (r.reply) {
              html += '<div style="background:#f9fafb;border-left:3px solid ' + primaryColor + ';padding:10px 12px;margin-top:10px;border-radius:0 6px 6px 0;">';
              html += '<div style="font-size:12px;font-weight:600;color:' + primaryColor + ';margin-bottom:4px;">Store reply</div>';
              html += '<div style="font-size:13px;color:#374151;">' + escHtml(r.reply) + '</div>';
              html += '</div>';
            }

            html += '</div>';
          });

          if (isGrid) html += '</div>';
        }

        html += '</div>';
        container.innerHTML = html;

        // Attach inline form submit handler
        var submitBtn = document.getElementById('attribix-submit-btn');
        // Photo file count display
        var photoInput = document.getElementById('attribix-rev-photos');
        if (photoInput) {
          photoInput.addEventListener('change', function() {
            var cnt = document.getElementById('attribix-photo-count');
            if (cnt) cnt.textContent = this.files.length + ' photo(s) selected';
          });
        }

        if (submitBtn) {
          submitBtn.addEventListener('click', function() {
            var name = document.getElementById('attribix-rev-name').value.trim();
            var email = document.getElementById('attribix-rev-email').value.trim();
            var title = document.getElementById('attribix-rev-title').value.trim();
            var body = document.getElementById('attribix-rev-body').value.trim();
            var rating = document.getElementById('attribix-rating-val').value;
            var msg = document.getElementById('attribix-form-msg');

            if (!name || !body) {
              msg.style.display = 'block';
              msg.style.background = '#fef2f2';
              msg.style.color = '#dc2626';
              msg.textContent = 'Please enter your name and review.';
              return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';

            // Read photos as base64
            var photosInput = document.getElementById('attribix-rev-photos');
            var photoPromises = [];
            if (photosInput && photosInput.files) {
              for (var fi = 0; fi < Math.min(photosInput.files.length, 5); fi++) {
                (function(file) {
                  photoPromises.push(new Promise(function(resolve) {
                    var reader = new FileReader();
                    reader.onload = function() { resolve(reader.result); };
                    reader.onerror = function() { resolve(null); };
                    reader.readAsDataURL(file);
                  }));
                })(photosInput.files[fi]);
              }
            }

            Promise.all(photoPromises).then(function(photos) {
              var images = photos.filter(Boolean);
              return fetch(submitUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: Number(rating), title: title, body: body, reviewerName: name, reviewerEmail: email, productId: productId, images: images })
              });
            })
            .then(function(r) { return r.json(); })
            .then(function(result) {
              msg.style.display = 'block';
              if (result.ok) {
                msg.style.background = '#f0fdf4';
                msg.style.color = '#16a34a';
                msg.textContent = 'Thank you! Your review has been submitted.';
                document.getElementById('attribix-rev-name').value = '';
                document.getElementById('attribix-rev-email').value = '';
                document.getElementById('attribix-rev-title').value = '';
                document.getElementById('attribix-rev-body').value = '';
              } else {
                msg.style.background = '#fef2f2';
                msg.style.color = '#dc2626';
                msg.textContent = result.error || 'Failed to submit review.';
              }
              submitBtn.disabled = false;
              submitBtn.textContent = 'Submit Review';
            })
            .catch(function() {
              msg.style.display = 'block';
              msg.style.background = '#fef2f2';
              msg.style.color = '#dc2626';
              msg.textContent = 'Network error. Please try again.';
              submitBtn.disabled = false;
              submitBtn.textContent = 'Submit Review';
            });
          });
        }
      }

      // Translate if configured
      if (translateTo && reviews.length) {
        var bodies = reviews.map(function(r) { return r.body; });
        translate(bodies, translateTo, function(translated) {
          renderWidget(translated);
        });
      } else {
        renderWidget(null);
      }
    })
    .catch(function() {
      container.innerHTML = '';
    });
})();
`.trim();

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

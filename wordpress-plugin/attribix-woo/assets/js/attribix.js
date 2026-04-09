(function () {
	"use strict";

	var CTX = window.__ATTRIBIX__ || {};
	if (!CTX.accountID || !CTX.endpoint) return;

	// ─── Visitor ID (persistent, 1-year cookie) ─────────────────────────
	function getCookie(name) {
		var m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
		return m ? decodeURIComponent(m[1]) : null;
	}
	function setCookie(name, val, days) {
		var d = new Date(); d.setTime(d.getTime() + days * 864e5);
		document.cookie = name + "=" + encodeURIComponent(val) + ";expires=" + d.toUTCString() + ";path=/;SameSite=Lax";
	}
	function uuid() {
		if (crypto && crypto.randomUUID) return crypto.randomUUID();
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
			var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
		});
	}

	var visitorId = getCookie("_attribix_vid");
	if (!visitorId) { visitorId = uuid(); setCookie("_attribix_vid", visitorId, 365); }

	var sessionId = null;
	try {
		sessionId = sessionStorage.getItem("_attribix_sid");
		if (!sessionId) { sessionId = uuid(); sessionStorage.setItem("_attribix_sid", sessionId); }
	} catch (e) { sessionId = uuid(); }

	// ─── UTM & Click ID Capture ─────────────────────────────────────────
	var params = {};
	try {
		var sp = new URLSearchParams(window.location.search);
		["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
		 "fbclid", "gclid", "ttclid", "msclkid"].forEach(function (k) {
			var v = sp.get(k);
			if (v) params[k] = v;
		});
	} catch (e) {}

	// Persist UTM/click IDs in cookies (30-day window) for cross-page attribution
	var utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "ttclid", "msclkid"];
	var hasNewUtm = false;
	utmKeys.forEach(function (k) {
		if (params[k]) { setCookie("_ax_" + k, params[k], 30); hasNewUtm = true; }
	});
	// If no new UTMs in URL, read from cookies
	if (!hasNewUtm) {
		utmKeys.forEach(function (k) {
			var v = getCookie("_ax_" + k);
			if (v) params[k] = v;
		});
	}

	// ─── Helpers ─────────────────────────────────────────────────────────
	function nowIso() {
		try { return new Date().toISOString(); } catch (e) { return ""; }
	}

	function post(type, eventData, meta) {
		var body = {
			type: type,
			accountID: CTX.accountID,
			visitorId: visitorId,
			sessionId: sessionId,
			event: {
				name: type,
				data: eventData || null,
				context: {
					document: {
						location: {
							href: window.location.href,
							pathname: window.location.pathname,
							search: window.location.search,
						},
						title: document.title,
						referrer: document.referrer || null,
					},
					navigator: {
						userAgent: navigator.userAgent,
						language: navigator.language,
					},
				},
			},
			meta: {
				t: nowIso(),
				platform: "woocommerce",
				source: "client",
			},
		};

		// Attach UTM & click IDs
		if (params.utm_source) body.utmSource = params.utm_source;
		if (params.utm_medium) body.utmMedium = params.utm_medium;
		if (params.utm_campaign) body.utmCampaign = params.utm_campaign;
		if (params.fbclid) body.fbclid = params.fbclid;
		if (params.gclid) body.gclid = params.gclid;
		if (params.ttclid) body.ttclid = params.ttclid;
		if (params.msclkid) body.msclkid = params.msclkid;

		if (meta) {
			for (var k in meta) {
				if (Object.prototype.hasOwnProperty.call(meta, k)) {
					body.meta[k] = meta[k];
				}
			}
		}

		var json = JSON.stringify(body);

		try {
			if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
				var blob = new Blob([json], { type: "application/json" });
				if (navigator.sendBeacon(CTX.endpoint, blob)) return;
			}
		} catch (e) {}

		try {
			fetch(CTX.endpoint, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: json,
				keepalive: true,
				mode: "cors",
			}).catch(function () {});
		} catch (e) {}
	}

	// ─── Page Events ────────────────────────────────────────────────────
	var page = CTX.page || { type: "other" };

	post("page_viewed", { page: page });

	if (page.type === "product" && page.product) {
		post("product_viewed", { productVariant: page.product });
	} else if (page.type === "collection" && page.collection) {
		post("collection_viewed", { collection: page.collection });
	} else if (page.type === "search") {
		post("search_submitted", { searchResult: { query: page.query } });
	} else if (page.type === "checkout") {
		post("checkout_started", null);
	}

	// ─── Add to Cart (AJAX) ─────────────────────────────────────────────
	// Listen for WooCommerce AJAX add-to-cart buttons
	document.addEventListener("click", function (e) {
		var btn = e.target.closest(".add_to_cart_button, .single_add_to_cart_button");
		if (!btn) return;
		var productId = btn.getAttribute("data-product_id") || (page.product && page.product.id);
		if (productId) {
			post("product_added_to_cart", {
				data: { cartLine: { merchandise: { id: productId }, quantity: 1 } }
			});
		}
	});

	// Expose for custom events
	window.attribix = { track: post, visitorId: visitorId, sessionId: sessionId };
})();

(function () {
	"use strict";

	var CTX = window.__ATTRIBIX__ || {};
	if (!CTX.accountID || !CTX.endpoint) return;

	function nowIso() {
		try { return new Date().toISOString(); } catch (e) { return ""; }
	}

	function post(type, eventData, meta) {
		var body = {
			type: type,
			accountID: CTX.accountID,
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
})();

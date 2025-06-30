import React, { useState, useEffect } from 'react';
import './App.css';
import Tracking from './components/Tracking';

// use enabledPresentmentCurrencies instead of currencyCode
const SHOP_CURRENCY_QUERY = `
  query ShopCurrencies {
    shop {
      paymentSettings {
        enabledPresentmentCurrencies
      }
    }
  }
`;

const PRODUCTS_QUERY = `
  query Products {
    products(first: 10) {
      edges {
        node {
          id
          title
          priceRange {
            minVariantPrice {
              amount
            }
          }
        }
      }
    }
  }
`;

function initPixel(id) {
  if (window.fbq) {
    const ver = window.fbq.version || "unknown";
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
}

export default function App({ pixelId }) {
  const [currency, setCurrency] = useState('…loading…');
  const [error, setError]     = useState(null);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState(null);
  const [leadValue, setLeadValue] = useState('');
  const product = products.find(p => p.id === productId) || { price: 0 };

  useEffect(() => {
    const domain = import.meta.env.VITE_SHOPIFY_DOMAIN;
    const token  = import.meta.env.VITE_STOREFRONT_API_TOKEN;
    if (!domain || !token) {
      setError('Missing SHOPIFY_DOMAIN or STOREFRONT_API_TOKEN');
      return;
    }
    if (token.includes('YOUR_') || token.startsWith('<')) {
      setError('VITE_STOREFRONT_API_TOKEN looks like a placeholder. Please set it in .env.local');
      return;
    }

    fetch(`https://${domain}/api/2023-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token
      },
      body: JSON.stringify({ query: SHOP_CURRENCY_QUERY })
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
        const list = json.data.shop.paymentSettings.enabledPresentmentCurrencies;
        setCurrency(list[0] || '—');
      })
      .catch(err => {
        console.error('❌ Detailed fetch error:', err);
         if (err.message === 'HTTP 401') {
          setError(
            'Shopify Storefront API token returned 401. ' +
            'Ensure the app is installed on this store and that the token in .env.local was ' +
            'created from the store admin under Apps → Develop apps.'
          );
        } else {
          setError(`Failed to fetch currency: ${err.message}`);
        }
      });

    fetch(`https://${domain}/api/2023-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token
      },
      body: JSON.stringify({ query: PRODUCTS_QUERY })
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
        const edges = json.data.products.edges || [];
        const items = edges.map(({ node }) => ({
          id: node.id,
          name: node.title,
          price: parseFloat(node.priceRange.minVariantPrice.amount)
        }));
        setProducts(items);
        if (items[0]) setProductId(items[0].id);
      })
      .catch(err => {
        console.error('❌ Error fetching products:', err);
        setError(`Failed to fetch products: ${err.message}`);
      });
  }, []);

  useEffect(() => {
     if (pixelId && !pixelId.startsWith('YOUR_') && !pixelId.startsWith('<')) {
      initPixel(pixelId);
    } else {
      console.warn('pixelId is missing or placeholder; skipping initPixel()');
    }
  }, [pixelId]);

  if (error) {
    return <div style={{ padding: 20, color: 'red' }}>{error}</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>🎉 Store currency is: {currency}</h1>
      <div style={{ marginBottom: '1rem' }}>
        <label>
          Choose product:{' '}
          <select value={productId || ''} onChange={e => setProductId(e.target.value)}>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} - {currency} {p.price}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="buttons">
          <button onClick={() => Tracking.trigger('AddToCart')}>Add to Cart</button>
        <button onClick={() => Tracking.trigger('AddPaymentInfo')}>Add Payment Info</button>
        <button onClick={() => Tracking.trigger('AddToWishlist')}>Add to Wishlist</button>
        <button onClick={() => Tracking.trigger('ViewContent', { content_name: 'Home Page' })}>View Content</button>
          <div style={{ margin: '0.5rem 0' }}>
          <input
            type="number"
            placeholder="Lead value"
            value={leadValue}
            onChange={e => setLeadValue(e.target.value)}
            style={{ marginRight: '0.5rem' }}
          />
          <button
            onClick={() =>
              Tracking.trigger('Lead', { value: parseFloat(leadValue || 0), currency })
            }
          >
            Lead
          </button>
        </div>
        <button onClick={() => Tracking.trigger('InitiateCheckout')}>Initiate Checkout</button>
        <button onClick={() => Tracking.trigger('Purchase', { value: product.price, currency })}>
          Purchase
        </button>
      </div>
    </div>
  );}
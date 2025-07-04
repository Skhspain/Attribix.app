import React, { useState, useEffect } from 'react';
import '~/styles/app.css';
import { trackEvent } from '../utils/tracking';
import { createStorefrontApiClient } from '@shopify/storefront-api-client';

// Set up Shopify client
const client = createStorefrontApiClient({
  storeDomain: 'attribix-com.myshopify.com',
  apiVersion: '2025-07',
  publicAccessToken: import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN,
});

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
              currencyCode
            }
          }
        }
      }
    }
  }
`;

export default function App() {
  const [currency, setCurrency] = useState('USD');
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState(null);
  const [leadValue, setLeadValue] = useState('');
  const [error, setError] = useState(null);
  const [pixelId, setPixelId] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch currencies
        const currencyRes = await client.request(SHOP_CURRENCY_QUERY);
        const currencies = currencyRes.data.shop.paymentSettings.enabledPresentmentCurrencies;
        setCurrency(currencies[0] || 'USD');

        // Fetch products
        const productsRes = await client.request(PRODUCTS_QUERY);
        const productEdges = productsRes.data.products.edges;

        const formattedProducts = productEdges.map(({ node }) => ({
          id: node.id,
          name: node.title,
          price: parseFloat(node.priceRange.minVariantPrice.amount),
        }));

        setProducts(formattedProducts);
        setProductId(formattedProducts[0]?.id || null);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch store data');
      }
    }

    fetchData();

    if (!pixelId || pixelId === 'YOUR_PIXEL_ID') {
      console.warn('pixelId is missing or placeholder; skipping initPixel()');
    }
  }, [pixelId]);

  const selectedProduct = products.find(p => p.id === productId) || { price: 0 };

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
        <button onClick={() => trackEvent('AddToCart')}>Add to Cart</button>
        <button onClick={() => trackEvent('AddPaymentInfo')}>Add Payment Info</button>
        <button onClick={() => trackEvent('AddToWishlist')}>Add to Wishlist</button>
        <button onClick={() => trackEvent('ViewContent', { content_name: 'Home Page' })}>
          View Content
        </button>
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
              trackEvent('Lead', { value: parseFloat(leadValue || 0), currency })
            }
          >
            Lead
          </button>
        </div>
        <button onClick={() => trackEvent('InitiateCheckout')}>Initiate Checkout</button>
        <button
          onClick={() =>
            trackEvent('Purchase', { value: selectedProduct.price, currency })
          }
        >
          Purchase
        </button>
      </div>
    </div>
  );
}
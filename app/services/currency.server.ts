// Currency conversion helper using frankfurter.app (free, no API key)

let rateCache: { rates: Record<string, number>; fetchedAt: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Fetch exchange rates from EUR base (frankfurter.app is free, reliable)
 */
async function fetchRates(): Promise<Record<string, number>> {
  if (rateCache && Date.now() - rateCache.fetchedAt < CACHE_TTL) {
    return rateCache.rates;
  }

  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD");
    const data = await res.json();
    if (data?.rates) {
      // data.rates has rates relative to USD (e.g. { NOK: 10.5, EUR: 0.92, ... })
      const rates: Record<string, number> = { USD: 1, ...data.rates };
      rateCache = { rates, fetchedAt: Date.now() };
      return rates;
    }
  } catch (e) {
    console.error("[currency] Failed to fetch exchange rates:", e);
  }

  // Fallback rates if API fails (approximate)
  return {
    USD: 1, NOK: 10.5, EUR: 0.92, GBP: 0.79, SEK: 10.3, DKK: 6.9,
    CAD: 1.36, AUD: 1.53, NZD: 1.67, CHF: 0.88, CZK: 23.5, PLN: 4.0,
    JPY: 153, CNY: 7.24, BRL: 5.1, AED: 3.67, GBP: 0.79,
  };
}

/**
 * Convert an amount from one currency to another.
 * @param amount - The amount in the source currency
 * @param from - Source currency code (e.g. "USD")
 * @param to - Target currency code (e.g. "NOK")
 * @returns Converted amount
 */
export async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  if (from === to || !amount) return amount;

  const rates = await fetchRates();

  // Convert via USD: amount → USD → target
  const fromRate = rates[from.toUpperCase()];
  const toRate = rates[to.toUpperCase()];

  if (!fromRate || !toRate) {
    console.warn(`[currency] Unknown currency pair: ${from} → ${to}. Returning unconverted.`);
    return amount;
  }

  // Convert from source to USD, then USD to target
  const inUsd = amount / fromRate;
  return inUsd * toRate;
}

/**
 * Get the exchange rate between two currencies.
 */
export async function getExchangeRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const rates = await fetchRates();
  const fromRate = rates[from.toUpperCase()] || 1;
  const toRate = rates[to.toUpperCase()] || 1;
  return toRate / fromRate;
}

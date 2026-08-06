import axios from 'axios';
import { prisma } from '@kephale/database';
import { redis } from '../lib/redis.js';

const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'XOF', 'XAF', 'NGN', 'KES', 'TZS', 'GHS', 'ZAR', 'RWF'];
const CACHE_KEY = 'exchange_rates:EUR';

export function setupCronJobs() {
  // Update exchange rates every hour
  updateExchangeRates();
  setInterval(updateExchangeRates, 60 * 60 * 1000); // every 1 hour

  console.log('✅ Cron jobs started');
}

async function updateExchangeRates() {
  try {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    if (!apiKey || apiKey === 'your_openexchangerates_key') {
      console.warn('[Cron] EXCHANGE_RATE_API_KEY not set or is placeholder, skipping rate update');
      return;
    }

    const response = await axios.get(
      `https://openexchangerates.org/api/latest.json?app_id=${apiKey}&base=USD&symbols=${SUPPORTED_CURRENCIES.join(',')}`
    );

    const rates = response.data.rates as Record<string, number>;

    // Convert all to EUR base
    const eurRate = rates['EUR'];
    const eurBasedRates: Record<string, number> = {};
    for (const [currency, rate] of Object.entries(rates)) {
      eurBasedRates[currency] = rate / eurRate;
    }

    // Update Redis cache (for fast reads)
    await redis.setex(
      CACHE_KEY,
      3600, // 1 hour TTL
      JSON.stringify({ rates: eurBasedRates, updatedAt: new Date().toISOString() })
    );

    // Update database (for persistence / fallback)
    const operations = Object.entries(eurBasedRates).map(([toCurrency, rate]) =>
      prisma.exchangeRate.upsert({
        where: { fromCurrency_toCurrency: { fromCurrency: 'EUR', toCurrency } },
        update: { rate, updatedAt: new Date() },
        create: { fromCurrency: 'EUR', toCurrency, rate },
      })
    );

    await prisma.$transaction(operations);

    console.log(`[Cron] ✅ Exchange rates updated at ${new Date().toISOString()}`);
  } catch (error) {
    console.error('[Cron] ❌ Failed to update exchange rates:', error);
  }
}

/**
 * Get current exchange rate from Redis cache (with DB fallback)
 */
export async function getExchangeRate(toCurrency: string): Promise<number> {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const { rates } = JSON.parse(cached);
      return rates[toCurrency] || 1;
    }
  } catch {}

  // DB fallback
  const rate = await prisma.exchangeRate.findUnique({
    where: { fromCurrency_toCurrency: { fromCurrency: 'EUR', toCurrency } },
  });

  return rate?.rate || 1;
}

/**
 * Convert price from EUR to target currency
 */
export async function convertPrice(amountEur: number, toCurrency: string): Promise<{ amount: number; currency: string; displayAmount: string }> {
  if (toCurrency === 'EUR') {
    return { amount: amountEur, currency: 'EUR', displayAmount: `${amountEur.toFixed(2)} €` };
  }

  const rate = await getExchangeRate(toCurrency);
  const amount = amountEur * rate;

  const formatters: Record<string, Intl.NumberFormat> = {
    XOF: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }),
    XAF: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 }),
    NGN: new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }),
    KES: new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }),
  };

  const formatter = formatters[toCurrency];
  const displayAmount = formatter
    ? formatter.format(amount)
    : `${amount.toFixed(2)} ${toCurrency}`;

  return { amount: Math.round(amount), currency: toCurrency, displayAmount };
}

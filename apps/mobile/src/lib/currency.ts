import type { SupportedCurrency, CurrencyInfo } from '@kephale/types';

export const CURRENCIES_CONFIG: Record<SupportedCurrency, CurrencyInfo> = {
  XOF: {
    code: 'XOF',
    name: 'Franc CFA (UEMOA)',
    symbol: 'FCFA',
    flag: '',
    rateToEur: 655.957,
    isZeroDecimal: true,
    minAmount: 100,
  },
  XAF: {
    code: 'XAF',
    name: 'Franc CFA (CEMAC)',
    symbol: 'FCFA',
    flag: '',
    rateToEur: 655.957,
    isZeroDecimal: true,
    minAmount: 100,
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    flag: '',
    rateToEur: 1.0,
    isZeroDecimal: false,
    minAmount: 0.5,
  },
  USD: {
    code: 'USD',
    name: 'Dollar Américain',
    symbol: '$',
    flag: '',
    rateToEur: 1.085,
    isZeroDecimal: false,
    minAmount: 0.5,
  },
  GNF: {
    code: 'GNF',
    name: 'Franc Guinéen',
    symbol: 'GNF',
    flag: '',
    rateToEur: 9350.0,
    isZeroDecimal: true,
    minAmount: 1000,
  },
  CDF: {
    code: 'CDF',
    name: 'Franc Congolais',
    symbol: 'CDF',
    flag: '',
    rateToEur: 3050.0,
    isZeroDecimal: true,
    minAmount: 500,
  },
  CAD: {
    code: 'CAD',
    name: 'Dollar Canadien',
    symbol: 'CA$',
    flag: '',
    rateToEur: 1.485,
    isZeroDecimal: false,
    minAmount: 0.5,
  },
  GBP: {
    code: 'GBP',
    name: 'Livre Sterling',
    symbol: '£',
    flag: '',
    rateToEur: 0.855,
    isZeroDecimal: false,
    minAmount: 0.5,
  },
  NGN: {
    code: 'NGN',
    name: 'Naira Nigérian',
    symbol: '₦',
    flag: '',
    rateToEur: 1650.0,
    isZeroDecimal: true,
    minAmount: 500,
  },
  KES: {
    code: 'KES',
    name: 'Shilling Kenyan',
    symbol: 'KSh',
    flag: '',
    rateToEur: 140.0,
    isZeroDecimal: true,
    minAmount: 100,
  },
  GHS: {
    code: 'GHS',
    name: 'Cedi Ghanéen',
    symbol: 'GH₵',
    flag: '',
    rateToEur: 16.5,
    isZeroDecimal: false,
    minAmount: 5.0,
  },
  ZAR: {
    code: 'ZAR',
    name: 'Rand Sud-Africain',
    symbol: 'R',
    flag: '',
    rateToEur: 19.5,
    isZeroDecimal: false,
    minAmount: 5.0,
  },
  RWF: {
    code: 'RWF',
    name: 'Franc Rwandais',
    symbol: 'FRw',
    flag: '',
    rateToEur: 1450.0,
    isZeroDecimal: true,
    minAmount: 500,
  },
};

export const TOKEN_XOF_VALUE = 10;

/**
 * Clean & normalize currency code
 */
export function normalizeCurrency(currency?: string | null): SupportedCurrency {
  if (!currency) return 'XOF';
  const upper = currency.trim().toUpperCase();
  if (upper === 'FCFA' || upper === 'CFA') return 'XOF';
  if (upper in CURRENCIES_CONFIG) return upper as SupportedCurrency;
  return 'XOF';
}

/**
 * Format fiat amount with its official currency symbol
 */
export function formatCurrency(amount: number, currency?: string | null): string {
  const code = normalizeCurrency(currency);
  const info = CURRENCIES_CONFIG[code];
  if (!info) return `${amount} ${currency || 'XOF'}`;

  if (info.isZeroDecimal) {
    return `${Math.round(amount).toLocaleString('fr-FR')} ${info.symbol}`;
  }
  return `${amount.toFixed(2).replace('.', ',')} ${info.symbol}`;
}

/**
 * Convert fiat amount between any two currencies
 */
export function convertFiat(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  roundDirection: 'UP' | 'DOWN' | 'NEAREST' = 'NEAREST'
): number {
  const fromCode = normalizeCurrency(fromCurrency);
  const toCode = normalizeCurrency(toCurrency);

  if (fromCode === toCode) return amount;

  const fromConfig = CURRENCIES_CONFIG[fromCode];
  const toConfig = CURRENCIES_CONFIG[toCode];

  const amountInEur = amount / fromConfig.rateToEur;
  const rawTargetAmount = amountInEur * toConfig.rateToEur;

  if (toConfig.isZeroDecimal) {
    if (roundDirection === 'UP') return Math.ceil(rawTargetAmount);
    if (roundDirection === 'DOWN') return Math.floor(rawTargetAmount);
    return Math.round(rawTargetAmount);
  } else {
    const factor = 100;
    if (roundDirection === 'UP') return Math.ceil(rawTargetAmount * factor) / factor;
    if (roundDirection === 'DOWN') return Math.floor(rawTargetAmount * factor) / factor;
    return Number(rawTargetAmount.toFixed(2));
  }
}

/**
 * Calculate required Kephale tokens for any item price with anti-loss Math.ceil rounding
 */
export function calculateTokensForPrice(fiatAmount: number, currency: string = 'XOF'): number {
  if (!fiatAmount || fiatAmount <= 0) return 0;
  const code = normalizeCurrency(currency);
  const amountInXof = convertFiat(fiatAmount, code, 'XOF', 'UP');
  const tokens = Math.ceil(amountInXof / TOKEN_XOF_VALUE);
  return Math.max(1, tokens);
}

/**
 * Calculate fiat equivalent for a number of tokens
 */
export function calculateFiatForTokens(tokens: number, targetCurrency: string = 'XOF'): number {
  if (!tokens || tokens <= 0) return 0;
  const code = normalizeCurrency(targetCurrency);
  const xofValue = tokens * TOKEN_XOF_VALUE;
  return convertFiat(xofValue, 'XOF', code, 'NEAREST');
}

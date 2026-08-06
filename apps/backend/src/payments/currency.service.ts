import { Injectable } from '@nestjs/common';
import type {
  SupportedCurrency,
  CurrencyInfo,
  TokenConversionResult,
  TokenPackWithLocalPrice,
} from '@kephale/types';

/**
 * Official Exchange Rates against 1 EUR (Base Currency)
 * Fixed Central Bank Peg: 1 EUR = 655.957 XOF / XAF
 */
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

/**
 * 1 Kephale Token is anchored to 10 XOF (FCFA)
 * 1 Token = 10 / 655.957 ≈ 0.0152449 EUR
 */
export const TOKEN_XOF_VALUE = 10;

@Injectable()
export class CurrencyService {
  /**
   * Normalize and sanitize currency code string
   */
  normalizeCurrency(currency?: string | null): SupportedCurrency {
    if (!currency) return 'XOF';
    const upper = currency.trim().toUpperCase();
    if (upper === 'FCFA' || upper === 'CFA') return 'XOF';
    if (upper in CURRENCIES_CONFIG) return upper as SupportedCurrency;
    return 'XOF';
  }

  /**
   * Get metadata for a specific currency
   */
  getCurrencyInfo(currency?: string | null): CurrencyInfo {
    const code = this.normalizeCurrency(currency);
    return CURRENCIES_CONFIG[code];
  }

  /**
   * Get all supported currencies with metadata
   */
  getAllCurrencies(): CurrencyInfo[] {
    return Object.values(CURRENCIES_CONFIG);
  }

  /**
   * Convert fiat amount between any two supported currencies
   * Applies directional rounding to prevent loss of margin
   */
  convertFiat(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    roundDirection: 'UP' | 'DOWN' | 'NEAREST' = 'NEAREST'
  ): number {
    const fromCode = this.normalizeCurrency(fromCurrency);
    const toCode = this.normalizeCurrency(toCurrency);

    if (fromCode === toCode) return amount;

    const fromConfig = CURRENCIES_CONFIG[fromCode];
    const toConfig = CURRENCIES_CONFIG[toCode];

    // Convert from source currency to EUR base, then to target currency
    const amountInEur = amount / fromConfig.rateToEur;
    const rawTargetAmount = amountInEur * toConfig.rateToEur;

    if (toConfig.isZeroDecimal) {
      if (roundDirection === 'UP') return Math.ceil(rawTargetAmount);
      if (roundDirection === 'DOWN') return Math.floor(rawTargetAmount);
      return Math.round(rawTargetAmount);
    } else {
      const factor = 100; // 2 decimal places
      if (roundDirection === 'UP') return Math.ceil(rawTargetAmount * factor) / factor;
      if (roundDirection === 'DOWN') return Math.floor(rawTargetAmount * factor) / factor;
      return Number(rawTargetAmount.toFixed(2));
    }
  }

  /**
   * Convert any fiat price into required Kephale Tokens
   * DIRECTIONAL ROUNDING: Always rounds UP (Math.ceil) to guarantee full value
   */
  calculateTokensForFiat(fiatAmount: number, currency: string): number {
    if (!fiatAmount || fiatAmount <= 0) return 0;

    const code = this.normalizeCurrency(currency);
    // Convert to XOF reference
    const amountInXof = this.convertFiat(fiatAmount, code, 'XOF', 'UP');

    // 1 Token = 10 XOF
    const tokens = Math.ceil(amountInXof / TOKEN_XOF_VALUE);
    return Math.max(1, tokens);
  }

  /**
   * Convert Kephale Tokens into exact fiat value in target currency
   */
  calculateFiatForTokens(
    tokens: number,
    targetCurrency: string,
    roundDirection: 'UP' | 'DOWN' | 'NEAREST' = 'NEAREST'
  ): number {
    if (!tokens || tokens <= 0) return 0;
    const code = this.normalizeCurrency(targetCurrency);
    const xofValue = tokens * TOKEN_XOF_VALUE;
    return this.convertFiat(xofValue, 'XOF', code, roundDirection);
  }

  /**
   * Calculate exact split between Platform and Artist
   */
  calculateArtistSplit(tokens: number, platformFeePercent: number = 20) {
    const platformFeeTokens = Math.ceil(tokens * (platformFeePercent / 100));
    const artistTokens = Math.max(0, tokens - platformFeeTokens);

    const fiatArtistAmount = artistTokens * TOKEN_XOF_VALUE;
    const fiatPlatformFee = platformFeeTokens * TOKEN_XOF_VALUE;
    const fiatTotalAmount = tokens * TOKEN_XOF_VALUE;

    return {
      priceTokens: tokens,
      platformFeeTokens,
      artistTokens,
      fiatArtistAmount,
      fiatPlatformFee,
      fiatTotalAmount,
      currency: 'XOF' as SupportedCurrency,
    };
  }

  /**
   * Format any price with its official currency symbol
   */
  formatPrice(amount: number, currency: string): string {
    const info = this.getCurrencyInfo(currency);
    if (info.isZeroDecimal) {
      return `${Math.round(amount).toLocaleString('fr-FR')} ${info.symbol}`;
    }
    return `${amount.toFixed(2).replace('.', ',')} ${info.symbol}`;
  }

  /**
   * Format a TokenPack with localized price for a specific currency
   */
  formatPackPrice(pack: any, currency: string): TokenPackWithLocalPrice {
    const code = this.normalizeCurrency(currency);
    const info = this.getCurrencyInfo(code);

    // If pack.priceEur is defined, convert from EUR to target currency with 'UP' rounding
    const priceLocal = this.convertFiat(pack.priceEur, 'EUR', code, 'UP');

    return {
      id: pack.id,
      tokens: pack.tokens,
      priceEur: pack.priceEur,
      priceLocal,
      currency: code,
      currencySymbol: info.symbol,
      formattedPrice: this.formatPrice(priceLocal, code),
      label: pack.label,
      isBestValue: pack.isBestValue || false,
      isActive: pack.isActive ?? true,
    };
  }
}

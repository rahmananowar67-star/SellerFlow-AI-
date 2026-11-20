export type SupportedCurrency = 'INR' | 'USD' | 'EUR';

export type FxRatesMap = Record<SupportedCurrency, number>;

export interface FxFeedMeta {
  base: 'INR';
  rates: FxRatesMap;
  source: string;
  fetchedAt: string;
  isLive: boolean;
}

export const DEFAULT_FX_RATES: FxRatesMap = {
  INR: 1,
  USD: 0.0118,
  EUR: 0.0109,
};

export const CURRENCY_META: Record<
  SupportedCurrency,
  { code: SupportedCurrency; symbol: string; label: string; nativeLabel: string; locale: string }
> = {
  INR: {
    code: 'INR',
    symbol: '₹',
    label: 'INR – Indian Rupee (₹)',
    nativeLabel: 'INR ₹',
    locale: 'en-IN',
  },
  USD: {
    code: 'USD',
    symbol: '$',
    label: 'USD – US Dollar ($)',
    nativeLabel: 'USD $',
    locale: 'en-US',
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    label: 'EUR – Euro (€)',
    nativeLabel: 'EUR €',
    locale: 'en-IE',
  },
};

export const ALL_CURRENCIES: SupportedCurrency[] = ['INR', 'USD', 'EUR'];

export function sanitizeCurrency(raw?: string | null): SupportedCurrency {
  if (raw === 'USD' || raw === 'EUR' || raw === 'INR') return raw;
  return 'INR';
}

/**
 * Deterministically converts an integer minor-unit amount (paise / cents) from `fromCurrency`
 * into `toCurrency` using INR-anchored exchange rates (`rates[C] = units of C per 1 INR`).
 */
export function convertCurrencyMinorUnits(
  amountMinor: number,
  fromCurrency: SupportedCurrency = 'INR',
  toCurrency: SupportedCurrency = 'INR',
  rates: FxRatesMap = DEFAULT_FX_RATES
): number {
  const safeAmount = Number.isFinite(amountMinor) ? amountMinor : 0;
  if (fromCurrency === toCurrency) return Math.round(safeAmount);
  const fromRate = rates[fromCurrency] > 0 ? rates[fromCurrency] : DEFAULT_FX_RATES[fromCurrency];
  const toRate = rates[toCurrency] > 0 ? rates[toCurrency] : DEFAULT_FX_RATES[toCurrency];
  const amountInInrMinor = safeAmount / fromRate;
  return Math.round(amountInInrMinor * toRate);
}

export function formatMinorInCurrency(amountMinor: number, currency: SupportedCurrency = 'INR'): string {
  const meta = CURRENCY_META[currency] || CURRENCY_META.INR;
  const value = Number.isFinite(amountMinor) ? amountMinor / 100 : 0;
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: meta.code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCurrency(
  amountMinor: number,
  fromCurrency: SupportedCurrency = 'INR',
  displayCurrency: SupportedCurrency = 'INR',
  rates: FxRatesMap = DEFAULT_FX_RATES
): string {
  const converted = convertCurrencyMinorUnits(amountMinor, fromCurrency, displayCurrency, rates);
  return formatMinorInCurrency(converted, displayCurrency);
}

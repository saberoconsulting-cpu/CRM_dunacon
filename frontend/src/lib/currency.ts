// Los importes internos permanecen en USD. La moneda elegida solo cambia su presentacion.
import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type Currency = 'PEN' | 'USD';
export const DEFAULT_EXCHANGE_RATE = 3.75;
const CURRENCY_KEY = 'crm_display_currency';
const RATE_KEY = 'crm_exchange_rate';
export const CURRENCY_SYMBOL: Record<Currency, string> = { PEN: 'S/', USD: 'US$' };

export function convertDisplayAmount(value: unknown, currency: Currency, rate: number): number {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_EXCHANGE_RATE;
  return currency === 'PEN' ? amount * safeRate : amount;
}

export function formatCurrency(amount: number, currency: Currency): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${CURRENCY_SYMBOL[currency]} ${value.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
export function formatCurrencyShort(amount: number, currency: Currency): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const symbol = CURRENCY_SYMBOL[currency];
  if (Math.abs(value) >= 1000000) return `${symbol} ${(value / 1000000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(value) >= 1000) return `${symbol} ${(value / 1000).toLocaleString('es-PE', { maximumFractionDigits: 0 })}k`;
  return `${symbol} ${value.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
}

type Stored = { currency: Currency; rate: number; listeners: Set<() => void> };
export const currencyStore: Stored = { currency: 'USD', rate: DEFAULT_EXCHANGE_RATE, listeners: new Set() };
export function setCurrencyStore(next: Partial<Pick<Stored, 'currency' | 'rate'>>) {
  let changed = false;
  if ((next.currency === 'USD' || next.currency === 'PEN') && next.currency !== currencyStore.currency) {
    currencyStore.currency = next.currency;
    changed = true;
  }
  if (next.rate != null && Number.isFinite(next.rate) && next.rate > 0 && next.rate !== currencyStore.rate) {
    currencyStore.rate = next.rate;
    changed = true;
  }
  if (changed) currencyStore.listeners.forEach(notify => notify());
}
export function subscribeCurrencyStore(listener: () => void) {
  currencyStore.listeners.add(listener);
  return () => { currencyStore.listeners.delete(listener); };
}
const snapshot = () => `${currencyStore.currency}:${currencyStore.rate}`;
const serverSnapshot = () => `USD:${DEFAULT_EXCHANGE_RATE}`;
function restoreDisplayPreference() {
  if (typeof window === 'undefined') return;
  try {
    const saved = window.localStorage.getItem(CURRENCY_KEY);
    const rate = Number(window.localStorage.getItem(RATE_KEY));
    setCurrencyStore({ currency: saved === 'PEN' ? 'PEN' : 'USD', rate: rate > 0 ? rate : DEFAULT_EXCHANGE_RATE });
  } catch {}
}

export function useDisplayCurrency() {
  const current = useSyncExternalStore(subscribeCurrencyStore, snapshot, serverSnapshot);
  const [selected, rate] = current.split(':');
  const currency = selected as Currency;
  const exchangeRate = Number(rate);
  useEffect(() => {
    restoreDisplayPreference();
    const onStorage = (event: StorageEvent) => {
      if (event.key === CURRENCY_KEY || event.key === RATE_KEY || event.key === null) restoreDisplayPreference();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const setCurrency = useCallback((next: Currency) => {
    if (next !== 'USD' && next !== 'PEN') return;
    setCurrencyStore({ currency: next });
    try { window.localStorage.setItem(CURRENCY_KEY, next); } catch {}
  }, []);
  const setExchangeRate = useCallback((next: number) => {
    const safe = Number.isFinite(next) && next > 0 ? next : DEFAULT_EXCHANGE_RATE;
    setCurrencyStore({ rate: safe });
    try { window.localStorage.setItem(RATE_KEY, String(safe)); } catch {}
  }, []);
  const toDisplay = useCallback((value: number | string | null | undefined) => convertDisplayAmount(value, currency, exchangeRate), [currency, exchangeRate]);
  const format = useCallback((value: number | string | null | undefined) => formatCurrency(toDisplay(value), currency), [toDisplay, currency]);
  const formatShort = useCallback((value: number | string | null | undefined) => formatCurrencyShort(toDisplay(value), currency), [toDisplay, currency]);
  return { currency, setCurrency, exchangeRate, setExchangeRate, toDisplay, format, formatShort };
}

export function moneyGlobal(value: unknown): string {
  return formatCurrency(convertDisplayAmount(value, currencyStore.currency, currencyStore.rate), currencyStore.currency);
}
/** Solo formato visual; nunca usar este resultado para guardar o calcular importes internos. */
export function displayNumberGlobal(value: unknown): number {
  return convertDisplayAmount(value, currencyStore.currency, currencyStore.rate);
}
export function displaySymbol(): string { return CURRENCY_SYMBOL[currencyStore.currency]; }
export function moneyGlobalShort(value: unknown): string {
  return formatCurrencyShort(displayNumberGlobal(value), currencyStore.currency);
}
export function useCurrencyStoreSync() { return useDisplayCurrency(); }

export function moneyGlobalDecimals(value: unknown, digits = 2): string {
  return `${displaySymbol()} ${displayNumberGlobal(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

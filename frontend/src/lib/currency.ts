// Los importes operativos del CRM se capturan, almacenan y muestran en USD.

import { useCallback, useEffect, useState } from 'react';

export type Currency = 'PEN' | 'USD';

/** Tipo de cambio referencial por defecto (S/ por US$), igual al usado en Cotizaciones. */
export const DEFAULT_EXCHANGE_RATE = 3.75;

const CURRENCY_KEY = 'crm_display_currency';
const RATE_KEY = 'crm_exchange_rate';

export const CURRENCY_SYMBOL: Record<Currency, string> = { PEN: 'S/', USD: 'US$' };

function readStorage<T>(key: string, fallback: T, parse: (raw: string) => T | null): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** Formatea un monto ya convertido, con el simbolo de la moneda elegida. */
export function formatCurrency(amount: number, currency: Currency): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const symbol = CURRENCY_SYMBOL[currency];
  return `${symbol} ${value.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Version corta (S/ 12k / US$ 3.2M) para ejes de graficos. */
export function formatCurrencyShort(amount: number, currency: Currency): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const symbol = CURRENCY_SYMBOL[currency];
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${symbol} ${(value / 1000000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1000) return `${symbol} ${(value / 1000).toLocaleString('es-PE', { maximumFractionDigits: 0 })}k`;
  return `${symbol} ${value.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
}

/**
 * Estado de moneda por pantalla: lee/escribe la preferencia y expone helpers
 * de conversion/format listos para usar en el render.
 */
export function useDisplayCurrency() {
  const [currency, setCurrencyState] = useState<Currency>('USD');
  const [exchangeRate, setExchangeRateState] = useState<number>(DEFAULT_EXCHANGE_RATE);

  useEffect(() => {
    // Ignorar preferencias antiguas en soles.
    try { window.localStorage.setItem(CURRENCY_KEY, 'USD'); } catch {}
    setExchangeRateState(readStorage<number>(RATE_KEY, DEFAULT_EXCHANGE_RATE, (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    }));
  }, []);

  const setCurrency = useCallback((_next: Currency) => {
    setCurrencyState('USD');
    try { window.localStorage.setItem(CURRENCY_KEY, 'USD'); } catch {}
  }, []);

  const setExchangeRate = useCallback((next: number) => {
    const safe = Number.isFinite(next) && next > 0 ? next : DEFAULT_EXCHANGE_RATE;
    setExchangeRateState(safe);
    try { window.localStorage.setItem(RATE_KEY, String(safe)); } catch {}
  }, []);

  /** Los montos ya vienen en USD; no aplicar tipos de cambio. */
  const toDisplay = useCallback(
    (amountInUSD: number | string | null | undefined) => Number(amountInUSD || 0),
    [currency, exchangeRate],
  );

  /** Convierte y formatea en un solo paso. */
  const format = useCallback(
    (amountInUSD: number | string | null | undefined) => formatCurrency(toDisplay(amountInUSD), currency),
    [toDisplay, currency],
  );

  /** Igual que `format` pero abreviado para ejes de graficos. */
  const formatShort = useCallback(
    (amountInUSD: number | string | null | undefined) => formatCurrencyShort(toDisplay(amountInUSD), currency),
    [toDisplay, currency],
  );

  return { currency, setCurrency, exchangeRate, setExchangeRate, toDisplay, format, formatShort };
}

// ---------------------------------------------------------------------------
// Almacen global ligero (fuera de React) para las vistas con muchos
// sub-componentes: permite que helpers como `money()` lean la moneda activa sin
// tener que pasar props por todo el arbol. El componente raiz lo sincroniza con
// `useCurrencyStoreSync()`.
// ---------------------------------------------------------------------------
type Stored = { currency: Currency; rate: number; listeners: Set<() => void> };

export const currencyStore: Stored = {
  currency: 'USD',
  rate: DEFAULT_EXCHANGE_RATE,
  listeners: new Set(),
};

export function setCurrencyStore(next: Partial<Pick<Stored, 'currency' | 'rate'>>) {
  let changed = false;
  if (currencyStore.currency !== 'USD') {
    currencyStore.currency = 'USD';
    changed = true;
  }
  if (next.rate && Number.isFinite(next.rate) && next.rate > 0 && next.rate !== currencyStore.rate) {
    currencyStore.rate = next.rate;
    changed = true;
  }
  // Solo notifica si algo cambio, para no provocar renders extra innecesarios.
  if (changed) currencyStore.listeners.forEach((notify) => notify());
}

export function subscribeCurrencyStore(listener: () => void) {
  currencyStore.listeners.add(listener);
  return () => { currencyStore.listeners.delete(listener); };
}

/** Formatea el importe original en USD. */
export function moneyGlobal(value: unknown): string {
  const converted = Number(value || 0);
  return formatCurrency(converted, 'USD');
}

/**
 * Sincroniza el almacen global con el estado del componente y fuerza un
 * re-render cuando cambia la moneda (para que los helpers se repinten).
 */
export function useCurrencyStoreSync() {
  const state = useDisplayCurrency();
  const [, bump] = useState(0);

  useEffect(() => {
    setCurrencyStore({ currency: state.currency, rate: state.exchangeRate });
  }, [state.currency, state.exchangeRate]);

  useEffect(() => subscribeCurrencyStore(() => bump((n) => n + 1)), []);

  return state;
}

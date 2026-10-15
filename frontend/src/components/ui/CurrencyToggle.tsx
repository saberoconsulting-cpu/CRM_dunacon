'use client';
import type { Currency } from '@/lib/currency';

// El CRM opera exclusivamente en dolares. Conserva las props para los consumidores existentes.
export default function CurrencyToggle({ className = '' }: {
  currency?: Currency;
  setCurrency?: (value: Currency) => void;
  exchangeRate?: number;
  setExchangeRate?: (value: number) => void;
  className?: string;
}) {
  return <span className={`inline-flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-600 ${className}`}>US$</span>;
}
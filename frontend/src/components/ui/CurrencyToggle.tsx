'use client';
// src/components/ui/CurrencyToggle.tsx
// Boton para alternar la moneda de visualizacion (S/ <-> US$) con tipo de
// cambio referencial editable. Se usa en las pantallas que muestran montos.

import { useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import { BRAND } from '@/lib/types';
import type { Currency } from '@/lib/currency';
import { DEFAULT_EXCHANGE_RATE, useDisplayCurrency } from '@/lib/currency';

export default function CurrencyToggle({
  currency,
  setCurrency,
  exchangeRate,
  setExchangeRate,
  className = '',
}: {
  currency?: Currency;
  setCurrency?: (value: Currency) => void;
  exchangeRate?: number;
  setExchangeRate?: (value: number) => void;
  className?: string;
}) {
  // Si el padre no controla el estado, el componente maneja su propia preferencia.
  const own = useDisplayCurrency();
  const value = currency ?? own.currency;
  const onChange = setCurrency ?? own.setCurrency;
  const rate = exchangeRate ?? own.exchangeRate;
  const onRateChange = setExchangeRate ?? own.setExchangeRate;
  const [openRate, setOpenRate] = useState(false);
  const [draftRate, setDraftRate] = useState(String(rate || DEFAULT_EXCHANGE_RATE));

  function applyRate() {
    const next = Number(draftRate);
    onRateChange(Number.isFinite(next) && next > 0 ? next : DEFAULT_EXCHANGE_RATE);
    setOpenRate(false);
  }

  return (
    <div className={`relative flex flex-wrap items-center gap-1 ${className}`}>
      <div className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: BRAND.border }}>
        {(['PEN', 'USD'] as const).map((item) => {
          const active = value === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              aria-pressed={active}
              className="h-8 px-2.5 text-xs font-semibold transition-colors"
              style={{ background: active ? BRAND.blue : '#fff', color: active ? '#fff' : BRAND.muted }}
            >
              {item === 'PEN' ? 'S/' : 'US$'}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => { setDraftRate(String(rate || DEFAULT_EXCHANGE_RATE)); setOpenRate((v) => !v); }}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs font-semibold transition-colors hover:bg-slate-50"
        style={{ borderColor: BRAND.border, color: BRAND.muted }}
        title="Editar tipo de cambio referencial (S/ por US$)"
        aria-label="Editar tipo de cambio referencial"
      >
        <FiRefreshCw style={{ fontSize: 12 }} />
        {Number(rate || 0).toLocaleString('es-PE', { maximumFractionDigits: 4 })}
      </button>

      {openRate && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpenRate(false)} />
          <div
            className="absolute right-0 top-10 z-40 w-56 rounded-md border bg-white p-3 shadow-xl"
            style={{ borderColor: BRAND.border }}
          >
            <label className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: BRAND.muted }}>
              Tipo de cambio (S/ por US$)
            </label>
            <input
              type="number"
              min={0.0001}
              step="0.0001"
              autoFocus
              className="input mt-1.5 !h-9"
              value={draftRate}
              onChange={(event) => setDraftRate(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') applyRate(); }}
            />
            <p className="mt-1.5 text-[10px]" style={{ color: BRAND.muted }}>
              Referencial. Se usa para convertir los montos a US$.
            </p>
            <div className="mt-2 flex justify-end gap-1.5">
              <button type="button" className="btn-neutral !h-7 !px-2.5 text-xs" onClick={() => setOpenRate(false)}>Cancelar</button>
              <button type="button" className="btn-primary !h-7 !px-2.5 text-xs" onClick={applyRate}>Aplicar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

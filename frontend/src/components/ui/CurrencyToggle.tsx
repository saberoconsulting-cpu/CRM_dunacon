'use client';
import { useEffect, useState } from 'react';
import { useDisplayCurrency, type Currency } from '@/lib/currency';

export default function CurrencyToggle({ currency, setCurrency, exchangeRate, setExchangeRate, className = '' }: {
  currency?: Currency;
  setCurrency?: (value: Currency) => void;
  exchangeRate?: number;
  setExchangeRate?: (value: number) => void;
  className?: string;
}) {
  const shared = useDisplayCurrency();
  const selected = currency ?? shared.currency;
  const rate = exchangeRate ?? shared.exchangeRate;
  const changeCurrency = setCurrency ?? shared.setCurrency;
  const changeRate = setExchangeRate ?? shared.setExchangeRate;
  const [draft, setDraft] = useState(String(rate));
  useEffect(() => { setDraft(String(rate)); }, [rate]);
  const commitRate = () => {
    const next = Number(draft.replace(',', '.'));
    if (Number.isFinite(next) && next > 0) changeRate(next);
    else setDraft(String(rate));
  };
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
      <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Moneda de visualizacion">
        {(['USD', 'PEN'] as const).map(value => (
          <button key={value} type="button" aria-pressed={selected === value} onClick={() => changeCurrency(value)} className={`h-7 rounded px-3 text-xs font-semibold ${selected === value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>{value === 'USD' ? 'US$' : 'S/'}</button>
        ))}
      </div>
      <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500" title="Soles por dolar. Solo cambia la visualizacion.">
        Tipo de cambio
        <input aria-label="Tipo de cambio de visualizacion" inputMode="decimal" className="h-8 w-[72px] rounded-md border border-slate-200 bg-white px-2 text-right text-xs text-slate-700" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commitRate} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
      </label>
    </div>
  );
}

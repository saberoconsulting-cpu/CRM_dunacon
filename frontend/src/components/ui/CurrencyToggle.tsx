'use client';
import { useDisplayCurrency, type Currency } from '@/lib/currency';

export default function CurrencyToggle({ currency, setCurrency, className = '' }: {
  currency?: Currency;
  setCurrency?: (value: Currency) => void;
  className?: string;
}) {
  const shared = useDisplayCurrency();
  const selected = currency ?? shared.currency;
  const changeCurrency = setCurrency ?? shared.setCurrency;
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
      <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Moneda de visualizacion">
        {(['USD', 'PEN'] as const).map(value => (
          <button key={value} type="button" aria-pressed={selected === value} onClick={() => changeCurrency(value)} className={`h-7 rounded px-3 text-xs font-semibold ${selected === value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>{value === 'USD' ? 'US$' : 'S/'}</button>
        ))}
      </div>
    </div>
  );
}

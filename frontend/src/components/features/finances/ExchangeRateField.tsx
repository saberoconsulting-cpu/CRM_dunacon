'use client';

import { useEffect, useState } from 'react';
import { useDisplayCurrency } from '@/lib/currency';

export default function ExchangeRateField({ className }: { className?: string } = {}) {
  const { exchangeRate, setExchangeRate } = useDisplayCurrency();
  const [draft, setDraft] = useState(String(exchangeRate));
  const [error, setError] = useState(false);

  useEffect(() => { setDraft(String(exchangeRate)); }, [exchangeRate]);

  const save = () => {
    const value = Number(draft.trim().replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError(true);
      return;
    }
    setError(false);
    setExchangeRate(value);
    setDraft(String(value));
  };

  return (
    <div>
      <input
        aria-label="Tipo de cambio"
        aria-invalid={error}
        aria-describedby={error ? 'exchange-rate-error' : undefined}
        inputMode="decimal"
        className={className || "input !h-7 !w-full !min-w-0 !max-w-none !rounded-md !px-1 text-right !text-xs lg:!text-sm"}
        value={draft}
        onChange={event => { setDraft(event.target.value); setError(false); }}
        onBlur={save}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { setDraft(String(exchangeRate)); setError(false); }
        }}
      />
      {error && <p id="exchange-rate-error" role="alert" className="mt-1 text-xs text-red-600">Ingresa un valor mayor que cero.</p>}
    </div>
  );
}

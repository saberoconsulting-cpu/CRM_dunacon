'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { AccountingInvoice } from '@/lib/accounting';
import { calculateIgv } from '@/lib/accounting-parameters';
import styles from './accounting.module.css';

export default function InvoiceBaseCell({ row, projectId, igvRate, disabled, onSaved }: { row: AccountingInvoice; projectId: number; igvRate: number; disabled: boolean; onSaved: (row: AccountingInvoice) => void }) {
  const [value, setValue] = useState(String(row.base));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelBlur = useRef(false);
  useEffect(() => { setValue(String(row.base)); setError(''); }, [row.base]);
  const dirty = value === '' || Number(value) !== row.base;
  const save = async () => {
    if (disabled || busy || !dirty) return;
    const base = Math.round(Number(value) * 100) / 100;
    if (value.trim() === '' || !Number.isFinite(base) || base < 0) { setError('Ingresa un importe válido.'); return; }
    setBusy(true); setError('');
    try {
      const saved = await api.patch<AccountingInvoice>(`/accounting/${row.id}`, { projectId, row: { ...row, base, igv: calculateIgv(base, igvRate) } });
      onSaved(saved); setValue(String(saved.base));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  };
  return <div className={styles.baseEditor}>
    <div><input aria-label={`Base imponible ${row.currency} de ${row.number}`} type="number" min="0" step="0.01" value={value} disabled={disabled || busy} onChange={e => { setValue(e.target.value); setError(''); }} onFocus={() => { cancelBlur.current = false; }} onBlur={() => { if (cancelBlur.current) { cancelBlur.current = false; return; } void save(); }} onKeyDown={e => {
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === 'Escape') { cancelBlur.current = true; setValue(String(row.base)); setError(''); e.currentTarget.blur(); }
    }} />

    </div>{error && <span role="alert">{error}</span>}
  </div>;
}

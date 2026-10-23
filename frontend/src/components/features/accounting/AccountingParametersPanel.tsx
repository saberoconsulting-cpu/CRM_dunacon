'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { AccountingParameters } from '@/lib/accounting-parameters';
import { Modal } from '@/components/ui/ui';
import styles from './accounting.module.css';

const fields = [
  { value: 'igvRate', label: 'igvLabel', text: 'Tasa IGV', unit: '%' },
  { value: 'deductionRate', label: 'deductionLabel', text: 'Tasa detracción', unit: '%' },
  { value: 'deductionThreshold', label: 'thresholdLabel', text: 'Umbral detracción', unit: 'S/' },
] as const;

export default function AccountingParametersPanel({ projectId, parameters, disabled, onSaved, onClose }: { projectId: number; parameters: AccountingParameters; disabled: boolean; onSaved: (parameters: AccountingParameters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(parameters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || busy) return;
    setBusy(true); setError('');
    try {
      const saved = await api.put<AccountingParameters>('/accounting/parameters', { projectId, parameters: draft });
      onSaved(saved); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron guardar los parámetros.'); }
    finally { setBusy(false); }
  };
  return <Modal open title="Parámetros de Contabilidad" width="max-w-lg" onClose={() => { if (!busy) onClose(); }}>
    <form className={styles.entry} onSubmit={save}>
      <table className={styles.parametersTable}><thead><tr><th>Parámetro</th><th>Valor</th></tr></thead><tbody>
        {fields.map(field => <tr key={field.value}>
          <td><input aria-label={`Nombre de ${field.text}`} required maxLength={100} disabled={disabled || busy} style={{ textAlign: 'left' }} value={draft[field.label] ?? field.text} onChange={e => setDraft({ ...draft, [field.label]: e.target.value })} /></td>
          <td><div className="flex items-center gap-2"><input aria-label={`Valor de ${field.text}`} type="number" required min="0" max={field.unit === '%' ? 100 : undefined} step="0.01" disabled={disabled || busy} value={draft[field.value]} onChange={e => setDraft({ ...draft, [field.value]: e.target.value === '' ? '' : Number(e.target.value) })} /><span>{field.unit}</span></div></td>
        </tr>)}
      </tbody></table>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" className="btn-neutral !h-8" disabled={busy} onClick={onClose}>Cerrar</button><button type="submit" className="btn-neutral !h-8" disabled={disabled || busy}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
    </form>
  </Modal>;
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getToken, projectContextHeaders, uploadFile } from '@/lib/api';
import { Modal } from '@/components/ui/ui';
import type { AccountingInvoice, InvoiceKind } from '@/lib/accounting';
import styles from './accounting.module.css';
import EntryAccessNotice from './EntryAccessNotice';
import { FiPlus, FiUpload } from 'react-icons/fi';
import { AccountingParameters, calculateDeduction, calculateIgv } from '@/lib/accounting-parameters';

type Draft = Omit<AccountingInvoice, 'id' | 'kind' | 'exchangeRate'> & { exchangeRate: number | string };
const blank = (): Draft => ({ documentType: 'Factura', issuedAt: '', dueAt: '', number: '', ruc: '', supplier: '', currency: 'PEN', base: 0, igv: 0, deduction: 0, deductionNumber: '', deductionDate: '', exchangeRate: 1, validated: false, creditReference: '' });
const fields: { key: keyof Draft; label: string; type?: string; required?: boolean }[] = [
  { key: 'issuedAt', label: 'Fecha de emisión', type: 'date', required: true },
  { key: 'dueAt', label: 'Fecha de vencimiento', type: 'date' },
  { key: 'number', label: 'N.º de comprobante', required: true },
  { key: 'ruc', label: 'RUC del proveedor', required: true },
  { key: 'supplier', label: 'Proveedor', required: true },
  { key: 'base', label: 'Base imponible', type: 'number', required: true },
  { key: 'igv', label: 'IGV', type: 'number', required: true },
  { key: 'deduction', label: 'Detracción S/', type: 'number' },
  { key: 'deductionNumber', label: 'N.º de detracción' },
  { key: 'deductionDate', label: 'Fecha de detracción', type: 'date' },
  { key: 'exchangeRate', label: 'Tipo de cambio del día', type: 'number', required: true },
  { key: 'creditReference', label: 'Referencia comprobante (NC)' },
];

export default function InvoiceEntry({ projectId, kind, disabled, onSaved, editing, onEditClose, blockedReason, parameters }: { projectId: number; kind: InvoiceKind; disabled: boolean; onSaved: (rows: AccountingInvoice[]) => void; editing: AccountingInvoice | null; onEditClose: () => void; blockedReason?: string; parameters: AccountingParameters }) {
  const sale = kind === 'sale';
  const party = sale ? 'Cliente' : 'Proveedor';
  const register = sale ? 'venta' : 'compra';
  const [mode, setMode] = useState<'manual' | 'excel' | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [preview, setPreview] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const updateDraft = (key: keyof Draft, value: string | number) => setDraft(current => {
    const next = { ...current, [key]: value };
    if (key === 'currency' && value !== current.currency) next.exchangeRate = value === 'USD' ? '' : 1;
    if (key === 'base') next.igv = calculateIgv(Number(value), parameters.igvRate);
    if (['base', 'igv', 'currency', 'exchangeRate'].includes(key)) next.deduction = calculateDeduction(Number(next.base) + Number(next.igv), next.currency, Number(next.exchangeRate), parameters);
    return next;
  });
  useEffect(() => { if (editing) { setDraft(editing); setMode('manual'); setError(''); } }, [editing]);
  const close = () => { if (!busy) { setMode(null); onEditClose(); } };
  const open = (next: 'manual' | 'excel') => { setError(''); setDraft(blank()); setPreview([]); setMode(next); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (disabled || busy) return;
    setError(''); setBusy(true);
    try {
      const rows = editing ? [await api.patch<AccountingInvoice>(`/accounting/${editing.id}`, { projectId, row: draft })] : await api.post<AccountingInvoice[]>('/accounting', { projectId, kind, rows: mode === 'manual' ? [draft] : preview });
      onSaved(rows); setMode(null); onEditClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  };
  const template = async () => {
    setError(''); setBusy(true);
    try {
      const response = await fetch(`/api/accounting/template?kind=${kind}`, { headers: { ...projectContextHeaders(), Authorization: `Bearer ${getToken()}` } });
      if (!response.ok) throw new Error('No se pudo descargar la plantilla.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `plantilla-facturas-${register}.xlsx`; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al descargar.'); }
    finally { setBusy(false); }
  };
  return <>
    <div className={styles.actions}><button type="button" className="btn-neutral !h-8 !rounded-md !px-3 !text-xs" disabled={disabled || busy} onClick={() => open('excel')}><FiUpload />Importar Excel</button><button type="button" className="btn-neutral !h-8 !rounded-md !px-3 !text-xs" disabled={disabled || busy} onClick={() => open('manual')}><FiPlus />Nueva factura</button></div>
    <Modal open={mode !== null} onClose={close} title={editing ? `Editar factura de ${register}` : mode === 'manual' ? `Registrar factura de ${register}` : `Importar facturas de ${register} desde Excel`} width="max-w-3xl">
      <form onSubmit={save} className={styles.entry}>
        <EntryAccessNotice blockedReason={blockedReason} />
        {mode === 'manual' ? <fieldset className={styles.formGrid} disabled={disabled || busy}>
          <label>Tipo de documento<select value={draft.documentType} onChange={e => setDraft({ ...draft, documentType: e.target.value })}>{['Factura', 'Boleta', 'Nota de crédito', 'Nota de débito', 'Recibo por honorarios'].map(v => <option key={v}>{v}</option>)}</select></label>
          <label>Moneda<select value={draft.currency} onChange={e => updateDraft('currency', e.target.value)}><option value="PEN">Soles S/</option><option value="USD">Dólares US$</option></select></label>
          {fields.map(field => <label key={field.key}>{field.key === 'supplier' ? party : field.key === 'ruc' ? `RUC del ${party.toLowerCase()}` : field.label}{field.required ? ' *' : ''}<input required={field.required} type={field.type || 'text'} value={String(draft[field.key])} min={field.key === 'exchangeRate' ? '0.0001' : field.type === 'number' ? '0' : field.key === 'dueAt' ? draft.issuedAt : undefined} step={field.key === 'exchangeRate' ? '0.0001' : '0.01'} maxLength={field.key === 'ruc' ? 11 : 255} pattern={field.key === 'ruc' ? '[0-9]{11}' : undefined} onChange={e => updateDraft(field.key, field.type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : e.target.value)} /></label>)}
          <label>Mes<input readOnly value={draft.issuedAt ? draft.issuedAt.slice(0, 7) : ''} /></label>
          <label>Total {draft.currency === 'PEN' ? 'S/' : 'US$'}<input readOnly value={(Number(draft.base) + Number(draft.igv)).toFixed(2)} /></label>
          {!sale && <label>Validada<select value={draft.validated ? 'SI' : 'NO'} onChange={e => setDraft({ ...draft, validated: e.target.value === 'SI' })}><option value="NO">NO</option><option value="SI">SÍ</option></select></label>}
        </fieldset> : <>
          <label className={styles.fileLabel}>Subir archivo Excel<input key={fileKey} type="file" accept=".xlsx,.xls" disabled={busy || disabled} onChange={async e => {
            const file = e.target.files?.[0]; setPreview([]); setError(''); if (!file) return;
            if (file.size > 5 * 1024 * 1024) { setError('El archivo supera los 5 MB.'); return; }
            setBusy(true);
            try { setPreview(await uploadFile(`/accounting/preview?projectId=${projectId}&kind=${kind}`, file)); }
            catch (err) { setError(err instanceof Error ? err.message : 'Error al leer el archivo.'); }
            finally { setBusy(false); setFileKey(n => n + 1); }
          }} /></label>
          <button type="button" className={styles.templateLink} disabled={busy} onClick={template}>Plantilla Excel</button>
          {!!preview.length && <><p>{preview.length} facturas de {register} listas para importar. Revisa los datos antes de guardar.</p><div className={styles.preview}><table><thead><tr><th>Comprobante</th><th>{party}</th><th>Fecha</th><th>Moneda</th><th>Base</th><th>IGV</th>{!sale && <th>Validada</th>}</tr></thead><tbody>{preview.map((r, i) => <tr key={i}><td>{r.number}</td><td>{r.supplier}</td><td>{r.issuedAt}</td><td>{r.currency}</td><td>{r.base}</td><td>{r.igv}</td>{!sale && <td>{r.validated ? 'SÍ' : 'NO'}</td>}</tr>)}</tbody></table></div></>}
        </>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}><button type="button" className="btn-neutral" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="btn-primary" disabled={busy || disabled || (mode === 'excel' && !preview.length)}>{busy ? 'Procesando…' : editing ? 'Guardar cambios' : mode === 'excel' ? 'Guardar importación' : 'Guardar factura'}</button></div>
      </form>
    </Modal>
  </>;
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getToken, projectContextHeaders, uploadFile } from '@/lib/api';
import { Modal, toast } from '@/components/ui/ui';
import type { AccountingInvoice, InvoiceKind } from '@/lib/accounting';
import styles from './accounting.module.css';
import AttachmentField, { saveAttachments, attachmentPath } from './AttachmentField';
import EntryAccessNotice from './EntryAccessNotice';
import { FiPlus, FiUpload } from 'react-icons/fi';
import { AccountingParameters, calculateIgv, extractIgv } from '@/lib/accounting-parameters';

type Draft = Omit<AccountingInvoice, 'id' | 'kind' | 'exchangeRate'> & { exchangeRate: number | string };
const blank = (): Draft => ({ documentType: 'Factura', issuedAt: '', dueAt: '', number: '', ruc: '', supplier: '', currency: 'PEN', base: 0, igv: 0, deduction: 0, deductionNumber: '', deductionDate: '', exchangeRate: '', validated: false, creditReference: '' });
const fields: { key: keyof Draft; label: string; type?: string; required?: boolean }[] = [
  { key: 'issuedAt', label: 'Fecha de emisión', type: 'date', required: true },
  { key: 'dueAt', label: 'Fecha de vencimiento', type: 'date' },
  { key: 'number', label: 'N.º de comprobante', required: true },
  { key: 'ruc', label: 'RUC del proveedor', required: true },
  { key: 'supplier', label: 'Proveedor', required: true },
  { key: 'base', label: 'Base imponible', type: 'number', required: true },
  { key: 'igv', label: 'IGV', type: 'number', required: true },
  { key: 'deduction', label: 'Detracción S/ (importe calculado)', type: 'number' },
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
  const [igvMode, setIgvMode] = useState<'apply' | 'included'>('apply');
  const [includedAmount, setIncludedAmount] = useState<number | string>('');
  const [includeDeduction, setIncludeDeduction] = useState(false);
  const [preview, setPreview] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [attachments, setAttachments] = useState<File[]>([]);
  const updateIncludedAmount = (value: number | string) => {
    setIncludedAmount(value);
    const total = Math.round(Number(value) * 100) / 100;
    const igv = extractIgv(total, parameters.igvRate);
    setDraft(current => ({ ...current, base: Math.round((total - igv) * 100) / 100, igv }));
  };
  const changeIgvMode = (value: 'apply' | 'included') => {
    setIgvMode(value);
    if (value === 'included') updateIncludedAmount(Math.round((Number(draft.base) + Number(draft.igv)) * 100) / 100);
    else setDraft(current => ({ ...current, igv: calculateIgv(Number(current.base), parameters.igvRate) }));
  };
  const updateDraft = (key: keyof Draft, value: string | number) => setDraft(current => {
    const next = { ...current, [key]: value };
    if (key === 'currency' && value !== current.currency) next.exchangeRate = '';
    if (key === 'base') next.igv = calculateIgv(Number(value), parameters.igvRate);
    return next;
  });
  useEffect(() => { if (editing) { setDraft(editing); setAttachments([]); setIncludeDeduction(Boolean(editing.deduction || editing.deductionNumber || editing.deductionDate)); setIgvMode('apply'); setIncludedAmount(''); setMode('manual'); setError(''); } }, [editing]);
  const close = () => { if (!busy) { setMode(null); onEditClose(); } };
  const open = (next: 'manual' | 'excel') => { setError(''); setAttachments([]); setDraft(blank()); setIncludeDeduction(false); setIgvMode('apply'); setIncludedAmount(''); setPreview([]); setMode(next); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (disabled || busy) return;
    setError(''); setBusy(true);
    try {
      const manualRow = { ...draft, exchangeRate: draft.currency === 'USD' ? draft.exchangeRate : 1, deduction: includeDeduction ? Number(draft.deduction || 0) : 0, deductionNumber: includeDeduction ? draft.deductionNumber : '', deductionDate: includeDeduction ? draft.deductionDate : '' };
      const rows = editing ? [await api.patch<AccountingInvoice>(`/accounting/${editing.id}`, { projectId, row: manualRow })] : await api.post<AccountingInvoice[]>('/accounting', { projectId, kind, rows: mode === 'manual' ? [manualRow] : preview });
      if (mode === 'manual' && attachments.length) {
        try { await saveAttachments('invoice', rows[0].id, projectId, attachments); Object.assign(rows[0], { attachments: await api.get(attachmentPath('invoice', rows[0].id, projectId)) }); }
        catch (e) { toast(`Registro guardado, pero faltan adjuntos. Usa el boton Adjuntar de la fila para reintentar. ${e instanceof Error ? e.message : ''}`); onSaved(rows); setMode(null); onEditClose(); return; }
      }
      onSaved(rows); toast(`${rows.length} facturas guardadas en el servidor.`); setMode(null); onEditClose();
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
          <label>Cálculo del IGV ({parameters.igvRate}%)<select value={igvMode} onChange={e => changeIgvMode(e.target.value as 'apply' | 'included')}><option value="apply">Aplicar IGV</option><option value="included">Incluye IGV</option></select></label>
          <div className={styles.deductionField}><span>Detracción</span><button type="button" aria-pressed={includeDeduction} onClick={() => setIncludeDeduction(value => !value)}>Incluir detracción {includeDeduction ? '−' : '+'}</button></div>
          {igvMode === 'included' && <label>Monto total (incluye IGV) {draft.currency === 'PEN' ? 'S/' : 'US$'} *<input type="number" required min="0" step="0.01" value={includedAmount} onChange={e => updateIncludedAmount(e.target.value === '' ? '' : Number(e.target.value))} /></label>}
          {fields.filter(field => (field.key !== 'exchangeRate' || draft.currency === 'USD') && (!['deduction', 'deductionNumber', 'deductionDate'].includes(field.key) || includeDeduction)).map(field => <label key={field.key}>{field.key === 'supplier' ? party : field.key === 'ruc' ? `RUC del ${party.toLowerCase()}` : field.label}{(field.key === 'exchangeRate' ? draft.currency === 'USD' : field.required) ? ' *' : ''}<input readOnly={igvMode === 'included' && (field.key === 'base' || field.key === 'igv')} required={field.key === 'exchangeRate' ? draft.currency === 'USD' : field.required} type={field.type || 'text'} value={String(draft[field.key])} placeholder={field.key === 'exchangeRate' ? 'Ej. 3.7500' : undefined} min={field.key === 'exchangeRate' ? '0.0001' : field.type === 'number' ? '0' : field.key === 'dueAt' ? draft.issuedAt : undefined} step={field.key === 'exchangeRate' ? '0.0001' : '0.01'} maxLength={field.key === 'ruc' ? 11 : 255} pattern={field.key === 'ruc' ? '[0-9]{11}' : undefined} onChange={e => updateDraft(field.key, field.type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : e.target.value)} /></label>)}
          {draft.currency === 'USD' && <label>Total convertido a soles S/<input readOnly value={Number(draft.exchangeRate) > 0 ? ((Number(draft.base) + Number(draft.igv)) * Number(draft.exchangeRate)).toFixed(2) : ''} placeholder="Ingresa el tipo de cambio" /></label>}
          <label>Mes<input readOnly value={draft.issuedAt ? draft.issuedAt.slice(0, 7) : ''} /></label>
          <label>Total {draft.currency === 'PEN' ? 'S/' : 'US$'}<input readOnly value={(Number(draft.base) + Number(draft.igv)).toFixed(2)} /></label>
          {!sale && <label>Validada<select value={draft.validated ? 'SI' : 'NO'} onChange={e => setDraft({ ...draft, validated: e.target.value === 'SI' })}><option value="NO">NO</option><option value="SI">SÍ</option></select></label>}
        <AttachmentField type="invoice" id={editing?.id} projectId={projectId} disabled={disabled || busy} files={attachments} onChange={setAttachments} />
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
          {!!preview.length && <><p>{preview.length} facturas de {register} listas para importar. Vista previa sin guardar: pulsa Guardar importación para registrarlas.</p><div className={styles.preview}><table><thead><tr><th>Comprobante</th><th>{party}</th><th>Fecha</th><th>Moneda</th><th>Base</th><th>IGV</th><th>Tipo de cambio del día</th><th>Total S/</th>{!sale && <th>Validada</th>}</tr></thead><tbody>{preview.map((r, i) => <tr key={i}><td>{r.number}</td><td>{r.supplier}</td><td>{r.issuedAt}</td><td>{r.currency}</td><td>{r.base}</td><td>{r.igv}</td><td>{r.currency === 'USD' ? r.exchangeRate : 'No aplica'}</td><td>{((Number(r.base) + Number(r.igv)) * (r.currency === 'USD' ? Number(r.exchangeRate) : 1)).toFixed(2)}</td>{!sale && <td>{r.validated ? 'SÍ' : 'NO'}</td>}</tr>)}</tbody></table></div></>}
        </>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}><button type="button" className="btn-neutral" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="btn-primary" disabled={busy || disabled || (mode === 'excel' && !preview.length)}>{busy ? 'Procesando…' : editing ? 'Guardar cambios' : mode === 'excel' ? 'Guardar importación' : 'Guardar factura'}</button></div>
      </form>
    </Modal>
  </>;
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getToken, projectContextHeaders, uploadFile } from '@/lib/api';
import { Modal, toast } from '@/components/ui/ui';
import { Select } from '@/components/ui/Select';
import type { CashMovement } from '@/lib/accounting-cash';
import { CASH_DOCUMENT_TYPES } from '@/lib/accounting-cash';
import styles from './accounting.module.css';
import AttachmentField, { saveAttachments, attachmentPath } from './AttachmentField';
import EntryAccessNotice from './EntryAccessNotice';
import AccountingInput from './AccountingInput';
import { FiPlus, FiUpload } from 'react-icons/fi';
import type { CashClassificationRow } from './CashClassificationPanel';

type Draft = Omit<CashMovement, 'id'>;
const blank = (): Draft => ({ date: '', paidTo: '', description: '', documentType: 'Sin Comprobante', documentNumber: '', responsible: '', deposit: 0, expense: 0, category: '', classification: '' });
const fields: { key: keyof Draft; label: string; type?: string; required?: boolean }[] = [
  { key: 'date', label: 'Fecha', type: 'date', required: true },
  { key: 'paidTo', label: 'Pagado a', required: true },
  { key: 'description', label: 'Descripción', required: true },
  { key: 'documentType', label: 'Tipo de documento', required: true },
  { key: 'documentNumber', label: 'N.º de documento' },
  { key: 'responsible', label: 'Responsable', required: true },
  { key: 'deposit', label: 'Abono S/', type: 'number' },
  { key: 'expense', label: 'Gasto S/', type: 'number' },
  { key: 'category', label: 'Categoría' },
  { key: 'classification', label: 'Clasificación' },
];

export default function CashEntry({ projectId, disabled, editing, onEditClose, onSaved, blockedReason }: { projectId: number; disabled: boolean; editing: CashMovement | null; onEditClose: () => void; onSaved: (rows: CashMovement[]) => void; blockedReason?: string }) {
  const [mode, setMode] = useState<'manual' | 'excel' | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [preview, setPreview] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [categories, setCategories] = useState<CashClassificationRow[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState('');
  useEffect(() => {
    if (mode !== 'manual') return;
    let active = true; setCategoriesLoading(true); setCategoriesError('');
    api.get<{ rows: CashClassificationRow[] }>(`/accounting/cash/classifications?projectId=${projectId}`)
      .then(data => { if (active) setCategories(data.rows); })
      .catch(e => { if (active) setCategoriesError(e.message || 'No se pudieron cargar las categorías.'); })
      .finally(() => { if (active) setCategoriesLoading(false); });
    return () => { active = false; };
  }, [mode, projectId]);
  const movementType = Number(draft.deposit) > 0 ? 'Ingreso' : Number(draft.expense) > 0 ? 'Egreso' : '';
  const categoryOptions = categories;
  useEffect(() => { if (editing) { setDraft(editing); setAttachments([]); setMode('manual'); setError(''); } }, [editing]);
  const close = () => { if (!busy) { setMode(null); onEditClose(); } };
  const open = (next: 'manual' | 'excel') => { setError(''); setAttachments([]); setDraft(blank()); setPreview([]); setMode(next); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (disabled || busy || mode === 'manual' && (categoriesLoading || categoriesError)) return;
    setError(''); setBusy(true);
    try {
      const rows = editing ? [await api.patch<CashMovement>(`/accounting/cash/${editing.id}`, { projectId, row: draft })] : await api.post<CashMovement[]>('/accounting/cash', { projectId, rows: mode === 'manual' ? [draft] : preview });
      if (mode === 'manual' && attachments.length) {
        try { await saveAttachments('cash', rows[0].id, projectId, attachments); Object.assign(rows[0], { attachments: await api.get(attachmentPath('cash', rows[0].id, projectId)) }); }
        catch (e) { toast(`Registro guardado, pero faltan adjuntos. Usa el boton Adjuntar de la fila para reintentar. ${e instanceof Error ? e.message : ''}`); onSaved(rows); setMode(null); onEditClose(); return; }
      }
      onSaved(rows); toast(`${rows.length} movimientos guardados en el servidor.`); setMode(null); onEditClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  };
  const template = async () => {
    setError(''); setBusy(true);
    try {
      const response = await fetch('/api/accounting/cash/template', { headers: { ...projectContextHeaders(), Authorization: `Bearer ${getToken()}` } });
      if (!response.ok) throw new Error('No se pudo descargar la plantilla.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'plantilla-caja-chica.xlsx'; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al descargar.'); }
    finally { setBusy(false); }
  };
  return <>
    <div className={styles.actions}><button type="button" className="btn-neutral !h-8 !rounded-md !px-3 !text-xs" disabled={disabled || busy} onClick={() => open('excel')}><FiUpload />Importar Excel</button><button type="button" className="btn-neutral !h-8 !rounded-md !px-3 !text-xs" disabled={disabled || busy} onClick={() => open('manual')}><FiPlus />Nuevo movimiento</button></div>
    <Modal open={mode !== null} onClose={close} title={editing ? 'Editar movimiento de Caja Chica' : mode === 'manual' ? 'Registrar movimiento de Caja Chica' : 'Importar Caja Chica desde Excel'} width="max-w-3xl">
      <form onSubmit={save} className={styles.entry}>
        <EntryAccessNotice blockedReason={blockedReason} />
        {mode === 'manual' ? <><fieldset className={`${styles.formGrid} ${styles.cashEntryGrid}`} disabled={disabled || busy || categoriesLoading}>
          {fields.map(field => <label key={field.key}>{field.label}{field.required ? ' *' : ''}{field.key === 'category' ? <Select searchable searchPlaceholder="Buscar categoría o código..." className={styles.categorySelect} disabled={disabled || busy || categoriesLoading || !!categoriesError} value={draft.categoryKey || categoryOptions.find(row => row.category === draft.category && (!movementType || row.movementType === movementType))?.key || ''} options={[{ value: '', label: 'Selecciona...' }, ...categoryOptions.map(row => ({ value: row.key, label: row.category || '', hint: `${row.code} · ${row.movementType}` }))]} onChange={value => { const selected = categoryOptions.find(row => row.key === value); setDraft({ ...draft, categoryKey: selected?.key || '', category: selected?.category || '', classification: selected?.eerrClassification || '' }); }} /> : field.key === 'classification' ? <input readOnly value={draft.classification} placeholder="Segun la categoria" /> : field.key === 'documentType' ? <select required value={draft.documentType} onChange={e => setDraft({ ...draft, documentType: e.target.value })}>{!CASH_DOCUMENT_TYPES.some(value => value === draft.documentType) && <option value={draft.documentType}>{draft.documentType}</option>}{CASH_DOCUMENT_TYPES.map(value => <option key={value}>{value}</option>)}</select> : <AccountingInput required={field.required} type={field.type || 'text'} value={draft[field.key]} min={field.type === 'number' ? '0' : field.type === 'date' ? '2000-01-01' : undefined} max={field.type === 'date' ? '2100-12-31' : undefined} step="0.01" maxLength={field.key === 'description' ? 1000 : 255} onChange={e => setDraft({ ...draft, [field.key]: field.type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : e.target.value })} />}</label>)}
          <label>Mes<input readOnly value={draft.date.slice(0, 7)} /></label>
        <AttachmentField type="cash" id={editing?.id} projectId={projectId} disabled={disabled || busy} files={attachments} onChange={setAttachments} /></fieldset>{categoriesError && <p className={styles.error} role="alert">{categoriesError}</p>}</> : <>
          <label className={styles.fileLabel}>Subir archivo Excel<input key={fileKey} type="file" accept=".xlsx,.xls" disabled={busy || disabled} onChange={async e => {
            const file = e.target.files?.[0]; setPreview([]); setError(''); if (!file) return;
            if (file.size > 5 * 1024 * 1024) { setError('El archivo supera los 5 MB.'); return; }
            setBusy(true);
            try { setPreview(await uploadFile(`/accounting/cash/preview?projectId=${projectId}`, file)); }
            catch (err) { setError(err instanceof Error ? err.message : 'Error al leer el archivo.'); }
            finally { setBusy(false); setFileKey(n => n + 1); }
          }} /></label>
          <button type="button" className={styles.templateLink} disabled={busy} onClick={template}>Plantilla Excel</button>
          {!!preview.length && <><p>{preview.length} movimientos listos para importar. Vista previa sin guardar: pulsa Guardar importación para registrarlos.</p><div className={styles.preview}><table><thead><tr>{fields.map(f => <th key={f.key}>{f.label}</th>)}</tr></thead><tbody>{preview.map((row, index) => <tr key={index}>{fields.map(f => <td key={f.key}>{row[f.key]}</td>)}</tr>)}</tbody></table></div></>}
        </>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}><button type="button" className="btn-neutral" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="btn-primary" disabled={busy || disabled || (mode === 'manual' && (categoriesLoading || !!categoriesError)) || (mode === 'excel' && !preview.length)}>{busy ? 'Procesando…' : editing ? 'Guardar cambios' : mode === 'excel' ? 'Guardar importación' : 'Guardar movimiento'}</button></div>
      </form>
    </Modal>
  </>;
}

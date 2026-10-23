'use client';

import { useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { api } from '@/lib/api';
import { useProjectReadonly } from '@/lib/project-readonly-context';
import ClassificationTable, { ClassificationRow } from '@/components/features/finances/ClassificationTable';
import EntryAccessNotice from './EntryAccessNotice';
import styles from './accounting.module.css';

export type CashClassificationRow = ClassificationRow & { paymentMethod?: string; cashflowRowId?: string; sortOrder?: string; custom?: boolean };

export default function CashClassificationPanel({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const readonly = useProjectReadonly();
  const [rows, setRows] = useState<CashClassificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    api.get<{ rows: CashClassificationRow[] }>(`/accounting/cash/classifications?projectId=${projectId}`)
      .then(data => { if (active) { setRows(data.rows); setLoaded(true); } })
      .catch(e => { if (active) setError(e.message || 'No se pudo cargar la clasificación.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);
  const change = (next: CashClassificationRow[]) => { revision.current++; setRows(next); setDirty(true); setError(''); };
  const complete = rows.every(r => /^[A-Z]{2,3}$/.test(r.code) && r.category?.trim() && r.eerrClassification.trim());
  const save = async () => {
    if (readonly || busy || loading || !loaded) return false;
    if (!complete) { setError('Completa las filas o elimina las que no vas a usar. El código debe tener 2 o 3 letras.'); return false; }
    setBusy(true); setError('');
    const currentRevision = revision.current;
    try {
      await api.put('/accounting/cash/classifications', { projectId, rows });
      if (currentRevision === revision.current) setDirty(false);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la clasificación.'); return false; }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (readonly || !dirty || !complete || loading || busy || error) return;
    const timer = setTimeout(() => { void save(); }, 600);
    return () => clearTimeout(timer);
  }, [readonly, dirty, complete, loading, busy, rows, error]);
  return <div className="fixed left-2 right-2 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-auto rounded-md border bg-white shadow-2xl sm:left-auto sm:right-6 sm:top-24 sm:max-h-[calc(100dvh-7rem)]" style={{ borderColor: '#E5E7EB' }} role="dialog" aria-label="Clasificación de Caja Chica">
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3"><h3 className="font-semibold">Clasificación</h3><div className="flex flex-wrap items-center justify-end gap-2"><span className="text-xs text-slate-400">{busy ? 'Guardando…' : dirty ? 'Cambios pendientes' : loading ? 'Cargando…' : 'Guardado'}</span><button type="button" className="btn-neutral !h-8 !px-3 !text-xs" disabled={readonly || loading || !loaded || busy} onClick={() => change([...rows, { key: crypto.randomUUID(), code: '', movementType: 'Egreso', category: '', eerrClassification: '', paymentMethod: '', sortOrder: String(rows.length + 1), custom: true }])}>Agregar</button><button type="button" className="btn-neutral !h-8 !px-3 !text-xs" disabled={readonly || loading || !loaded || busy || !dirty} onClick={() => void save()}>Guardar</button><button type="button" className="btn-neutral !h-8 !px-3 !text-xs" disabled={busy} onClick={async () => { if (!dirty || await save()) onClose(); }}><FiX />Cerrar</button></div></div>
    <div className={`${styles.classificationTable} overflow-auto p-3`}><EntryAccessNotice />{error && <p className={styles.error} role="alert">{error}</p>}{loading ? <p className="p-4 text-slate-400">Cargando clasificación…</p> : <ClassificationTable rows={rows} disabled={readonly || busy || !loaded} onChange={(key, patch) => change(rows.map(row => row.key === key ? { ...row, ...patch } : row))} onDelete={key => change(rows.filter(row => row.key !== key))} />}</div>
  </div>;
}

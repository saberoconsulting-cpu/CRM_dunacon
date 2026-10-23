'use client';

import { useState } from 'react';
import { FiEdit3, FiTrash2 } from 'react-icons/fi';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/ui';
import styles from './accounting.module.css';

export function RecordActions({ disabled, label, onEdit, onDelete }: { disabled: boolean; label: string; onEdit: () => void; onDelete: () => void }) {
  return <span className={styles.rowActions}><button type="button" disabled={disabled} title={`Editar ${label}`} aria-label={`Editar ${label}`} onClick={onEdit}><FiEdit3 /></button><button type="button" disabled={disabled} title={`Eliminar ${label}`} aria-label={`Eliminar ${label}`} onClick={onDelete}><FiTrash2 /></button></span>;
}

export function DeleteRecord({ target, disabled, onClose, onDeleted }: { target: { url: string; label: string } | null; disabled: boolean; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Modal open={!!target} title="Eliminar registro" onClose={() => { if (!busy) { setError(''); onClose(); } }}>
    <div className={styles.entry}><p>¿Eliminar <strong>{target?.label}</strong>? Se recalcularán los totales y saldos correspondientes.</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><button type="button" className="btn-neutral" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="btn-danger" disabled={busy || disabled} onClick={async () => {
        if (!target || busy || disabled) return;
        setBusy(true); setError('');
        try { await api.delete(target.url); onDeleted(); onClose(); }
        catch (e) { setError(e instanceof Error ? e.message : 'No se pudo eliminar.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Eliminando…' : 'Eliminar'}</button></div>
    </div>
  </Modal>;
}

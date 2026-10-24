'use client';

import { useState } from 'react';
import { FiEdit3, FiTrash2, FiPaperclip, FiEye } from 'react-icons/fi';
import AttachmentField, { saveAttachments } from './AttachmentField';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/ui';
import styles from './accounting.module.css';

export function RecordActions({ disabled, label, onEdit, onDelete, attachment }: { disabled: boolean; label: string; onEdit: () => void; onDelete: () => void; attachment: { type: 'cash' | 'invoice'; id: string; projectId: number; hasFiles?: boolean } }) {
  const [open, setOpen] = useState(false);
  const [hasUploaded, setHasUploaded] = useState(false);
  const hasFiles = attachment.hasFiles || hasUploaded;
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  return <><span className={styles.rowActions}><button type="button" disabled={disabled} title={`Editar ${label}`} aria-label={`Editar ${label}`} onClick={onEdit}><FiEdit3 /></button><button type="button" disabled={disabled} className={hasFiles ? styles.viewAttachments : undefined} title={`${hasFiles ? 'Ver adjuntos de' : 'Adjuntar documento o foto a'} ${label}`} aria-label={`${hasFiles ? 'Ver adjuntos de' : 'Adjuntar documento o foto a'} ${label}`} onClick={() => { setFiles([]); setError(''); setVersion(v => v + 1); setOpen(true); }}>{hasFiles ? <FiEye /> : <FiPaperclip />}</button><button type="button" disabled={disabled} title={`Eliminar ${label}`} aria-label={`Eliminar ${label}`} onClick={onDelete}><FiTrash2 /></button></span>
    <Modal open={open} title={`Adjuntos: ${label}`} onClose={() => { if (!busy) setOpen(false); }}><div className={styles.entry}>
      <AttachmentField key={version} {...attachment} disabled={disabled || busy} files={files} onChange={setFiles} />
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><button type="button" disabled={busy} onClick={() => setOpen(false)}>Cerrar</button><button type="button" disabled={disabled || busy || !files.length} onClick={async () => {
        setBusy(true); setError('');
        try {
          for (const file of files) {
            await saveAttachments(attachment.type, attachment.id, attachment.projectId, [file]);
            setHasUploaded(true);
            setFiles(current => current.filter(candidate => candidate !== file));
          }
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo adjuntar.'); }
        finally { setBusy(false); setVersion(v => v + 1); }
      }}>{busy ? 'Subiendo...' : 'Guardar adjuntos'}</button></div>
    </div></Modal>
  </>;
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

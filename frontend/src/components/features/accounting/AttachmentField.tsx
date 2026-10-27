'use client';

import { useEffect, useState } from 'react';
import { api, uploadFile } from '@/lib/api';
import { FiFileText, FiUpload, FiEye } from 'react-icons/fi';
import styles from './accounting.module.css';

export const attachmentAccept = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx';
export type Attachment = { name: string; url: string };
export function attachmentPath(type: 'cash' | 'invoice', id: string, projectId: number) {
  return `/accounting/attachments/${type}/${id}?projectId=${projectId}`;
}
export async function saveAttachments(type: 'cash' | 'invoice', id: string, projectId: number, files: File[]) {
  for (const file of files) await uploadFile(attachmentPath(type, id, projectId), file);
}
function AttachmentPreview({ file, pending = false }: { file: Attachment; pending?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const image = /\.(png|jpe?g|webp|gif|heic)$/i.test(file.name);
  return <a className={styles.attachmentCard} href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${file.name}`}>
    <span className={styles.attachmentThumbnail}>
      {image && !failed ? <><img src={file.url} alt={file.name} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />{!loaded && <span className={styles.attachmentImageLoading}>Cargando...</span>}</> : <FiFileText aria-hidden="true" />}
    </span>
    <span className={styles.attachmentInfo}><span className={styles.attachmentName}>{file.name}</span><small>{pending ? 'Pendiente de guardar' : 'Guardado'}</small></span>
    <span className={styles.attachmentView}><FiEye aria-hidden="true" />Ver</span>
  </a>;
}
export default function AttachmentField({ type, id, projectId, disabled, files, onChange }: { type: 'cash' | 'invoice'; id?: string; projectId: number; disabled: boolean; files: File[]; onChange: (files: File[]) => void }) {
  const [saved, setSaved] = useState<Attachment[]>([]);
  const [selected, setSelected] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState('');
  useEffect(() => {
    const previews = files.map(file => ({ name: file.name, url: URL.createObjectURL(file) }));
    setSelected(previews);
    return () => previews.forEach(file => URL.revokeObjectURL(file.url));
  }, [files]);
  useEffect(() => {
    let active = true; setSaved([]); setError(''); setLoading(Boolean(id));
    if (id) api.get<Attachment[]>(attachmentPath(type, id, projectId))
      .then(rows => { if (active) setSaved(rows); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, id, projectId]);
  return <div className={styles.attachmentField}>
    <div className={styles.attachmentControl}>
    <div className={styles.attachmentHeading}>Documentos y fotos</div>
    <label className={styles.attachmentPicker} aria-disabled={disabled}>
      <FiUpload aria-hidden="true" /><span>Adjuntar documento o foto</span>
      <input type="file" multiple accept={attachmentAccept} disabled={disabled} onChange={e => {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.some(file => file.size > 10 * 1024 * 1024)) { setError('Cada archivo debe pesar como m?ximo 10 MB.'); e.target.value = ''; return; }
        setError(''); onChange([...files, ...selectedFiles]); e.target.value = '';
      }} />
    </label>
    </div>
    <div className={styles.attachmentDetails}>
    <small className={styles.attachmentHint}>Fotos, PDF, Word o Excel. M?ximo 10 MB por archivo.</small>
    {loading && <p role="status" className={styles.attachmentHint}>Cargando adjuntos...</p>}
    {!loading && !error && !saved.length && !selected.length && <p className={styles.attachmentHint}>Sin archivos adjuntos.</p>}
    <div className={styles.attachmentList}>
      {saved.map((file, i) => <AttachmentPreview key={file.url + i} file={file} />)}
      {selected.map((file, i) => <AttachmentPreview key={file.url + i} file={file} pending />)}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  </div>;
}

'use client';

import { useContext, useState } from 'react';
import { ProjectEditAccessContext, useProjectReadonly } from '@/lib/project-readonly-context';
import styles from './accounting.module.css';

export default function EntryAccessNotice({ blockedReason }: { blockedReason?: string }) {
  const readonly = useProjectReadonly();
  const access = useContext(ProjectEditAccessContext);
  const [error, setError] = useState('');
  if (!readonly && !blockedReason) return null;
  return <div className={styles.entryAccess}>
    {blockedReason && <p role="status">{blockedReason}</p>}
    {readonly && <><p>El proyecto está en modo de solo lectura.</p><button type="button" className="btn-neutral !h-8 !rounded-md !px-3 !text-xs" disabled={!access || access.busy} onClick={async () => {
      if (!access) return;
      setError('');
      try { await access.enableEditing(); }
      catch (e) { setError(e instanceof Error ? e.message : 'No se pudo habilitar la edición.'); }
    }}>{access?.busy ? 'Habilitando…' : 'Habilitar edición'}</button></>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}

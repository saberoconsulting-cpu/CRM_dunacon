'use client';
import { useEffect, useState } from 'react';
import { FiCamera, FiChevronLeft, FiChevronRight, FiTrash2, FiUpload } from 'react-icons/fi';
import { api, getSessionUser, uploadFile } from '@/lib/api';
import { toast } from '@/components/ui/ui';

type Photo = { id: string; url: string; name: string };

export default function ProjectPhotos({ projectId, name }: { projectId: number; name: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const [remove, setRemove] = useState<Photo | null>(null);
  const canEdit = ['superadmin', 'admin'].includes(getSessionUser()?.role);

  function load() {
    setLoading(true); setError('');
    api.get<Photo[]>(`/projects/${projectId}/photos`).then(setPhotos)
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [projectId]);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.closest('input, textarea, button, select')) return;
      if (e.key === 'Escape' && !busy) { if (remove) setRemove(null); else setView(null); }
      if (view !== null && photos.length) {
        if (e.key === 'ArrowRight') { e.preventDefault(); setView((view + 1) % photos.length); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); setView((view + photos.length - 1) % photos.length); }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, photos.length, busy, remove]);

  async function upload(files: File[]) {
    if (files.length > 10 - photos.length) return toast(`Puedes subir ${10 - photos.length} fotos más. Elimina una existente para reemplazarla.`, 'err');
    if (files.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 10 * 1024 * 1024)) {
      return toast('Usa fotos JPG, PNG o WebP de hasta 10 MB cada una.', 'err');
    }
    setBusy(true);
    try {
      for (const file of files) {
        const next = await uploadFile(`/projects/${projectId}/photos`, file);
        setPhotos(next);
      }
      if (files.length) toast('Fotos guardadas');
    } catch (e: any) { toast(e.message, 'err'); load(); }
    finally { setBusy(false); }
  }
  async function deletePhoto() {
    if (!remove) return;
    setBusy(true);
    try {
      setPhotos(await api.delete<Photo[]>(`/projects/${projectId}/photos/${remove.id}`));
      setRemove(null); toast('Foto eliminada. Ya puedes subir otra.');
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label={`Fotos de ${name}`} className="w-full overflow-hidden rounded-xl border bg-white">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div className="min-w-0"><h2 className="truncate text-lg font-semibold">Fotos · {name}</h2><p className="text-sm text-slate-500">{photos.length}/10 fotos</p></div>
        </div>
        <div className="p-4 sm:p-6">
          {loading ? <p role="status">Cargando fotos...</p> : error ? <div role="alert"><p>{error}</p><button className="btn-neutral mt-3" onClick={load}>Reintentar</button></div> : <>
            {view !== null && photos[view] ? <>
              <div className="flex h-[65vh] items-center justify-center rounded-lg bg-slate-950"><img src={photos[view].url} alt={`Foto ${view + 1} de ${name}`} className="h-full w-full object-contain" /></div>
              <div className="my-3 flex flex-wrap items-center justify-center gap-3">
                <button className="btn-neutral" onClick={() => setView((view + photos.length - 1) % photos.length)}><FiChevronLeft /> Anterior</button>
                <span aria-live="polite">{view + 1} / {photos.length}</span>
                <button className="btn-neutral" onClick={() => setView((view + 1) % photos.length)}>Siguiente <FiChevronRight /></button>
                <button className="btn-neutral" onClick={() => setView(null)}>Ver todas</button>
              </div>
            </> : <div className="mb-4 flex flex-wrap gap-3">
              <button className="btn-primary" disabled={!photos.length} onClick={() => setView(0)}><FiCamera /> Ver fotos</button>
              {canEdit && <label className={`btn-neutral ${busy || photos.length >= 10 ? 'opacity-50' : 'cursor-pointer'}`}><FiUpload /> {busy ? 'Guardando...' : 'Subir fotos'}
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy || photos.length >= 10} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; upload(files); }} />
              </label>}
            </div>}
            {photos.length === 10 && canEdit && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Llegaste al máximo de 10 fotos. Para reemplazar una foto, elimínala y luego sube la nueva.</p>}
            {!photos.length ? <div className="py-12 text-center text-slate-500"><FiCamera className="mx-auto mb-3 text-4xl" /><p>Este proyecto aún no tiene fotos.</p></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {photos.map((photo, index) => <div key={photo.id} className="overflow-hidden rounded-lg border">
                <button className={`block w-full ${view === index ? 'ring-4 ring-inset ring-blue-500' : ''}`} onClick={() => setView(index)} aria-label={`Ver foto ${index + 1}`}><img src={photo.url} alt={`Foto ${index + 1} de ${name}`} loading="lazy" className="h-28 w-full object-cover" /></button>
                <div className="flex items-center justify-between gap-2 p-2 text-xs"><span>Foto {index + 1}</span>{canEdit && <button disabled={busy} onClick={() => setRemove(photo)} className="p-2 text-red-600" aria-label={`Eliminar foto ${index + 1}`}><FiTrash2 /></button>}</div>
              </div>)}
            </div>}
            {canEdit && <p className="mt-4 text-xs text-slate-500">JPG, PNG o WebP · Hasta 10 MB por archivo. Se guardan en WebP optimizado, con un máximo de 1600 px.</p>}
          </>}
          {remove && <div role="region" aria-label="Eliminar foto" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4"><p className="mb-3 text-sm">¿Eliminar esta foto? Podrás subir otra en su lugar.</p><div className="flex gap-2"><button className="btn-neutral" disabled={busy} onClick={() => setRemove(null)}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={deletePhoto}>{busy ? 'Eliminando...' : 'Eliminar foto'}</button></div></div>}
        </div>
    </section>
  );
}

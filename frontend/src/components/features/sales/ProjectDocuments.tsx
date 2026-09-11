'use client';
import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/ui';
import { api, uploadFile } from '@/lib/api';
import { FiPaperclip, FiFileText, FiExternalLink } from 'react-icons/fi';

type Doc = { id: number; kind: string; originalName: string; url: string; createdAt: string };

// "Se adjunta" — el usuario sube el archivo. Ya tiene backend funcional.
const ATTACHABLE: { kind: string; label: string }[] = [
  { kind: 'memoria_proyecto', label: 'Memoria Proyecto' },
  { kind: 'plano_proyecto', label: 'Plano del Proyecto' },
  { kind: 'condiciones_comerciales', label: 'Condiciones Comerciales' },
];

// "Lo genera la APP" — pendiente: requiere un generador de PDF que hoy no existe.
const GENERATED: { label: string }[] = [
  { label: 'Contrato Venta de Lote' },
  { label: 'Cotización de Lote' },
  { label: 'Financiamiento' },
];

export default function ProjectDocuments({ projectId }: { projectId: number }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busyKind, setBusyKind] = useState<string | null>(null);

  function load() {
    api.get<Doc[]>(`/projects/${projectId}/documents`).then((d) => setDocs(Array.isArray(d) ? d : [])).catch(() => {});
  }
  useEffect(() => { load(); }, [projectId]);

  async function onPick(kind: string, f?: File) {
    if (!f) return;
    setBusyKind(kind);
    try {
      await uploadFile(`/projects/${projectId}/documents?kind=${kind}`, f);
      toast('Documento subido'); load();
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusyKind(null); }
  }

  const byKind = (kind: string) => docs.filter((d) => d.kind === kind).sort((a, b) => b.id - a.id)[0];

  return (
    <div className="card">
      <h3 className="font-semibold mb-1">Documentos del proyecto</h3>
      <p className="text-xs text-slate-500 mb-4">Repositorio de documentos comerciales asociados al proyecto.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ATTACHABLE.map(({ kind, label }) => {
          const doc = byKind(kind);
          return (
            <div key={kind} className="rounded-xl border p-3" style={{ borderColor: '#E5E7EB' }}>
              <p className="font-semibold text-sm mb-2">{label}</p>
              {doc ? (
                <a href={doc.url} target="_blank" rel="noreferrer" className="btn-neutral !h-8 text-xs w-full justify-center inline-flex items-center gap-1.5">
                  <FiExternalLink /> Ver documento
                </a>
              ) : (
                <p className="text-xs text-slate-400 mb-2">Sin adjuntar</p>
              )}
              <label className="btn-outline !h-8 text-xs w-full justify-center mt-2 inline-flex items-center gap-1.5 cursor-pointer">
                <FiPaperclip /> {busyKind === kind ? 'Subiendo…' : doc ? 'Reemplazar' : 'Adjuntar archivo'}
                <input type="file" className="hidden" disabled={busyKind === kind} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onPick(kind, f); }} />
              </label>
            </div>
          );
        })}
        {GENERATED.map(({ label }) => (
          <div key={label} className="rounded-xl border p-3 opacity-60" style={{ borderColor: '#E5E7EB', background: '#FAFAFB' }}>
            <p className="font-semibold text-sm mb-2 inline-flex items-center gap-1.5"><FiFileText /> {label}</p>
            <p className="text-xs text-slate-400">Próximamente — lo generará el sistema</p>
          </div>
        ))}
      </div>
    </div>
  );
}

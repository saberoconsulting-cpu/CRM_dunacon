'use client';
import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/ui';
import { api, uploadFile } from '@/lib/api';
import { FiDownload, FiExternalLink, FiFileText, FiPaperclip } from 'react-icons/fi';

type Doc = { id: number; kind: string; originalName: string; url: string; createdAt: string };
type Quote = { id: number; lotCode?: string | null; clientName: string; paymentMethod: string };

const ATTACHABLE: { kind: string; label: string }[] = [
  { kind: 'memoria_proyecto', label: 'Memoria Proyecto' },
  { kind: 'plano_proyecto', label: 'Plano del Proyecto' },
  { kind: 'condiciones_comerciales', label: 'Condiciones Comerciales' },
];

export default function ProjectDocuments({ projectId }: { projectId: number }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  function load() {
    api.get<Doc[]>(`/projects/${projectId}/documents`).then((d) => setDocs(Array.isArray(d) ? d : [])).catch(() => {});
    api.get<Quote[]>(`/quotes?projectId=${projectId}`).then((d) => setQuotes(Array.isArray(d) ? d : [])).catch(() => {});
  }

  useEffect(() => { load(); }, [projectId]);

  async function onPick(kind: string, file?: File) {
    if (!file) return;
    setBusyKind(kind);
    try {
      await uploadFile(`/projects/${projectId}/documents?kind=${kind}`, file);
      toast('Documento subido');
      load();
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusyKind(null);
    }
  }

  const byKind = (kind: string) => docs.filter((doc) => doc.kind === kind).sort((a, b) => b.id - a.id)[0];

  return (
    <div>
      <h3 className="font-semibold mb-1">Documentos del proyecto</h3>
      <p className="text-xs text-slate-500 mb-4">Repositorio de documentos comerciales asociados al proyecto.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ATTACHABLE.map(({ kind, label }) => {
          const doc = byKind(kind);
          return (
            <div key={kind} className="rounded-md border bg-white p-3" style={{ borderColor: '#E5E7EB' }}>
              <p className="mb-2 text-sm font-semibold">{label}</p>
              {doc ? (
                <div className="space-y-2">
                  <p className="truncate text-xs text-slate-500" title={doc.originalName}>{doc.originalName}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <a href={doc.url} target="_blank" rel="noreferrer" className="btn-neutral !h-8 justify-center text-xs">
                      <FiExternalLink /> Ver
                    </a>
                    <a href={doc.url} download={doc.originalName} className="btn-outline !h-8 justify-center text-xs">
                      <FiDownload /> Descargar
                    </a>
                  </div>
                </div>
              ) : (
                <p className="mb-2 text-xs text-slate-400">Sin adjuntar</p>
              )}
              <label className="btn-outline mt-2 inline-flex !h-8 w-full cursor-pointer items-center justify-center gap-1.5 text-xs">
                <FiPaperclip /> {busyKind === kind ? 'Subiendo...' : doc ? 'Reemplazar archivo' : 'Adjuntar archivo'}
                <input type="file" className="hidden" disabled={busyKind === kind} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; onPick(kind, file); }} />
              </label>
            </div>
          );
        })}
        <div className="rounded-md border bg-[#FAFAFB] p-3 opacity-75" style={{ borderColor: '#E5E7EB' }}>
          <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold"><FiFileText /> Contrato Venta de Lote</p>
          <p className="text-xs text-slate-400">Proximamente - lo generara el sistema.</p>
        </div>
        <div className="rounded-md border bg-white p-3" style={{ borderColor: '#E5E7EB' }}>
          <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold"><FiFileText /> Cotizacion de Lote</p>
          {quotes.length ? (
            <button className="btn-neutral !h-8 w-full justify-center text-xs" onClick={() => window.open(`/projects/${projectId}/quotes/${quotes[0].id}/cotizacion`, '_blank')}>
              <FiExternalLink /> Ver ultima cotizacion
            </button>
          ) : <p className="text-xs text-slate-400">Sin cotizaciones generadas</p>}
          <a href={`/projects/${projectId}/quotes`} className="btn-outline mt-2 inline-flex !h-8 w-full items-center justify-center gap-1.5 text-xs">
            Ver todas ({quotes.length})
          </a>
        </div>
        <div className="rounded-md border bg-white p-3" style={{ borderColor: '#E5E7EB' }}>
          <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold"><FiFileText /> Financiamiento</p>
          {(() => {
            const withCredit = quotes.find((quote) => quote.paymentMethod === 'credito');
            return withCredit ? (
              <button className="btn-neutral !h-8 w-full justify-center text-xs" onClick={() => window.open(`/projects/${projectId}/quotes/${withCredit.id}/financiamiento`, '_blank')}>
                <FiExternalLink /> Ver cronograma
              </button>
            ) : <p className="text-xs text-slate-400">Sin cotizaciones a credito todavia</p>;
          })()}
        </div>
      </div>
    </div>
  );
}

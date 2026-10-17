'use client';
import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/ui';
import { api, uploadFile, getToken } from '@/lib/api';
import { FiDownload, FiExternalLink, FiPaperclip } from 'react-icons/fi';

type Doc = { id: number; kind: string; originalName: string; url: string; createdAt: string };
const ATTACHABLE: { kind: string; label: string }[] = [
  { kind: 'memoria_proyecto', label: 'Memoria Proyecto' },
  { kind: 'plano_proyecto', label: 'Plano del Proyecto' },
  { kind: 'condiciones_comerciales', label: 'Condiciones Comerciales' },
  { kind: 'contrato_venta', label: 'Contrato Venta de Lote' },
];

export default function ProjectDocuments({ projectId }: { projectId: number }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [templatePreview, setTemplatePreview] = useState<{ text: string; fields: string[]; availableFields: string[]; format?: string } | null>(null);
  const [readingTemplate, setReadingTemplate] = useState(false);
  async function readTemplate() {
    setReadingTemplate(true);
    try { setTemplatePreview(await api.get<any>(`/projects/${projectId}/contract-template`)); }
    catch (error: any) { toast(error.message, 'err'); }
    finally { setReadingTemplate(false); }
  }


  async function openContractTemplate(doc: Doc, download: boolean) {
    const preview = download ? null : window.open('', '_blank');
    try {
      const token = getToken();
      const response = await fetch(`/api/projects/${projectId}/contract-template/file`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'No se pudo abrir la plantilla');
      }
      const url = URL.createObjectURL(await response.blob());
      if (preview) { preview.opener = null; preview.location.href = url; }
      else {
        const link = document.createElement('a');
        link.href = url; link.download = doc.originalName;
        document.body.appendChild(link); link.click(); link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error: any) { preview?.close(); toast(error.message, 'err'); }
  }

  function load() {
    api.get<Doc[]>(`/projects/${projectId}/documents`).then((d) => setDocs(Array.isArray(d) ? d : [])).catch(() => {});
  }

  useEffect(() => { load(); }, [projectId]);

  async function onPick(kind: string, file?: File) {
    if (!file) return;
    if (kind === 'contrato_venta' && !/\.(docx|pdf)$/i.test(file.name)) return toast('Selecciona un PDF o Word .docx', 'err');
    setBusyKind(kind);
    try {
      await uploadFile(`/projects/${projectId}/documents?kind=${kind}`, file);
      toast('Documento subido');
      load();
      if (kind === 'contrato_venta') { setTemplatePreview(null); await readTemplate(); }
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
      <div className="grid grid-cols-4 gap-2">
        {ATTACHABLE.map(({ kind, label }) => {
          const doc = byKind(kind);
          return (
            <div key={kind} className="min-w-0 rounded-md border bg-white p-2 sm:p-3" style={{ borderColor: '#E5E7EB' }}>
              <p className="mb-2 min-h-8 break-words text-[10px] font-semibold leading-4 sm:text-sm">{label}</p>
              {doc ? (
                <div className="space-y-2">
                  <p className="truncate text-xs text-slate-500" title={doc.originalName}>{doc.originalName}</p>
                  <div className="flex flex-wrap gap-1 [&_a]:min-w-0 [&_a]:!px-1 [&_a]:!text-[10px] sm:[&_a]:!text-xs">
                    <a href={doc.url} target="_blank" rel="noreferrer" onClick={kind === 'contrato_venta' ? (event) => { event.preventDefault(); openContractTemplate(doc, false); } : undefined} className="btn-neutral !h-8 justify-center text-xs">
                      <FiExternalLink /> Ver
                    </a>
                    <a href={doc.url} download={doc.originalName} onClick={kind === 'contrato_venta' ? (event) => { event.preventDefault(); openContractTemplate(doc, true); } : undefined} className="btn-outline !h-8 justify-center text-xs">
                      <FiDownload /> Descargar
                    </a>
                  </div>
                </div>
              ) : (
                <p className="mb-2 text-xs text-slate-400">Sin adjuntar</p>
              )}
              <label className="btn-outline mt-2 inline-flex !h-auto min-h-8 !min-w-0 w-full cursor-pointer items-center justify-center gap-1 !px-1 !py-1 !text-[10px] sm:!text-xs">
                <FiPaperclip /> {busyKind === kind ? 'Subiendo...' : doc ? 'Reemplazar archivo' : 'Adjuntar archivo'}
                <input type="file" accept={kind === 'contrato_venta' ? '.docx,.pdf' : undefined} className="hidden" disabled={busyKind === kind} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; onPick(kind, file); }} />
              </label>
              {kind === 'contrato_venta' && <p className="mt-2 text-[10px] leading-4 text-slate-500">PDF o Word (.docx) con campos para completar los datos de cada venta.</p>}
              {kind === 'contrato_venta' && doc && <button type="button" disabled={readingTemplate} className="btn-neutral mt-2 !h-auto min-h-8 !w-full !min-w-0 !px-1 !text-[10px] sm:!text-xs" onClick={readTemplate}>{readingTemplate ? 'Leyendo...' : 'Leer plantilla'}</button>}
            </div>
          );
        })}

      </div>
      <details className="mt-3 rounded-md border border-slate-200 p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold">Campos para la plantilla Word</summary>
        <p className="mt-2">Puedes subir PDF o Word (.docx) para generar contratos. En tu plantilla, coloca estos campos donde deben ir los datos de cada venta; el sistema conserva el resto del documento.</p>
        <p className="mt-2 break-words font-mono">{'{cliente_nombre}, {cliente_documento}, {cliente_domicilio}, {ciudad_firma}, {proyecto_nombre}, {proyecto_ubicacion}, {lote_codigo}, {lote_direccion}, {lote_area_m2}, {lote_dimensiones}, {precio_venta}, {cuota_inicial}, {saldo_financiar}, {numero_cuotas}, {valor_cuota}, {fecha_venta}, {venta_id}, {condiciones}, {agente_nombre}'}</p>
      </details>
      {templatePreview && (
        <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/40 p-3 text-xs">
          <h4 className="font-semibold">Texto de la plantilla</h4>
          {templatePreview.format === 'pdf' && <p className="mt-2 text-slate-500">PDF con formulario: conserva su diseño. PDF de texto: el contrato se genera con diseño uniforme y ajuste de párrafos. Los escaneos necesitan una capa de texto.</p>}
          <p className="mt-2 text-slate-600">{templatePreview.fields.length ? `Campos encontrados: ${templatePreview.fields.join(', ')}` : 'Este documento no tiene campos para completar. Agrega los campos de la guía antes de generar contratos.'}</p>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-slate-700">{templatePreview.text}</pre>
        </div>
      )}
    </div>
  );
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiDownload, FiEdit3, FiTrash2 } from 'react-icons/fi';
import { api, getToken, uploadFile } from '@/lib/api';
import { printHtml } from '@/lib/print';
import { Field, toast } from '@/components/ui/ui';
import { getSocket } from '@/lib/socket';
import { Select } from '@/components/ui/Select';

const BORDER = '#CBD5E1';
const NAVY = '#002060';
const columns = [
  ['code', 'N.º Lte.'], ['address', 'Dirección'], ['type', 'Tipo'], ['areaM2', 'Área (m²)'],
  ['perimeter', 'Perímetro (m)'], ['dimensions', 'Dimensiones'], ['front', 'Frente (m)'],
  ['leftSide', 'Lado Izquierdo (m)'], ['rightSide', 'Lado Derecho (m)'], ['back', 'Fondo (m)'],
  ['status', 'Estado'], ['owner', 'Propietario'],
] as const;
const columnWidths = [5, 12, 4, 7, 9, 11, 6, 8, 8, 6, 8, 16];
type Key = typeof columns[number][0];
type LotData = Record<Exclude<Key, 'areaM2'>, string> & { id?: number; areaM2: number; sold?: boolean };
const emptyRow = (): LotData => ({ code: '', address: '', type: '', areaM2: 0, perimeter: '', dimensions: '', front: '', leftSide: '', rightSide: '', back: '', status: '', owner: '' });
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const areaFormat = (value: number) => value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProjectLotDataPanel({ projectId, canManage }: { projectId: number; canManage: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LotData[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState<LotData | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try { setRows(await api.get<LotData[]>(`/plan/lot-data/${projectId}`)); }
    catch (error: any) { setLoadError(true); toast(error.message || 'No se pudo cargar Dimensiones de lotes', 'err'); }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { void load(); api.get(`/projects/${projectId}`).then(setProject).catch(() => {}); }, [load, projectId]);
  useEffect(() => {
    if (!open) return;
    void load();
    const token = getToken();
    if (!token) return;
    const socket = getSocket(token);
    const refresh = () => { void load(); };
    socket?.on('sale.created', refresh);
    socket?.on('sale.updated', refresh);
    socket?.on('lot.updated', refresh);
    return () => {
      socket?.off('sale.created', refresh);
      socket?.off('sale.updated', refresh);
      socket?.off('lot.updated', refresh);
    };
  }, [open, load]);
  const filtered = rows.filter(row => (!status || row.status === status) && (!search.trim() || columns.some(([key]) => String(row[key]).toLowerCase().includes(search.trim().toLowerCase()))));
  const totalArea = Math.round(filtered.reduce((sum, row) => sum + Number(row.areaM2), 0) * 100) / 100;
  const averageArea = filtered.length ? totalArea / filtered.length : 0;
  const statuses = [...new Set(rows.map(row => row.status).filter(Boolean))].sort();
  const projectName = project?.name || `Proyecto ${projectId}`;

  async function importExcel(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const result = await uploadFile(`/plan/lot-data/import/${projectId}`, file);
      toast(`Excel cargado: ${result.created} nuevos, ${result.updated} actualizados`);
      await load();
    } catch (error: any) { toast(error.message || 'No se pudo importar el Excel', 'err'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  async function save() {
    if (!draft || !draft.code.trim()) return toast('Indica el numero de lote', 'err');
    if (!Number.isFinite(Number(draft.areaM2)) || Number(draft.areaM2) < 0) return toast('El area debe ser un numero no negativo', 'err');
    setBusy(true);
    try {
      const { id, ...payload } = draft;
      await api.post(id ? `/plan/lot-data/update/${projectId}/${id}` : `/plan/lot-data/${projectId}`, { ...payload, code: payload.code.trim(), areaM2: Number(payload.areaM2) });
      setDraft(null);
      toast('Datos del lote guardados');
      await load();
    } catch (error: any) { toast(error.message || 'No se pudo guardar', 'err'); }
    finally { setBusy(false); }
  }
  async function remove(row: LotData) {
    if (!confirm(`Eliminar ${row.code} de Dimensiones de lotes?`)) return;
    setBusy(true);
    try { await api.post(`/plan/lot-data/delete/${projectId}/${row.id}`, {}); toast('Registro eliminado'); await load(); }
    catch (error: any) { toast(error.message || 'No se pudo eliminar', 'err'); }
    finally { setBusy(false); }
  }
  function downloadPdf() {
    const pdfColumnWidths = [5, 13, 4, 7, 9, 11, 6, 8, 8, 6, 8, 15];
    const widths = columns.map((_, index) => `<col style="width:${pdfColumnWidths[index]}%">`).join('');
    const headers = columns.map(([key, label]) => `<th${key === 'type' ? ' style="text-align:center"' : ''}>${escape(label.replace(/ \(/g, '\u00a0('))}</th>`).join('');
    const body = filtered.map(row => `<tr>${columns.map(([key]) => `<td${key === 'areaM2' ? ' class="num"' : key === 'type' ? ' style="text-align:center"' : ''}>${escape(key === 'areaM2' ? areaFormat(row.areaM2) : row[key] || '-')}</td>`).join('')}</tr>`).join('');
    printHtml(`<html><head><meta charset="utf-8"><title>Dimensiones de lotes - ${escape(projectName)}</title><style>
      @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0F172A;margin:0;font-size:9pt;line-height:1.3;-webkit-print-color-adjust:exact;print-color-adjust:exact}.brand{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:3px solid #002060;padding-bottom:12px;margin-bottom:12px}.logos{display:flex;gap:12px;align-items:center}.logos img{max-width:120px;max-height:48px;object-fit:contain}h1{font-size:17px;margin:0 0 5px}p{margin:4px 0;color:#64748B}.summary{display:flex;gap:24px;margin:12px 0;font-size:11px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #CBD5E1;padding:5px 4px;overflow-wrap:break-word;vertical-align:middle}th{background:#E5E7EB;color:#111827;font-size:8.5pt;font-weight:700;line-height:1.2;overflow-wrap:normal;word-break:normal}td{font-size:7.5pt;font-weight:400;line-height:1.25}.total td{font-size:7.5pt}tbody tr:nth-child(even){background:#F8FAFC}tr{break-inside:avoid}.num{text-align:right;font-variant-numeric:tabular-nums}.total td{background:#002060;color:white;font-weight:bold}thead{display:table-header-group}tfoot{display:table-row-group}.footer{margin-top:10px;font-size:8px;color:#64748B}
      </style></head><body><div class="brand"><div><h1>DIMENSIONES DE LOTES - ${escape(projectName)}</h1><p>Dimensiones de lotes del proyecto</p><p>Emitido: ${escape(new Date().toLocaleString('es-PE'))}</p>${search || status ? `<p>Filtro: ${escape([search, status].filter(Boolean).join(' · '))}</p>` : ''}</div><div class="logos">${project?.logoImageUrl ? `<img src="${escape(project.logoImageUrl)}" alt="Proyecto">` : ''}<img src="${escape(window.location.origin + '/logo/dunacon.png')}" alt="Dunacon"></div></div><div class="summary"><span><b>${filtered.length}</b> lotes</span><span>Área total: <b>${areaFormat(totalArea)} m²</b></span></div><table><colgroup>${widths}</colgroup><thead><tr>${headers}</tr></thead><tbody>${body}</tbody><tfoot><tr class="total"><td colspan="3">Total (${filtered.length} lotes)</td><td class="num" title="Area promedio">${areaFormat(averageArea)}</td><td colspan="8"></td></tr></tfoot></table><div class="footer">Dunacon - CRM Inmobiliario</div></body></html>`);
  }

  return <>
    <button type="button" className="min-w-0 w-full rounded-lg border bg-white p-4 text-left transition hover:bg-[#F8FAFC]" style={{ borderColor: '#E5E7EB' }} onClick={() => setOpen(true)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#0F172A]">Dimensiones de lotes</h3>
        <span className="rounded-full border border-[#B9D2F4] bg-[#EAF2FD] px-2.5 py-1 text-xs font-bold tabular-nums text-[#1259C4]">{loading ? '...' : loadError ? '—' : `${rows.length} lotes`}</span>
      </div>
    </button>
    {open && mounted && createPortal(<aside className="fixed bottom-0 right-0 top-[72px] z-[9999] flex w-full justify-end lg:left-[248px] lg:w-auto" role="dialog" aria-modal="true" aria-label="Dimensiones de lotes">
      <div className="flex h-full w-full flex-col border-l bg-white shadow-2xl" style={{ borderColor: BORDER }}>
        <div className="shrink-0 border-b px-4 py-3 sm:px-5" style={{ borderColor: BORDER }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-base font-bold" style={{ color: NAVY }}>Dimensiones de lotes del proyecto</h2><p className="mt-1 text-xs text-slate-500">Dimensiones de lotes - {projectName}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {canManage && <><input type="file" accept=".xlsx,.xls" ref={fileRef} className="hidden" onChange={event => { void importExcel(event.target.files?.[0]); }} /><button className="btn-neutral !h-9 !px-3 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Procesando...' : 'Cargar Excel'}</button><button className="btn-primary !h-9 !px-3 text-xs" disabled={busy} onClick={() => setDraft(emptyRow())}>Crear</button></>}
              <button className="btn-neutral !h-9 !px-3 text-xs" disabled={busy} onClick={() => setOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <input aria-label="Buscar en dimensiones de lotes" className="input !h-9 min-w-0 flex-1 text-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar lote, dirección, estado o propietario..." />
            <Select value={status} onChange={setStatus} options={[{ value: '', label: 'Todos los estados' }, ...statuses.map(value => ({ value, label: value }))]} className="w-full sm:w-48 [&_button.select-trigger]:!h-9 [&_button.select-trigger]:!text-xs [&_button.select-trigger]:!border-[#B9D2F4] [&_button.select-trigger]:!bg-[#F8FAFC] [&_button.select-trigger>svg]:text-[#1259C4]" />
            <button className="btn-primary !h-9 !px-3 text-xs" disabled={loading || loadError || !filtered.length} onClick={downloadPdf}><FiDownload /> Descargar PDF</button>
          </div>
          {canManage && <p className="mb-3 text-xs text-slate-500">Cada Excel actualiza los números de lote existentes y agrega los nuevos. Los lotes que no incluya se conservan.</p>}
          <div className="overflow-auto rounded-lg border" style={{ borderColor: BORDER }}>
            <table className="w-full border-collapse text-xs" style={{ minWidth: 1120, tableLayout: 'fixed' }}>
              <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width: `${width / (canManage ? 106 : 100) * 100}%` }} />)}{canManage && <col style={{ width: `${6 / 106 * 100}%` }} />}</colgroup>
              <thead><tr>{columns.map(([key, label]) => <th key={key} className={`border px-1 py-3 font-semibold text-white ${key === 'type' ? 'text-center' : 'text-left'}`} style={{ background: '#6B7280', borderColor: BORDER }}>{label.replace(/ \(/g, '\u00a0(')}</th>)}{canManage && <th className="border px-2 py-3 text-center text-white" style={{ background: '#6B7280', borderColor: BORDER }}>Acciones</th>}</tr></thead>
              <tbody>{loading ? <tr><td colSpan={canManage ? 13 : 12} className="p-6 text-center text-slate-500">Cargando dimensiones de lotes...</td></tr> : loadError ? <tr><td colSpan={canManage ? 13 : 12} className="p-6 text-center"><button className="text-[#1259C4] underline" onClick={load}>No se pudieron cargar los datos. Reintentar</button></td></tr> : filtered.map((row, index) => <tr key={row.id} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>{columns.map(([key]) => <td key={key} className={`border px-2 py-2 break-words ${key === 'areaM2' ? 'text-right tabular-nums' : key === 'type' ? 'text-center' : ''}`} style={{ borderColor: BORDER }}>{key === 'areaM2' ? areaFormat(row.areaM2) : row[key] || '-'}</td>)}{canManage && <td className="border px-2 py-2" style={{ borderColor: BORDER }}><div className="flex justify-center gap-2"><button title="Editar lote" aria-label={`Editar ${row.code}`} className="text-[#1259C4]" disabled={busy} onClick={() => setDraft({ ...row })}><FiEdit3 /></button><button title="Eliminar lote" aria-label={`Eliminar ${row.code}`} className="text-red-600" disabled={busy} onClick={() => { void remove(row); }}><FiTrash2 /></button></div></td>}</tr>)}{!loading && !loadError && !filtered.length && <tr><td colSpan={canManage ? 13 : 12} className="p-6 text-center text-slate-500">{rows.length ? 'No hay lotes para este filtro.' : 'Carga el Excel o crea el primer registro.'}</td></tr>}</tbody>
              {!loading && !loadError && <tfoot><tr className="font-bold text-white" style={{ background: NAVY }}><td colSpan={3} className="border px-2 py-3" style={{ borderColor: BORDER }}>Total ({filtered.length} lotes)</td><td className="border px-2 py-3 text-right tabular-nums" style={{ borderColor: BORDER }} title="Area promedio">{areaFormat(averageArea)}</td><td colSpan={canManage ? 9 : 8} className="border" style={{ borderColor: BORDER }} /></tr></tfoot>}
            </table>
          </div>
        </div>
        {draft && <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/35 p-3">
          <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-white shadow-2xl" style={{ borderColor: BORDER }}>
            <div className="border-b px-4 py-3" style={{ borderColor: BORDER }}><h3 className="text-base font-bold" style={{ color: NAVY }}>{draft.id ? 'Editar datos del lote' : 'Crear datos del lote'}</h3></div>
            <p className="px-4 pt-3 text-xs text-slate-500">Estado y propietario se completan desde las ventas del sistema.</p>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-4 md:grid-cols-3">{columns.map(([key, label]) => <Field key={key} label={label}><input className="input !h-9" autoFocus={key === 'code'} type={key === 'areaM2' ? 'number' : 'text'} min={key === 'areaM2' ? 0 : undefined} step={key === 'areaM2' ? '0.01' : undefined} maxLength={key === 'code' ? 50 : ['address', 'dimensions', 'owner'].includes(key) ? 255 : 80} value={draft[key]} readOnly={key === 'status' || key === 'owner' || (key === 'code' && draft.sold)} disabled={busy || key === 'status' || key === 'owner' || (key === 'code' && draft.sold)} onChange={event => setDraft({ ...draft, [key]: key === 'areaM2' ? Number(event.target.value) : event.target.value })} /></Field>)}</div>
            <div className="flex shrink-0 justify-end gap-2 border-t px-4 py-3" style={{ borderColor: BORDER }}><button className="btn-neutral !h-9" disabled={busy} onClick={() => setDraft(null)}>Cancelar</button><button className="btn-primary !h-9" disabled={busy} onClick={save}>{busy ? 'Guardando...' : 'Guardar'}</button></div>
          </div>
        </div>}
      </div>
    </aside>, document.body)}
  </>;
}

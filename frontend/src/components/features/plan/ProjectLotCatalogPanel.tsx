'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FiDownload } from 'react-icons/fi';
import { api, uploadFile } from '@/lib/api';
import { printHtml } from '@/lib/print';
import { Field, toast } from '@/components/ui/ui';
import { Select } from '@/components/ui/Select';

const INK = '#0F172A';
const BORDER = '#CBD5E1';
const NAVY = '#002060';

// Los precios de la base de lotes se cargan y se muestran en dolares (US$).
// Se formatean con separador de miles por comas, igual que en PlanEditor.
function moneyUsd(value: unknown) {
  const n = Number(value || 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `US$ ${safe.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

type LotCatalogRow = {
  id?: number;
  code: string;
  address?: string;
  type?: string;
  areaM2: number;
  dimensions?: string;
  priceM2: number;
  salePrice: number;
  discount: number;
  finalPrice: number;
  status?: string;
  client?: string;
};

const emptyCatalogRow = (): LotCatalogRow => ({
  code: '',
  address: '',
  type: '',
  areaM2: 0,
  dimensions: '',
  priceM2: 0,
  salePrice: 0,
  discount: 0,
  finalPrice: 0,
  status: 'Disponible',
  client: '',
});

export default function ProjectLotCatalogPanel({ projectId, canManage }: { projectId: number; canManage: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LotCatalogRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<LotCatalogRow>(emptyCatalogRow());
  const [project, setProject] = useState<any>(null);

  const load = useCallback(async () => {
    const data = await api.get<any[]>(`/plan/lot-catalog/${projectId}`).catch(() => []);
    setRows((Array.isArray(data) ? data : []).map((item: any) => ({
      id: item.id,
      code: item.code || '',
      address: item.address || '',
      type: item.type || '',
      areaM2: Number(item.areaM2 || 0),
      dimensions: item.dimensions || '',
      priceM2: Number(item.priceM2 || 0),
      salePrice: Number(item.salePrice || 0),
      discount: Number(item.discount || 0),
      finalPrice: Number(item.finalPrice || 0),
      status: item.status || 'Disponible',
      client: item.client || '',
    })));
  }, [projectId]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<any>(`/projects/${projectId}`).then(setProject).catch(() => setProject(null));
  }, [projectId]);

  const filtered = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [row.code, row.address, row.type, row.status, row.client].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStatus = statusFilter === 'todos' || row.status?.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  function startEdit(row?: LotCatalogRow) {
    setEditingId(row?.id || null);
    setDraft(row ? { ...row } : emptyCatalogRow());
    setEditorOpen(true);
  }

  async function saveRow() {
    if (!draft.code.trim()) return toast('Indica el numero de lote', 'err');
    const payload = {
      ...draft,
      code: draft.code.trim(),
      areaM2: Number(draft.areaM2) || 0,
      priceM2: Number(draft.priceM2) || 0,
      salePrice: Number(draft.salePrice) || 0,
      discount: Number(draft.discount) || 0,
      finalPrice: Number(draft.finalPrice) || 0,
    };
    try {
      if (editingId) await api.post(`/plan/lot-catalog/update/${projectId}/${editingId}`, payload);
      else await api.post(`/plan/lot-catalog/${projectId}`, payload);
      toast('Lote base guardado');
      setEditingId(null);
      setEditorOpen(false);
      setDraft(emptyCatalogRow());
      load();
    } catch (e: any) { toast(e.message || 'No se pudo guardar', 'err'); }
  }

  async function importExcel(file?: File) {
    if (!file) return;
    try {
      const result = await uploadFile(`/plan/lot-catalog/import/${projectId}`, file);
      toast(`Excel cargado: ${result?.created || 0} nuevos, ${result?.updated || 0} actualizados`);
      load();
    } catch (e: any) {
      toast(e?.message || 'No se pudo cargar el Excel de lotes', 'err');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(row: LotCatalogRow) {
    if (!row.id || !confirm(`Eliminar ${row.code} de la lista base?`)) return;
    try {
      await api.post(`/plan/lot-catalog/delete/${projectId}/${row.id}`, {});
      toast('Lote base eliminado');
      load();
    } catch (e: any) { toast(e.message || 'No se pudo eliminar', 'err'); }
  }

  function downloadPDF() {
    const projectName = project?.name || 'Proyecto';
    const projectLogoUrl = project?.logoImageUrl || '';
    const adminLogoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
    const totalArea = filtered.reduce((sum, row) => sum + Number(row.areaM2 || 0), 0);
    const totalSale = filtered.reduce((sum, row) => sum + Number(row.salePrice || 0), 0);
    const totalFinal = filtered.reduce((sum, row) => sum + Number(row.finalPrice || 0), 0);
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=1120, initial-scale=1" />
          <style>
            *{box-sizing:border-box}
            body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:18px;color:#111827;background:#fff;font-size:10px}
            .brand{display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:3px solid #374151;padding-bottom:10px;margin-bottom:10px}
            .brand-copy{min-width:0}
            .eyebrow{margin:0 0 4px;color:#374151;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
            h1{margin:0;color:#0F172A;font-size:20px;line-height:1.12}
            .sub{margin:4px 0 0;color:#64748B;font-size:10px}
            .logos{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex:0 0 auto}
            .logos img{height:38px;max-width:135px;object-fit:contain}
            .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0 12px}
            .summary div{border:1px solid #E5E7EB;background:#F8FAFC;border-left:4px solid #374151;border-radius:6px;padding:7px 8px;min-width:0}
            .summary span{display:block;color:#64748B;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
            .summary strong{display:block;margin-top:3px;color:#0F172A;font-size:11px;white-space:nowrap}
            table{width:100%;border-collapse:collapse;table-layout:fixed;background:white}
            th{background:#374151;color:white;border:1px solid #374151;padding:6px 5px;text-align:left;font-size:8.5px;line-height:1.1;text-transform:uppercase}
            td{border:1px solid #E5E7EB;padding:5px 5px;font-size:8.7px;line-height:1.16;vertical-align:top;color:#111827}
            tbody tr:nth-child(even):not(.total-row){background:#F8FAFC}
            .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
            .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .total-row td{background:#E5E7EB;font-weight:800;color:#111827;border-color:#CBD5E1}
            .footer{margin-top:9px;border-top:1px solid #E5E7EB;padding-top:6px;text-align:right;color:#64748B;font-size:8px}
            @page{size:A4 landscape;margin:7mm}
            @media print{
              body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
              thead{display:table-header-group}
              tr{break-inside:avoid;page-break-inside:avoid}
              .brand,.summary{break-inside:avoid}
            }
          </style>
        </head>
        <body>
          <div class="brand">
            <div class="brand-copy">
              <p class="eyebrow">Base de lotes del proyecto</p>
              <h1>${escapeHtml(projectName)}</h1>
              <p class="sub">${filtered.length} lotes filtrados · ${new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
            <div class="logos">
              ${projectLogoUrl ? `<img src="${escapeHtml(projectLogoUrl)}" alt="Proyecto" />` : ''}
              <img src="${escapeHtml(adminLogoUrl)}" alt="Dunacon" />
            </div>
          </div>
          <div class="summary">
            <div><span>Lotes</span><strong>${filtered.length}</strong></div>
            <div><span>Area total</span><strong>${totalArea.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m2</strong></div>
            <div><span>Precio venta</span><strong>${escapeHtml(moneyUsd(totalSale))}</strong></div>
            <div><span>Precio final</span><strong>${escapeHtml(moneyUsd(totalFinal))}</strong></div>
          </div>
          <table>
            <colgroup>
              <col style="width:7%" />
              <col style="width:14%" />
              <col style="width:8%" />
              <col style="width:7%" />
              <col style="width:10%" />
              <col style="width:10%" />
              <col style="width:11%" />
              <col style="width:11%" />
              <col style="width:8%" />
              <col style="width:14%" />
            </colgroup>
            <thead>
              <tr>
                <th>Num. de lote</th>
                <th>Direccion</th>
                <th>Tipo</th>
                <th>Area m2</th>
                <th>Dimensiones</th>
                <th>Precio m2 (US$)</th>
                <th>Precio venta (US$)</th>
                <th>Precio final (US$)</th>
                <th>Estado</th>
                <th>Cliente</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(row => `
                <tr>
                  <td class="truncate">${escapeHtml(row.code)}</td>
                  <td class="truncate">${escapeHtml(row.address || '-')}</td>
                  <td class="truncate">${escapeHtml(row.type || '-')}</td>
                  <td class="num">${Number(row.areaM2 || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  <td class="truncate">${escapeHtml(row.dimensions || '-')}</td>
                  <td class="num">${escapeHtml(moneyUsd(row.priceM2))}</td>
                  <td class="num">${escapeHtml(moneyUsd(row.salePrice))}</td>
                  <td class="num">${escapeHtml(moneyUsd(row.finalPrice))}</td>
                  <td class="truncate">${escapeHtml(row.status || '-')}</td>
                  <td class="truncate">${escapeHtml(row.client || '-')}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3">Total (${filtered.length} lotes)</td>
                <td class="num">${totalArea.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                <td>-</td>
                <td>${moneyUsd(filtered.reduce((sum, row) => sum + Number(row.priceM2 || 0), 0))}</td>
                <td class="num">${moneyUsd(totalSale)}</td>
                <td class="num">${moneyUsd(totalFinal)}</td>
                <td>-</td>
                <td>-</td>
              </tr>
            </tbody>
          </table>
          <div class="footer">Dunacon - CRM Inmobiliario</div>
        </body>
      </html>
    `;
    printHtml(html);
  }

  if (!canManage) {
    return (
      <div className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white p-4" style={{ borderColor: '#E5E7EB' }}>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: INK }}>Base de lotes</h3>
          <p className="text-[11px]" style={{ color: '#6B7280' }}>Cantidad cargada en el proyecto.</p>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums" style={{ borderColor: '#B9D2F4', color: '#1259C4', background: '#EAF2FD' }}>{rows.length}</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white p-4 text-left transition hover:bg-[#F8FAFC]"
        style={{ borderColor: '#E5E7EB' }}
      >
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: INK }}>Base de lotes</h3>
          <p className="text-[11px]" style={{ color: '#6B7280' }}>Cargar, editar y eliminar lotes del Excel del proyecto.</p>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums" style={{ borderColor: '#B9D2F4', color: '#1259C4', background: '#EAF2FD' }}>{rows.length}</span>
      </button>

      {open && mounted && createPortal((
        <aside className="fixed bottom-0 right-0 top-[72px] z-[9999] flex w-full justify-end lg:left-[248px] lg:w-auto" role="dialog" aria-modal="true">
          <div className="flex h-full w-full flex-col border-l bg-white shadow-2xl" style={{ borderColor: BORDER }}>
            <div className="shrink-0 border-b px-4 py-3 sm:px-5" style={{ borderColor: BORDER }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold" style={{ color: NAVY }}>Base de lotes del proyecto</h2>
                  <p className="mt-1 text-xs" style={{ color: '#6B7280' }}>Base editable para cargar el Excel; no activa lotes hasta dibujar el poligono.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { void importExcel(event.target.files?.[0]); }} />
                  <button className="btn-neutral !h-9 !px-3 text-xs" onClick={() => fileRef.current?.click()}>Cargar lotes del proyecto</button>
                  <button className="btn-primary !h-9 !px-3 text-xs" onClick={() => startEdit()}>Crear</button>
                  <button className="btn-neutral !h-9 !px-3 text-xs" onClick={() => setOpen(false)}>Cerrar</button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="mb-3 flex gap-2">
                <input className="input !h-9 flex-1 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lote, direccion, estado..." />
                <Select
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value)}
                  options={[
                    { value: 'todos', label: 'Filtrar todos' },
                    { value: 'vendido', label: 'Vendido' },
                    { value: 'reservado', label: 'Reservado' },
                    { value: 'disponible', label: 'Libre' },
                  ]}
                  className="!h-9 min-w-[140px]"
                />
                <button className="btn-primary !h-9 !px-3 text-xs" onClick={downloadPDF}>
                  <FiDownload /> Descargar PDF
                </button>
              </div>

              <div className="overflow-auto rounded-lg border" style={{ borderColor: BORDER }}>
                <table className="min-w-[1180px] w-full text-xs">
                  <thead className="sticky top-0">
                    <tr>
                      {['Num. de lote', 'Direccion', 'Tipo', 'Area m2', 'Dimensiones', 'Precio m2 (US$)', 'Precio venta (US$)', 'Precio final (US$)', 'Estado', 'Cliente', 'Accion'].map((head) => (
                        <th key={head} className="th-base !py-2 text-left !font-bold !text-white" style={{ backgroundColor: '#374151' }}>{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id || row.code}>
                        <td className="td-base font-semibold">{row.code}</td>
                        <td className="td-base">{row.address || '-'}</td>
                        <td className="td-base">{row.type || '-'}</td>
                        <td className="td-base tabular-nums">{Number(row.areaM2 || 0).toLocaleString('es-PE')}</td>
                        <td className="td-base">{row.dimensions || '-'}</td>
                        <td className="td-base tabular-nums">{moneyUsd(row.priceM2)}</td>
                        <td className="td-base tabular-nums font-semibold">{moneyUsd(row.salePrice)}</td>
                        <td className="td-base tabular-nums font-semibold" style={{ color: '#0F8B5F' }}>{moneyUsd(row.finalPrice)}</td>
                        <td className="td-base">{row.status || '-'}</td>
                        <td className="td-base">{row.client || '-'}</td>
                        <td className="td-base">
                          <div className="flex gap-1.5">
                            <button className="btn-neutral !h-7 !px-2 text-xs" onClick={() => startEdit(row)}>Editar</button>
                            <button className="btn-danger !h-7 !px-2 text-xs" onClick={() => remove(row)}>Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && <tr><td className="td-base text-center text-slate-400" colSpan={11}>Aun no hay lotes base para este proyecto.</td></tr>}
                    {filtered.length > 0 && (
                      <tr style={{ backgroundColor: '#F3F4F6', fontWeight: 'bold' }}>
                        <td className="td-base" colSpan={3}>Total ({filtered.length} lotes)</td>
                        <td className="td-base tabular-nums">{filtered.reduce((sum, row) => sum + Number(row.areaM2 || 0), 0).toLocaleString('es-PE')}</td>
                        <td className="td-base">-</td>
                        <td className="td-base tabular-nums">{moneyUsd(filtered.reduce((sum, row) => sum + Number(row.priceM2 || 0), 0))}</td>
                        <td className="td-base tabular-nums">{moneyUsd(filtered.reduce((sum, row) => sum + Number(row.salePrice || 0), 0))}</td>
                        <td className="td-base tabular-nums" style={{ color: '#0F8B5F' }}>{moneyUsd(filtered.reduce((sum, row) => sum + Number(row.finalPrice || 0), 0))}</td>
                        <td className="td-base">-</td>
                        <td className="td-base">-</td>
                        <td className="td-base">-</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {editorOpen && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/35 p-4">
              <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg border bg-white shadow-2xl" style={{ borderColor: BORDER }}>
                <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: BORDER }}>
                  <h3 className="text-base font-bold" style={{ color: NAVY }}>{editingId ? `Editar lote ${draft.code || ''}` : 'Crear lote base'}</h3>
                  <p className="mt-1 text-xs text-slate-500">Estos datos alimentan el selector al dibujar el lote en el plano.</p>
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-4 md:grid-cols-3">
                  <Field label="Num. de lote"><input autoFocus className="input !h-9" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></Field>
                  <Field label="Direccion"><input className="input !h-9" value={draft.address || ''} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
                  <Field label="Tipo"><input className="input !h-9" value={draft.type || ''} onChange={(e) => setDraft({ ...draft, type: e.target.value })} /></Field>
                  <Field label="Area m2"><input className="input !h-9" type="number" value={draft.areaM2 || ''} onChange={(e) => setDraft({ ...draft, areaM2: Number(e.target.value) })} /></Field>
                  <Field label="Dimensiones"><input className="input !h-9" value={draft.dimensions || ''} onChange={(e) => setDraft({ ...draft, dimensions: e.target.value })} /></Field>
                  <Field label="Precio m2 (US$)"><input className="input !h-9" type="number" value={draft.priceM2 || ''} onChange={(e) => setDraft({ ...draft, priceM2: Number(e.target.value) })} /></Field>
                  <Field label="Precio venta (US$)"><input className="input !h-9" type="number" value={draft.salePrice || ''} onChange={(e) => setDraft({ ...draft, salePrice: Number(e.target.value) })} /></Field>
                  <Field label="Precio final (US$)"><input className="input !h-9" type="number" value={draft.finalPrice || ''} onChange={(e) => setDraft({ ...draft, finalPrice: Number(e.target.value) })} /></Field>
                  <Field label="Estado"><input className="input !h-9" value={draft.status || ''} onChange={(e) => setDraft({ ...draft, status: e.target.value })} /></Field>
                  <Field label="Cliente"><input className="input !h-9" value={draft.client || ''} onChange={(e) => setDraft({ ...draft, client: e.target.value })} /></Field>
                </div>
                <div className="flex shrink-0 justify-end gap-2 border-t px-4 py-3" style={{ borderColor: BORDER }}>
                  <button className="btn-neutral !h-9 px-3" onClick={() => { setEditorOpen(false); setEditingId(null); setDraft(emptyCatalogRow()); }}>Cancelar</button>
                  <button className="btn-primary !h-9 px-4" onClick={saveRow}>Guardar</button>
                </div>
              </div>
            </div>
          )}
        </aside>
      ), document.body)}
    </>
  );
}

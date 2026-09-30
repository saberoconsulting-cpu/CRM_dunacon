'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api, uploadFile } from '@/lib/api';
import { Field, toast } from '@/components/ui/ui';

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
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<LotCatalogRow>(emptyCatalogRow());

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

  const filtered = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return !query || [row.code, row.address, row.type, row.status, row.client].some((value) => String(value || '').toLowerCase().includes(query));
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
              <input className="input !h-9 mb-3 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lote, direccion, estado..." />

              <div className="overflow-auto rounded-lg border" style={{ borderColor: BORDER }}>
                <table className="min-w-[1180px] w-full text-xs">
                  <thead className="sticky top-0">
                    <tr style={{ backgroundColor: NAVY, color: '#FFFFFF' }}>
                      {['Num. de lote', 'Direccion', 'Tipo', 'Area m2', 'Dimensiones', 'Precio m2 (US$)', 'Precio venta (US$)', 'Precio final (US$)', 'Estado', 'Cliente', 'Accion'].map((head) => (
                        <th key={head} className="th-base !py-2 text-left">{head}</th>
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

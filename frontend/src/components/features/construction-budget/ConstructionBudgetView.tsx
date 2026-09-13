'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiBriefcase,
  FiChevronDown,
  FiChevronRight,
  FiDollarSign,
  FiEdit3,
  FiFilePlus,
  FiLayers,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
} from 'react-icons/fi';
import { Toaster, toast, Field } from '@/components/ui/ui';
import { api, uploadFile } from '@/lib/api';
import { BRAND, formatMoney } from '@/lib/types';

type BudgetCategory = 'costo_terreno' | 'costo_directo' | 'costo_indirecto' | 'gastos_ventas_admin' | 'gastos_financieros_impuestos';
type BudgetItem = {
  id: number;
  projectId: number;
  parentId?: number | null;
  category: BudgetCategory;
  code: string;
  name: string;
  description?: string | null;
  amount: string;
  currency: string;
  sortOrder: number;
  isActive: boolean;
};

type ImportPreviewRow = {
  rowNumber: number;
  category: BudgetCategory | '';
  code: string;
  parentCode?: string | null;
  name: string;
  description?: string | null;
  amount: number;
  currency: string;
  sortOrder: number;
  errors: string[];
};

type ImportPreview = {
  sheet: string;
  totalRows: number;
  validRows: number;
  errors: Array<{ rowNumber: number; message: string }>;
  rows: ImportPreviewRow[];
  expectedColumns: string[];
};

const CATEGORIES: Array<{ key: BudgetCategory; label: string; letter: string; color: string; helper: string }> = [
  { key: 'costo_terreno', label: 'Costo de terreno', letter: 'A', color: '#0866E5', helper: 'Compra del fundo matriz y formalizacion legal.' },
  { key: 'costo_directo', label: 'Costos directos', letter: 'B', color: '#16A36A', helper: 'Ejecucion fisica de habilitacion urbana.' },
  { key: 'costo_indirecto', label: 'Costos indirectos', letter: 'C', color: '#7C3AED', helper: 'Licencias, supervision y gestion de obra.' },
  { key: 'gastos_ventas_admin', label: 'Ventas y administracion', letter: 'D', color: '#D97706', helper: 'Comisiones, marketing y administracion del proyecto.' },
  { key: 'gastos_financieros_impuestos', label: 'Financieros e impuestos', letter: 'E', color: '#DC2626', helper: 'Intereses, IGV e impuesto a la renta aplicable.' },
];

const BORDER = '#E2E8F0';
const INK = '#0F172A';
const MUTED = '#64748B';

function money(n: unknown) {
  return formatMoney(Number(n || 0));
}

function nextCode(items: BudgetItem[], category: BudgetCategory) {
  const meta = CATEGORIES.find((item) => item.key === category);
  const count = items.filter((item) => item.category === category).length + 1;
  return `${meta?.letter || 'X'}.${String(count).padStart(2, '0')}`;
}

function parentOptions(items: BudgetItem[], category: BudgetCategory, currentId?: number) {
  return items.filter((item) => item.category === category && item.id !== currentId && !item.parentId);
}

export default function ConstructionBudgetView({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [summary, setSummary] = useState<any>({ categories: {}, grandTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [form, setForm] = useState<any>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<any>(`/construction-budget?projectId=${projectId}`);
      setItems(data?.items || []);
      setSummary(data?.summary || { categories: {}, grandTotal: 0 });
      setOpenCats((current) => current && Object.keys(current).length ? current : Object.fromEntries(CATEGORIES.map((cat) => [cat.key, true])));
    } catch (error: any) {
      toast(error?.message || 'No se pudo cargar el presupuesto', 'err');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const itemTree = useMemo(() => {
    const children = new Map<number, BudgetItem[]>();
    for (const item of items) {
      if (!item.parentId) continue;
      children.set(item.parentId, [...(children.get(item.parentId) || []), item]);
    }
    return CATEGORIES.map((category) => ({
      ...category,
      roots: items
        .filter((item) => item.category === category.key && !item.parentId)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.id - b.id)
        .map((item) => ({ ...item, children: (children.get(item.id) || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.id - b.id) })),
    }));
  }, [items]);

  function openCreate(category: BudgetCategory, parentId?: number | null) {
    setEditing(null);
    setForm({
      projectId,
      category,
      parentId: parentId || null,
      code: nextCode(items, category),
      name: '',
      amount: '',
      currency: 'PEN',
      sortOrder: items.length * 10 + 10,
    });
    setModalOpen(true);
  }

  function openEdit(item: BudgetItem) {
    setEditing(item);
    setForm({ ...item, amount: Number(item.amount || 0) });
    setModalOpen(true);
  }

  async function seedBase() {
    try {
      const data = await api.post<any>('/construction-budget/seed', { projectId });
      setItems(data?.items || []);
      setSummary(data?.summary || { categories: {}, grandTotal: 0 });
      toast('Estructura base cargada');
    } catch (error: any) {
      toast(error?.message || 'No se pudo cargar la estructura base', 'err');
    }
  }

  async function save() {
    if (!form.name || !form.code) return toast('Completa codigo y nombre', 'err');
    try {
      const payload = {
        ...form,
        projectId,
        amount: Number(form.amount || 0),
        sortOrder: Number(form.sortOrder || 0),
        parentId: form.parentId ? Number(form.parentId) : null,
      };
      if (editing) await api.patch(`/construction-budget/${editing.id}`, payload);
      else await api.post('/construction-budget', payload);
      toast(editing ? 'Partida actualizada' : 'Partida creada');
      setModalOpen(false);
      setEditing(null);
      setForm({});
      load();
    } catch (error: any) {
      toast(error?.message || 'No se pudo guardar la partida', 'err');
    }
  }

  async function remove(item: BudgetItem) {
    if (!confirm(`Eliminar la partida ${item.code} - ${item.name}?`)) return;
    try {
      await api.delete(`/construction-budget/${item.id}`);
      toast('Partida eliminada');
      load();
    } catch (error: any) {
      toast(error?.message || 'No se pudo eliminar', 'err');
    }
  }

  async function previewExcel(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      const data = await uploadFile('/construction-budget/import/preview', file);
      setPreview(data);
      toast(data.errors?.length ? 'Excel leido con observaciones' : 'Excel listo para importar');
    } catch (error: any) {
      toast(error?.message || 'No se pudo leer el Excel', 'err');
    } finally {
      setImporting(false);
    }
  }

  async function confirmImport() {
    if (!preview?.rows?.length) return;
    if (preview.errors?.length) return toast('Corrige los errores del Excel antes de importar', 'err');
    setImporting(true);
    try {
      const data = await api.post<any>('/construction-budget/import', { projectId, rows: preview.rows });
      setItems(data?.items || []);
      setSummary(data?.summary || { categories: {}, grandTotal: 0 });
      setPreview(null);
      toast(`Importacion completa: ${data.imported || 0} filas`);
    } catch (error: any) {
      toast(error?.message || 'No se pudo importar el Excel', 'err');
    } finally {
      setImporting(false);
    }
  }

  function renderItem(item: BudgetItem & { children?: BudgetItem[] }, level = 0) {
    return (
      <div key={item.id} className="border-t" style={{ borderColor: '#EEF2F7' }}>
        <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_150px_88px] items-center gap-3 px-4 py-2 hover:bg-slate-50">
          <div className="flex min-w-0 items-center gap-3" style={{ paddingLeft: level * 22 }}>
            <span className="rounded-md px-2 py-1 text-xs font-bold" style={{ background: '#EAF3FF', color: BRAND.blue }}>{item.code}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: INK }}>{item.name}</p>
              {item.description && <p className="truncate text-xs" style={{ color: MUTED }}>{item.description}</p>}
            </div>
          </div>
          <div className="text-right text-sm font-bold tabular-nums" style={{ color: INK }}>{money(item.amount)}</div>
          <div className="flex justify-end gap-1">
            <button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" title="Agregar subpartida" onClick={() => openCreate(item.category, item.id)}><FiPlus /></button>
            <button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" title="Editar" onClick={() => openEdit(item)}><FiEdit3 /></button>
            <button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600" title="Eliminar" onClick={() => remove(item)}><FiTrash2 /></button>
          </div>
        </div>
        {(item.children || []).map((child) => renderItem(child, level + 1))}
      </div>
    );
  }

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
          <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-md px-3 py-1 text-xs font-bold" style={{ background: '#EAF3FF', color: BRAND.blue }}>
                <FiBriefcase /> Modulo 11
              </div>
              <h2 className="mt-3 text-2xl font-bold" style={{ color: INK }}>Presupuesto de Obra</h2>
              <p className="mt-1 max-w-3xl text-sm" style={{ color: MUTED }}>
                Partidas y subpartidas por proyecto. Estos montos alimentan automaticamente la columna Proyectado del Estado de Resultados.
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:max-w-[520px] lg:flex-wrap lg:justify-end">
              <button className="btn-neutral w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={load} disabled={loading}><FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar</button>
              <button className="btn-outline w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={seedBase}><FiFilePlus /> Base</button>
              <label className="btn-outline w-full cursor-pointer justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto">
                <FiFilePlus /> Importar Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; previewExcel(file); }}
                />
              </label>
              <button className="btn-primary w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={() => openCreate('costo_directo')}><FiPlus /> Nueva partida</button>
            </div>
          </div>
          <div className="grid gap-3 border-t bg-[#F8FAFC] p-4 sm:grid-cols-2 xl:grid-cols-6" style={{ borderColor: BORDER }}>
            <div className="rounded-md border bg-white p-4 xl:col-span-1" style={{ borderColor: BORDER }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: MUTED }}>Total presupuesto</p>
              <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: INK }}>{money(summary?.grandTotal)}</p>
            </div>
            {CATEGORIES.map((cat) => (
              <div key={cat.key} className="rounded-md border bg-white p-4" style={{ borderColor: BORDER }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{cat.letter}. {cat.label}</p>
                <p className="mt-1 text-lg font-bold tabular-nums" style={{ color: cat.color }}>{money(summary?.categories?.[cat.key])}</p>
              </div>
            ))}
          </div>
        </section>

        {preview && (
          <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
            <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: BORDER }}>
              <div>
                <h3 className="font-semibold" style={{ color: INK }}>Vista previa del Excel</h3>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>
                  Hoja {preview.sheet} - {preview.validRows}/{preview.totalRows} filas validas - Columnas esperadas: {preview.expectedColumns.join(', ')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-neutral !h-8 text-xs" onClick={() => setPreview(null)} disabled={importing}>Cancelar</button>
                <button className="btn-primary !h-8 text-xs" onClick={confirmImport} disabled={importing || preview.errors.length > 0}>
                  {importing ? 'Importando...' : 'Confirmar importacion'}
                </button>
              </div>
            </div>
            {preview.errors.length > 0 && (
              <div className="border-b bg-red-50 px-5 py-3 text-xs text-red-700" style={{ borderColor: '#FECACA' }}>
                <b>{preview.errors.length} errores:</b> {preview.errors.slice(0, 6).map((error) => `Fila ${error.rowNumber}: ${error.message}`).join(' - ')}
                {preview.errors.length > 6 ? ' - ...' : ''}
              </div>
            )}
            <div className="overflow-auto">
              <table className="table-base" style={{ minWidth: 960, width: '100%' }}>
                <thead>
                  <tr>
                    <th className="th-base">Fila</th>
                    <th className="th-base">Categoria</th>
                    <th className="th-base">Codigo</th>
                    <th className="th-base">Padre</th>
                    <th className="th-base">Partida</th>
                    <th className="th-base">Monto</th>
                    <th className="th-base">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.slice(0, 80).map((row) => (
                    <tr key={`${row.rowNumber}-${row.code}`}>
                      <td className="td-base text-slate-400">{row.rowNumber}</td>
                      <td className="td-base">{CATEGORIES.find((cat) => cat.key === row.category)?.label || row.category || '-'}</td>
                      <td className="td-base font-semibold">{row.code}</td>
                      <td className="td-base">{row.parentCode || '-'}</td>
                      <td className="td-base">{row.name}</td>
                      <td className="td-base font-semibold tabular-nums">{money(row.amount)}</td>
                      <td className="td-base">
                        {row.errors.length ? <span className="badge bg-red-100 text-red-700">{row.errors.join(', ')}</span> : <span className="badge bg-emerald-50 text-emerald-700">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-400">Cargando presupuesto...</p>
          ) : items.length === 0 ? (
            <div className="grid place-items-center px-5 py-14 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-md" style={{ background: '#EAF3FF', color: BRAND.blue }}><FiLayers /></div>
              <h3 className="mt-4 font-semibold" style={{ color: INK }}>Aun no hay partidas</h3>
              <p className="mt-1 max-w-md text-sm" style={{ color: MUTED }}>Carga la estructura base o crea una partida global para empezar.</p>
              <button className="btn-primary mt-4" onClick={seedBase}>Cargar estructura base</button>
            </div>
          ) : itemTree.map((cat) => (
            <div key={cat.key} className="border-b last:border-b-0" style={{ borderColor: BORDER }}>
              <button
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50"
                onClick={() => setOpenCats((current) => ({ ...current, [cat.key]: !current[cat.key] }))}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-md text-sm font-bold text-white" style={{ background: cat.color }}>{cat.letter}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold" style={{ color: INK }}>{cat.label}</span>
                    <span className="block text-xs" style={{ color: MUTED }}>{cat.helper}</span>
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <b className="text-sm tabular-nums" style={{ color: cat.color }}>{money(summary?.categories?.[cat.key])}</b>
                  {openCats[cat.key] ? <FiChevronDown /> : <FiChevronRight />}
                </span>
              </button>
              {openCats[cat.key] && (
                <div>
                  {cat.roots.map((item) => renderItem(item))}
                  <div className="border-t px-4 py-3" style={{ borderColor: '#EEF2F7' }}>
                    <button className="btn-neutral !h-8 text-xs" onClick={() => openCreate(cat.key)}><FiPlus /> Agregar partida en {cat.letter}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-5 font-semibold" style={{ fontSize: 18 }}>{editing ? 'Editar partida' : 'Nueva partida'}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoria">
                <select className="input" value={form.category || 'costo_directo'} onChange={(event) => setForm((p: any) => ({ ...p, category: event.target.value, parentId: null, code: nextCode(items, event.target.value as BudgetCategory) }))}>
                  {CATEGORIES.map((cat) => <option key={cat.key} value={cat.key}>{cat.letter}. {cat.label}</option>)}
                </select>
              </Field>
              <Field label="Partida padre opcional">
                <select className="input" value={form.parentId || ''} onChange={(event) => setForm((p: any) => ({ ...p, parentId: event.target.value ? Number(event.target.value) : null }))}>
                  <option value="">Sin padre</option>
                  {parentOptions(items, form.category || 'costo_directo', editing?.id).map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-[130px_minmax(0,1fr)]">
              <Field label="Codigo"><input className="input" value={form.code || ''} onChange={(event) => setForm((p: any) => ({ ...p, code: event.target.value }))} /></Field>
              <Field label="Nombre"><input className="input" value={form.name || ''} onChange={(event) => setForm((p: any) => ({ ...p, name: event.target.value }))} /></Field>
            </div>
            <Field label="Descripcion opcional"><input className="input" value={form.description || ''} onChange={(event) => setForm((p: any) => ({ ...p, description: event.target.value }))} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Monto proyectado"><input type="number" className="input" value={form.amount || ''} onChange={(event) => setForm((p: any) => ({ ...p, amount: event.target.value }))} /></Field>
              <Field label="Moneda"><select className="input" value={form.currency || 'PEN'} onChange={(event) => setForm((p: any) => ({ ...p, currency: event.target.value }))}><option value="PEN">S/ PEN</option><option value="USD">US$ USD</option></select></Field>
              <Field label="Orden"><input type="number" className="input" value={form.sortOrder || 0} onChange={(event) => setForm((p: any) => ({ ...p, sortOrder: event.target.value }))} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={save}><FiDollarSign /> Guardar presupuesto</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

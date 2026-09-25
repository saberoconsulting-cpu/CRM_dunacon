'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiBriefcase,
  FiChevronDown,
  FiChevronRight,
  FiDollarSign,
  FiEdit3,
  FiLayers,
  FiPlus,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { Toaster, toast, Field } from '@/components/ui/ui';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/types';
import { useDisplayCurrency } from '@/lib/currency';

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
type BudgetTreeItem = BudgetItem & { children: BudgetTreeItem[] };
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

function nextCode(items: BudgetItem[], category: BudgetCategory) {
  const meta = CATEGORIES.find((item) => item.key === category);
  const count = items.filter((item) => item.category === category && !item.parentId).length + 1;
  return `${meta?.letter || 'X'}.${String(count).padStart(2, '0')}`;
}

function nextChildCode(items: BudgetItem[], parentId: number, parentCode: string) {
  const count = items.filter((item) => Number(item.parentId || 0) === Number(parentId)).length + 1;
  return `${parentCode}.${String(count).padStart(2, '0')}`;
}

function compareBudgetItems(a: BudgetItem, b: BudgetItem) {
  return compareBudgetCodes(a.code, b.code) || (a.sortOrder || 0) - (b.sortOrder || 0) || Number(a.id) - Number(b.id);
}

function compareBudgetCodes(a: string, b: string) {
  const ax = String(a || '').match(/[A-Za-z]+|\d+/g) || [];
  const bx = String(b || '').match(/[A-Za-z]+|\d+/g) || [];
  for (let i = 0; i < Math.max(ax.length, bx.length); i += 1) {
    if (ax[i] == null) return -1;
    if (bx[i] == null) return 1;
    const an = Number(ax[i]);
    const bn = Number(bx[i]);
    const diff = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : ax[i].localeCompare(bx[i]);
    if (diff) return diff;
  }
  return String(a || '').localeCompare(String(b || ''));
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
  const [deleting, setDeleting] = useState<BudgetItem | null>(null);
  const [form, setForm] = useState<any>({});
  // Moneda unica de la pantalla: los montos se guardan siempre en soles y
  // `show()` los convierte a la moneda activa al momento de pintarlos.
  const { currency, setCurrency, exchangeRate, setExchangeRate, format: show } = useDisplayCurrency();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data] = await Promise.all([
        api.get<any>(`/construction-budget?projectId=${projectId}`),
      ]);
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

  function projectedAmount(item: BudgetTreeItem): number {
    if (item.children.length) return item.children.reduce((sum, child) => sum + projectedAmount(child), 0);
    return Number(item.amount || 0);
  }

  const itemTree = useMemo(() => {
    const children = new Map<number, BudgetTreeItem[]>();
    const normalizedItems = items.map((item) => ({
      ...item,
      id: Number(item.id),
      projectId: Number(item.projectId),
      parentId: item.parentId == null ? null : Number(item.parentId),
      sortOrder: Number(item.sortOrder || 0),
      children: [],
    }));
    for (const item of items) {
      const parentId = item.parentId == null ? null : Number(item.parentId);
      if (!parentId) continue;
      const normalized = normalizedItems.find((candidate) => Number(candidate.id) === Number(item.id));
      if (normalized) children.set(parentId, [...(children.get(parentId) || []), normalized]);
    }
    const withChildren = (item: BudgetTreeItem): BudgetTreeItem => ({
      ...item,
      children: (children.get(Number(item.id)) || []).sort(compareBudgetItems).map(withChildren),
    });
    return CATEGORIES.map((category) => ({
      ...category,
      roots: normalizedItems
        .filter((item) => item.category === category.key && !item.parentId)
        .sort(compareBudgetItems)
        .map(withChildren),
    }));
  }, [items]);

  const projectedObra = itemTree.reduce((sum, cat) => sum + cat.roots.reduce((catSum, item) => catSum + projectedAmount(item), 0), 0);

  function openCreate(category: BudgetCategory, parentId?: number | null) {
    setEditing(null);
    setForm({
      projectId,
      category,
      parentId: parentId || null,
      code: parentId
        ? nextChildCode(items, Number(parentId), items.find((item) => Number(item.id) === Number(parentId))?.code || nextCode(items, category))
        : nextCode(items, category),
      name: '',
      amount: '',
      currency: 'PEN',
      sortOrder: parentId
        ? items.filter((item) => Number(item.parentId || 0) === Number(parentId)).length * 10 + 10
        : items.filter((item) => item.category === category && !item.parentId).length * 10 + 10,
    });
    setModalOpen(true);
  }

  function openEdit(item: BudgetItem) {
    setEditing(item);
    setForm({ ...item, amount: Number(item.amount || 0) });
    setModalOpen(true);
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
    try {
      await api.delete(`/construction-budget/${item.id}`);
      toast('Partida eliminada');
      setDeleting(null);
      load();
    } catch (error: any) {
      toast(error?.message || 'No se pudo eliminar', 'err');
    }
  }

  function renderItem(item: BudgetTreeItem, level = 0) {
    const projected = projectedAmount(item);
    return (
      <div key={item.id} className="min-w-0 border-t" style={{ borderColor: '#EEF2F7' }}>
        {/* Fila del presupuesto. En movil la fila mide "ancho visible + 104px":
            asi se ve codigo + nombre (con "...") + monto y apenas asoma el boton
            "+", y las acciones se alcanzan deslizando. El nombre se ajusta solo
            al espacio disponible. En escritorio todo queda como antes. */}
        <div className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-slate-50 sm:gap-4">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3" style={{ paddingLeft: level * 22 }}>
            <span className="shrink-0 rounded-md px-2 py-1 text-xs font-bold" style={{ background: '#EAF3FF', color: BRAND.blue }}>{item.code}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: INK }} title={item.name}>{item.name}</p>
              {item.description && <p className="truncate text-xs" style={{ color: MUTED }} title={item.description}>{item.description}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="min-w-[120px] text-right sm:min-w-[150px]">
              <p className="text-[10px] font-semibold uppercase leading-tight" style={{ color: MUTED }}>Monto</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: INK }}>{show(projected)}</p>
            </div>
            <div className="flex shrink-0 justify-end gap-1">
              <button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" title="Agregar subpartida" onClick={() => openCreate(item.category, item.id)}><FiPlus /></button>
              <button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" title="Editar" onClick={() => openEdit(item)}><FiEdit3 /></button>
              <button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600" title="Eliminar" onClick={() => setDeleting(item)}><FiTrash2 /></button>
            </div>
          </div>
          </div>
        </div>
        {item.children.map((child) => renderItem(child, level + 1))}
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
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:max-w-[360px] lg:flex-wrap lg:justify-end">
              <div className="flex w-full justify-center sm:col-span-2 lg:w-auto lg:justify-start">
                <CurrencyToggle
                  currency={currency}
                  setCurrency={setCurrency}
                  exchangeRate={exchangeRate}
                  setExchangeRate={setExchangeRate}
                />
              </div>
              <button className="btn-primary w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={() => openCreate('costo_directo')}><FiPlus /> Nueva partida</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t bg-[#F8FAFC] p-4 lg:grid-cols-3 xl:grid-cols-6" style={{ borderColor: BORDER }}>
            <div className="min-w-0 rounded-md border bg-white p-3 sm:p-4 xl:col-span-1" style={{ borderColor: BORDER }}>
              <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }}>Total presupuesto</p>
              <p className="mt-1 truncate text-base font-bold tabular-nums sm:text-xl" style={{ color: INK }}>{show(projectedObra || summary?.grandTotal)}</p>
            </div>
            {CATEGORIES.map((cat) => (
              <div key={cat.key} className="min-w-0 rounded-md border bg-white p-3 sm:p-4" style={{ borderColor: BORDER }}>
                <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }} title={`${cat.letter}. ${cat.label}`}>{cat.letter}. {cat.label}</p>
                <p className="mt-1 truncate text-base font-bold tabular-nums sm:text-lg" style={{ color: cat.color }}>
                  {show(itemTree.find((item) => item.key === cat.key)?.roots.reduce((sum, item) => sum + projectedAmount(item), 0) || summary?.categories?.[cat.key])}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-400">Cargando presupuesto...</p>
          ) : items.length === 0 ? (
            <div className="grid place-items-center px-5 py-14 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-md" style={{ background: '#EAF3FF', color: BRAND.blue }}><FiLayers /></div>
              <h3 className="mt-4 font-semibold" style={{ color: INK }}>Aun no hay partidas</h3>
              <p className="mt-1 max-w-md text-sm" style={{ color: MUTED }}>Crea una partida global para empezar.</p>
              <button className="btn-primary mt-4" onClick={() => openCreate('costo_directo')}><FiPlus /> Nueva partida</button>
            </div>
          ) : (
            <>
              <p className="px-4 py-2 text-xs text-slate-400 sm:hidden">Desliza hacia la derecha para ver monto y acciones.</p>
              {/* [container-type:inline-size] permite usar `cqw` (= ancho visible del
                  contenedor) para que en movil cada categoria mida ancho visible + 260px. */}
              <div className="overflow-x-auto [container-type:inline-size]">
                {itemTree.map((cat) => {
                  const categoryProjected = cat.roots.reduce((sum, item) => sum + projectedAmount(item), 0);
                  return (
                  <div key={cat.key} className="w-[calc(100cqw_+_260px)] border-b last:border-b-0 sm:w-full" style={{ borderColor: BORDER }}>
                    {/* Cabecera pegada a la izquierda: no se desplaza, su monto y flecha siempre se ven. */}
                    <button
                      className="sticky left-0 flex w-[100cqw] items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 sm:w-full"
                      onClick={() => setOpenCats((current) => ({ ...current, [cat.key]: !current[cat.key] }))}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm font-bold text-white" style={{ background: cat.color }}>{cat.letter}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold" style={{ color: INK }}>{cat.label}</span>
                          <span className="block text-xs" style={{ color: MUTED }}>{cat.helper}</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-4">
                        <span className="hidden text-right sm:block">
                          <span>
                            <span className="block text-[10px] font-semibold uppercase" style={{ color: MUTED }}>Monto</span>
                            <b className="text-sm tabular-nums" style={{ color: cat.color }}>{show(categoryProjected)}</b>
                          </span>
                        </span>
                        <b className="text-sm tabular-nums sm:hidden" style={{ color: cat.color }}>{show(categoryProjected)}</b>
                        {openCats[cat.key] ? <FiChevronDown /> : <FiChevronRight />}
                      </span>
                    </button>
                    {openCats[cat.key] && (
                      <div>
                        {cat.roots.map((item) => renderItem(item))}
                        <div className="border-t" style={{ borderColor: '#EEF2F7' }}>
                          <div className="sticky left-0 w-[100cqw] px-4 py-3 sm:w-full">
                            <button className="btn-neutral !h-8 text-xs" onClick={() => openCreate(cat.key)}><FiPlus /> Agregar partida en {cat.letter}</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModalOpen(false)} />
          <div className="relative flex max-h-[80dvh] w-full max-w-[360px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:max-w-xl">
            {/* Cabecera compacta: el subtitulo se oculta en movil para ganar altura. */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 sm:items-start sm:px-5 sm:py-4" style={{ borderColor: BORDER }}>
              <div className="min-w-0">
                <h3 className="text-base font-semibold sm:text-lg" style={{ color: INK }}>{editing ? 'Editar partida' : 'Nueva partida'}</h3>
                <p className="mt-0.5 hidden text-xs sm:block" style={{ color: MUTED }}>Define la partida y su monto dentro del presupuesto.</p>
              </div>
              <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setModalOpen(false)} aria-label="Cerrar">
                <FiX />
              </button>
            </div>

            {/* Cuerpo con scroll propio. En movil los inputs son mas bajos (h-9) y
                los campos se agrupan en filas; en sm+ vuelven al tamano normal. */}
            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3 sm:space-y-3 sm:px-5 sm:py-4 [&_.input]:!h-9 [&_.input]:!py-1 [&_.input]:!text-sm sm:[&_.input]:!h-10 sm:[&_.input]:!py-2">
              <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
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

              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2.5 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-3">
                <Field label="Codigo"><input className="input" value={form.code || ''} onChange={(event) => setForm((p: any) => ({ ...p, code: event.target.value }))} /></Field>
                <Field label="Nombre"><input className="input" value={form.name || ''} onChange={(event) => setForm((p: any) => ({ ...p, name: event.target.value }))} /></Field>
              </div>

              <Field label="Descripcion opcional"><input className="input" value={form.description || ''} onChange={(event) => setForm((p: any) => ({ ...p, description: event.target.value }))} /></Field>

              <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.7fr)] gap-2.5 sm:grid-cols-3 sm:gap-3">
                <Field label="Monto proyectado"><input type="number" inputMode="decimal" className="input" value={form.amount || ''} onChange={(event) => setForm((p: any) => ({ ...p, amount: event.target.value }))} /></Field>
                <Field label="Moneda">
                  <select className="input" value={form.currency || 'PEN'} onChange={(event) => setForm((p: any) => ({ ...p, currency: event.target.value }))}>
                    <option value="PEN">S/ PEN</option>
                    <option value="USD">US$ USD</option>
                  </select>
                </Field>
                <Field label="Orden"><input type="number" inputMode="numeric" className="input" value={form.sortOrder || 0} onChange={(event) => setForm((p: any) => ({ ...p, sortOrder: event.target.value }))} /></Field>
              </div>
            </div>

            {/* Pie: en movil los dos botones van en una sola fila. */}
            <div className="grid shrink-0 grid-cols-[1fr_1.7fr] gap-2 border-t px-4 py-2.5 sm:flex sm:justify-end sm:px-5 sm:py-3" style={{ borderColor: BORDER }}>
              <button className="btn-neutral justify-center !h-10 text-sm sm:!h-auto" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-primary justify-center !h-10 text-sm sm:!h-auto" onClick={save}><FiDollarSign /> Guardar presupuesto</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDeleting(null)} />
          <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-lg">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-red-50 text-red-600">
                <FiTrash2 />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold" style={{ color: INK }}>Eliminar partida</h3>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>
                  Esta partida se retirara del presupuesto del proyecto.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-md border bg-slate-50 p-3" style={{ borderColor: BORDER }}>
              <p className="text-xs font-bold uppercase" style={{ color: MUTED }}>Partida seleccionada</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: INK }}>{deleting.code} - {deleting.name}</p>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-neutral justify-center" onClick={() => setDeleting(null)}>Cancelar</button>
              <button className="btn-primary justify-center bg-red-600 hover:bg-red-700" onClick={() => remove(deleting)}>
                <FiTrash2 /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

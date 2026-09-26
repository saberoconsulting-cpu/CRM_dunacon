'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiBriefcase,
  FiChevronDown,
  FiChevronRight,
  FiDollarSign,
  FiDownload,
  FiEdit3,
  FiFilePlus,
  FiLayers,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { Toaster, toast, Field } from '@/components/ui/ui';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { Select } from '@/components/ui/Select';
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
type CashflowModel = {
  rows?: Array<{ id: string; label: string; values: number[] }>;
};
type BankMovement = {
  chargeAmount?: string | number;
  eerrClassification?: string | null;
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

function nextCode(items: BudgetItem[], category: BudgetCategory, excludeId?: number) {
  const meta = CATEGORIES.find((item) => item.key === category);
  const count = items.filter((item) => item.category === category && !item.parentId && Number(item.id) !== Number(excludeId || 0)).length + 1;
  return `${meta?.letter || 'X'}.${String(count).padStart(2, '0')}`;
}

function nextSiblingIndex(items: BudgetItem[], parentId: number | null, category: BudgetCategory, excludeId?: number) {
  const count = parentId
    ? items.filter((item) => Number(item.parentId || 0) === Number(parentId) && Number(item.id) !== Number(excludeId || 0)).length
    : items.filter((item) => item.category === category && !item.parentId && Number(item.id) !== Number(excludeId || 0)).length;
  return count + 1;
}

function childCodeFor(items: BudgetItem[], parent: BudgetItem, category: BudgetCategory, excludeId?: number) {
  const base = String(parent?.code || nextCode(items, category)).trim().replace(/-/g, '.');
  return `${base}.${String(nextSiblingIndex(items, Number(parent.id), category, excludeId)).padStart(2, '0')}`;
}

function ancestorChain(items: BudgetItem[], id: number | null): number[] {
  const chain: number[] = [];
  let current = id ? items.find((item) => Number(item.id) === Number(id)) : null;
  while (current) {
    chain.push(Number(current.id));
    current = current.parentId ? items.find((item) => Number(item.id) === Number(current?.parentId)) : null;
  }
  return chain;
}

function parentOptions(items: BudgetItem[], category: BudgetCategory, currentId?: number) {
  return items.filter((item) => item.category === category && Number(item.id) !== Number(currentId || 0));
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

function compareBudgetItems(a: BudgetItem, b: BudgetItem) {
  return compareBudgetCodes(a.code, b.code) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || Number(a.id) - Number(b.id);
}

function normalizeMatch(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pct(real: number, projected: number) {
  if (!projected) return real ? 100 : 0;
  return (real / projected) * 100;
}

export default function ConstructionBudgetView({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [summary, setSummary] = useState<any>({ categories: {}, grandTotal: 0 });
  const [cashflow, setCashflow] = useState<CashflowModel | null>(null);
  const [bankMovements, setBankMovements] = useState<BankMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [deleting, setDeleting] = useState<BudgetItem | null>(null);
  const [form, setForm] = useState<any>({});
  const [printing, setPrinting] = useState(false);
  // Moneda unica de la pantalla: los montos se guardan siempre en soles y
  // `show()` los convierte a la moneda activa al momento de pintarlos.
  const { currency, setCurrency, exchangeRate, setExchangeRate, format: show } = useDisplayCurrency();
  // Simbolo de la moneda activa para los encabezados de la tabla.
  const symbol = String(currency).toUpperCase() === 'USD' ? 'US$' : 'S/';
  // En movil la columna del monto es angosta: pintamos el numero sin simbolo
  // (el encabezado ya lo indica) para que no se amontone con el Concepto.
  const showCompact = (value: number) => show(value).replace(/^[^\d-]+/, '').trim();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, cashflowData, bankData] = await Promise.all([
        api.get<any>(`/construction-budget?projectId=${projectId}`),
        api.get<CashflowModel | null>(`/cashflow/model?projectId=${projectId}&mode=estatico`).catch(() => null),
        api.get<any>(`/bank-accounts/accounts?projectId=${projectId}`)
          .then(async (accountsData) => {
            const accounts = Array.isArray(accountsData?.items) ? accountsData.items : [];
            const keys = accounts.length ? accounts.map((account: any) => account.accountKey).filter(Boolean) : ['GENERAL'];
            const responses = await Promise.all(keys.map((accountKey: string) =>
              api.get<any>(`/bank-accounts?projectId=${projectId}&accountKey=${encodeURIComponent(accountKey)}`).catch(() => ({ items: [] })),
            ));
            return { items: responses.flatMap((response) => Array.isArray(response?.items) ? response.items : []) };
          })
          .catch(() => ({ items: [] })),
      ]);
      setItems(data?.items || []);
      setSummary(data?.summary || { categories: {}, grandTotal: 0 });
      setCashflow(cashflowData && Array.isArray(cashflowData.rows) ? cashflowData : null);
      setBankMovements(Array.isArray(bankData?.items) ? bankData.items : []);
      setOpenCats((current) => current && Object.keys(current).length ? current : Object.fromEntries(CATEGORIES.map((cat) => [cat.key, true])));
    } catch (error: any) {
      toast(error?.message || 'No se pudo cargar el presupuesto', 'err');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, [printing]);

  // Con un modal abierto se bloquea el scroll del fondo. Sin esto, el overlay
  // `fixed` de los Select y el viewport movil (dvh) puede desplazar la pagina
  // detras del modal y descolocar la posicion del menu.
  useEffect(() => {
    if (!modalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [modalOpen]);

  const itemTree = useMemo(() => {
    const normalized = items.map((item) => ({
      ...item,
      id: Number(item.id),
      parentId: item.parentId == null ? null : Number(item.parentId),
      sortOrder: Number(item.sortOrder || 0),
      children: [],
    }));
    const children = new Map<number, BudgetTreeItem[]>();
    for (const item of normalized) {
      if (!item.parentId) continue;
      children.set(item.parentId, [...(children.get(item.parentId) || []), item]);
    }
    const withChildren = (item: BudgetTreeItem): BudgetTreeItem => ({
      ...item,
      children: (children.get(Number(item.id)) || []).sort(compareBudgetItems).map(withChildren),
    });
    return CATEGORIES.map((category) => ({
      ...category,
      roots: normalized
        .filter((item) => item.category === category.key && !item.parentId)
        .sort(compareBudgetItems)
        .map(withChildren),
    }));
  }, [items]);

  const cashflowTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of cashflow?.rows || []) {
      const total = (row.values || []).reduce((sum, value) => sum + Number(value || 0), 0);
      const keys = [row.id, row.label].map(normalizeMatch).filter(Boolean);
      keys.forEach((key) => totals.set(key, (totals.get(key) || 0) + total));
    }
    return totals;
  }, [cashflow]);

  const bankTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const movement of bankMovements) {
      const key = normalizeMatch(movement.eerrClassification);
      if (!key) continue;
      totals.set(key, (totals.get(key) || 0) + Number(movement.chargeAmount || 0));
    }
    return totals;
  }, [bankMovements]);

  function matchedTotal(source: Map<string, number>, item: BudgetItem) {
    const code = normalizeMatch(item.code);
    const name = normalizeMatch(item.name);
    let total = 0;
    for (const [key, value] of source.entries()) {
      if (
        key === code ||
        key === name ||
        key.startsWith(`${code} `) ||
        key.includes(` ${code} `) ||
        (name.length > 2 && key.includes(name))
      ) {
        total += value;
      }
    }
    return total;
  }

  function projectedAmount(item: BudgetTreeItem): number {
    if (item.children.length) return item.children.reduce((sum, child) => sum + projectedAmount(child), 0);
    const fromCashflow = matchedTotal(cashflowTotals, item);
    return fromCashflow || Number(item.amount || 0);
  }

  function realAmount(item: BudgetTreeItem): number {
    if (item.children.length) return item.children.reduce((sum, child) => sum + realAmount(child), 0);
    return matchedTotal(bankTotals, item);
  }

  const budgetTotals = useMemo(() => {
    const categories = Object.fromEntries(itemTree.map((cat) => [
      cat.key,
      {
        projected: cat.roots.reduce((sum, item) => sum + projectedAmount(item), 0),
        real: cat.roots.reduce((sum, item) => sum + realAmount(item), 0),
      },
    ])) as Record<BudgetCategory, { projected: number; real: number }>;
    const projected = Object.values(categories).reduce((sum, item) => sum + item.projected, 0);
    const real = Object.values(categories).reduce((sum, item) => sum + item.real, 0);
    return { categories, projected, real };
  }, [itemTree, cashflowTotals, bankTotals]);

  function revealItem(id: number | null) {
    if (!id) return;
    const chain = ancestorChain(items, id);
    if (!chain.length) return;
    setOpenItems((current) => {
      const next = { ...current };
      chain.forEach((key) => { next[key] = true; });
      return next;
    });
  }

  function openCreate(category: BudgetCategory, parentId?: number | null) {
    setEditing(null);
    revealItem(parentId || null);
    setForm({
      projectId,
      category,
      parentId: parentId || null,
      code: parentId
        ? childCodeFor(items, items.find((item) => Number(item.id) === Number(parentId)) as BudgetItem, category)
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

  async function seedBase() {
    if (items.length > 0) return toast('La base solo se carga cuando el presupuesto esta vacio', 'err');
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
      revealItem(payload.parentId ? Number(payload.parentId) : null);
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

  function renderItem(item: BudgetTreeItem, level = 0): JSX.Element {
    const projected = projectedAmount(item);
    const real = realAmount(item);
    const advance = pct(real, projected);
    const hasChildren = item.children.length > 0;
    const isOpen = printing || !!openItems[item.id];
    return (
      <>
        <tr key={item.id} className="border-t hover:bg-slate-50" style={{ borderColor: '#EEF2F7' }}>
          <td className="px-3 py-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2 overflow-hidden sm:gap-3" style={{ paddingLeft: level * 12 }}>
              {hasChildren ? (
                <button
                  type="button"
                  className="budget-no-print grid h-5 w-5 shrink-0 place-items-center rounded text-slate-500 hover:bg-slate-100"
                  title={isOpen ? 'Ocultar subpartidas' : 'Ver subpartidas'}
                  aria-expanded={isOpen}
                  onClick={() => setOpenItems((current) => ({ ...current, [item.id]: !current[item.id] }))}
                >
                  {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}
              <span className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-bold sm:px-2 sm:text-xs" style={{ background: level ? '#F8FAFC' : '#EAF3FF', color: level ? MUTED : BRAND.blue, border: `1px solid ${level ? BORDER : '#BFDBFE'}` }}>{item.code}</span>
              <div
                className={`min-w-0 flex-1 overflow-hidden ${hasChildren ? 'cursor-pointer select-none' : ''}`}
                onClick={hasChildren ? () => setOpenItems((current) => ({ ...current, [item.id]: !current[item.id] })) : undefined}
                title={hasChildren ? (isOpen ? 'Ocultar subpartidas' : 'Ver subpartidas') : undefined}
              >
                <p className="block w-full truncate whitespace-nowrap text-xs font-semibold leading-tight sm:text-sm" style={{ color: INK }} title={item.name}>{item.name}</p>
                {item.description && <p className="hidden truncate text-xs sm:block" style={{ color: MUTED }} title={item.description}>{item.description}</p>}
              </div>
              {hasChildren && (
                <span className="budget-no-print shrink-0 text-[10px] font-semibold tabular-nums" style={{ color: MUTED }}>{item.children.length}</span>
              )}
            </div>
          </td>
          <td className="budget-cell-projected whitespace-nowrap px-2 py-3 text-right text-xs font-bold tabular-nums sm:text-sm md:px-3" style={{ color: INK }}>
            <span className="budget-amount-compact md:hidden">{showCompact(projected)}</span>
            <span className="budget-amount-full hidden md:inline">{show(projected)}</span>
          </td>
          <td className="budget-cell-real whitespace-nowrap px-2 py-3 text-right text-xs font-bold tabular-nums sm:text-sm md:px-3" style={{ color: real > 0 ? '#16A36A' : INK }}>
            <span className="budget-amount-compact md:hidden">{showCompact(real)}</span>
            <span className="budget-amount-full hidden md:inline">{show(real)}</span>
          </td>
          <td className="budget-cell-advance px-1.5 py-3 text-right md:px-3">
            <span className="inline-block rounded-full px-1.5 py-1 text-[11px] font-bold tabular-nums sm:px-2.5 sm:text-xs" style={{ background: advance >= 100 ? '#EAF7EE' : '#F1F5F9', color: advance >= 100 ? '#16A36A' : BRAND.blue }}>
              {advance.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </span>
          </td>
          <td className="budget-no-print px-1.5 py-3 md:px-3">
            <div className="flex justify-end gap-0.5 sm:gap-1">
              <button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 sm:h-8 sm:w-8" title="Agregar subpartida" onClick={() => openCreate(item.category, item.id)}><FiPlus /></button>
              <button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 sm:h-8 sm:w-8" title="Editar" onClick={() => openEdit(item)}><FiEdit3 /></button>
              <button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 sm:h-8 sm:w-8" title="Eliminar" onClick={() => setDeleting(item)}><FiTrash2 /></button>
            </div>
          </td>
        </tr>
        {isOpen && item.children.map((child) => renderItem(child, level + 1))}
      </>
    );
  }

  function exportPdf() {
    setOpenCats(Object.fromEntries(CATEGORIES.map((cat) => [cat.key, true])));
    setOpenItems(Object.fromEntries(items.map((item) => [Number(item.id), true])));
    setPrinting(true);
    window.setTimeout(() => window.print(), 80);
  }

  return (
    <>
      <Toaster />
      <style jsx global>{`
        @media (min-width: 768px) {
          .budget-table { width: 100% !important; min-width: 980px !important; }
        }
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          body * {
            visibility: hidden !important;
          }
          .budget-print-area,
          .budget-print-area * {
            visibility: visible !important;
          }
          .budget-print-area {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            background: #ffffff !important;
          }
          .budget-no-print {
            display: none !important;
          }
          .budget-print-header {
            display: flex !important;
          }
          .budget-print-area,
          .budget-print-area section {
            box-shadow: none !important;
          }
          .budget-print-area .budget-table {
            width: 100% !important;
            min-width: 0 !important;
          }
          /* Al exportar desde el celular la tabla quedo en su modo reducido
             (Concepto + Proyectado): aqui se fuerzan las 5 columnas para que
             Real, Avance % y Acciones reaparezcan en el PDF. */
          .budget-print-area .budget-table > colgroup > .budget-col-concept { width: 44% !important; }
          .budget-print-area .budget-table > colgroup > .budget-col-projected { width: 15% !important; }
          .budget-print-area .budget-table > colgroup > .budget-col-real { width: 15% !important; }
          .budget-print-area .budget-table > colgroup > .budget-col-advance { width: 12% !important; }
          .budget-print-area .budget-table > colgroup > .budget-col-actions { width: 14% !important; }
          .budget-print-area .budget-table .budget-cell-real,
          .budget-print-area .budget-table .budget-cell-advance { display: table-cell !important; }
          .budget-print-area .budget-no-print,
          .budget-print-area .budget-table .budget-col-actions { display: none !important; }
          .budget-print-area th,
          .budget-print-area td {
            padding-left: 8px !important;
            padding-right: 8px !important;
          }
          /* En el PDF/impresion los montos siempre muestran su simbolo, aunque
             se imprima desde el celular (donde el ancho es reducido). */
          .budget-print-area .budget-amount-compact {
            display: none !important;
          }
          .budget-print-area .budget-amount-full {
            display: inline !important;
          }
          /* En el PDF las celdas recuperan su padding normal y dejan de recortar
             el contenido, porque el ancho de hoja (A4 landscape) ya alcanza. */
          .budget-print-area .budget-table td,
          .budget-print-area .budget-table th { overflow: visible !important; }
          .budget-print-area .budget-table .budget-cell-projected,
          .budget-print-area .budget-table .budget-head-projected { padding-left: 8px !important; padding-right: 8px !important; }
        }
      `}</style>
      <div className="budget-print-area space-y-5">
        <div className="budget-print-header hidden items-center justify-between gap-5 border-b pb-4" style={{ borderColor: BORDER }}>
          <img src="/logo/dunacon.png" alt="Dunacon" className="h-12 max-w-36 object-contain" />
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: BRAND.blue }}>Dunacon CRM</p>
            <h1 className="mt-1 text-xl font-bold" style={{ color: INK }}>Presupuesto de Obra</h1>
            <p className="mt-1 text-xs" style={{ color: MUTED }}>Proyecto {projectId}</p>
          </div>
          <div className="text-right text-xs" style={{ color: MUTED }}>
            <p className="font-semibold" style={{ color: INK }}>Fecha</p>
            <p>{new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
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
            <div className="budget-no-print grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:max-w-[620px] lg:flex-wrap lg:justify-end">
              <div className="flex w-full justify-center sm:col-span-2 lg:w-auto lg:justify-start">
                <CurrencyToggle
                  currency={currency}
                  setCurrency={setCurrency}
                  exchangeRate={exchangeRate}
                  setExchangeRate={setExchangeRate}
                />
              </div>
              <button className="btn-neutral w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={exportPdf}><FiDownload /> Exportar PDF</button>
              <button className="btn-neutral w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={load} disabled={loading}><FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar</button>
              <button className="btn-outline w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={seedBase} disabled={items.length > 0} title={items.length > 0 ? 'La base solo se carga cuando el presupuesto esta vacio' : 'Carga las partidas base del presupuesto'}><FiFilePlus /> Base</button>
              <button className="btn-primary w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={() => openCreate('costo_directo')}><FiPlus /> Nueva partida</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t bg-[#F8FAFC] p-4 xl:grid-cols-6" style={{ borderColor: BORDER }}>
            <div className="min-w-0 rounded-md border bg-white p-3 sm:p-4 xl:col-span-1" style={{ borderColor: BORDER }}>
              <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }}>Total presupuesto</p>
              <p className="mt-1 truncate text-base font-bold tabular-nums sm:text-xl" style={{ color: INK }}>{show(budgetTotals.projected || summary?.grandTotal)}</p>
            </div>
            {CATEGORIES.map((cat) => (
              <div key={cat.key} className="min-w-0 rounded-md border bg-white p-3 sm:p-4" style={{ borderColor: BORDER }}>
                <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }} title={`${cat.letter}. ${cat.label}`}>{cat.letter}. {cat.label}</p>
                <p className="mt-1 truncate text-base font-bold tabular-nums sm:text-lg" style={{ color: cat.color }}>{show(budgetTotals.categories[cat.key]?.projected || summary?.categories?.[cat.key])}</p>
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
              <p className="mt-1 max-w-md text-sm" style={{ color: MUTED }}>Carga la estructura base o crea una partida global para empezar.</p>
              <button className="btn-primary mt-4" onClick={seedBase}>Cargar estructura base</button>
            </div>
          ) : (
            <>
              <p className="px-4 py-2 text-xs text-slate-400 md:hidden">Desliza la tabla hacia la derecha para ver mas columnas.</p>
              <div className="overflow-x-auto [container-type:inline-size]" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="budget-table w-[calc(100cqw_+_300px)] table-fixed border-collapse text-[13px] md:w-full md:min-w-[980px] md:text-sm">
                  <colgroup>
                    <col className="budget-col-concept w-[calc(100cqw_-_132px)] md:w-[44%]" />
                    <col className="budget-col-projected w-[132px] md:w-[15%]" />
                    <col className="budget-col-real w-[130px] md:w-[15%]" />
                    <col className="budget-col-advance w-[86px] md:w-[12%]" />
                    <col className="budget-col-actions budget-no-print w-[84px] md:w-[14%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b text-[10px] font-bold uppercase tracking-wide" style={{ borderColor: BORDER, background: '#F8FAFC', color: MUTED }}>
                      <th className="px-3 py-3 text-left sm:px-4">Concepto</th>
                      <th className="budget-head-projected whitespace-nowrap px-2 py-3 text-right md:px-3">Proyectado {symbol}</th>
                      <th className="budget-cell-real whitespace-nowrap px-2 py-3 text-right md:px-3">Real {symbol}</th>
                      <th className="budget-cell-advance whitespace-nowrap px-1.5 py-3 text-right md:px-3">Avance %</th>
                      <th className="budget-no-print px-1.5 py-3 text-right md:px-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemTree.map((cat) => {
                      const categoryProjected = budgetTotals.categories[cat.key]?.projected || 0;
                      const categoryReal = budgetTotals.categories[cat.key]?.real || 0;
                      const categoryAdvance = pct(categoryReal, categoryProjected);
                      const isOpen = printing || openCats[cat.key];
                      return (
                        <Fragment key={cat.key}>
                          <tr className="border-b" style={{ borderColor: BORDER, background: '#F8FAFC' }}>
                            <td className="px-3 py-3 sm:px-4">
                              <button
                                type="button"
                                className="flex w-full min-w-0 items-center gap-2 overflow-hidden text-left sm:gap-3"
                                onClick={() => setOpenCats((current) => ({ ...current, [cat.key]: !current[cat.key] }))}
                              >
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-sm font-bold text-white sm:h-9 sm:w-9" style={{ background: cat.color }}>{cat.letter}</span>
                                <span className="min-w-0 flex-1 overflow-hidden">
                                  <span className="block w-full truncate whitespace-nowrap text-xs font-semibold sm:text-sm" style={{ color: INK }}>{cat.label}</span>
                                  <span className="budget-no-print hidden truncate text-xs sm:block" style={{ color: MUTED }}>{cat.helper}</span>
                                </span>
                                <span className="budget-no-print shrink-0 text-slate-500">{isOpen ? <FiChevronDown /> : <FiChevronRight />}</span>
                              </button>
                            </td>
                            <td className="budget-cell-projected whitespace-nowrap px-2 py-3 text-right text-xs font-bold tabular-nums sm:text-sm md:px-3" style={{ color: cat.color }}>
                              <span className="budget-amount-compact md:hidden">{showCompact(categoryProjected)}</span>
                              <span className="budget-amount-full hidden md:inline">{show(categoryProjected)}</span>
                            </td>
                            <td className="budget-cell-real whitespace-nowrap px-2 py-3 text-right text-xs font-bold tabular-nums sm:text-sm md:px-3" style={{ color: categoryReal > 0 ? '#16A36A' : INK }}>
                              <span className="budget-amount-compact md:hidden">{showCompact(categoryReal)}</span>
                              <span className="budget-amount-full hidden md:inline">{show(categoryReal)}</span>
                            </td>
                            <td className="budget-cell-advance px-1.5 py-3 text-right md:px-3">
                              <span className="inline-block rounded-full px-1.5 py-1 text-[11px] font-bold tabular-nums sm:px-2.5 sm:text-xs" style={{ background: categoryAdvance >= 100 ? '#EAF7EE' : '#F1F5F9', color: categoryAdvance >= 100 ? '#16A36A' : BRAND.blue }}>
                                {categoryAdvance.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                              </span>
                            </td>
                            <td className="budget-no-print px-1.5 py-3 text-right md:px-3">
                              <button className="btn-neutral !h-8 !px-2 text-xs" title="Agregar partida" onClick={() => openCreate(cat.key)}><FiPlus /><span className="hidden md:inline"> Partida</span></button>
                            </td>
                          </tr>
                          {isOpen && cat.roots.map((item) => renderItem(item))}
                        </Fragment>
                      );
                    })}
                    <tr className="border-t" style={{ borderColor: BRAND.blueDark, background: '#EAF3FF' }}>
                      <td className="px-2 py-4 text-sm font-bold sm:px-4 sm:text-base" style={{ color: BRAND.blueDark }}>Total A+B+C+D+E</td>
                      <td className="budget-cell-projected whitespace-nowrap px-2 py-4 text-right text-xs font-extrabold tabular-nums sm:text-sm md:px-3" style={{ color: INK }}>
                        <span className="budget-amount-compact md:hidden">{showCompact(budgetTotals.projected)}</span>
                        <span className="budget-amount-full hidden md:inline">{show(budgetTotals.projected)}</span>
                      </td>
                      <td className="budget-cell-real whitespace-nowrap px-2 py-4 text-right text-xs font-extrabold tabular-nums sm:text-sm md:px-3" style={{ color: '#16A36A' }}>
                        <span className="budget-amount-compact md:hidden">{showCompact(budgetTotals.real)}</span>
                        <span className="budget-amount-full hidden md:inline">{show(budgetTotals.real)}</span>
                      </td>
                      <td className="budget-cell-advance px-1.5 py-4 text-right md:px-3">
                        <span className="inline-block rounded-full bg-white px-1.5 py-1 text-[11px] font-extrabold tabular-nums sm:px-2.5 sm:text-xs" style={{ color: pct(budgetTotals.real, budgetTotals.projected) >= 100 ? '#16A36A' : BRAND.blue }}>
                          {pct(budgetTotals.real, budgetTotals.projected).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                        </span>
                      </td>
                      <td className="budget-no-print px-1.5 py-4 md:px-3" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-3 sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModalOpen(false)} />
          <div className="relative flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full max-w-[20rem] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:max-w-md">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:items-start sm:px-5 sm:py-4" style={{ borderColor: BORDER }}>
              <div className="min-w-0">
                <h3 className="text-base font-semibold sm:text-lg" style={{ color: INK }}>{editing ? 'Editar partida' : 'Nueva partida'}</h3>
                <p className="mt-0.5 hidden text-xs sm:block" style={{ color: MUTED }}>Define la partida y su monto dentro del presupuesto.</p>
              </div>
              <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setModalOpen(false)} aria-label="Cerrar">
                <FiX />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3 pb-4 sm:space-y-3 sm:px-5 sm:py-4 [&_.input]:!h-9 [&_.input]:!py-1 [&_.input]:!text-sm [&_.label]:!mb-1 [&_.select-trigger]:!h-9 [&_.select-trigger]:!text-sm sm:[&_.input]:!h-10 sm:[&_.input]:!py-2 sm:[&_.select-trigger]:!h-10">
              <div className="grid gap-2.5">
                <Field label="Categoria">
                  <Select
                    value={form.category || 'costo_directo'}
                    onChange={(value) => setForm((p: any) => ({ ...p, category: value as BudgetCategory, parentId: null, code: nextCode(items, value as BudgetCategory, editing?.id) }))}
                    options={CATEGORIES.map((cat) => ({ value: cat.key, label: `${cat.letter}. ${cat.label}` }))}
                  />
                </Field>
                <Field label="Partida padre opcional">
                  <Select
                    value={form.parentId || ''}
                    onChange={(value) => setForm((p: any) => {
                      const parentId = value ? Number(value) : null;
                      const category = (p.category || 'costo_directo') as BudgetCategory;
                      const parent = parentId ? items.find((item) => Number(item.id) === Number(parentId)) : null;
                      return {
                        ...p,
                        parentId,
                        code: parent
                          ? childCodeFor(items, parent, category, editing?.id)
                          : nextCode(items, category, editing?.id),
                      };
                    })}
                    options={[
                      { value: '', label: 'Sin padre' },
                      ...parentOptions(items, form.category || 'costo_directo', editing?.id).map((item) => ({
                        value: item.id,
                        hint: item.code,
                        label: item.name,
                      })),
                    ]}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2.5 sm:gap-3">
                <Field label="Codigo"><input className="input" value={form.code || ''} onChange={(event) => setForm((p: any) => ({ ...p, code: event.target.value }))} /></Field>
                <Field label="Nombre"><input className="input" value={form.name || ''} onChange={(event) => setForm((p: any) => ({ ...p, name: event.target.value }))} /></Field>
              </div>

              <Field label="Descripcion opcional"><input className="input" value={form.description || ''} onChange={(event) => setForm((p: any) => ({ ...p, description: event.target.value }))} /></Field>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <Field label="Monto proyectado"><input type="number" inputMode="decimal" className="input" value={form.amount || ''} onChange={(event) => setForm((p: any) => ({ ...p, amount: event.target.value }))} /></Field>
                <Field label="Moneda">
                  <Select
                    value={form.currency || 'PEN'}
                    onChange={(value) => setForm((p: any) => ({ ...p, currency: value }))}
                    options={[
                      { value: 'PEN', label: 'S/' },
                      { value: 'USD', label: '$' },
                    ]}
                  />
                </Field>
                <div className="col-span-2 sm:col-span-1">
                  <Field label="Orden"><input type="number" inputMode="numeric" className="input" value={form.sortOrder || 0} onChange={(event) => setForm((p: any) => ({ ...p, sortOrder: event.target.value }))} /></Field>
                </div>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-[1fr_1.7fr] gap-2 border-t px-4 py-3 sm:flex sm:justify-end sm:px-5" style={{ borderColor: BORDER }}>
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

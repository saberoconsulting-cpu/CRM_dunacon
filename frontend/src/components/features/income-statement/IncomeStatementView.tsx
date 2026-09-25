'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FiActivity, FiAward, FiBarChart2, FiBriefcase, FiCheckCircle, FiChevronDown, FiChevronRight, FiClipboard, FiCreditCard, FiDollarSign, FiDownload, FiEdit3, FiFileText, FiGrid, FiMapPin, FiPackage, FiPercent, FiPieChart, FiRefreshCw, FiTool, FiTrendingUp, FiUsers } from 'react-icons/fi';
import { Toaster, toast } from '@/components/ui/ui';
import { KpiCard as SharedKpiCard } from '@/components/ui/Metrics';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { api } from '@/lib/api';
import { BRAND, Lot, Project } from '@/lib/types';
import { useDisplayCurrency, formatCurrency } from '@/lib/currency';

type IncomeStatement = {
  ingresos: number | string;
  egresos_total: number | string;
  egresos_clasificados?: {
    inversion?: number | string;
    financiamiento?: number | string;
    compra_terreno?: number | string;
    costo_indirecto?: number | string;
    ventas_admin?: number | string;
    impuestos?: number | string;
    operacion?: number | string;
  };
  egresos_por_clases?: Record<string, number | string>;
  proyectado?: {
    compra_terreno?: number | string;
    inversion?: number | string;
    costo_indirecto?: number | string;
    ventas_admin?: number | string;
    financiamiento?: number | string;
    impuestos?: number | string;
    total_costos?: number | string;
  };
  presupuesto_obra?: Record<string, number | string>;
  utilidad: number | string;
};

type CashflowModel = {
  rows?: Array<{ id: string; label: string; values: number[] }>;
};

type StatementRow = {
  id: string;
  label: string;
  projected: number;
  real: number;
  icon: JSX.Element;
  accent?: 'income' | 'subtotal' | 'tax' | 'final';
  group?: 'cost';
  child?: boolean;
  note?: string;
  code?: string;
  level?: number;
  color?: string;
  isTotal?: boolean;
  children?: StatementRow[];
};

type BudgetCategory = 'costo_terreno' | 'costo_directo' | 'costo_indirecto' | 'gastos_ventas_admin' | 'gastos_financieros_impuestos';
type BudgetItem = {
  id: number;
  parentId?: number | null;
  category: BudgetCategory;
  code: string;
  name: string;
  amount: string | number;
  sortOrder: number;
};
type BudgetTreeItem = BudgetItem & { children: BudgetTreeItem[] };
type BankMovement = {
  chargeAmount?: string | number;
  depositAmount?: string | number;
  eerrClassification?: string | null;
  movementType?: string | null;
};

const BUDGET_CATEGORIES: Array<{ key: BudgetCategory; label: string; letter: string; color: string; icon: JSX.Element; realKeys: string[] }> = [
  { key: 'costo_terreno', label: 'Costo de terreno', letter: 'A', color: '#0866E5', icon: <FiMapPin />, realKeys: ['compra_terreno'] },
  { key: 'costo_directo', label: 'Costos directos', letter: 'B', color: '#16A36A', icon: <FiTool />, realKeys: ['inversion'] },
  { key: 'costo_indirecto', label: 'Costos indirectos', letter: 'C', color: '#7C3AED', icon: <FiClipboard />, realKeys: ['costo_indirecto'] },
  { key: 'gastos_ventas_admin', label: 'Ventas y administracion', letter: 'D', color: '#D97706', icon: <FiUsers />, realKeys: ['ventas_admin', 'operacion'] },
  { key: 'gastos_financieros_impuestos', label: 'Financieros e impuestos', letter: 'E', color: '#DC2626', icon: <FiCreditCard />, realKeys: ['financiamiento', 'impuestos'] },
];

const BLUE = '#0866E5';
const BLUE_DARK = '#063B87';
const BLUE_SOFT = '#EAF3FF';
const INK = '#0F172A';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A36A';
const AMBER = '#D97706';
const RED = '#DC2626';
// Color del grupo "Costo de venta de lotes" y sus componentes.
const COST = '#4F46E5';
const COST_SOFT = '#EEF2FF';
const COST_BORDER = '#C7D2FE';
const RUC_KEY_PREFIX = 'crm_income_statement_ruc_';
const DEFAULT_RUC = '20601820049';
const INCOME_TAX_RATE = 0.295;

function money(n: number) {
  return formatCurrency(Number.isFinite(n) ? n : 0, 'PEN');
}

function pct(n: number) {
  if (!Number.isFinite(n)) return '0.0%';
  return `${n.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function num(n: unknown) {
  return Number(n || 0);
}

function deviation(real: number, projected: number) {
  if (!projected) return real ? 100 : 0;
  return ((real - projected) / projected) * 100;
}

function lotRevenue(lot: Lot) {
  return num(lot.finalPrice || lot.salePrice || lot.price);
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
  return compareBudgetCodes(a.code, b.code) || num(a.sortOrder) - num(b.sortOrder) || Number(a.id) - Number(b.id);
}

function normalizeMatch(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildBudgetTree(items: BudgetItem[]) {
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
    children.set(Number(item.parentId), [...(children.get(Number(item.parentId)) || []), item]);
  }
  const withChildren = (item: BudgetTreeItem): BudgetTreeItem => ({
    ...item,
    children: (children.get(Number(item.id)) || []).sort(compareBudgetItems).map(withChildren),
  });
  return normalized.filter((item) => !item.parentId).sort(compareBudgetItems).map(withChildren);
}

function rowTone(row: StatementRow) {
  if (row.group === 'cost') return { bg: COST_SOFT, color: COST, border: COST_BORDER };
  if (row.accent === 'income') return { bg: '#F0FDF4', color: GREEN, border: '#BBF7D0' };
  if (row.accent === 'final') return { bg: BLUE_SOFT, color: BLUE_DARK, border: '#BFDBFE' };
  if (row.accent === 'tax') return { bg: '#FFF7ED', color: AMBER, border: '#FED7AA' };
  if (row.accent === 'subtotal') return { bg: '#F8FAFC', color: INK, border: BORDER };
  return { bg: '#FFFFFF', color: INK, border: BORDER };
}

function KpiCard({ label, value, helper, icon, color = BLUE }: { label: string; value: string; helper: string; icon: JSX.Element; color?: string }) {
  return (
    <SharedKpiCard label={label} value={<span className="block w-full text-center">{value}</span>}
      helper={helper}
      icon={icon}
      tone={color}
    />
  );
}

function MetricPill({ label, value, color = BLUE }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-white px-3 py-2.5 sm:px-4 sm:py-3" style={{ borderColor: BORDER }}>
      <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }}>{label}</p>
      <p className="mt-1 truncate text-base font-bold tabular-nums sm:text-lg" style={{ color }}>{value}</p>
    </div>
  );
}

function StatementTooltip({ active, payload, label, formatter = money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-xl" style={{ borderColor: BORDER }}>
      <p className="mb-1 text-xs font-semibold" style={{ color: INK }}>{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-5 text-xs">
          <span style={{ color: MUTED }}>{entry.name}</span>
          <b style={{ color: INK }}>{formatter(Number(entry.value || 0))}</b>
        </div>
      ))}
    </div>
  );
}

async function loadAllLots(projectId: number) {
  const all: Lot[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await api.get<any>(`/lots?projectId=${projectId}&page=${page}&limit=200`);
    const items = Array.isArray(response) ? response : (response?.items || []);
    all.push(...items);
    totalPages = Number(Array.isArray(response) ? 1 : (response?.totalPages || 1));
    page += 1;
  } while (page <= totalPages);

  return all;
}

export default function IncomeStatementView({ projectId }: { projectId: number }) {
  const [project, setProject] = useState<Project | null>(null);
  const [statement, setStatement] = useState<IncomeStatement | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [bankMovements, setBankMovements] = useState<BankMovement[]>([]);
  // Modelo de Flujo de Caja Estático: fuente del Proyectado.
  const [cashflow, setCashflow] = useState<CashflowModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [ruc, setRuc] = useState(DEFAULT_RUC);
  // Moneda unica de la pantalla: `show()` convierte los montos a la moneda activa.
  const { currency, setCurrency, exchangeRate, setExchangeRate, format: show, formatShort: short } = useDisplayCurrency();
  // Simbolo para los encabezados de la tabla segun la moneda activa.
  const symbol = String(currency).toUpperCase() === 'USD' ? 'US$' : 'S/';

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`${RUC_KEY_PREFIX}${projectId}`);
      setRuc(saved || DEFAULT_RUC);
    } catch {
      setRuc(DEFAULT_RUC);
    }
  }, [projectId]);

  useEffect(() => {
    try {
      localStorage.setItem(`${RUC_KEY_PREFIX}${projectId}`, ruc);
    } catch { }
  }, [projectId, ruc]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projectData, statementData, lotData, cashflowData, budgetData, bankData] = await Promise.all([
        api.get<Project>(`/projects/${projectId}`),
        api.get<IncomeStatement>(`/finances/income-statement?projectId=${projectId}`),
        loadAllLots(projectId),
        api.get<CashflowModel | null>(`/cashflow/model?projectId=${projectId}&mode=estatico`).catch(() => null),
        api.get<any>(`/construction-budget?projectId=${projectId}`).catch(() => ({ items: [] })),
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
      setProject(projectData);
      setStatement(statementData);
      setLots(lotData);
      setCashflow(cashflowData && Array.isArray(cashflowData.rows) ? cashflowData : null);
      setBudgetItems(Array.isArray(budgetData?.items) ? budgetData.items : []);
      setBankMovements(Array.isArray(bankData?.items) ? bankData.items : []);
    } catch (error: any) {
      toast(error?.message || 'No se pudo cargar el estado de resultados', 'err');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, [printing]);

  function exportPdf() {
    setPrinting(true);
    window.setTimeout(() => window.print(), 80);
  }

  const report = useMemo(() => {
    const classes = statement?.egresos_clasificados || {};
    const projected = statement?.proyectado || {};
    // Proyectado: sale del Flujo de Caja Estático del proyecto (modo 'estatico').
    // El total de cada fila es la suma de sus valores por año. Si aún no hay modelo
    // guardado, se cae a la lógica anterior (lotes + presupuesto) como referencia.
    const cfTotals = new Map<string, number>();
    for (const row of cashflow?.rows || []) {
      cfTotals.set(row.id, (row.values || []).reduce((sum, value) => sum + num(value), 0));
    }
    const cf = (id: string, fallback: number) => cfTotals.has(id) ? (cfTotals.get(id) ?? 0) : fallback;
    const projectedRevenue = cf('income', lots.reduce((sum, lot) => sum + lotRevenue(lot), 0));
    const totalArea = lots.reduce((sum, lot) => sum + num(lot.areaM2), 0);
    const soldLots = lots.filter((lot) => lot.status === 'vendido').length;
    const realRevenue = num(statement?.ingresos);
    const landCost = num(classes.compra_terreno);
    const directCost = num(classes.inversion);
    const indirectCost = num(classes.costo_indirecto);
    const salesAdminCost = num(classes.ventas_admin) + num(classes.operacion);
    const financeCost = num(classes.financiamiento);
    const realTaxRegistered = num(classes.impuestos);
    const projectedLand = cf('land', num(projected.compra_terreno));
    const projectedDirect = cf('direct', num(projected.inversion));
    const projectedIndirect = cf('indirect', num(projected.costo_indirecto));
    const projectedSalesAdmin = cf('selling', num(projected.ventas_admin));
    const projectedFinanceTax = cf('financial', num(projected.financiamiento));
    const projectedCostOfSales = projectedLand + projectedDirect + projectedIndirect;
    const costOfSales = landCost + directCost + indirectCost;
    const grossProfit = realRevenue - costOfSales;
    const operatingProfit = grossProfit - salesAdminCost;
    const preTaxProfit = operatingProfit - financeCost;
    const incomeTax = Math.max(0, preTaxProfit * INCOME_TAX_RATE);
    const netProfit = preTaxProfit - Math.max(realTaxRegistered, incomeTax);
    const igvReference = realRevenue > 0 ? realRevenue * 18 / 118 : 0;
    const adjustedProfit = netProfit - igvReference;
    const projectedGrossProfit = projectedRevenue - projectedCostOfSales;
    const projectedOperatingProfit = projectedGrossProfit - projectedSalesAdmin;
    const projectedPreTaxProfit = projectedOperatingProfit - projectedFinanceTax;
    const projectedIncomeTax = cf('tax', Math.max(0, projectedPreTaxProfit * INCOME_TAX_RATE));
    const projectedNetProfit = projectedPreTaxProfit - projectedIncomeTax;

    const budgetTree = buildBudgetTree(budgetItems);
    const movementsByClass = new Map<string, number>();
    for (const movement of bankMovements) {
      const key = normalizeMatch(movement.eerrClassification);
      if (!key) continue;
      movementsByClass.set(key, (movementsByClass.get(key) || 0) + num(movement.chargeAmount));
    }
    const itemReal = (item: BudgetItem) => {
      const code = normalizeMatch(item.code);
      const name = normalizeMatch(item.name);
      let total = 0;
      for (const [key, amount] of movementsByClass.entries()) {
        if (key === code || key === name || key.startsWith(`${code} `) || key.includes(` ${code} `)) total += amount;
      }
      return total;
    };
    const itemProjected = (item: BudgetTreeItem): number => item.children.length
      ? item.children.reduce((sum, child) => sum + itemProjected(child), 0)
      : num(item.amount);
    const itemActual = (item: BudgetTreeItem): number => {
      const childrenReal = item.children.reduce((sum, child) => sum + itemActual(child), 0);
      return childrenReal || itemReal(item);
    };
    const fallbackRealByCategory = (category: typeof BUDGET_CATEGORIES[number]) =>
      category.realKeys.reduce((sum, key) => sum + num((classes as any)[key]), 0);

    const rows: StatementRow[] = [];
    let totalProjected = 0;
    let totalReal = 0;
    for (const category of BUDGET_CATEGORIES) {
      const roots = budgetTree.filter((item) => item.category === category.key);
      const projectedCategory = roots.reduce((sum, item) => sum + itemProjected(item), 0);
      const itemRealCategory = roots.reduce((sum, item) => sum + itemActual(item), 0);
      const realCategory = itemRealCategory || fallbackRealByCategory(category);
      totalProjected += projectedCategory;
      totalReal += realCategory;
      const itemRows = (item: BudgetTreeItem, level: number): StatementRow => ({
        id: `item-${item.id}`,
        code: item.code,
        label: item.name,
        projected: itemProjected(item),
        real: itemActual(item),
        icon: category.icon,
        color: category.color,
        level,
        child: true,
        children: item.children.map((child) => itemRows(child, level + 1)),
      });
      rows.push({
        id: `category-${category.letter}`,
        code: category.letter,
        label: category.label,
        projected: projectedCategory,
        real: realCategory,
        accent: 'subtotal',
        icon: category.icon,
        color: category.color,
        level: 0,
        children: roots.map((item) => itemRows(item, 1)),
      });
    }
    rows.push({
      id: 'total',
      code: '',
      label: 'Total A+B+C+D+E',
      projected: totalProjected,
      real: totalReal,
      accent: 'final',
      icon: <FiAward />,
      color: BLUE_DARK,
      isTotal: true,
    });
    return {
      rows,
      totalArea,
      soldLots,
      projectedRevenue,
      realRevenue,
      netProfit,
      adjustedProfit,
      costOfSales,
      operatingCost: salesAdminCost,
      financeCost,
      margin: realRevenue > 0 ? (netProfit / realRevenue) * 100 : 0,
      projectedM2: totalArea > 0 ? projectedRevenue / totalArea : 0,
      realM2: totalArea > 0 ? realRevenue / totalArea : 0,
      chart: [
        { name: 'Ingresos', value: realRevenue, color: GREEN },
        { name: 'Costo venta', value: costOfSales, color: BLUE },
        { name: 'Ventas/Admin', value: salesAdminCost, color: AMBER },
        { name: 'Financiero', value: financeCost, color: '#7C3AED' },
        { name: 'Utilidad neta', value: netProfit, color: netProfit >= 0 ? BLUE_DARK : RED },
      ],
    };
  }, [lots, statement, cashflow, budgetItems, bankMovements]);

  const visibleRows = useMemo(() => {
    const output: StatementRow[] = [];
    const visit = (row: StatementRow) => {
      output.push(row);
      if (!row.children?.length) return;
      const isCategory = (row.level || 0) === 0;
      const isOpen = printing || (expandedRows[row.id] ?? isCategory);
      if (isOpen) row.children.forEach(visit);
    };
    report.rows.forEach(visit);
    return output;
  }, [report.rows, expandedRows, printing]);

  const toggleRow = (row: StatementRow) => {
    if (!row.children?.length) return;
    setExpandedRows((current) => ({
      ...current,
      [row.id]: !(current[row.id] ?? (row.level || 0) === 0),
    }));
  };

  return (
    <>
      <Toaster />
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          body * {
            visibility: hidden !important;
          }
          .income-print-area,
          .income-print-area * {
            visibility: visible !important;
          }
          .income-print-area {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            background: #ffffff !important;
          }
          .income-no-print {
            display: none !important;
          }
          .income-print-area table {
            width: 100% !important;
            min-width: 0 !important;
          }
          .income-print-header {
            display: flex !important;
          }
          .income-print-area,
          .income-print-area section {
            box-shadow: none !important;
          }
        }
      `}</style>
      <div className="space-y-5">
        <section className="income-no-print overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
          <div className="relative min-h-[190px] overflow-hidden px-5 py-6 sm:px-7" style={{ background: `linear-gradient(135deg, ${BLUE_DARK}, ${BLUE})` }}>
            <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-white/15" />
            <div className="absolute right-24 top-12 h-24 w-24 rotate-12 rounded-md border border-white/10" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 text-white">
                <div className="inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
                  <FiFileText /> CRM - DUNACON
                </div>
                <h2 className="mt-5 text-3xl font-bold tracking-normal text-white sm:text-4xl">Estado de Resultados</h2>
                <p className="mt-2 max-w-2xl text-sm text-blue-50">
                  Vista contable ejecutiva del proyecto, construida con ingresos, egresos y lotizacion registrada en la base de datos.
                </p>
              </div>
              <div className="grid gap-3 rounded-md bg-white/10 p-3 ring-1 ring-white/20 backdrop-blur-sm sm:min-w-[360px]">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-blue-50">Moneda</label>
                  <CurrencyToggle
                    currency={currency}
                    setCurrency={setCurrency}
                    exchangeRate={exchangeRate}
                    setExchangeRate={setExchangeRate}
                  />
                </div>
                <label className="text-xs font-semibold uppercase tracking-wide text-blue-50">Proyecto</label>
                <div className="flex min-h-10 items-center rounded-md bg-white px-3 text-sm font-bold" style={{ color: INK }}>
                  {project?.name || `Proyecto ${projectId}`}
                </div>
                <label className="text-xs font-semibold uppercase tracking-wide text-blue-50">RUC editable</label>
                <div className="flex items-center gap-2 rounded-md bg-white px-3">
                  <FiEdit3 className="shrink-0" style={{ color: BLUE }} />
                  <input
                    className="h-10 min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                    style={{ color: INK }}
                    value={ruc}
                    onChange={(event) => setRuc(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t bg-[#F8FAFC] p-4 xl:grid-cols-4" style={{ borderColor: BORDER }}>
            <MetricPill label="Precio proyectado m2" value={show(report.projectedM2)} />
            <MetricPill label="Ingreso real m2" value={show(report.realM2)} color={GREEN} />
            <MetricPill label="Area venta m2" value={`${report.totalArea.toLocaleString('es-PE', { maximumFractionDigits: 2 })} m2`} color={BLUE_DARK} />
            <MetricPill label="Fecha de reporte" value={new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })} color={INK} />
          </div>
        </section>

        <div className="income-print-area space-y-5">
        <div className="income-print-header hidden items-center justify-between gap-5 border-b pb-4" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-3">
            {project?.logoImageUrl ? <img src={project.logoImageUrl} alt={project.name || 'Proyecto'} className="h-12 max-w-36 object-contain" /> : null}
            <img src="/logo/dunacon.png" alt="Dunacon" className="h-12 max-w-36 object-contain" />
          </div>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: BRAND.blue }}>Dunacon CRM</p>
            <h1 className="mt-1 text-xl font-bold" style={{ color: INK }}>Estado de Resultados</h1>
            <p className="mt-1 text-xs" style={{ color: MUTED }}>{project?.name || `Proyecto ${projectId}`}</p>
          </div>
          <div className="text-right text-xs" style={{ color: MUTED }}>
            <p className="font-semibold" style={{ color: INK }}>Fecha</p>
            <p>{new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Ingreso real" value={show(report.realRevenue)} helper="Ingresos de la operación diaria (transacciones)" icon={<FiDollarSign />} color={GREEN} />
          <KpiCard label="Utilidad neta" value={show(report.netProfit)} helper={`Margen neto ${pct(report.margin)}`} icon={<FiTrendingUp />} color={report.netProfit >= 0 ? BLUE : RED} />
          <KpiCard label="Lotes vendidos" value={`${report.soldLots}/${lots.length}`} helper="Conteo desde lotizacion" icon={<FiGrid />} color={BLUE_DARK} />
          <KpiCard label="Area vendible" value={`${report.totalArea.toLocaleString('es-PE', { maximumFractionDigits: 0 })} m2`} helper={project?.location || 'Ubicacion del proyecto'} icon={<FiMapPin />} color="#7C3AED" />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: BORDER }}>
              <div>
                <h3 className="font-semibold" style={{ color: INK }}>Partidas del presupuesto de obra</h3>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>Proyectado manual, real desde estado de cuentas y avance Real / Proyectado.</p>
              </div>
              <div className="income-no-print flex flex-wrap gap-2">
                <button className="btn-neutral !h-9 text-xs" onClick={exportPdf}><FiDownload /> Exportar PDF</button>
                <button className="btn-neutral !h-9 text-xs" onClick={load} disabled={loading}>
                  <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar
                </button>
              </div>
            </div>
            <p className="income-no-print px-4 py-2 text-xs text-slate-400 md:hidden">Desliza un poco para ver importes; el concepto queda mas ancho para identificar cada partida.</p>
            {/* [container-type:inline-size] permite usar `cqw` (= ancho visible del
                contenedor). En movil la tabla mide "ancho visible + 170px": la primera
                columna se ajusta (texto con "...") y deja ver completa la columna
                Proyectado; el resto se alcanza deslizando. Desde md vuelve a porcentajes. */}
            <div className="overflow-x-auto [container-type:inline-size]">
              <table className="w-[calc(100cqw_+_170px)] table-fixed border-collapse md:w-full md:min-w-0">
                <colgroup>
                  <col className="w-[calc(100cqw_-_105px)] md:w-[52%]" />
                  <col className="w-[94px] md:w-[16%]" />
                  <col className="w-[94px] md:w-[16%]" />
                  <col className="w-[87px] md:w-[16%]" />
                </colgroup>
                <thead>
                  <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wide sm:text-xs" style={{ borderColor: BORDER, color: MUTED, background: '#F8FAFC' }}>
                    <th className="px-2 py-3 sm:px-4">Concepto</th>
                    <th className="px-1.5 py-3 text-right sm:px-3">Proyectado {symbol}</th>
                    <th className="px-1.5 py-3 text-right sm:px-3">Real {symbol}</th>
                    <th className="px-2 py-3 text-right sm:px-4">Avance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: BORDER }}>
                  {loading ? (
                    <tr>
                      <td className="py-10" colSpan={4}>
                        <div className="sticky left-0 w-[100cqw] text-center text-sm text-slate-400 md:w-full">Cargando estado de resultados...</div>
                      </td>
                    </tr>
                  ) : visibleRows.map((row) => {
                    const advance = row.projected ? (row.real / row.projected) * 100 : (row.real ? 100 : 0);
                    const rowColor = row.color || rowTone(row).color;
                    const rowBg = row.isTotal ? 'bg-[#EAF3FF]' : row.level === 0 ? 'bg-slate-50 hover:bg-slate-100' : 'hover:bg-white';
                    const isExpandable = Boolean(row.children?.length);
                    const isOpen = expandedRows[row.id] ?? (row.level || 0) === 0;
                    return (
                      <tr key={row.id} className={`transition-colors ${rowBg} ${isExpandable ? 'cursor-pointer' : ''}`} onClick={() => toggleRow(row)}>
                        <td className="px-2 py-2.5 sm:px-4 sm:py-3" style={{ boxShadow: row.isTotal ? `inset 4px 0 0 ${BLUE_DARK}` : `inset ${row.level ? 2 : 4}px 0 0 ${rowColor}` }}>
                          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3" style={{ paddingLeft: `${(row.level || 0) * 10}px` }}>
                            <button
                              type="button"
                              className={`income-no-print grid h-5 w-5 shrink-0 place-items-center rounded-md border text-xs sm:h-6 sm:w-6 ${isExpandable ? 'opacity-100' : 'opacity-0'}`}
                              style={{ borderColor: isExpandable ? rowColor : 'transparent', color: rowColor }}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleRow(row);
                              }}
                              tabIndex={isExpandable ? 0 : -1}
                              aria-label={isOpen ? 'Contraer fila' : 'Expandir fila'}
                            >
                              {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                            </button>
                            <span className={`hidden shrink-0 place-items-center rounded-md sm:grid ${row.level ? 'h-7 w-7 text-xs' : 'h-8 w-8'}`} style={{ background: row.level ? '#FFFFFF' : rowColor, color: row.level ? rowColor : '#FFFFFF', border: `1px solid ${rowColor}` }}>
                              {row.icon}
                            </span>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-[12px] font-semibold leading-tight sm:truncate sm:text-sm" style={{ color: row.isTotal || row.level === 0 ? rowColor : INK }} title={row.label}>
                                {row.code && <span className="mr-1 rounded bg-white px-1 py-0.5 text-[10px] font-bold sm:mr-2 sm:px-1.5 sm:text-xs" style={{ color: rowColor }}>{row.code}</span>}
                                {row.label}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-1.5 py-2.5 text-right text-[11px] font-semibold tabular-nums sm:px-3 sm:py-3 sm:text-sm" style={{ color: INK }}>{show(row.projected)}</td>
                        <td className="px-1.5 py-2.5 text-right text-[11px] font-bold tabular-nums sm:px-3 sm:py-3 sm:text-sm" style={{ color: row.real < 0 ? RED : INK }}>{show(row.real)}</td>
                        <td className="px-2 py-2.5 text-right sm:px-4 sm:py-3">
                          <span className="inline-block rounded-full px-1.5 py-1 text-[10px] font-bold tabular-nums sm:px-2.5 sm:text-xs" style={{ background: advance >= 100 ? '#EAF7EE' : '#F1F5F9', color: advance >= 100 ? GREEN : MUTED }}>
                            {pct(advance)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
              <div className="border-b px-5 py-4" style={{ borderColor: BORDER }}>
                <h3 className="flex items-center gap-2 font-semibold" style={{ color: INK }}><FiBarChart2 /> Composicion real</h3>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>Estructura visual de ingresos, costos y utilidad.</p>
              </div>
              <div className="h-[310px] px-3 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.chart} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 12 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" tickFormatter={short} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: MUTED }} width={88} axisLine={false} tickLine={false} />
                    <Tooltip content={<StatementTooltip formatter={show} />} cursor={{ fill: '#F8FAFC' }} />
                    <Bar dataKey="value" name="Monto" radius={[0, 8, 8, 0]}>
                      {report.chart.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="income-no-print rounded-md border bg-white p-5 shadow-sm" style={{ borderColor: BORDER }}>
              <h3 className="font-semibold" style={{ color: INK }}>Criterio contable usado</h3>
              <div className="mt-3 space-y-3 text-sm" style={{ color: MUTED }}>
                <p>Los ingresos reales salen de la operación diaria (transacciones registradas). El proyectado de ingresos y costos sale del flujo de caja estático del proyecto.</p>
                <p>Si el proyecto aún no tiene un flujo de caja estático guardado, el proyectado usa como referencia los lotes registrados y el presupuesto de obra.</p>
                <p>Impuesto a la renta e IGV se muestran como referencia gerencial, para facilitar lectura contable sin reemplazar cierre tributario.</p>
              </div>
            </section>
          </aside>
        </div>
        </div>
      </div>
    </>
  );
}

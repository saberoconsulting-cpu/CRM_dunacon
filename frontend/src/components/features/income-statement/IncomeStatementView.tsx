'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FiAlertTriangle, FiBarChart2, FiChevronDown, FiChevronRight, FiDollarSign, FiDownload, FiEdit3, FiFileText, FiGrid, FiMapPin, FiPlus, FiRefreshCw, FiTrendingUp, FiX } from 'react-icons/fi';
import { Toaster, toast, Field } from '@/components/ui/ui';
import { Select } from '@/components/ui/Select';
import { KpiCard as SharedKpiCard } from '@/components/ui/Metrics';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { api } from '@/lib/api';
import { printHtml } from '@/lib/print';
import { Lot, Project } from '@/lib/types';
import { useDisplayCurrency, formatCurrency, formatCurrencyShort } from '@/lib/currency';

/**
 * Version minima del sembrado del flujo dinamico que este componente considera
 * valida. Los registros anteriores a este arreglo podian ser una copia del flujo
 * estatico (por eso la columna Real terminaba igual a la Proyectada). Se exige
 * la marca `assumptions.dynamicSeedVersion` antes de usar sus montos.
 */
const DYNAMIC_SEED_VERSION = 1;

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
  partidas_er?: {
    lines?: Record<string, number | string>;
    computed?: Record<string, number | string>;
  };
  utilidad: number | string;
};

/**
 * Linea contable del Estado de Resultados. Cada partida pertenece a una linea:
 * los cargos restan (costo, ventas/admin, financiero, impuestos, IGV) y los
 * abonos suman (ingreso, ajuste).
 */
type StatementLine = 'ingreso' | 'costo' | 'ventas_admin' | 'financiero' | 'impuestos' | 'igv' | 'ajuste';

type StatementItem = {
  id: number;
  projectId: number;
  parentId?: number | null;
  line: StatementLine;
  code: string;
  name: string;
  description?: string | null;
  amount: string;
  currency: string;
  sortOrder: number;
  isActive: boolean;
};

type StatementTreeItem = StatementItem & { children: StatementTreeItem[] };
type StatementTreeItemWithSource = StatementTreeItem & { cashflowRowId?: string; isVirtual?: boolean };

type StatementLineMeta = {
  key: StatementLine;
  label: string;
  letter: string;
  color: string;
  soft: string;
  parent: string | null;
  helper: string;
};

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
const LABEL_KEY_PREFIX = 'crm_income_statement_labels_';
const DEFAULT_RUC = '20601820049';
const INCOME_TAX_RATE = 0.295;

/** Lineas maestras del cuadro: mismas del backend (`INCOME_STATEMENT_LINE_LABELS`). */
const LINES: StatementLineMeta[] = [
  { key: 'ingreso', label: 'Ingreso por venta de lotes', letter: 'I', color: GREEN, soft: '#F0FDF4', parent: null, helper: 'Ventas de lotes y otros ingresos que alimentan la utilidad bruta.' },
  { key: 'costo', label: 'Costo de venta de lotes', letter: 'C', color: COST, soft: COST_SOFT, parent: null, helper: 'Terreno, costos directos e indirectos de la venta.' },
  { key: 'ventas_admin', label: 'Gastos de ventas y administrativos', letter: 'D', color: AMBER, soft: '#FFF7ED', parent: null, helper: 'Comisiones, marketing y administracion del proyecto.' },
  { key: 'financiero', label: 'Gastos financieros', letter: 'E', color: '#7C3AED', soft: '#F5F3FF', parent: null, helper: 'Intereses y comisiones bancarias.' },
  { key: 'impuestos', label: 'Impuesto a la renta referencial', letter: 'F', color: RED, soft: '#FEF2F2', parent: null, helper: 'Referencia gerencial del 29.5% sobre la utilidad.' },
  { key: 'igv', label: 'IGV referencial incluido en ingresos', letter: 'G', color: '#0F766E', soft: '#F0FDFA', parent: null, helper: 'Separacion referencial del IGV contenido en los ingresos.' },
  { key: 'ajuste', label: 'Ajustes gerenciales referenciales', letter: 'H', color: BLUE_DARK, soft: BLUE_SOFT, parent: null, helper: 'Ajustes gerenciales que no forman parte del cierre tributario.' },
];

const LINE_BY_KEY = Object.fromEntries(LINES.map((line) => [line.key, line])) as Record<StatementLine, StatementLineMeta>;

function nextItemCode(items: StatementItem[], line: StatementLine, excludeId?: number) {
  const meta = LINE_BY_KEY[line];
  const count = items.filter((item) => item.line === line && !item.parentId && Number(item.id) !== Number(excludeId || 0)).length + 1;
  return `${meta?.letter || 'X'}.${String(count).padStart(2, '0')}`;
}

function childCodeFor(items: StatementItem[], parent: StatementItem, line: StatementLine, excludeId?: number) {
  const base = String(parent?.code || nextItemCode(items, line)).trim().replace(/-/g, '.');
  const count = items.filter((item) => Number(item.parentId || 0) === Number(parent.id) && Number(item.id) !== Number(excludeId || 0)).length;
  return `${base}.${String(count + 1).padStart(2, '0')}`;
}

function compareStatementItems(a: StatementItem, b: StatementItem) {
  return Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    || String(a.code || '').localeCompare(String(b.code || ''), 'es')
    || Number(a.id) - Number(b.id);
}

type CashflowModel = {
  assumptions?: Record<string, any>;
  rows?: CashflowRow[];
  bankSync?: {
    movementCount: number;
    lastBankMovementAt: string | null;
    modelUpdatedAt: string | null;
    stale: boolean;
  };
};
type CashflowRow = { id: string; label: string; values: number[]; parentId?: string };

/** Fila del cuadro: una linea contable fija, una partida editable o un subtotal. */
type SheetRow =
  | { kind: 'line'; id: string; line: StatementLine; label: string; level: 0; meta: StatementLineMeta }
  | { kind: 'item'; id: string; line: StatementLine; label: string; level: number; meta: StatementLineMeta; item: StatementTreeItemWithSource; hasChildren: boolean }
  | { kind: 'computed'; id: string; line: StatementLine; label: string; level: 0; meta: StatementLineMeta };


/** Iconos inline del cuadro (elegidos por linea; no dependen de react-icons). */
function LineIcon({ line, size = 14 }: { line: StatementLine; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (line === 'ingreso') return <svg {...common}><path d="M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 3 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3" /></svg>;
  if (line === 'costo') return <svg {...common}><path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" /><path d="m3 8.5 9 5.5 9-5.5M12 21v-7" /></svg>;
  if (line === 'ventas_admin') return <svg {...common}><path d="M19 21V8M15 21V11M11 21V5M7 21v-8M3 21h18" /></svg>;
  if (line === 'financiero') return <svg {...common}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10.5h20" /></svg>;
  if (line === 'impuestos') return <svg {...common}><path d="M19 5 5 19" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></svg>;
  if (line === 'igv') return <svg {...common}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M9 14h6M9 17h4" /></svg>;
  return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
}

type CashflowSectionPartida = {
  line: StatementLine;
  /** Seccion del flujo de caja que gobierna la linea (id del padre). */
  section: string;
  /** Filas hijas del flujo que se muestran como partidas, en su orden natural. */
  children: Array<{ code: string; id: string; label: string }>;
  /** Partida mostrada si el flujo no expone filas hijas (seccion total). */
  single?: { code: string; id: string; label: string };
};

const LINE_CASHFLOW_SECTIONS: CashflowSectionPartida[] = [
  {
    line: 'ingreso',
    section: 'income',
    children: [
      { code: 'A.01', id: 'initial-fee', label: 'Cuota inicial' },
      { code: 'A.02', id: 'financing-fee', label: 'Cuota financiamiento (lotes que pagan cuota)' },
    ],
    single: { code: 'A.01', id: 'income', label: 'Ingreso por venta de lotes' },
  },
  {
    line: 'costo',
    section: 'cost-sales',
    children: [
      { code: 'C.01', id: 'land', label: 'Costo de Terreno' },
      { code: 'C.02', id: 'direct', label: 'Costo Directo' },
      { code: 'C.03', id: 'indirect', label: 'Costo Indirecto' },
    ],
  },
  {
    line: 'ventas_admin',
    section: 'selling',
    children: [
      { code: 'D.01', id: 'sales-plan', label: 'Gastos de Administración (Planilla)' },
      { code: 'D.02', id: 'marketing', label: 'Marketing Digital (1.5% de Ventas)' },
      { code: 'D.03', id: 'commission', label: 'Comisión de Ventas (3% de Ventas)' },
      { code: 'D.04', id: 'post-sale', label: 'Post Venta (1% de Ventas)' },
      { code: 'D.05', id: 'discounts', label: 'Descuentos (bonos) (10% de Ventas)' },
    ],
  },
  {
    line: 'financiero',
    section: 'financial',
    children: [],
    single: { code: 'E.01', id: 'financial', label: 'Gastos financieros' },
  },
  {
    line: 'impuestos',
    section: 'tax',
    children: [],
    single: { code: 'F.01', id: 'tax', label: 'Impuesto a la renta referencial' },
  },
  {
    line: 'igv',
    section: 'igv',
    children: [],
    single: { code: 'G.01', id: 'igv', label: 'IGV Referencial Incluido en Ingresos' },
  },
];

const LINE_CASHFLOW_TOTAL_ROWS: Record<StatementLine, string[]> = {
  ingreso: ['income'],
  costo: ['cost-sales', 'land', 'direct', 'indirect'],
  ventas_admin: ['selling'],
  financiero: ['financial'],
  impuestos: ['tax'],
  igv: ['igv'],
  ajuste: ['managerial-adjustment'],
};

const STATEMENT_CASHFLOW_ROW_MAP: Array<[StatementLine | null, string[], string]> = [
  ['ingreso', ['ingreso por venta de lotes', 'venta de lotes', 'ventas de lotes'], 'income'],
  ['costo', ['costo de venta de lotes'], 'cost-sales'],
  ['costo', ['costo de terreno', 'costos de terreno', 'terreno'], 'land'],
  ['costo', ['costo directo', 'costos directos'], 'direct'],
  ['costo', ['costo indirecto', 'costos indirectos'], 'indirect'],
  ['ventas_admin', ['gastos de ventas y administrativos', 'ventas y administracion'], 'selling'],
  ['ventas_admin', ['planilla', 'planillas', 'sueldos'], 'sales-plan'],
  ['ventas_admin', ['marketing', 'publicidad', 'mkt'], 'marketing'],
  ['ventas_admin', ['comision', 'comisiones'], 'commission'],
  ['ventas_admin', ['post venta', 'postventa'], 'post-sale'],
  ['ventas_admin', ['descuento', 'bono'], 'discounts'],
  ['financiero', ['intereses de prestamos', 'interes de prestamo'], 'loan-interest'],
  ['financiero', ['comisiones bancarias', 'comision bancaria'], 'bank-commissions'],
  ['financiero', ['gastos financieros', 'financiero', 'intereses', 'prestamo'], 'financial'],
  ['impuestos', ['impuesto a la renta', 'impuesto', 'renta'], 'tax'],
  ['igv', ['igv'], 'igv'],
  ['ajuste', ['ajuste gerencial', 'ajustes gerenciales'], 'managerial-adjustment'],
];

const STATEMENT_CASHFLOW_CODE_MAP: Array<[StatementLine, string, string]> = [
  ['ventas_admin', 'd 01', 'sales-plan'],
  ['ventas_admin', 'd 02', 'marketing'],
  ['ventas_admin', 'd 03', 'commission'],
  ['ventas_admin', 'd 04', 'maintenance-condominium'],
  ['financiero', 'e 01', 'loan-interest'],
  ['financiero', 'e 02', 'bank-commissions'],
  ['ajuste', 'h 01', 'managerial-adjustment'],
];

const CASHFLOW_ROW_ALIASES: Record<string, string[]> = {
  'sales-plan': ['planilla', 'planillas', 'sueldos', 'gastos de administracion'],
  marketing: ['marketing', 'publicidad', 'mkt'],
  commission: ['comision de ventas', 'comision venta', 'comisiones de ventas'],
  'maintenance-condominium': ['mantenimiento', 'condominio'],
  'loan-interest': ['intereses de prestamos', 'interes de prestamo', 'intereses', 'prestamo'],
  'bank-commissions': ['comisiones bancarias', 'comision bancaria'],
  'post-sale': ['post venta', 'postventa'],
  discounts: ['descuentos', 'descuento', 'bonos', 'bono'],
  financial: ['gastos financieros', 'financiero'],
  tax: ['impuesto a la renta', 'impuesto', 'renta'],
  igv: ['igv'],
  'managerial-adjustment': ['ajuste gerencial', 'ajustes gerenciales'],
};

function statementCashflowKey(item: Pick<StatementItem, 'line' | 'code' | 'name'>): string | null {
  const code = normalizeMatch(item.code);
  const name = normalizeMatch(item.name);
  const codeMapping = STATEMENT_CASHFLOW_CODE_MAP.find(([line, value]) => line === item.line && code === value);
  if (codeMapping) return codeMapping[2];
  const text = `${code} ${name}`.trim();
  for (const [line, needles, target] of STATEMENT_CASHFLOW_ROW_MAP) {
    if (line && line !== item.line) continue;
    if (needles.some((needle) => text.includes(needle))) return target;
  }
  return null;
}

function findCashflowRow(model: CashflowModel | null, item: Pick<StatementItem, 'line' | 'code' | 'name'>) {
  const target = statementCashflowKey(item);
  if (!target) return undefined;
  const rows = model?.rows || [];
  const targetKey = normalizeMatch(target);
  const byId = rows.find((row) => normalizeMatch(row.id) === targetKey);
  if (byId) return byId;
  const aliases = CASHFLOW_ROW_ALIASES[target] || [];
  return rows.find((row) => {
    const label = normalizeMatch(row.label);
    if (target === 'loan-interest' || target === 'bank-commissions') {
      if (normalizeMatch(row.id) === 'financial' || normalizeMatch(row.label) === 'gastos financieros') return false;
      if (label.includes('interes') && label.includes('comision')) return false;
    }
    return aliases.some((alias) => label.includes(alias));
  });
}

function cashflowRowTotal(row: CashflowRow | undefined) {
  return (row?.values || []).reduce((sum, value) => sum + num(value), 0);
}

/** Construye el arbol de partidas (padres con sus subpartidas ordenadas). */
function buildTree(items: StatementItem[]): StatementTreeItem[] {
  const normalized = items.map((item) => ({
    ...item,
    id: Number(item.id),
    parentId: item.parentId == null ? null : Number(item.parentId),
    sortOrder: Number(item.sortOrder || 0),
    children: [] as StatementTreeItem[],
  }));
  const childrenOf = new Map<number, StatementTreeItem[]>();
  for (const item of normalized) {
    if (!item.parentId) continue;
    childrenOf.set(item.parentId, [...(childrenOf.get(item.parentId) || []), item]);
  }
  const withChildren = (item: StatementTreeItem): StatementTreeItem => ({
    ...item,
    children: (childrenOf.get(Number(item.id)) || []).sort(compareStatementItems).map(withChildren),
  });
  return normalized.filter((item) => !item.parentId).sort(compareStatementItems).map(withChildren);
}

/** Monto real de una partida: si tiene subpartidas, suma solo las hojas. */
function itemRealAmount(item: StatementTreeItem): number {
  if (item.children.length) return item.children.reduce((sum, child) => sum + itemRealAmount(child), 0);
  return num(item.amount);
}


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

function normalizeMatch(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function deviation(real: number, projected: number) {
  if (!projected) return real ? 100 : 0;
  return ((real - projected) / projected) * 100;
}

/** Participacion de cada linea sobre el ingreso total real (la primera linea es 100%). */
function incomeShare(real: number, totalIncome: number) {
  if (!totalIncome) return real ? 100 : 0;
  return (real / totalIncome) * 100;
}

function lotRevenue(lot: Lot) {
  return num(lot.finalPrice || lot.salePrice || lot.price);
}

/**
 * Indice de un modelo de flujo de caja. Ademas de los montos por id/label, expone
 * la jerarquia (`childrenByParent`) y un mapa de claves normalizadas hacia el id
 * canonico de la fila (`rowIdByKey`), de modo que una subpartida pueda resolverse
 * por nombre ACOTADO a los hijos de su fila padre (evita colapsar sobre el total
 * del padre cuando hay nombres repetidos en secciones distintas).
 */
type FlowIndex = {
  totals: Map<string, number>;
  labels: Map<string, string>;
  byId: Map<string, number>;
  byLabel: Map<string, number>;
  childrenByParent: Map<string, CashflowRow[]>;
  rowIdByKey: Map<string, string>;
};

function cashflowTotals(model: CashflowModel | null): FlowIndex {
  const totals = new Map<string, number>();
  const labels = new Map<string, string>();
  // Dos indices SEPARADOS: uno por id tecnico y otro por label normalizado. Antes
  // ambas claves se volcaban en un MISMO mapa sumando montos, por lo que una fila
  // era alcanzable por dos claves y el matching difuso la contaba dos veces
  // (duplicando montos entre partidas distintas). Ahora cada mapa guarda exactamente
  // un valor por fila y nunca se suman.
  const byId = new Map<string, number>();
  const byLabel = new Map<string, number>();
  const childrenByParent = new Map<string, CashflowRow[]>();
  const rowIdByKey = new Map<string, string>();
  for (const row of model?.rows || []) {
    const total = (row.values || []).reduce((sum, value) => sum + num(value), 0);
    totals.set(row.id, total);
    labels.set(row.id, row.label || row.id);
    const idKey = normalizeMatch(row.id);
    const labelKey = normalizeMatch(row.label);
    if (idKey) byId.set(idKey, total);
    if (labelKey && !byId.has(labelKey)) byLabel.set(labelKey, total);
    // Jerarquia: los hijos se indexan por el id del padre (clave normalizada).
    if (row.parentId) {
      const parentKey = normalizeMatch(row.parentId);
      if (parentKey) childrenByParent.set(parentKey, [...(childrenByParent.get(parentKey) || []), row]);
      const parentExact = rowIdByKey.get(parentKey) || row.parentId;
      rowIdByKey.set(parentKey, parentExact);
    }
    // Claves -> id canonico. El id tiene prioridad sobre el label.
    if (idKey) rowIdByKey.set(idKey, row.id);
    if (labelKey && !rowIdByKey.has(labelKey)) rowIdByKey.set(labelKey, row.id);
  }
  return { totals, labels, byId, byLabel, childrenByParent, rowIdByKey };
}

/**
 * Id de la fila del flujo que corresponde a una partida del cuadro (su "clave").
 * Se usa para acotar la busqueda de sus subpartidas a los hijos de esa fila:
 * 1) la fila asignada explicitamente (`cashflowRowId`), 2) el mapeo por codigo/nombre
 * de la partida (`statementCashflowKey`) resuelto contra el index, 3) el propio
 * nombre/codigo de la partida.
 */
function parentFlowKeyFor(
  index: FlowIndex,
  item: StatementTreeItemWithSource | null | undefined,
): string | null {
  if (!item) return null;
  if (item.cashflowRowId != null) {
    const key = normalizeMatch(item.cashflowRowId);
    if (key) return index.rowIdByKey.get(key) || item.cashflowRowId;
  }
  const mapped = statementCashflowKey(item);
  if (mapped) {
    const key = normalizeMatch(mapped);
    if (index.rowIdByKey.has(key)) return index.rowIdByKey.get(key) || mapped;
  }
  const name = normalizeMatch(item.name);
  if (name && index.rowIdByKey.has(name)) return index.rowIdByKey.get(name) || null;
  const code = normalizeMatch(item.code);
  if (code && index.rowIdByKey.has(code)) return index.rowIdByKey.get(code) || null;
  return null;
}

function matchedFlowTotal(
  index: FlowIndex,
  item: { code?: string | null; name?: string | null; cashflowRowId?: string | null; parentId?: number | null },
  parentFlowKey?: string | null,
  fallback = 0,
): number {
  if (item.cashflowRowId != null) {
    const mapped = index.byId.get(normalizeMatch(item.cashflowRowId));
    if (mapped != null) return mapped;
  }
  // Subpartida (a cualquier nivel): busca por nombre ACOTADO a los hijos de la fila
  // padre cuando se conoce la clave del padre. Asi dos subpartidas homonimas en
  // secciones distintas no se confunden entre si y nunca colapsan sobre el padre.
  const name = normalizeMatch(item.name);
  if (parentFlowKey) {
    const parentKey = normalizeMatch(parentFlowKey);
    const siblings = index.childrenByParent.get(parentKey) || [];
    if (name) {
      const child = siblings.find((row) => normalizeMatch(row.label) === name);
      if (child) return (child.values || []).reduce((sum, value) => sum + num(value), 0);
    }
    const code = normalizeMatch(item.code);
    if (code) {
      const child = siblings.find((row) => normalizeMatch(row.id) === code || normalizeMatch(row.label) === code);
      if (child) return (child.values || []).reduce((sum, value) => sum + num(value), 0);
    }
  }
  if (name) {
    const byName = index.byLabel.get(name) ?? index.byId.get(name);
    if (byName != null) return byName;
  }
  const code = normalizeMatch(item.code);
  if (code) {
    const byCode = index.byId.get(code) ?? index.byLabel.get(code);
    if (byCode != null) return byCode;
  }
  if (!item.parentId) {
    const name = normalizeMatch(item.name);
    if (name) {
      const byName = index.byId.get(name) ?? index.byLabel.get(name);
      if (byName != null) return byName;
    }
  }
  return fallback;
}

function cashflowRowAmount(source: Map<string, number>, rowId: string | null | undefined): number | null {
  if (rowId == null) return null;
  const key = normalizeMatch(rowId);
  if (!key) return null;
  const value = source.get(key);
  return value == null ? null : value;
}

function cashflowLineTotal(totals: Map<string, number>, line: StatementLine, fallback: number) {
  const ids = LINE_CASHFLOW_TOTAL_ROWS[line] || [];
  if (!ids.some((id) => totals.has(id))) return fallback;
  if (line === 'costo' && totals.has('cost-sales')) return totals.get('cost-sales') || 0;
  return ids.reduce((sum, id) => sum + (totals.get(id) || 0), 0);
}

function cashflowLineAmount(model: CashflowModel | null, line: StatementLine, fallback: number) {
  if (line === 'ajuste') {
    const adjustment = findCashflowRow(model, { line, code: '', name: LINE_BY_KEY.ajuste.label });
    if (adjustment) return cashflowRowTotal(adjustment);
  }
  return cashflowLineTotal(cashflowTotals(model).totals, line, fallback);
}

/**
 * Colores de la fila segun su naturaleza: ingresos en verde, costo de venta en
 * el grupo indigo, impuestos/IGV en ambar y los subtotales en gris.
 */
function rowTone(row: SheetRow) {
  const line = row.kind === 'computed'
    ? (row.id === 'net' || row.id === 'adjusted' ? 'ajuste' : 'costo')
    : row.line;
  if (line === 'costo') return { bg: COST_SOFT, color: COST, border: COST_BORDER };
  if (line === 'ingreso') return { bg: '#F0FDF4', color: GREEN, border: '#BBF7D0' };
  if (line === 'ajuste') return { bg: BLUE_SOFT, color: BLUE_DARK, border: '#BFDBFE' };
  if (line === 'impuestos' || line === 'igv') return { bg: '#FFF7ED', color: AMBER, border: '#FED7AA' };
  return { bg: '#F8FAFC', color: INK, border: BORDER };
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
    <div className="min-w-0 rounded-md border bg-white px-3 py-2 sm:px-4 sm:py-2.5" style={{ borderColor: BORDER }}>
      <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }} title={label}>{label}</p>
      <p className="mt-0.5 truncate text-center text-sm font-bold tabular-nums sm:text-base" style={{ color }} title={value}>{value}</p>
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

/** Estilos del PDF de Estado de Resultados (se inyectan en el iframe de printHtml). */
const PDF_STYLES = `
  body{font-family:Arial,Helvetica,sans-serif;margin:22px;color:#0F172A;background:white}
  .brand{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:3px solid #0866E5;padding-bottom:14px;margin-bottom:14px}
  .brand img{height:42px;max-width:180px;object-fit:contain}
  .eyebrow{margin:0 0 5px;color:#0866E5;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
  h1{margin:0;font-size:23px;line-height:1.15;color:#111827}
  h2{font-size:12px;margin:16px 0 7px;color:#063B87;text-transform:uppercase;letter-spacing:.05em}
  p{margin:3px 0 0;color:#64748B;font-size:11px}
  .meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:6px}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:8px 0 4px}
  .card{border:1px solid #E2E8F0;border-top:3px solid #0866E5;border-radius:6px;background:#FFFFFF;padding:9px 10px}
  .card-label{margin:0;color:#6B7280;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
  .card-value{margin:4px 0 0;font-size:15px;font-weight:800;line-height:1.1}
  .card-helper{margin:3px 0 0;color:#6B7280;font-size:8px}
  .pills{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:8px 0 4px}
  .pill{border:1px solid #E2E8F0;border-radius:6px;background:#F8FAFC;padding:8px 10px}
  .pill-label{margin:0;color:#64748B;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
  .pill-value{margin:4px 0 0;color:#0F172A;font-size:12px;font-weight:800}
  table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:6px;background:white}
  th{background:#0866E5;color:white;border:1px solid #0866E5;padding:7px 6px;font-size:8px;text-align:left;text-transform:uppercase;letter-spacing:.03em}
  th.num,td.num{text-align:right;white-space:nowrap}
  td{border:1px solid #E2E8F0;padding:6px;font-size:9px;vertical-align:top}
  .concept-name{display:block;font-weight:600;color:#0F172A}
  .concept-note{display:block;color:#6B7280;font-size:8px}
  .cell-child{padding-left:16px}
  .row-cost{background:#EEF2FF}
  .row-income{background:#F0FDF4}
  .row-subtotal{background:#F8FAFC;font-weight:700}
  .row-tax{background:#FFF7ED}
  .row-final{background:#EAF3FF;font-weight:700}
  .footer{margin-top:16px;border-top:1px solid #E2E8F0;padding-top:8px;color:#6B7280;font-size:9px;text-align:right}
  @media print{body{margin:14px}thead{display:table-header-group}tr{break-inside:avoid}.cards,.pills{break-inside:avoid}}
`;

/**
 * Arma el documento HTML imprimible del Estado de Resultados: encabezado de
 * marca, cards de indicadores, pills de precios/areas y el cuadro completo.
 */
function buildPdfHtml({ logoUrl, projectName, today, metaHtml, cardsHtml, pillsHtml, rowsHtml }: {
  logoUrl: string;
  projectName: string;
  today: string;
  metaHtml: string;
  cardsHtml: string;
  pillsHtml: string;
  rowsHtml: string;
}) {
  return `
    <html>
      <head>
        <title>Estado de Resultados - ${escapeForPdf(projectName)}</title>
        <style>${PDF_STYLES}</style>
      </head>
      <body>
        <div class="brand">
          <div>
            <p class="eyebrow">Reporte contable</p>
            <h1>Estado de Resultados</h1>
            <div class="meta">${metaHtml}</div>
          </div>
          <img src="${escapeForPdf(logoUrl)}" alt="Dunacon" />
        </div>

        <h2>Indicadores principales</h2>
        <div class="cards">${cardsHtml}</div>

        <h2>Precios y areas</h2>
        <div class="pills">${pillsHtml}</div>

        <h2>Resultado economico del proyecto</h2>
        <table>
          <colgroup>
            <col style="width:40%" /><col style="width:16%" /><col style="width:16%" /><col style="width:13%" /><col style="width:15%" />
          </colgroup>
          <thead>
            <tr>
              <th>Concepto</th>
              <th class="num">Proyectado</th>
              <th class="num">Real</th>
              <th class="num">% Ingreso</th>
              <th class="num">Desviacion</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div class="footer">CRM - DUNACON &middot; Documento gerencial de referencia, no reemplaza el cierre tributario.</div>
      </body>
    </html>
  `;
}

/** Escapa texto para HTML en el PDF (mismo criterio que las demas vistas). */
function escapeForPdf(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  // Partidas editables del cuadro (con subpartidas), persistidas en backend.
  const [items, setItems] = useState<StatementItem[]>([]);
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({});
  const [openLines, setOpenLines] = useState<Record<StatementLine, boolean>>({
    ingreso: false,
    costo: false,
    ventas_admin: false,
    financiero: false,
    impuestos: false,
    igv: false,
    ajuste: false,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StatementItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Omit<StatementItem, 'amount'>> & { amount?: number | string }>({});
  // Al exportar a PDF se fuerzan abiertas todas las subpartidas.
  const [printing, setPrinting] = useState(false);
  // Modelo de Flujo de Caja Estático: fuente del Proyectado.
  const [cashflow, setCashflow] = useState<CashflowModel | null>(null);
  // Modelo de Flujo de Caja Dinámico: fuente del Real cuando existe.
  const [dynamicCashflow, setDynamicCashflow] = useState<CashflowModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [ruc, setRuc] = useState(DEFAULT_RUC);
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const { currency, setCurrency, exchangeRate, setExchangeRate } = useDisplayCurrency();
  // Simbolo para los encabezados de la tabla segun la moneda activa.
  const symbol = String(currency).toUpperCase() === 'USD' ? 'US$' : 'S/';
  // El Estado de Resultados alimenta su columna "Real" desde el flujo de caja,
  // que se maneja en dolares. La pantalla puede mostrarse en soles con el toggle:
  // en ese caso se MULTIPLICA por el tipo de cambio (solo visual, el dato guardado
  // sigue en dolares). En US$ el monto se pinta tal cual.
  const toDisplay = (value: number | string | null | undefined) => (String(currency).toUpperCase() === 'PEN' ? Number(value || 0) * exchangeRate : Number(value || 0));
  const showUsdBase = (value: number | string | null | undefined) => formatCurrency(
    toDisplay(value),
    currency,
  );
  // Version abreviada (US$ 3.2M / S/ 12k) para ejes de graficos.
  const showUsdBaseShort = (value: number | string | null | undefined) => formatCurrencyShort(
    toDisplay(value),
    currency,
  );

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
      const saved = localStorage.getItem(`${LABEL_KEY_PREFIX}${projectId}`);
      setLabelOverrides(saved ? JSON.parse(saved) : {});
    } catch {
      setLabelOverrides({});
    }
  }, [projectId]);

  useEffect(() => {
    try {
      localStorage.setItem(`${LABEL_KEY_PREFIX}${projectId}`, JSON.stringify(labelOverrides));
    } catch { }
  }, [projectId, labelOverrides]);

  useEffect(() => {
    try {
      localStorage.setItem(`${RUC_KEY_PREFIX}${projectId}`, ruc);
    } catch { }
  }, [projectId, ruc]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projectData, statementData, lotData, cashflowData, dynamicCashflowData, itemsData] = await Promise.all([
        api.get<Project>(`/projects/${projectId}`),
        api.get<IncomeStatement>(`/finances/income-statement?projectId=${projectId}`),
        loadAllLots(projectId),
        api.get<CashflowModel | null>(`/cashflow/model?projectId=${projectId}&mode=estatico`).catch(() => null),
        api.get<CashflowModel | null>(`/cashflow/model?projectId=${projectId}&mode=dinamico`).catch(() => null),
        api.get<{ items?: StatementItem[] }>(`/income-statement?projectId=${projectId}`).catch(() => ({ items: [] })),
      ]);
      setProject(projectData);
      setStatement(statementData);
      setLots(lotData);
      setCashflow(cashflowData && Array.isArray(cashflowData.rows) ? cashflowData : null);
      // Salvaguarda: los modelos dinamicos guardados ANTES del arreglo podian ser
      // una copia del estatico (mismo monto en Real y Proyectado). Si el registro
      // no trae la marca de version del sembrado dinamico, se ignora; se regenerara
      // al abrir el flujo de caja en modo dinamico.
      const dynamicIsClean = dynamicCashflowData
        && Array.isArray(dynamicCashflowData.rows)
        && Number((dynamicCashflowData.assumptions || {}).dynamicSeedVersion || 0) >= DYNAMIC_SEED_VERSION;
      setDynamicCashflow(dynamicIsClean ? dynamicCashflowData : null);
      setItems(Array.isArray(itemsData?.items) ? itemsData.items : []);
    } catch (error: any) {
      toast(error?.message || 'No se pudo cargar el estado de resultados', 'err');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Con un modal abierto se bloquea el scroll del fondo (mismo criterio que
  // Presupuesto de Obra) para que el Select no descoloque la pagina.
  useEffect(() => {
    if (!modalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [modalOpen]);

  const report = useMemo(() => {
    const classes = statement?.egresos_clasificados || {};
    const projected = statement?.proyectado || {};
    // Proyectado: sale del Flujo de Caja Estático del proyecto (modo 'estatico').
    // El total de cada fila es la suma de sus valores por año. Si aún no hay modelo
    // guardado, se cae a la lógica anterior (lotes + presupuesto) como referencia.
    const { totals: cfTotals } = cashflowTotals(cashflow);
    const { totals: dynamicCfTotals } = cashflowTotals(dynamicCashflow);
    // Real: sale UNICAMENTE del Flujo de Caja Dinámico (modo 'dinamico'), que se
    // alimenta de Cuentas y Bancos. No se mezcla con el estático.
    const cf = (id: string, fallback: number) => cfTotals.has(id) ? (cfTotals.get(id) ?? 0) : fallback;
    const realCf = (id: string, fallback: number) => dynamicCfTotals.has(id) ? (dynamicCfTotals.get(id) ?? 0) : fallback;
    const projectedRevenue = cf('income', lots.reduce((sum, lot) => sum + lotRevenue(lot), 0));
    const totalArea = lots.reduce((sum, lot) => sum + num(lot.areaM2), 0);
    const soldLots = lots.filter((lot) => lot.status === 'vendido').length;
    const realRevenue = realCf('income', num(statement?.ingresos));
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
    const costOfSales = cashflowLineTotal(dynamicCfTotals, 'costo', landCost + directCost + indirectCost);
    const grossProfit = realRevenue - costOfSales;
    const realSalesAdminFromFlow = cashflowLineTotal(dynamicCfTotals, 'ventas_admin', salesAdminCost);
    const realFinanceFromFlow = cashflowLineTotal(dynamicCfTotals, 'financiero', financeCost);
    const operatingProfit = grossProfit - realSalesAdminFromFlow;
    const preTaxProfit = operatingProfit - realFinanceFromFlow;
    const incomeTax = Math.max(0, preTaxProfit * INCOME_TAX_RATE);
    const netProfit = preTaxProfit - Math.max(realTaxRegistered, incomeTax);
    const igvReference = realCf('igv', realRevenue > 0 ? realRevenue * 18 / 118 : 0);
    const adjustedProfit = netProfit - igvReference;
    const projectedGrossProfit = projectedRevenue - projectedCostOfSales;
    const projectedOperatingProfit = projectedGrossProfit - projectedSalesAdmin;
    const projectedPreTaxProfit = projectedOperatingProfit - projectedFinanceTax;
    const projectedIncomeTax = cf('tax', Math.max(0, projectedPreTaxProfit * INCOME_TAX_RATE));
    const projectedNetProfit = projectedPreTaxProfit - projectedIncomeTax;
    const projectedIgv = cf('igv', projectedRevenue > 0 ? projectedRevenue * 18 / 118 : 0);

    // Reales por linea: manda UNICAMENTE el flujo DINAMICO (data de Cuentas y Bancos).
    // Solo si el flujo no expone la linea se cae a las partidas propias del ER.
    const lineTotals = (statement?.partidas_er?.lines || {}) as Record<string, number | string>;
    const hasPartidas = items.length > 0;
    const realIncome = cashflowLineTotal(dynamicCfTotals, 'ingreso', hasPartidas ? num(lineTotals.ingreso) : realRevenue);
    const realCostOfSales = cashflowLineTotal(dynamicCfTotals, 'costo', hasPartidas ? num(lineTotals.costo) : costOfSales);
    const realSalesAdmin = cashflowLineTotal(dynamicCfTotals, 'ventas_admin', hasPartidas ? num(lineTotals.ventas_admin) : realSalesAdminFromFlow);
    const realFinance = cashflowLineTotal(dynamicCfTotals, 'financiero', hasPartidas ? num(lineTotals.financiero) : realFinanceFromFlow);
    const realIgv = cashflowLineTotal(dynamicCfTotals, 'igv', hasPartidas ? num(lineTotals.igv) : igvReference);
    const realTax = cashflowLineTotal(dynamicCfTotals, 'impuestos', hasPartidas ? num(lineTotals.impuestos) : Math.max(realTaxRegistered, incomeTax));
    const realGrossProfit = realIncome - realCostOfSales;
    const realOperatingProfit = realGrossProfit - realSalesAdmin;
    const realPreTaxProfit = realOperatingProfit - realFinance;
    const realNetProfit = realPreTaxProfit - realTax;
    const realAdjustment = cashflowLineAmount(dynamicCashflow, 'ajuste', 0);
    const realAdjustedProfit = realNetProfit - realIgv + realAdjustment;

    return {
      totalArea,
      soldLots,
      projectedRevenue,
      realRevenue: realIncome,
      netProfit: realNetProfit,
      adjustedProfit: realAdjustedProfit,
      costOfSales: realCostOfSales,
      operatingCost: realSalesAdmin,
      financeCost: realFinance,
      margin: realIncome > 0 ? (realNetProfit / realIncome) * 100 : 0,
      projectedM2: totalArea > 0 ? projectedRevenue / totalArea : 0,
      realM2: totalArea > 0 ? realIncome / totalArea : 0,
      // Proyectado de cada linea, usado por el cuadro editable.
      projectedCostOfSales,
      projectedSalesAdmin,
      projectedFinanceTax,
      projectedIncomeTax,
      projectedIgv,
      projectedNetProfit,
      projectedChart: [
        { name: 'Ingresos', value: projectedRevenue, color: GREEN },
        { name: 'Costo venta', value: projectedCostOfSales, color: BLUE },
        { name: 'Ventas/Admin', value: projectedSalesAdmin, color: AMBER },
        { name: 'Financiero', value: projectedFinanceTax, color: '#7C3AED' },
        { name: 'Utilidad neta', value: projectedNetProfit, color: projectedNetProfit >= 0 ? BLUE_DARK : RED },
      ],
      chart: [
        { name: 'Ingresos', value: realIncome, color: GREEN },
        { name: 'Costo venta', value: realCostOfSales, color: BLUE },
        { name: 'Ventas/Admin', value: realSalesAdmin, color: AMBER },
        { name: 'Financiero', value: realFinance, color: '#7C3AED' },
        { name: 'Utilidad neta', value: realNetProfit, color: realNetProfit >= 0 ? BLUE_DARK : RED },
      ],
    };
  }, [lots, statement, cashflow, dynamicCashflow, items]);

  /** Arbol de partidas por linea (padres + subpartidas), ya ordenado. */
  const treeByLine = useMemo(() => {
    const { labels: projectedLabels } = cashflowTotals(cashflow);
    const projectedIndex = cashflowTotals(cashflow);
    const { totals: projectedTotals } = projectedIndex;
    const realIndex = cashflowTotals(dynamicCashflow);
    const { totals: realTotals } = realIndex;
    const flowValue = (rowId: string, isProjected: boolean, fallback = 0) => {
      const index = isProjected ? projectedIndex : realIndex;
      const totals = isProjected ? projectedTotals : realTotals;
      return matchedFlowTotal(index, { cashflowRowId: rowId, code: rowId, name: rowId }, null, totals.has(rowId) ? totals.get(rowId) || 0 : fallback);
    };
    // Filas del flujo indexadas por id y por label, igual que Presupuesto de Obra,
    // para poder resolver una partida tanto por su id como por su nombre.
    const staticRows = cashflow?.rows || [];
    const dynamicRows = dynamicCashflow?.rows || [];
    const findFlowRow = (id: string) => staticRows.find((row) => normalizeMatch(row.id) === normalizeMatch(id))
      || dynamicRows.find((row) => normalizeMatch(row.id) === normalizeMatch(id));
    const labelFor = (id: string, fallback: string) =>
      findFlowRow(id)?.label || projectedLabels.get(id) || fallback;
    const financialChildRows = () => {
      const rows = [...staticRows, ...dynamicRows].filter((row) => normalizeMatch(row.parentId) === 'financial');
      const seen = new Set<string>();
      return rows.filter((row) => {
        const key = normalizeMatch(row.id || row.label);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const LINE_ID_OFFSET: Record<StatementLine, number> = {
      ingreso: 0, costo: 1, ventas_admin: 2, financiero: 3, impuestos: 4, igv: 5, ajuste: 6,
    };
    const partida = (index: number, line: StatementLine, code: string, id: string, label: string): StatementTreeItemWithSource => ({
      id: -1000 - LINE_ID_OFFSET[line] * 100 - index,
      projectId,
      parentId: null,
      line,
      code,
      name: labelFor(id, label),
      description: null,
      amount: '0',
      currency: 'PEN',
      sortOrder: (index + 1) * 10,
      isActive: true,
      children: [],
      cashflowRowId: id,
      isVirtual: true,
    });
    const sectionPartidas = (line: StatementLine): StatementTreeItemWithSource[] => {
      const def = LINE_CASHFLOW_SECTIONS.find((entry) => entry.line === line);
      if (!def) return [];
      if (line === 'financiero') {
        const children = financialChildRows();
        if (children.length) {
          return children.map((child, index) => partida(index, line, `E.${String(index + 1).padStart(2, '0')}`, child.id, child.label || child.id));
        }
      }
      // Filas que existen en cualquiera de los dos flujos
      const present = def.children.filter((child) => 
        staticRows.some((row) => normalizeMatch(row.id) === normalizeMatch(child.id)) ||
        dynamicRows.some((row) => normalizeMatch(row.id) === normalizeMatch(child.id))
      );
      if (present.length) return present.map((child, index) => partida(index, line, child.code, child.id, child.label));
      if (def.single && findFlowRow(def.single.id)) return [partida(0, line, def.single.code, def.single.id, def.single.label)];
      return [];
    };
    const tree = buildTree(items);
    const grouped: Record<StatementLine, StatementTreeItem[]> = {
      ingreso: [], costo: [], ventas_admin: [], financiero: [], impuestos: [], igv: [], ajuste: [],
    };
    for (const item of tree) {
      if (grouped[item.line]) grouped[item.line].push(item);
    }
    (['ingreso', 'costo', 'ventas_admin', 'financiero', 'impuestos', 'igv'] as StatementLine[]).forEach((line) => {
      const flowPartidas = sectionPartidas(line) as StatementTreeItem[];
      if (!flowPartidas.length) return;
      const mapped = new Set(flowPartidas.map((item) => (item as StatementTreeItemWithSource).cashflowRowId).filter(Boolean) as string[]);
      const ownItems = (grouped[line] || []) as StatementTreeItemWithSource[];
      const extras = ownItems.filter((item) => {
        const key = statementCashflowKey(item);
        return Boolean(key) && !mapped.has(key as string) && Boolean(findFlowRow(key as string));
      });
      grouped[line] = extras.length ? [...flowPartidas, ...(extras as StatementTreeItem[])] : flowPartidas;
    });
    return grouped;
  }, [items, cashflow, dynamicCashflow, projectId]);

  const hasFinancialFlowChildren = useMemo(
    () => (treeByLine.financiero || []).some((item) => normalizeMatch((item as StatementTreeItemWithSource).cashflowRowId) !== 'financial'),
    [treeByLine],
  );

  const sheet = useMemo<SheetRow[]>(() => {
    const rows: SheetRow[] = [];
    const walk = (line: StatementLine, nodes: StatementTreeItem[], depth: number) => {
      for (const node of nodes) {
        const hasChildren = node.children.length > 0;
        rows.push({
          kind: 'item',
          id: `item-${node.id}`,
          line,
          label: node.name,
          level: depth,
          meta: LINE_BY_KEY[line],
          item: node,
          hasChildren,
        });
        if (hasChildren && (printing || openItems[node.id])) walk(line, node.children, depth + 1);
      }
    };
    const pushItems = (line: StatementLine) => {
      if (line === 'ingreso') return;
      if (!printing && !openLines[line]) return;
      walk(line, treeByLine[line] || [], 1);
    };
    const pushLine = (line: StatementLine) => rows.push({
      kind: 'line', id: `line-${line}`, line, label: labelOverrides[`line-${line}`] || LINE_BY_KEY[line].label, level: 0, meta: LINE_BY_KEY[line],
    });
    const pushComputed = (id: string, label: string, line: StatementLine) => rows.push({
      kind: 'computed', id, line, label: labelOverrides[id] || label, level: 0, meta: LINE_BY_KEY[line],
    });

    pushLine('ingreso');
    pushItems('ingreso');
    pushLine('costo');
    pushItems('costo');
    pushComputed('gross', 'Utilidad bruta', 'costo');
    pushLine('ventas_admin');
    pushItems('ventas_admin');
    pushComputed('operating', 'Utilidad operativa', 'ventas_admin');
    pushLine('financiero');
    pushItems('financiero');
    pushComputed('pre-tax', 'Utilidad antes de impuesto', 'financiero');
    pushLine('impuestos');
    pushItems('impuestos');
    pushComputed('net', 'Utilidad neta', 'impuestos');
    pushLine('igv');
    pushItems('igv');
    pushLine('ajuste');
    pushItems('ajuste');
    pushComputed('adjusted', 'Utilidad ajustada referencial', 'ajuste');
    return rows;
  }, [treeByLine, labelOverrides, openItems, openLines, printing]);

  /**
   * Real de cada fila del cuadro. Las lineas fijas suman sus partidas y los
   * subtotales se recalculan en cascada, igual que el PDF.
   */
  const rowReal = useMemo(() => {
    const dynamicIndex = cashflowTotals(dynamicCashflow);
    const { totals: dynamicTotals } = dynamicIndex;
    // Indice "real": UNICAMENTE el flujo DINAMICO (data de Cuentas y Bancos).
    // No se mezcla con el estático.
    const realAmount = (item: StatementTreeItemWithSource, parentFlowKey?: string | null): number => {
      if (item.children.length) return item.children.reduce((sum, child) => sum + realAmount(child, parentFlowKeyFor(dynamicIndex, item)), 0);
      // Partida virtual del flujo: el Real es el de su fila (dinamico).
      if (item.cashflowRowId) {
        const byId = cashflowRowAmount(dynamicIndex.byId, item.cashflowRowId);
        if (byId != null) return byId;
        if (dynamicTotals.has(item.cashflowRowId)) return dynamicTotals.get(item.cashflowRowId) || 0;
        const fromFlow = matchedFlowTotal(dynamicIndex, {
          cashflowRowId: item.cashflowRowId,
          code: item.cashflowRowId,
          name: item.cashflowRowId,
        });
        if (fromFlow) return fromFlow;
      }
      // Matching difuso (codigo/nombre) SOLO para partidas raiz: las subpartidas
      // nacen en el flujo, por eso se resuelven aparte (por nombre acotado al padre).
      if (item.parentId == null) {
        const mappedRow = findCashflowRow(dynamicCashflow, item);
        if (mappedRow) return cashflowRowTotal(mappedRow);
      }
      if (item.isVirtual) return 0;
      return matchedFlowTotal(dynamicIndex, item, parentFlowKey, num(item.amount));
    };
    const totals: Record<string, number> = {};
    for (const meta of LINES) {
      const fallbackLineTotal = (treeByLine[meta.key] || []).reduce((sum, item) => sum + realAmount(item as StatementTreeItemWithSource), 0);
      totals[`line-${meta.key}`] = meta.key === 'financiero' && hasFinancialFlowChildren
        ? fallbackLineTotal
        : cashflowLineAmount(dynamicCashflow, meta.key, fallbackLineTotal);
      // Real por partida: el cuadro pinta cada fila con la clave `item-<id>`, por eso
      // se replica aqui el mismo valor que aporta a su linea (los hijos suman el padre).
      const walkItems = (nodes: StatementTreeItem[]) => {
        for (const node of nodes) {
          const withSource = node as StatementTreeItemWithSource;
          totals[`item-${node.id}`] = realAmount(withSource);
          if (node.children.length) walkItems(node.children);
        }
      };
      walkItems(treeByLine[meta.key] || []);
    }
    const line = (key: StatementLine) => totals[`line-${key}`] || 0;
    const gross = line('ingreso') - line('costo');
    const operating = gross - line('ventas_admin');
    const preTax = operating - line('financiero');
    const net = preTax - line('impuestos');
    totals.gross = gross;
    totals.operating = operating;
    totals['pre-tax'] = preTax;
    totals.net = net;
    totals.adjusted = net - line('igv') + line('ajuste');
    return totals;
  }, [treeByLine, dynamicCashflow, cashflow, hasFinancialFlowChildren]);

  const hasItems = items.length > 0 || Boolean(cashflow?.rows?.length || dynamicCashflow?.rows?.length);

  /**
   * Monto proyectado de cada linea. Las partidas creadas por el usuario no
   * tienen proyectado propio (solo detallan el real), por eso el proyectado se
   * prorratea segun el peso de cada partida dentro de su linea.
   */
  const lineProjected: Record<StatementLine, number> = {
    ingreso: report.projectedRevenue,
    costo: report.projectedCostOfSales,
    ventas_admin: report.projectedSalesAdmin,
    financiero: hasFinancialFlowChildren
      ? (treeByLine.financiero || []).reduce((sum, item) => {
        const rowId = (item as StatementTreeItemWithSource).cashflowRowId;
        if (!rowId) return sum;
        const index = cashflowTotals(cashflow);
        return sum + (cashflowRowAmount(index.byId, rowId) ?? cashflowRowAmount(index.totals, rowId) ?? matchedFlowTotal(index, { cashflowRowId: rowId, code: rowId, name: rowId }, null, 0));
      }, 0)
      : report.projectedFinanceTax,
    impuestos: report.projectedIncomeTax,
    igv: report.projectedIgv,
    ajuste: cashflowLineAmount(cashflow, 'ajuste', 0),
  };

  /** Subtotales proyectados en cascada (igual que el real). */
  const projectedComputed = useMemo(() => {
    const gross = lineProjected.ingreso - lineProjected.costo;
    const operating = gross - lineProjected.ventas_admin;
    const preTax = operating - lineProjected.financiero;
    const net = preTax - lineProjected.impuestos;
    const adjusted = net - lineProjected.igv + lineProjected.ajuste;
    return { gross, operating, 'pre-tax': preTax, net, adjusted } as Record<string, number>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  /** Partida por id (para resolver el padre de una subpartida en el matching del flujo). */
  const itemById = useMemo(() => {
    const map = new Map<number, StatementTreeItemWithSource>();
    const walk = (nodes: StatementTreeItem[]) => {
      for (const node of nodes) {
        map.set(Number(node.id), node as StatementTreeItemWithSource);
        if (node.children.length) walk(node.children);
      }
    };
    (Object.values(treeByLine) as StatementTreeItem[][]).forEach(walk);
    return map;
  }, [treeByLine]);

  const findItemById = (id: number | null | undefined) => (id == null ? null : itemById.get(Number(id)) || null);

  function rowProjected(row: SheetRow): number {
    if (row.kind === 'computed') return projectedComputed[row.id] || 0;
    if (row.kind === 'line') return lineProjected[row.line] || 0;
    const index = cashflowTotals(cashflow);
    // Subpartida: su proyectado sale del flujo ESTATICO buscando por NOMBRE entre
    // los hijos de la fila PADRE ya resuelta (misma regla que el Real).
    const parentItem = row.item.parentId != null ? findItemById(row.item.parentId) : null;
    const parentFlowKey = parentItem ? parentFlowKeyFor(index, parentItem as StatementTreeItemWithSource) : null;
    if (row.item.cashflowRowId) {
      const { totals } = index;
      // Mismo criterio que Presupuesto de Obra y que el Real: primero por id/label
      // normalizado (determinista), luego matching determinista por codigo/nombre.
      const byId = cashflowRowAmount(index.byId, row.item.cashflowRowId);
      if (byId != null) return byId;
      const fromStatic = matchedFlowTotal(index, {
        cashflowRowId: row.item.cashflowRowId,
        code: row.item.cashflowRowId,
        name: row.item.cashflowRowId,
      });
      if (fromStatic) return fromStatic;
      if (totals.has(row.item.cashflowRowId)) return totals.get(row.item.cashflowRowId) || 0;
    }
    // Matching difuso (codigo/nombre) SOLO para partidas raiz: las subpartidas nacen
    // en el flujo, por eso se resuelven por nombre acotado al padre.
    if (row.item.parentId == null) {
      const projectedRow = findCashflowRow(cashflow, row.item);
      if (projectedRow) return cashflowRowTotal(projectedRow);
    }
    if (row.item.isVirtual) return 0;
    // Subpartida real del flujo: proyectado por nombre entre los hijos del padre.
    const fromStaticChild = row.item.parentId != null
      ? matchedFlowTotal(index, row.item, parentFlowKey, 0)
      : 0;
    if (fromStaticChild) return fromStaticChild;
    const itemsInLine = (treeByLine[row.line] || []).reduce((sum, item) => sum + itemRealAmount(item), 0);
    if (!itemsInLine) return 0;
    return (lineProjected[row.line] || 0) * (itemRealAmount(row.item) / itemsInLine);
  }

  const projectedChartData = [
    { name: 'Ingresos', value: lineProjected.ingreso, color: GREEN },
    { name: 'Costo venta', value: lineProjected.costo, color: BLUE },
    { name: 'Ventas/Admin', value: lineProjected.ventas_admin, color: AMBER },
    { name: 'Financiero', value: lineProjected.financiero, color: '#7C3AED' },
    { name: 'Utilidad neta', value: projectedComputed.net || 0, color: (projectedComputed.net || 0) >= 0 ? BLUE_DARK : RED },
  ];
  const realChartData = [
    { name: 'Ingresos', value: rowReal['line-ingreso'] || 0, color: GREEN },
    { name: 'Costo venta', value: rowReal['line-costo'] || 0, color: BLUE },
    { name: 'Ventas/Admin', value: rowReal['line-ventas_admin'] || 0, color: AMBER },
    { name: 'Financiero', value: rowReal['line-financiero'] || 0, color: '#7C3AED' },
    { name: 'Utilidad neta', value: rowReal.net || 0, color: (rowReal.net || 0) >= 0 ? BLUE_DARK : RED },
  ];

  function escapeHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function saveRowLabel(id: string | undefined, label: string) {
    if (!id) return;
    const nextLabel = label.trim();
    if (!nextLabel) {
      setEditingLabel(null);
      return;
    }
    setLabelOverrides((current) => ({ ...current, [id]: nextLabel }));
    setEditingLabel(null);
  }

  /** Nombre del concepto: en linea fija se edita por localStorage, la partida en su modal. */
  function editableConcept(row: SheetRow, color: string) {
    const isChild = row.level > 1;
    const textClass = `min-w-0 truncate text-xs font-semibold leading-tight md:whitespace-normal md:break-words md:text-sm ${isChild ? 'font-medium' : ''}`;
    if (row.kind !== 'line') {
      return (
        <p className={textClass} style={{ color }} title={row.label}>
          {row.label}
        </p>
      );
    }
    const labelKey = `line-${row.line}`;
    if (editingLabel === row.id) {
      return (
        <input
          autoFocus
          className="w-full min-w-0 rounded border border-[#1877F2] bg-white px-1.5 py-1 text-xs font-semibold outline-none md:text-sm"
          defaultValue={row.label}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onBlur={(event) => saveRowLabel(labelKey, event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') setEditingLabel(null);
          }}
        />
      );
    }
    return (
      <p
        className={`${textClass} cursor-text`}
        style={{ color }}
        title={`${row.label} (doble clic para renombrar)`}
        onDoubleClick={(event) => {
          event.stopPropagation();
          setEditingLabel(row.id);
        }}
      >
        {row.label}
      </p>
    );
  }

  /** Cierra el modal y limpia el formulario para la siguiente vez. */
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm({});
  }

  /** Abre el modal para crear una partida raiz o una subpartida de otra. */
  function openCreate(line: StatementLine, parent?: StatementItem) {
    const parentItem = parent || null;
    setEditing(null);
    setForm({
      projectId,
      line,
      parentId: parentItem ? Number(parentItem.id) : null,
      code: parentItem
        ? childCodeFor(items, parentItem, line)
        : nextItemCode(items, line),
      name: '',
      description: '',
      amount: '',
      currency: 'PEN',
      sortOrder: parentItem
        ? items.filter((item) => Number(item.parentId || 0) === Number(parentItem.id)).length * 10 + 10
        : items.filter((item) => item.line === line && !item.parentId).length * 10 + 10,
    });
    setModalOpen(true);
  }

  function openEdit(item: StatementItem) {
    setEditing(item);
    setForm({
      projectId,
      line: item.line,
      parentId: item.parentId ? Number(item.parentId) : null,
      code: item.code,
      name: item.name,
      description: item.description || '',
      amount: Number(item.amount || 0),
      currency: item.currency || 'PEN',
      sortOrder: Number(item.sortOrder || 0),
    });
    setModalOpen(true);
  }

  async function saveItem() {
    const code = String(form.code || '').trim();
    const name = String(form.name || '').trim();
    if (!code || !name) return toast('Completa codigo y nombre', 'err');
    setSaving(true);
    try {
      const payload = {
        projectId,
        line: form.line,
        parentId: form.parentId ? Number(form.parentId) : null,
        code,
        name,
        description: form.description ?? null,
        amount: Number(form.amount || 0),
        currency: form.currency || 'PEN',
        sortOrder: Number(form.sortOrder || 0),
      };
      if (editing) {
        const { projectId: _omit, ...patch } = payload;
        await api.patch(`/income-statement/${editing.id}`, patch);
      } else {
        await api.post('/income-statement', payload);
      }
      if (payload.parentId) setOpenItems((current) => ({ ...current, [Number(payload.parentId)]: true }));
      toast(editing ? 'Partida actualizada' : 'Partida creada');
      closeModal();
      load();
    } catch (error: any) {
      toast(error?.message || 'No se pudo guardar la partida', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: StatementItem) {
    if (!window.confirm(`Eliminar "${item.name}" del estado de resultados?`)) return;
    try {
      await api.delete(`/income-statement/${item.id}`);
      toast('Subpartida eliminada');
      load();
    } catch (error: any) {
      toast(error?.message || 'No se pudo eliminar la subpartida', 'err');
    }
  }

  /**
   * Exporta las cards (KPI + metricas) y el cuadro completo del Estado de
   * Resultados a PDF usando el mismo helper `printHtml` que el resto del CRM.
   * Respeta la moneda activa (S/ o US$) mediante `showUsdBase` y `symbol`.
   */
  function exportPdf() {
    if (loading) return toast('Espera a que termine la carga', 'err');
    // Las subpartidas salen siempre en el PDF: se abren antes de construir el HTML.
    setOpenItems(Object.fromEntries(items.map((item) => [Number(item.id), true])));
    setPrinting(true);
    window.setTimeout(() => {
      setPrinting(false);
    }, 1200);
    const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
    const projectName = project?.name || `Proyecto ${projectId}`;
    const today = new Date().toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' });

    const cards: Array<{ label: string; value: string; helper: string; tone: string }> = [
      { label: 'Ingreso real', value: showUsdBase(report.realRevenue), helper: 'Ingresos de la operacion diaria (transacciones)', tone: GREEN },
      { label: 'Utilidad neta', value: showUsdBase(report.netProfit), helper: `Margen neto ${pct(report.margin)}`, tone: report.netProfit >= 0 ? BLUE : RED },
      { label: 'Lotes vendidos', value: `${report.soldLots}/${lots.length}`, helper: 'Conteo desde lotizacion', tone: BLUE_DARK },
      { label: 'Area vendible', value: `${report.totalArea.toLocaleString('es-PE', { maximumFractionDigits: 0 })} m2`, helper: project?.location || 'Ubicacion del proyecto', tone: '#7C3AED' },
    ];
    const pills: Array<{ label: string; value: string }> = [
      { label: 'Precio proyectado m2', value: showUsdBase(report.projectedM2) },
      { label: 'Ingreso real m2', value: showUsdBase(report.realM2) },
      { label: 'Area venta m2', value: `${report.totalArea.toLocaleString('es-PE', { maximumFractionDigits: 2 })} m2` },
      { label: 'Fecha de reporte', value: new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) },
    ];

    const cardsHtml = cards.map((card) => `
      <div class="card" style="border-top-color:${card.tone}">
        <p class="card-label">${escapeHtml(card.label)}</p>
        <p class="card-value" style="color:${card.tone}">${escapeHtml(card.value)}</p>
        <p class="card-helper">${escapeHtml(card.helper)}</p>
      </div>
    `).join('');

    const pillsHtml = pills.map((pill) => `
      <div class="pill">
        <p class="pill-label">${escapeHtml(pill.label)}</p>
        <p class="pill-value">${escapeHtml(pill.value)}</p>
      </div>
    `).join('');

    const rowsHtml = sheet.map((row) => {
      const real = rowReal[row.id] || 0;
      const projected = rowProjected(row);
      const diff = deviation(real, projected);
      const share = incomeShare(real, report.realRevenue);
      const isChild = row.level > 1;
      const cls = row.kind === 'computed'
        ? (row.id === 'net' || row.id === 'adjusted' ? 'row-final' : 'row-subtotal')
        : row.kind === 'line'
          ? (row.line === 'ingreso' ? 'row-income'
            : row.line === 'impuestos' || row.line === 'igv' ? 'row-tax'
              : row.line === 'costo' ? 'row-cost' : 'row-subtotal')
          : (row.line === 'costo' ? 'row-cost' : '');
      const child = isChild ? ' cell-child' : '';
      return `
        <tr class="${cls}">
          <td class="concept${child}">
            <span class="concept-name">${escapeHtml(row.label)}</span>
          </td>
          <td class="num">${escapeHtml(showUsdBase(projected))}</td>
          <td class="num">${escapeHtml(showUsdBase(real))}</td>
          <td class="num">${escapeHtml(pct(share))}</td>
          <td class="num">${escapeHtml(`${diff >= 0 ? '+' : ''}${pct(diff)}`)}</td>
        </tr>
      `;
    }).join('');

    printHtml(buildPdfHtml({
      logoUrl,
      projectName,
      today,
      metaHtml: [
        `<p><b>Proyecto:</b> ${escapeHtml(projectName)}</p>`,
        `<p><b>RUC:</b> ${escapeHtml(ruc)}</p>`,
        `<p><b>Moneda:</b> ${escapeHtml(symbol)}${String(currency).toUpperCase() === 'USD' ? ` (TC ${escapeHtml(String(exchangeRate))})` : ''}</p>`,
        `<p><b>Generado:</b> ${escapeHtml(today)}</p>`,
      ].join(''),
      cardsHtml,
      pillsHtml,
      rowsHtml,
    }));
  }

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
          <div className="relative min-h-[190px] overflow-hidden px-5 py-6 sm:px-7" style={{ background: `linear-gradient(135deg, ${BLUE_DARK}, ${BLUE})` }}>
            <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-white/15" />
            <div className="absolute right-24 top-12 h-24 w-24 rotate-12 rounded-md border border-white/10" />
            <div className="relative flex w-full min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="block w-full min-w-0 text-white lg:flex-1">
                <div className="inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
                  <FiFileText /> CRM - DUNACON
                </div>
                <h2 className="mt-4 block break-words text-2xl font-bold leading-tight tracking-normal text-white sm:mt-5 sm:text-4xl">Estado de Resultados</h2>
                <p className="mt-2 block max-w-2xl text-sm leading-relaxed text-blue-50">
                  Vista contable ejecutiva del proyecto, construida con ingresos y egresos.
                </p>
              </div>
              <div className="grid w-full min-w-0 gap-3 rounded-md bg-white/10 p-3 ring-1 ring-white/20 backdrop-blur-sm lg:w-auto lg:min-w-[360px]">
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
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-blue-50">RUC editable</label>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 rounded-md bg-white px-2 sm:gap-2 sm:px-3">
                      <FiEdit3 className="shrink-0 text-sm sm:text-base" style={{ color: BLUE }} />
                      <input
                        className="h-10 min-w-0 flex-1 bg-transparent text-xs font-bold outline-none sm:text-sm"
                        style={{ color: INK }}
                        value={ruc}
                        onChange={(event) => setRuc(event.target.value)}
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-neutral !h-10 shrink-0 justify-center whitespace-nowrap !px-2 text-xs sm:!px-3 sm:text-sm"
                    style={{ color: INK }}
                    onClick={exportPdf}
                    disabled={loading}
                    title="Exporta las cards y el cuadro del Estado de Resultados a PDF"
                  >
                    <FiDownload /> Exportar PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t bg-[#F8FAFC] p-4 xl:grid-cols-4" style={{ borderColor: BORDER }}>
            <MetricPill label="Precio proyectado m2" value={showUsdBase(report.projectedM2)} />
            <MetricPill label="Ingreso real m2" value={showUsdBase(report.realM2)} color={GREEN} />
            <MetricPill label="Area venta m2" value={`${report.totalArea.toLocaleString('es-PE', { maximumFractionDigits: 2 })} m2`} color={BLUE_DARK} />
            <MetricPill label="Fecha de reporte" value={new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })} color={INK} />
          </div>
        </section>

        {dynamicCashflow?.bankSync?.stale && (
          <section className="rounded-md border bg-amber-50 px-4 py-3 shadow-sm" style={{ borderColor: '#FCD34D' }}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-sm font-semibold text-amber-900">
                <FiAlertTriangle className="mt-0.5 shrink-0" />
                El flujo de caja dinamico esta desactualizado frente a Cuentas y bancos.
              </p>
              <a
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-xs font-bold text-white"
                style={{ background: BLUE }}
                href={`/projects/${projectId}/cashflow`}
              >
                <FiRefreshCw /> Actualizar flujo
              </a>
            </div>
            <p className="mt-1 text-xs text-amber-800">
              Hay movimientos bancarios registrados despues de la ultima reconstruccion del flujo dinamico. Actualizalo antes de tomar decisiones con la columna Real.
            </p>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Ingreso real" value={showUsdBase(report.realRevenue)} helper="Ingresos de la operación diaria (transacciones)" icon={<FiDollarSign />} color={GREEN} />
          <KpiCard label="Utilidad neta" value={showUsdBase(report.netProfit)} helper={`Margen neto ${pct(report.margin)}`} icon={<FiTrendingUp />} color={report.netProfit >= 0 ? BLUE : RED} />
          <KpiCard label="Lotes vendidos" value={`${report.soldLots}/${lots.length}`} helper="Conteo desde lotizacion" icon={<FiGrid />} color={BLUE_DARK} />
          <KpiCard label="Area vendible" value={`${report.totalArea.toLocaleString('es-PE', { maximumFractionDigits: 0 })} m2`} helper={project?.location || 'Ubicacion del proyecto'} icon={<FiMapPin />} color="#7C3AED" />
        </div>

        {/* El cuadro se apila hasta 1023px: en tablets el panel lateral ya no
            comprime las columnas de la tabla. */}
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
          <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: BORDER }}>
              <div>
                <h3 className="font-semibold" style={{ color: INK }}>Resultado economico del proyecto</h3>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>Partidas y subpartidas editables por linea. Usa el lapiz para editar o el + para agregar una subpartida.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-neutral !h-9 text-xs" onClick={() => openCreate('costo')} disabled={loading} title="Agregar una partida a la linea de costo de venta">
                  <FiPlus /> Agregar partida
                </button>
                <button className="btn-neutral !h-9 text-xs" onClick={load} disabled={loading}>
                  <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar
                </button>
              </div>
            </div>
            {/* En pantallas chicas se conserva el desplazamiento horizontal.
                En escritorio el concepto recibe mas ancho y las cifras mantienen
                columnas amplias y alineadas para facilitar su lectura. */}
            <p className="px-4 py-2 text-xs text-slate-400 sm:hidden">Desliza la tabla hacia la derecha para ver las demas columnas.</p>
            <div className="w-full overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full table-fixed text-[13px] sm:!min-w-[540px] md:!min-w-[760px] md:text-sm">
                <colgroup>
                  <col className="w-[200px] sm:w-[33%] md:w-[38%]" />
                  <col className="w-[92px] sm:w-[19%] md:w-[18%]" />
                  <col className="w-[92px] sm:w-[15%] md:w-[18%]" />
                  <col className="w-[70px] sm:w-[12%] md:w-[10%]" />
                  <col className="w-[84px] sm:w-[13%] md:w-[11%]" />
                  <col className="w-[62px] sm:w-[8%] md:w-[5%]" />
                </colgroup>
                <thead>
                  <tr className="border-b text-left text-[10px] font-bold uppercase leading-tight tracking-normal md:text-xs md:tracking-wide" style={{ borderColor: BORDER, color: MUTED, background: '#F8FAFC' }}>
                    <th className="px-1.5 py-2 md:px-4 md:py-3">Concepto</th>
                    <th className="px-1 py-2 text-right md:px-3 md:py-3">Proy. {symbol}</th>
                    <th className="px-1 py-2 text-right md:px-3 md:py-3">Real {symbol}</th>
                    <th className="px-1 py-2 text-right md:px-3 md:py-3">%&nbsp;Ingr.</th>
                    <th className="px-1 py-2 text-right md:px-3 md:py-3">Desv.</th>
                    <th className="px-1 py-2 text-right sm:px-1.5 md:px-3" aria-label="Acciones"></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: BORDER }}>
                  {loading ? (
                    <tr>
                      <td className="py-10 text-center text-sm text-slate-400" colSpan={6}>
                        Cargando estado de resultados...
                      </td>
                    </tr>
                  ) : sheet.map((row) => {
                    const tone = rowTone(row);
                    const real = rowReal[row.id] || 0;
                    const projected = rowProjected(row);
                    const diff = deviation(real, projected);
                    const share = incomeShare(real, report.realRevenue);
                    const isChild = row.level > 1;
                    const isItem = row.kind === 'item';
                    const lineHasItems = row.kind === 'line' && row.line !== 'ingreso' && (treeByLine[row.line] || []).length > 0;
                    const lineOpen = row.kind === 'line' ? !!openLines[row.line] : false;
                    const rowBg = row.kind === 'computed'
                      ? 'bg-[#F8FAFC] hover:bg-[#F1F5F9]'
                      : row.line === 'costo'
                        ? (isChild ? 'bg-[#F7F8FF] hover:bg-[#EEF1FF]' : 'bg-[#EEF2FF] hover:bg-[#E6EBFF]')
                        : isChild ? 'bg-[#FAFAFB] hover:bg-slate-50' : 'hover:bg-slate-50';
                    return (
                      <tr
                        key={row.id}
                        className={`group transition-colors ${rowBg} ${lineHasItems ? 'cursor-pointer' : ''}`}
                        onClick={() => lineHasItems && setOpenLines((current) => ({ ...current, [row.line]: !current[row.line] }))}
                      >
                        <td className="px-1.5 py-2 md:px-4 md:py-3" style={row.kind !== 'computed' && row.line === 'costo' ? { boxShadow: `inset ${isChild ? 3 : 4}px 0 0 ${COST}` } : undefined}>
                          <div className="flex min-w-0 items-center gap-2 md:gap-3" style={isChild ? { paddingLeft: 8 } : undefined}>
                            {isItem && row.hasChildren ? (
                              <button
                                type="button"
                                className="grid h-7 w-7 shrink-0 place-items-center rounded text-slate-500 hover:bg-slate-200/70"
                                title={openItems[Number(row.item.id)] ? 'Ocultar subpartidas' : 'Ver subpartidas'}
                                aria-expanded={!!openItems[Number(row.item.id)]}
                                onClick={() => setOpenItems((current) => ({ ...current, [Number(row.item.id)]: !current[Number(row.item.id)] }))}
                              >
                                {openItems[Number(row.item.id)] ? <FiChevronDown /> : <FiChevronRight />}
                              </button>
                            ) : row.kind === 'line' ? (
                              <button
                                type="button"
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
                                style={{ background: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}
                                title={lineHasItems ? (lineOpen ? 'Ocultar partidas' : 'Ver partidas') : row.label}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (lineHasItems) setOpenLines((current) => ({ ...current, [row.line]: !current[row.line] }));
                                }}
                              >
                                {lineHasItems ? (lineOpen ? <FiChevronDown /> : <FiChevronRight />) : <LineIcon line={row.line} size={12} />}
                              </button>
                            ) : <span className="h-7 w-7 shrink-0" aria-hidden="true" />}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 md:gap-2">
                                {row.kind === 'item' && !row.item.isVirtual && (
                                  <span className="hidden shrink-0 rounded px-1 py-0.5 text-[11px] font-bold md:inline" style={{ background: isChild ? '#F8FAFC' : '#EAF3FF', color: isChild ? MUTED : BLUE, border: `1px solid ${isChild ? BORDER : '#BFDBFE'}` }}>{row.item.code}</span>
                                )}
                                {editableConcept(row, tone.color)}
                                {row.kind === 'item' && (
                                  <span className="ml-auto hidden shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 md:flex">
                                    <button type="button" className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-100" title="Agregar subpartida" onClick={() => openCreate(row.line, row.item)}><FiPlus /></button>
                                    <button type="button" className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-100" title="Editar" onClick={() => openEdit(row.item)}><FiEdit3 /></button>
                                    <button type="button" className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-red-50 hover:text-red-600" title="Eliminar" onClick={() => deleteItem(row.item)}><FiX /></button>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-1 py-2 text-right text-xs font-semibold tabular-nums md:px-3 md:py-3 md:text-[13px]" style={{ color: INK }}>{showUsdBase(projected)}</td>
                        <td className="whitespace-nowrap px-1 py-2 text-right text-xs font-bold tabular-nums md:px-3 md:py-3 md:text-[13px]" style={{ color: real < 0 ? RED : INK }}>{showUsdBase(real)}</td>
                        <td className="whitespace-nowrap px-1 py-2 text-right text-xs tabular-nums md:px-3 md:py-3 md:text-[13px]" style={{ color: real < 0 ? RED : row.line === 'ingreso' ? GREEN : MUTED, fontWeight: row.line === 'ingreso' || row.kind === 'computed' ? 700 : 500 }}>{pct(share)}</td>
                        <td className="px-0.5 py-2 text-right md:px-1 md:py-3">
                          <span className="inline-block whitespace-nowrap rounded-full px-1 py-0.5 text-[10px] font-bold tabular-nums md:px-2.5 md:py-1 md:text-[11px]" style={{ background: Math.abs(diff) <= 5 ? '#F1F5F9' : diff >= 0 ? '#EAF7EE' : '#FEE2E2', color: Math.abs(diff) <= 5 ? MUTED : diff >= 0 ? GREEN : RED }}>
                            {diff >= 0 ? '+' : ''}{pct(diff)}
                          </span>
                        </td>
                        <td className="px-0.5 py-2 text-right sm:px-1.5 md:px-2">
                          {row.kind === 'line' ? (
                            <button type="button" className="grid h-5 w-5 place-items-center rounded-md text-slate-500 hover:bg-slate-100 md:h-7 md:w-7" title="Agregar partida" onClick={(event) => { event.stopPropagation(); openCreate(row.line); }}><FiPlus /></button>
                          ) : row.kind === 'item' ? (
                            <button type="button" className="grid h-5 w-5 place-items-center rounded-md text-slate-500 hover:bg-slate-100 md:hidden" title="Editar" onClick={() => openEdit(row.item)}><FiEdit3 /></button>
                          ) : <span className="block h-5 w-5 md:h-7 md:w-7" />}
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && !hasItems && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                        Este proyecto aun no tiene partidas: usa <b>Agregar partida</b> o el boton <b>+</b> de cada linea para crear la primera.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
              <div className="border-b px-5 py-4" style={{ borderColor: BORDER }}>
                <h3 className="flex items-center gap-2 font-semibold" style={{ color: INK }}><FiBarChart2 /> Composición Proyectado</h3>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>Estructura visual de ingresos, costos y utilidad proyectada.</p>
              </div>
              <div className="h-[310px] px-3 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectedChartData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 12 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" tickFormatter={showUsdBaseShort} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: MUTED }} width={88} axisLine={false} tickLine={false} />
                    <Tooltip content={<StatementTooltip formatter={showUsdBase} />} cursor={{ fill: '#F8FAFC' }} />
                    <Bar dataKey="value" name="Monto" radius={[0, 8, 8, 0]}>
                      {projectedChartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
              <div className="border-b px-5 py-4" style={{ borderColor: BORDER }}>
                <h3 className="flex items-center gap-2 font-semibold" style={{ color: INK }}><FiBarChart2 /> Composición real</h3>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>Estructura visual de ingresos, costos y utilidad.</p>
              </div>
              <div className="h-[310px] px-3 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={realChartData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 12 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" tickFormatter={showUsdBaseShort} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: MUTED }} width={88} axisLine={false} tickLine={false} />
                    <Tooltip content={<StatementTooltip formatter={showUsdBase} />} cursor={{ fill: '#F8FAFC' }} />
                    <Bar dataKey="value" name="Monto" radius={[0, 8, 8, 0]}>
                      {realChartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: BORDER }}>
              <div>
                <h3 className="font-semibold" style={{ color: INK }}>{editing ? 'Editar partida' : 'Nueva partida'}</h3>
                <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
                  {editing ? 'Actualiza el detalle y el monto de la partida.' : 'Se agrega a la linea contable seleccionada.'}
                </p>
              </div>
              <button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={closeModal}><FiX /></button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <Field label="Linea del cuadro">
                <Select
                  value={form.line || 'costo'}
                  onChange={(value) => setForm((current) => ({ ...current, line: value as StatementLine }))}
                  options={LINES.map((line) => ({ value: line.key, label: line.label, hint: line.letter }))}
                />
              </Field>

              <Field label="Partida padre (opcional)">
                <Select
                  value={form.parentId ? String(form.parentId) : ''}
                  onChange={(value) => setForm((current) => ({ ...current, parentId: value ? Number(value) : null }))}
                  options={[
                    { value: '', label: 'Sin padre (partida raiz)' },
                    ...items
                      .filter((item) => item.line === (form.line || 'costo') && Number(item.id) !== Number(editing?.id || 0))
                      .map((item) => ({ value: String(item.id), label: `${item.code} - ${item.name}` })),
                  ]}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Codigo">
                  <input className="input" value={form.code || ''} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="C.01" />
                </Field>
                <Field label={`Monto (${form.currency || 'PEN'})`}>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={form.amount === undefined || form.amount === null ? '' : String(form.amount)}
                    onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value === '' ? '' : Number(event.target.value) }))}
                    placeholder="0.00"
                  />
                </Field>
              </div>

              <Field label="Nombre">
                <input className="input" value={form.name || ''} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Movimiento de tierras" />
              </Field>

              <Field label="Descripcion (opcional)">
                <textarea
                  className="input min-h-[70px]"
                  value={form.description || ''}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Detalle de la partida"
                />
              </Field>

              <p className="rounded-md bg-[#F8FAFC] px-3 py-2 text-xs" style={{ color: MUTED }}>
                Si esta partida tiene subpartidas, su monto mostrado sera la suma de ellas.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-5 py-4" style={{ borderColor: BORDER }}>
              <button className="btn-neutral" onClick={closeModal} disabled={saving}>Cancelar</button>
              <button className="btn-primary" onClick={saveItem} disabled={saving}>{saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear partida'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

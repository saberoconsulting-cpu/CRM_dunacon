'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiBriefcase,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiCircle,
  FiClock,
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
import type { IconType } from 'react-icons';
import { Toaster, toast, Field } from '@/components/ui/ui';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { Select } from '@/components/ui/Select';
import { StatusPillSelect, type StatusPillOption } from '@/components/ui/StatusPillSelect';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/types';
import { formatCurrency, useDisplayCurrency } from '@/lib/currency';

type BudgetCategory = 'costo_terreno' | 'costo_directo' | 'costo_indirecto' | 'gastos_ventas_admin' | 'gastos_financieros_impuestos';
type BudgetStatus = 'sin_inicio' | 'en_ejecucion' | 'terminada';
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
  status: BudgetStatus;
  sortOrder: number;
  isActive: boolean;
};
type BudgetTreeItem = BudgetItem & { children: BudgetTreeItem[] };
type CashflowRow = { id: string; label: string; values: number[]; parentId?: string | null };
type CashflowModel = {
  assumptions?: Record<string, any>;
  rows?: CashflowRow[];
};
/**
 * Indice de un flujo de caja: montos por id/label, la jerarquia de filas
 * (`childrenByParent`) y un mapa de claves normalizadas hacia el id canonico
 * de cada fila (`rowIdByKey`), necesario para acotar el matching de subpartidas
 * a los hijos de su fila padre.
 */
type FlowIndex = {
  byId: Map<string, number>;
  byLabel: Map<string, number>;
  childrenByParent: Map<string, CashflowRow[]>;
  rowIdByKey: Map<string, string>;
};
// El Presupuesto de Obra consume UNICAMENTE los flujos de caja del proyecto:
// el estatico (Proyectado) y el dinamico (Real). Ya no lee "Cuentas y bancos":
// esa data solo alimenta el flujo dinamico, que es el que aqui se consulta.
//
// Version minima del sembrado del flujo dinamico que este componente considera
// valida. Los registros anteriores podian ser una copia del estatico; por eso se
// exige esta marca en `assumptions.dynamicSeedVersion` antes de usar sus montos.
const DYNAMIC_SEED_VERSION = 1;


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
const CLOSED_CATEGORIES = Object.fromEntries(CATEGORIES.map((cat) => [cat.key, false])) as Record<string, boolean>;

// Estados de ejecucion de cada partida/subpartida del presupuesto.
const STATUS_OPTIONS: Array<{ key: BudgetStatus; label: string; color: string; background: string; border: string }> = [
  { key: 'sin_inicio', label: 'Sin Inicio', color: '#64748B', background: '#F1F5F9', border: '#E2E8F0' },
  { key: 'en_ejecucion', label: 'En Ejecución', color: '#B45309', background: '#FEF3C7', border: '#FCD34D' },
  { key: 'terminada', label: 'Terminada', color: '#15803D', background: '#DCFCE7', border: '#86EFAC' },
];
const STATUS_META = Object.fromEntries(STATUS_OPTIONS.map((status) => [status.key, status])) as Record<BudgetStatus, (typeof STATUS_OPTIONS)[number]>;

// Icono por estado para el pill-select (mejora la lectura visual de cada fila).
const STATUS_ICON: Record<BudgetStatus, IconType> = {
  sin_inicio: FiCircle,
  en_ejecucion: FiClock,
  terminada: FiCheckCircle,
};

const STATUS_PILL_OPTIONS: StatusPillOption[] = STATUS_OPTIONS.map((status) => ({
  value: status.key,
  label: status.label,
  color: status.color,
  background: status.background,
  border: status.border,
  icon: STATUS_ICON[status.key],
}));

function statusMeta(status?: string) {
  return STATUS_META[(status as BudgetStatus)] || STATUS_META.sin_inicio;
}

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

/**
 * Homologacion de cada partida del presupuesto hacia la fila del flujo de caja.
 * El presupuesto usa codigos propios (A.01, B.01, C.02...) y nombres largos, mientras
 * que el flujo de caja expone ids tecnicos (land-cost, construction-earthworks, legal...).
 * Sin este puente ningun partida matchea y tanto Proyectado (flujo estatico) como Real
 * (flujo dinamico + Cuentas y bancos) caen a su fallback. Se replica el mismo patron que
 * el mapa EERR de Cuentas y bancos.
 */
const BUDGET_CASHFLOW_ROW_MAP: Array<[string[], string]> = [
  // A) Costo de terreno. El ORDEN importa: cada needle se evalua de lo mas
  // especifico a lo mas generico, asi que `alcabala` va ANTES que `legal`
  // (la palabra "legal" es un needle muy amplio y nunca debe robarle la
  // alcabala a la partida que si es de alcabala).
  [['alcabala', 'alcabala 3'], 'alcabala'],
  [['a 02', 'gastos legales', 'notariales', 'notarial', 'asesoria legal', 'legal'], 'legal'],
  [['a 01', 'adquisicion de terreno', 'terreno bruto', 'fundo matriz', 'compra terreno', 'compra de terreno'], 'land-cost'],
  // B) Costo directo (subpartidas de obra)
  [['b 01', 'movimiento de tierras', 'movimiento de tierra', 'afirmado'], 'construction-earthworks'],
  [['b 02', 'obras civiles', 'obras de saneamiento', 'saneamiento', 'cisterna', 'redes de agua', 'redes sanitarias'], 'construction-sanitation'],
  [['b 03', 'pavimentacion y vias', 'pavimentacion', 'vias', 'veredas', 'pistas', 'sardineles'], 'construction-roads'],
  [['b 04', 'redes electricas', 'alumbrado publico', 'alumbrado', 'electricas', 'electrico'], 'construction-electric'],
  [['b 05', 'obras complementarias', 'obras complementaria', 'complementarias'], 'construction-complementary'],
  [['costos de construccion', 'costo de construccion'], 'construction'],
  [['supervision tecnica'], 'supervision'],
  [['conexion de servicios', 'servicios publicos'], 'services'],
  // C) Costo indirecto
  [['c 01', 'licencias', 'permisos', 'tasaciones', 'impactos ambientales', 'diseno'], 'design'],
  [['c 02', 'ingenieria y supervision', 'gerencia de proyectos', 'gerencia'], 'management'],
  [['c 03', 'gastos generales de campo', 'indemnizacion', 'titulacion'], 'indemnity'],
  [['imprevistos', 'contingencia'], 'legal-contingency'],
  // D) Gastos de ventas y administrativos
  [['d 01', 'gastos de administracion', 'gastos administrativos', 'planilla', 'planillas'], 'sales-plan'],
  [['d 02', 'publicidad', 'marketing', 'mkt'], 'marketing'],
  [['d 03', 'comisiones de ventas', 'comision de ventas', 'comision venta'], 'commission'],
  [['d 04', 'mantenimiento', 'condominio'], 'post-sale'],
  [['d 05', 'post venta', 'postventa'], 'discounts'],
  // E) Gastos financieros e impuestos
  [['e 01', 'financiamiento de obra', 'intereses', 'interes', 'prestamo'], 'financial'],
  [['e 02', 'impuesto a la renta', 'impuesto', 'renta'], 'tax'],
  [['e 03', 'igv referencial incluido en ingresos', 'igv referencial', 'igv'], 'igv'],
];

const BUDGET_ROW_CATEGORIES: Record<string, BudgetCategory> = {
  'land-cost': 'costo_terreno',
  alcabala: 'costo_terreno',
  legal: 'costo_terreno',
  'construction-earthworks': 'costo_directo',
  'construction-sanitation': 'costo_directo',
  'construction-roads': 'costo_directo',
  'construction-electric': 'costo_directo',
  'construction-complementary': 'costo_directo',
  supervision: 'costo_directo',
  services: 'costo_directo',
  design: 'costo_indirecto',
  management: 'costo_indirecto',
  indemnity: 'costo_indirecto',
  'legal-contingency': 'costo_indirecto',
  'sales-plan': 'gastos_ventas_admin',
  marketing: 'gastos_ventas_admin',
  commission: 'gastos_ventas_admin',
  'post-sale': 'gastos_ventas_admin',
  discounts: 'gastos_ventas_admin',
  financial: 'gastos_financieros_impuestos',
  tax: 'gastos_financieros_impuestos',
  igv: 'gastos_financieros_impuestos',
};

/**
 * Un needle es "de codigo" cuando, ya normalizado, tiene la forma de un codigo
 * de partida del presupuesto (una letra + 2 digitos: "a 02", "b 01"...). Estos
 * se comparan SOLO contra el codigo exacto de la partida; nunca contra el
 * nombre. Asi, una partida llamada "Alcabala (3%)" con codigo A.02 NO es robada
 * por la entrada `['a 02', ...] -> legal`: su nombre manda y cae en `alcabala`.
 */
function isCodeNeedle(needle: string) {
  return /^[a-z] \d{1,3}$/.test(needle);
}

/**
 * Fila del flujo de caja asociada a una partida. Se evalua en orden y gana la
 * primera coincidencia (de lo mas especifico a lo mas generico) para que una
 * partida no sume dos filas a la vez (p. ej. A.02 solo debe caer en `legal`,
 * no tambien en `land-cost` por contener la palabra "terreno").
 *
 * Los needles de codigo ("a 02", "b 01"...) solo coinciden con el codigo EXACTO
 * de la partida; los needles de texto ("alcabala", "asesoria legal"...) solo
 * coinciden con el NOMBRE. Esto evita que un codigo generico (A.02) se confunda
 * con el nombre de otra partida y termine trayendo el mismo monto en dos filas.
 */
function budgetCashflowKey(item: BudgetItem): string | null {
  const code = normalizeMatch(item.code);
  const name = normalizeMatch(item.name);
  const text = `${code} ${name}`.trim();
  for (const [needles, target] of BUDGET_CASHFLOW_ROW_MAP) {
    if (BUDGET_ROW_CATEGORIES[target] !== item.category) continue;
    const hit = needles.some((needle) => (isCodeNeedle(needle) ? code === needle : name.includes(needle)));
    if (hit) return normalizeMatch(target);
  }
  if (item.category === 'costo_terreno' && text.includes('costo de terreno')) return 'land';
  if (item.category === 'costo_directo' && text.includes('costo directo')) return 'direct';
  if (item.category === 'costo_indirecto' && text.includes('costo indirecto')) return 'indirect';
  if (item.category === 'gastos_ventas_admin' && text.includes('ventas administracion')) return 'selling';
  if (item.category === 'gastos_financieros_impuestos' && text.includes('gastos financieros')) return 'financial';
  return null;
}

/**
 * Fila del flujo a usar cuando la partida no coincide con ningun needle de
 * `BUDGET_CASHFLOW_ROW_MAP`. Espeja `BUDGET_CATEGORY_FALLBACK_ROW` de
 * CashflowExcelTestView para que ambas pantallas resuelvan la misma fila.
 */
const BUDGET_CATEGORY_FALLBACK_ROW: Record<BudgetCategory, string> = {
  costo_terreno: 'land-cost',
  costo_directo: 'construction-complementary',
  costo_indirecto: 'legal-contingency',
  gastos_ventas_admin: 'marketing',
  gastos_financieros_impuestos: 'financial',
};

function pct(real: number, projected: number) {
  if (!projected) return real ? 100 : 0;
  return (real / projected) * 100;
}

function cashflowCategoryTotal(source: Map<string, number>, category: BudgetCategory): number | null {
  const value = (key: string) => source.get(normalizeMatch(key));
  if (category === 'costo_terreno') return value('land') ?? null;
  if (category === 'costo_directo') return value('direct') ?? null;
  if (category === 'costo_indirecto') return value('indirect') ?? null;
  if (category === 'gastos_ventas_admin') return value('selling') ?? null;
  if (category === 'gastos_financieros_impuestos') {
    const financial = value('financial');
    const tax = value('tax');
    if (financial == null && tax == null) return null;
    return Number(financial || 0) + Number(tax || 0);
  }
  return null;
}

export default function ConstructionBudgetView({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [summary, setSummary] = useState<any>({ categories: {}, grandTotal: 0 });
  const [cashflow, setCashflow] = useState<CashflowModel | null>(null);
  const [dynamicCashflow, setDynamicCashflow] = useState<CashflowModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(CLOSED_CATEGORIES);
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [deleting, setDeleting] = useState<BudgetItem | null>(null);
  const [form, setForm] = useState<any>({});
  const [printing, setPrinting] = useState(false);
  // Moneda unica de la pantalla: los montos base del presupuesto/flujo son USD.
  // La pantalla puede mostrarse en soles con el toggle: en ese caso se MULTIPLICA
  // por el tipo de cambio (solo visual, el dato guardado sigue en dolares).
  // En US$ el monto se pinta tal cual.
  const { currency, setCurrency, exchangeRate, setExchangeRate } = useDisplayCurrency();
  // Simbolo de la moneda activa para los encabezados de la tabla.
  const symbol = String(currency).toUpperCase() === 'USD' ? 'US$' : 'S/';
  // Convierte un monto base (dolares) a la moneda activa: en S/ multiplica por el TC.
  const toDisplay = (value: number) => (String(currency).toUpperCase() === 'PEN' ? Number(value || 0) * exchangeRate : Number(value || 0));
  // En movil la columna del monto es angosta: pintamos el numero sin simbolo
  // (el encabezado ya lo indica) para que no se amontone con el Concepto.
  const showUsdBase = (value: number) => formatCurrency(toDisplay(value), currency);
  const showUsdBaseCompact = (value: number) => showUsdBase(value).replace(/^[^\d-]+/, '').trim();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, cashflowData, dynamicCashflowData] = await Promise.all([
        api.get<any>(`/construction-budget?projectId=${projectId}`),
        api.get<CashflowModel | null>(`/cashflow/model?projectId=${projectId}&mode=estatico`).catch(() => null),
        api.get<CashflowModel | null>(`/cashflow/model?projectId=${projectId}&mode=dinamico`).catch(() => null),
      ]);
      setItems(data?.items || []);
      setSummary(data?.summary || { categories: {}, grandTotal: 0 });
      setCashflow(cashflowData && Array.isArray(cashflowData.rows) ? cashflowData : null);
      // Salvaguarda: los modelos dinamicos guardados ANTES del arreglo podian ser
      // una copia del estatico (mismo monto en Real y Proyectado). Si el registro
      // no trae la marca de version del sembrado dinamico, se ignora para no
      // mostrar un Real contaminado; se regenerara al abrir el flujo de caja.
      const dynamicIsClean = dynamicCashflowData
        && Array.isArray(dynamicCashflowData.rows)
        && Number((dynamicCashflowData.assumptions || {}).dynamicSeedVersion || 0) >= DYNAMIC_SEED_VERSION;
      setDynamicCashflow(dynamicIsClean ? dynamicCashflowData : null);
      setOpenCats(CLOSED_CATEGORIES);
      setOpenItems({});
    } catch (error: any) {
      toast(error?.message || 'No se pudo cargar el presupuesto', 'err');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!printing) return undefined;
    const done = () => {
      setPrinting(false);
      setOpenCats(CLOSED_CATEGORIES);
      setOpenItems({});
    };
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

  /**
   * Indice de un modelo de flujo de caja indexado por id tecnico (clave canonica,
   * un unico valor por fila) y, aparte, por label normalizado. Antes se sumaban
   * id y label en el MISMO mapa, lo que hacia que una fila fuera alcanzable por
   * dos claves y el matching difuso la contara dos veces (duplicando montos).
   * Ahora el id es la unica fuente numerica y el label solo sirve para resolver
   * exactamente una fila (nunca para sumar varias).
   *
   * Ademas se reconstruye la JERARQUIA del flujo (`childrenByParent`) y un mapa
   * de claves normalizadas hacia el id canonico de la fila (`rowIdByKey`), de
   * modo que una subpartida pueda resolverse por nombre ACOTADO a los hijos de su
   * fila padre. Esto es clave en produccion: hay hasta 3 niveles de subpartidas y
   * sin acotar por padre dos homonimas en secciones distintas se confundirian o
   * colapsarian sobre el total del padre.
   */
  const buildFlowIndex = useCallback((model: CashflowModel | null) => {
    const byId = new Map<string, number>();
    const byLabel = new Map<string, number>();
    const childrenByParent = new Map<string, CashflowRow[]>();
    const rowIdByKey = new Map<string, string>();
    for (const row of model?.rows || []) {
      const total = (row.values || []).reduce((sum, value) => sum + Number(value || 0), 0);
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
    return { byId, byLabel, childrenByParent, rowIdByKey };
  }, []);

  const cashflowIndex = useMemo(() => buildFlowIndex(cashflow), [cashflow, buildFlowIndex]);
  const dynamicCashflowIndex = useMemo(() => buildFlowIndex(dynamicCashflow), [dynamicCashflow, buildFlowIndex]);

  /**
   * Fila del flujo a la que apunta cada categoria del presupuesto. Se usa como
   * ultimo recurso cuando el flujo no expone la fila de seccion (land/direct/
   * indirect/selling/financial): asi el monto nunca queda en cero si la data
   * existe en el flujo.
   */
  const staticCategoryRow: Record<BudgetCategory, string> = {
    costo_terreno: 'land',
    costo_directo: 'direct',
    costo_indirecto: 'indirect',
    gastos_ventas_admin: 'selling',
    gastos_financieros_impuestos: 'financial',
  };

  /**
   * Id de la fila del flujo que corresponde a una partida del presupuesto (su
   * "clave"). Se usa para acotar la busqueda de sus subpartidas a los hijos de
   * esa fila. Orden: 1) la fila mapeada por codigo/nombre de la partida
   * (`budgetCashflowKey`), 2) el mapeo hacia su id canonico en el flujo
   * (`rowIdByKey`), 3) su propio codigo/nombre normalizado.
   */
  function parentFlowKeyFor(index: FlowIndex, item: BudgetItem | null | undefined): string | null {
    if (!item) return null;
    const mapped = budgetCashflowKey(item);
    if (mapped) {
      const key = normalizeMatch(mapped);
      if (index.rowIdByKey.has(key)) return index.rowIdByKey.get(key) || mapped;
      if (index.byId.has(key)) return mapped;
    }
    const name = normalizeMatch(item.name);
    if (name && index.rowIdByKey.has(name)) return index.rowIdByKey.get(name) || null;
    const code = normalizeMatch(item.code);
    if (code && index.rowIdByKey.has(code)) return index.rowIdByKey.get(code) || null;
    return null;
  }

  /**
   * Resuelve el monto de UNA partida contra UNA fila del flujo. Es determinista:
   * nunca suma varias filas y nunca colapsa subpartidas hermanas sobre el total
   * del padre.
   *
   * Partida raiz (sin parentId): el flujo la define a nivel de partida, asi que
   *   se mapea por codigo/nombre, luego por su codigo exacto y luego por su nombre.
   * Subpartida (con parentId): busca por su NOMBRE ACOTADO a los hijos de su fila
   *   padre (a cualquier nivel de anidamiento: B.01.01, B.01.01.01...). Asi dos
   *   subpartidas homonimas en secciones distintas no se confunden entre si y nunca
   *   colapsan sobre el total del padre. Si no halla por nombre, busca por codigo
   *   entre esos mismos hermanos; y recien despues cae al indice global plano.
   */
  function matchedTotal(
    index: FlowIndex,
    item: BudgetItem,
    parentFlowKey?: string | null,
  ) {
    const isSub = item.parentId != null;
    if (!isSub) {
      const mappedKey = budgetCashflowKey(item) ?? normalizeMatch(BUDGET_CATEGORY_FALLBACK_ROW[item.category]);
      if (mappedKey != null) {
        const mappedValue = index.byId.get(mappedKey);
        if (mappedValue != null) return mappedValue;
      }
    }
    // Subpartida (a cualquier nivel de anidamiento): busca por nombre ACOTADO a los
    // hijos de la fila padre ya resuelta.
    const name = normalizeMatch(item.name);
    if (parentFlowKey) {
      const parentKey = normalizeMatch(parentFlowKey);
      const siblings = index.childrenByParent.get(parentKey) || [];
      if (name) {
        const child = siblings.find((row) => normalizeMatch(row.label) === name);
        if (child) return (child.values || []).reduce((sum, value) => sum + Number(value || 0), 0);
      }
      const code = normalizeMatch(item.code);
      if (code) {
        const child = siblings.find((row) => normalizeMatch(row.id) === code || normalizeMatch(row.label) === code);
        if (child) return (child.values || []).reduce((sum, value) => sum + Number(value || 0), 0);
      }
    }
    // Fallback: indice global plano (por nombre y luego por codigo).
    if (name) {
      const byName = index.byLabel.get(name) ?? index.byId.get(name);
      if (byName != null) return byName;
    }
    const code = normalizeMatch(item.code);
    if (code) {
      const byCode = index.byId.get(code) ?? index.byLabel.get(code);
      if (byCode != null) return byCode;
    }
    if (!isSub) {
      if (name) {
        const byName = index.byId.get(name) ?? index.byLabel.get(name);
        if (byName != null) return byName;
      }
    }
    return 0;
  }

  /**
   * Monto proyectado de una partida. Sale del Flujo de Caja ESTATICO (modo
   * 'estatico'), que es donde el cliente carga sus partidas y subpartidas. Si el
   * flujo no expone la fila, se usa el monto manual de la partida.
   */
  function projectedAmount(item: BudgetTreeItem, parentFlowKey?: string | null): number {
    if (item.children.length) {
      const selfKey = parentFlowKeyFor(cashflowIndex, item) || parentFlowKey || null;
      return item.children.reduce((sum, child) => sum + projectedAmount(child, selfKey), 0);
    }
    const fromCashflow = matchedTotal(cashflowIndex, item, parentFlowKey);
    if (fromCashflow) return fromCashflow;
    // Si la subpartida no encuentra su fila en el flujo, usa su monto manual.
    // Solo para partidas raiz se cae a la categoria cuando no hay match.
    if (item.parentId != null) return Number(item.amount || 0);
    // Partida raiz: si la fila de seccion existe en el estatico (aunque sume 0), se respeta.
    const categoryRow = staticCategoryRow[item.category];
    const categoryValue = cashflowIndex.byId.get(normalizeMatch(categoryRow));
    if (categoryValue != null) return categoryValue;
    return Number(item.amount || 0);
  }

  /**
   * Monto real de una partida. Consume UNICAMENTE el Flujo de Caja Dinámico
   * (modo 'dinamico'), que se alimenta de Cuentas y Bancos. No se mezcla con
   * el estático.
   */
  function realAmount(item: BudgetTreeItem, parentFlowKey?: string | null): number {
    if (item.children.length) {
      const selfKey = parentFlowKeyFor(dynamicCashflowIndex, item) || parentFlowKey || null;
      return item.children.reduce((sum, child) => sum + realAmount(child, selfKey), 0);
    }
    const fromDynamic = matchedTotal(dynamicCashflowIndex, item, parentFlowKey);
    if (fromDynamic) return fromDynamic;
    // Si la subpartida no encuentra su fila en el flujo dinamico, usa su monto manual.
    // Solo para partidas raiz se cae a la categoria cuando no hay match.
    if (item.parentId != null) return Number(item.amount || 0);
    // Partida raiz: ultima recurso es la fila de seccion del flujo dinamico.
    const categoryRow = staticCategoryRow[item.category];
    const categoryKey = normalizeMatch(categoryRow);
    const dynamicCategory = dynamicCashflowIndex.byId.get(categoryKey);
    if (dynamicCategory != null) return dynamicCategory;
    return 0;
  }

  const budgetTotals = useMemo(() => {
    const categories = Object.fromEntries(itemTree.map((cat) => [
      cat.key,
      {
        projected: cashflowCategoryTotal(cashflowIndex.byId, cat.key) ?? cat.roots.reduce((sum, item) => sum + projectedAmount(item), 0),
        // Real: UNICAMENTE flujo dinamico (data de Cuentas y Bancos), pero el
        // encabezado debe cuadrar con las subpartidas visibles del presupuesto.
        // Si se toma primero el total de seccion del flujo (`indirect`,
        // `selling`, `financial`), puede diferir de la suma de C.01/C.02..., D.01
        // ... o E.01... cuando el flujo dinamico trae filas hijas homologadas.
        real: cat.roots.reduce((sum, item) => sum + realAmount(item), 0),
      },
    ])) as Record<BudgetCategory, { projected: number; real: number }>;
    const projected = Object.values(categories).reduce((sum, item) => sum + item.projected, 0);
    const real = Object.values(categories).reduce((sum, item) => sum + item.real, 0);
    return { categories, projected, real };
  }, [itemTree, cashflowIndex, dynamicCashflowIndex]);
  const staticConstructionCost = cashflowIndex.byId.get(normalizeMatch('construction')) || 0;

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
      status: 'sin_inicio' as BudgetStatus,
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

  // Cambia el estado de una partida/subpartida directamente desde la tabla.
  // Se actualiza la UI de inmediato (optimista) y, si el backend falla, se revierte.
  async function updateStatus(item: BudgetTreeItem, status: BudgetStatus) {
    if (item.status === status) return;
    setItems((current) => current.map((row) => (Number(row.id) === Number(item.id) ? { ...row, status } : row)));
    if (editing && Number(editing.id) === Number(item.id)) setEditing({ ...editing, status });
    try {
      await api.patch(`/construction-budget/${item.id}`, { status });
    } catch (error: any) {
      setItems((current) => current.map((row) => (Number(row.id) === Number(item.id) ? { ...row, status: item.status } : row)));
      if (editing && Number(editing.id) === Number(item.id)) setEditing({ ...editing, status: item.status });
      toast(error?.message || 'No se pudo actualizar el estado', 'err');
    }
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
            <span className="budget-amount-compact md:hidden">{showUsdBaseCompact(projected)}</span>
            <span className="budget-amount-full hidden md:inline">{showUsdBase(projected)}</span>
          </td>
          <td className="budget-cell-real whitespace-nowrap px-2 py-3 text-right text-xs font-bold tabular-nums sm:text-sm md:px-3" style={{ color: real > 0 ? '#16A36A' : INK }}>
            <span className="budget-amount-compact md:hidden">{showUsdBaseCompact(real)}</span>
            <span className="budget-amount-full hidden md:inline">{showUsdBase(real)}</span>
          </td>
          <td className="budget-cell-advance px-1.5 py-3 text-right md:px-3">
            <span className="inline-block rounded-full px-1.5 py-1 text-[11px] font-bold tabular-nums sm:px-2.5 sm:text-xs" style={{ background: advance >= 100 ? '#EAF7EE' : '#F1F5F9', color: advance >= 100 ? '#16A36A' : BRAND.blue }}>
              {advance.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </span>
          </td>
          <td className="budget-cell-status px-1.5 py-3 text-center md:px-3">
            {/* En pantalla se edita con el pill-select; en impresion se muestra solo el texto. */}
            <StatusPillSelect
              className="budget-no-print"
              title="Estado de la partida"
              value={item.status || 'sin_inicio'}
              onChange={(next) => updateStatus(item, next as BudgetStatus)}
              options={STATUS_PILL_OPTIONS}
            />
            <span className="budget-status-text" style={{ color: statusMeta(item.status).color, fontWeight: 700 }}>
              {statusMeta(item.status).label}
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
          .budget-table { width: 100% !important; min-width: 1120px !important; }
        }
        /* En pantalla el estado se edita con el selector; el texto solo se usa al imprimir. */
        .budget-status-text { display: none; }
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
             (Concepto + Proyectado): aqui se fuerzan las columnas para que
             Real, Avance %, Estado y Acciones reaparezcan en el PDF. */
          .budget-print-area .budget-table > colgroup > .budget-col-concept { width: 34% !important; }
          .budget-print-area .budget-table > colgroup > .budget-col-projected { width: 14% !important; }
          .budget-print-area .budget-table > colgroup > .budget-col-real { width: 14% !important; }
          .budget-print-area .budget-table > colgroup > .budget-col-advance { width: 11% !important; }
          .budget-print-area .budget-table > colgroup > .budget-col-status { width: 15% !important; }
          .budget-print-area .budget-table > colgroup > .budget-col-actions { width: 12% !important; }
          .budget-print-area .budget-table .budget-cell-real,
          .budget-print-area .budget-table .budget-cell-advance,
          .budget-print-area .budget-table .budget-cell-status { display: table-cell !important; }
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
          /* En el PDF el estado se muestra como texto (el select queda oculto). */
          .budget-print-area .budget-status-text {
            display: inline-block !important;
            white-space: nowrap;
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
            <div className="budget-no-print grid w-full grid-cols-2 gap-2 lg:w-auto lg:max-w-[460px]">
              <div className="flex w-full justify-center col-span-2 lg:justify-end">
                <CurrencyToggle
                  currency={currency}
                  setCurrency={setCurrency}
                  exchangeRate={exchangeRate}
                  setExchangeRate={setExchangeRate}
                />
              </div>
              <button className="btn-neutral w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm" onClick={exportPdf}><FiDownload /> Exportar PDF</button>
              <button className="btn-neutral w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm" onClick={load} disabled={loading}><FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar</button>
              <button className="btn-outline w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm" onClick={seedBase} disabled={items.length > 0} title={items.length > 0 ? 'La base solo se carga cuando el presupuesto esta vacio' : 'Carga las partidas base del presupuesto'}><FiFilePlus /> Base</button>
              <button className="btn-primary w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm" onClick={() => openCreate('costo_directo')}><FiPlus /> Nueva partida</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t bg-[#F8FAFC] p-4 xl:grid-cols-7" style={{ borderColor: BORDER }}>
            <div className="min-w-0 rounded-md border bg-white p-3 sm:p-4 xl:col-span-1" style={{ borderColor: BORDER }}>
              <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }}>Total presupuesto</p>
              <p className="mt-1 truncate text-center text-base font-bold tabular-nums sm:text-xl" style={{ color: INK }}>{showUsdBase(budgetTotals.projected || summary?.grandTotal)}</p>
            </div>
            {CATEGORIES.map((cat) => (
              <div key={cat.key} className="min-w-0 rounded-md border bg-white p-3 sm:p-4" style={{ borderColor: BORDER }}>
                <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }} title={`${cat.letter}. ${cat.label}`}>{cat.letter}. {cat.label}</p>
                <p className="mt-1 truncate text-center text-base font-bold tabular-nums sm:text-lg" style={{ color: cat.color }}>{showUsdBase(budgetTotals.categories[cat.key]?.projected || summary?.categories?.[cat.key])}</p>
              </div>
            ))}
            <div className="min-w-0 rounded-md border bg-white p-3 sm:p-4" style={{ borderColor: BORDER }}>
              <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }} title="Costo de construccion">Costo construccion</p>
              <p className="mt-1 truncate text-center text-base font-bold tabular-nums sm:text-lg" style={{ color: '#0F9F6E' }}>{showUsdBase(staticConstructionCost)}</p>
            </div>
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
                <table className="budget-table w-[calc(100cqw_+_440px)] table-fixed border-collapse text-[13px] md:w-full md:min-w-[1120px] md:text-sm">
                  <colgroup>
                    <col className="budget-col-concept w-[calc(100cqw_-_132px)] md:w-[36%]" />
                    <col className="budget-col-projected w-[132px] md:w-[14%]" />
                    <col className="budget-col-real w-[130px] md:w-[14%]" />
                    <col className="budget-col-advance w-[86px] md:w-[11%]" />
                    <col className="budget-col-status w-[150px] md:w-[13%]" />
                    <col className="budget-col-actions budget-no-print w-[84px] md:w-[12%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b text-[10px] font-bold uppercase tracking-wide" style={{ borderColor: BORDER, background: '#F8FAFC', color: MUTED }}>
                      <th className="px-3 py-3 text-left sm:px-4">Concepto</th>
                      <th className="budget-head-projected whitespace-nowrap px-2 py-3 text-right md:px-3">Proyectado {symbol}</th>
                      <th className="budget-cell-real whitespace-nowrap px-2 py-3 text-right md:px-3">Real {symbol}</th>
                      <th className="budget-cell-advance whitespace-nowrap px-1.5 py-3 text-right md:px-3">Avance %</th>
                      <th className="budget-cell-status whitespace-nowrap px-1.5 py-3 text-center md:px-3">Estado</th>
                      <th className="budget-no-print px-1.5 py-3 text-right md:px-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemTree.map((cat) => {
                      const categoryProjected = budgetTotals.categories[cat.key]?.projected || 0;
                      const categoryReal = budgetTotals.categories[cat.key]?.real || 0;
                      const categoryAdvance = pct(categoryReal, categoryProjected);
                      const isOpen = printing || openCats[cat.key] === true;
                      return (
                        <Fragment key={cat.key}>
                          <tr className="border-b" style={{ borderColor: BORDER, background: '#F8FAFC' }}>
                            <td className="px-3 py-3 sm:px-4">
                              <button
                                type="button"
                                className="flex w-full min-w-0 items-center gap-2 overflow-hidden text-left sm:gap-3"
                                onClick={() => setOpenCats((current) => ({ ...current, [cat.key]: current[cat.key] !== true }))}
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
                              <span className="budget-amount-compact md:hidden">{showUsdBaseCompact(categoryProjected)}</span>
                              <span className="budget-amount-full hidden md:inline">{showUsdBase(categoryProjected)}</span>
                            </td>
                            <td className="budget-cell-real whitespace-nowrap px-2 py-3 text-right text-xs font-bold tabular-nums sm:text-sm md:px-3" style={{ color: categoryReal > 0 ? '#16A36A' : INK }}>
                              <span className="budget-amount-compact md:hidden">{showUsdBaseCompact(categoryReal)}</span>
                              <span className="budget-amount-full hidden md:inline">{showUsdBase(categoryReal)}</span>
                            </td>
                            <td className="budget-cell-advance px-1.5 py-3 text-right md:px-3">
                              <span className="inline-block rounded-full px-1.5 py-1 text-[11px] font-bold tabular-nums sm:px-2.5 sm:text-xs" style={{ background: categoryAdvance >= 100 ? '#EAF7EE' : '#F1F5F9', color: categoryAdvance >= 100 ? '#16A36A' : BRAND.blue }}>
                                {categoryAdvance.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                              </span>
                            </td>
                            <td className="budget-cell-status px-1.5 py-3 text-center md:px-3" />
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
                        <span className="budget-amount-compact md:hidden">{showUsdBaseCompact(budgetTotals.projected)}</span>
                        <span className="budget-amount-full hidden md:inline">{showUsdBase(budgetTotals.projected)}</span>
                      </td>
                      <td className="budget-cell-real whitespace-nowrap px-2 py-4 text-right text-xs font-extrabold tabular-nums sm:text-sm md:px-3" style={{ color: '#16A36A' }}>
                        <span className="budget-amount-compact md:hidden">{showUsdBaseCompact(budgetTotals.real)}</span>
                        <span className="budget-amount-full hidden md:inline">{showUsdBase(budgetTotals.real)}</span>
                      </td>
                      <td className="budget-cell-advance px-1.5 py-4 text-right md:px-3">
                        <span className="inline-block rounded-full bg-white px-1.5 py-1 text-[11px] font-extrabold tabular-nums sm:px-2.5 sm:text-xs" style={{ color: pct(budgetTotals.real, budgetTotals.projected) >= 100 ? '#16A36A' : BRAND.blue }}>
                          {pct(budgetTotals.real, budgetTotals.projected).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                        </span>
                      </td>
                      <td className="budget-cell-status px-1.5 py-4 md:px-3" />
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

              <Field label="Estado">
                <Select
                  value={form.status || 'sin_inicio'}
                  onChange={(value) => setForm((p: any) => ({ ...p, status: value as BudgetStatus }))}
                  options={STATUS_OPTIONS.map((status) => ({ value: status.key, label: status.label }))}
                />
              </Field>
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

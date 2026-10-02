'use client';

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiBriefcase, FiCheck, FiClipboard, FiCreditCard, FiDollarSign, FiDownload, FiEdit3, FiHome, FiLayers, FiMapPin, FiPercent, FiPieChart, FiPlus, FiRefreshCw, FiSave, FiTool, FiTrendingUp, FiZap } from 'react-icons/fi';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/types';
import { Toaster, toast } from '@/components/ui/ui';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { useDisplayCurrency } from '@/lib/currency';

type Row = { id: string; label: string; group?: boolean; computed?: boolean; values: number[]; parentId?: string; depth?: number };
type CashflowMode = 'estatico' | 'dinamico';
type SectionRowDefinition = { id: string; label: string; computed?: boolean; parentId?: string };
const MODE_LABEL: Record<CashflowMode, string> = { estatico: 'Flujo estático', dinamico: 'Flujo dinámico' };
const MAX_PROJECTION_YEARS = 15;
const YEAR_COUNT = MAX_PROJECTION_YEARS + 1;
const YEARS = Array.from({ length: YEAR_COUNT }, (_, index) => `Año ${index}`);
// El endpoint /sales valida limit con @Max(100) (pagination.dto.ts): pedir 500
// devolvía 400 Bad Request y el flujo se generaba sin ventas.
const SALES_EXPORT_LIMIT = 100;
/**
 * Versionado del sembrado del flujo estatico. Se guarda dentro de `assumptions`.
 * v1 (implicita, sin marca) escribia en Año 0 las filas 'initial-fee' y
 * 'financing-fee' a partir del % de cuota inicial (saleValue * initialPercent y
 * saleValue * (1 - initialPercent)), pisando lo que el usuario borraba.
 * v2 las trata como numero plano: por defecto 0 y solo cambian si el usuario
 * escribe o si vienen de pagos reales. Al leer un modelo v1 se limpian.
 */
const CASHFLOW_SEED_VERSION = 2;
/** Filas que NO se rellenan por formula desde los supuestos (celdas planas). */
const PLAIN_NUMBER_ROW_IDS = ['initial-fee', 'financing-fee'];
const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
const empty = () => Array(YEAR_COUNT).fill(0) as number[];
const normalizeValues = (values?: number[]) => Array.from({ length: YEAR_COUNT }, (_, index) => Number(values?.[index] || 0));

// Columnas fijas de las tablas. `cqw` = ancho visible del contenedor con scroll
// (se activa con [container-type:inline-size]).
// En movil: Concepto = ancho visible - 116px (104px de Total + 12px del primer año que
// "asoma" para que se note que hay mas a la derecha). El texto se recorta con "...".
// Desde md vuelve a 232px, con columnas pegadas (sticky) como antes.
const CONCEPT_COL = 'w-[calc(100cqw_-_112px)] min-w-[calc(100cqw_-_112px)] max-w-[calc(100cqw_-_112px)] md:w-[232px] md:min-w-[232px] md:max-w-none';
const TOTAL_COL = 'w-[100px] min-w-[100px]';
const YEAR_COL = 'w-[100px] min-w-[100px]';

function computeIRR(flow: number[]): number | null {
    const hasNeg = flow.some((value) => value < 0);
    const hasPos = flow.some((value) => value > 0);
    if (!hasNeg || !hasPos) return null;
    const npvAt = (rate: number) => flow.reduce((sum, value, year) => sum + value / Math.pow(1 + rate, year), 0);
    let low = -0.9, high = 10.0;
    let lowValue = npvAt(low), highValue = npvAt(high);
    if ((lowValue > 0 && highValue > 0) || (lowValue < 0 && highValue < 0)) return null;
    for (let i = 0; i < 200; i++) {
        const mid = (low + high) / 2;
        const midValue = npvAt(mid);
        if (Math.abs(midValue) < 1e-8) return mid;
        if ((lowValue < 0) === (midValue < 0)) { low = mid; lowValue = midValue; }
        else { high = mid; highValue = midValue; }
    }
    return (low + high) / 2;
}

const CONSTRUCTION_CHILD_ROWS: SectionRowDefinition[] = [
    { id: 'construction-earthworks', label: 'Movimiento de tierras', parentId: 'construction' },
    { id: 'construction-sanitation', label: 'Obras de saneamiento', parentId: 'construction' },
    { id: 'construction-roads', label: 'Pavimentación y vías', parentId: 'construction' },
    { id: 'construction-electric', label: 'Redes eléctricas y alumbrado público', parentId: 'construction' },
    { id: 'construction-complementary', label: 'Obras complementarias', parentId: 'construction' },
];

const SECTIONS: Array<{ id: string; label: string; tone: string; computed?: boolean; rows: SectionRowDefinition[] }> = [
    {
        id: 'income', label: 'Ingreso por venta de lotes', tone: BRAND.blue, rows: [
            { id: 'lots-sold', label: 'Venta de lotes por año' },
            { id: 'initial-fee', label: 'Cuota inicial' },
            { id: 'financing-fee', label: 'Cuota financiamiento (lotes que pagan cuota)' },
        ]
    },
    { id: 'cost-sales', label: 'Costo de venta de lotes', tone: '#0EA5A9', rows: [] },
    {
        id: 'land', label: 'Costo de Terreno', tone: '#D97706', rows: [
            { id: 'land-cost', label: 'Costos de Terreno' },
            { id: 'alcabala', label: 'Alcabala (3%)' },
            { id: 'legal', label: 'Asesoria Legal, Gastos Notariales y Legales' },
        ]
    },
    {
        id: 'direct', label: 'Costo Directo', tone: '#16A36A', rows: [
            { id: 'construction', label: 'Costos de Construcción', computed: true },
            ...CONSTRUCTION_CHILD_ROWS,
            { id: 'supervision', label: 'Supervisión Técnica (4% de CC)' },
            { id: 'services', label: 'Conexión de Servicios Públicos (1% de CC)' },
        ]
    },
    {
        id: 'indirect', label: 'Costo Indirecto', tone: '#8064A2', rows: [
            { id: 'design', label: 'Diseño Proyecto, Licencias, etc. (3% de Costos)' },
            { id: 'management', label: 'Gerencia de Proyectos (4% de Ventas)' },
            { id: 'indemnity', label: 'Indemnización, Titulación, etc. (1% de Costos Const.)' },
            { id: 'legal-contingency', label: 'Gastos Legales, Imprevistos, Otros (5% CC)' },
        ]
    },
    { id: 'gross', label: 'Utilidad bruta', tone: '#15803D', rows: [], computed: true },
    {
        id: 'selling', label: 'Gastos de Ventas y Administrativos', tone: '#E11D48', rows: [
            { id: 'sales-plan', label: 'Pago de Planillas' },
            { id: 'marketing', label: 'Publicidad - MKT Digital (1.5% de Ventas)' },
            { id: 'commission', label: 'Comisión de Ventas (2.5% de Ventas)' },
            { id: 'post-sale', label: 'Post Venta (1% de Ventas)' },
            { id: 'discounts', label: 'Descuentos (bonos) (10% de Ventas)' },
        ]
    },
    { id: 'operating', label: 'Utilidad operativa', tone: '#15803D', rows: [], computed: true },
    { id: 'financial', label: 'Gastos financieros', tone: '#DC2626', rows: [] },
    { id: 'pre-tax', label: 'Utilidad antes de Impuesto', tone: '#15803D', rows: [], computed: true },
    { id: 'tax', label: 'Impuesto a la renta', tone: '#64748B', rows: [] },
    { id: 'net', label: 'Utilidad Neta', tone: '#15803D', rows: [], computed: true },
    { id: 'igv', label: 'IGV Referencial Incluido en Ingresos', tone: '#64748B', rows: [] },
    { id: 'adjusted', label: 'Utilidad Ajustada Referencial Neta', tone: BRAND.blue, rows: [], computed: true },
    { id: 'accumulated-title', label: 'Utilidad Acumulada', tone: BRAND.blue, rows: [], computed: true },
    { id: 'pre-tax-accumulated', label: 'Utilidad Antes de Imp. Acumulada', tone: '#15803D', rows: [], computed: true },
    { id: 'adjusted-accumulated', label: 'Utilidad Ajustada Referencial Acumulada Neta', tone: BRAND.blue, rows: [], computed: true },
];

function row(id: string, label: string, values: number[] = empty(), computed = false): Row { return { id, label, values, computed }; }

function sectionSurface(id: string, computed?: boolean) {
    if (computed) return { background: '#EAF7EE', color: '#125A3B' };
    if (id === 'income') return { background: '#E7F0FE', color: BRAND.blueDark };
    if (id === 'selling' || id === 'financial') return { background: '#FFF4E5', color: '#9A5B00' };
    if (id === 'land' || id === 'direct' || id === 'indirect' || id === 'cost-sales') return { background: '#F3F4F6', color: BRAND.ink };
    return { background: '#EEF2F7', color: BRAND.ink };
}

const SECTION_ICONS: Record<string, any> = {
    income: FiHome,
    'cost-sales': FiCreditCard,
    land: FiMapPin,
    direct: FiTool,
    indirect: FiLayers,
    gross: FiDollarSign,
    selling: FiBriefcase,
    operating: FiTrendingUp,
    financial: FiCreditCard,
    'pre-tax': FiPieChart,
    tax: FiPercent,
    net: FiDollarSign,
    igv: FiClipboard,
    adjusted: FiCheck,
};

const COST_DETAIL_SECTIONS = new Set(['land', 'direct', 'indirect']);
const COST_SALES_CHILD_SECTION_IDS = ['land', 'direct', 'indirect'];
const CASCADE_TOTAL_SECTION_IDS = SECTIONS
    .filter((section) => section.id !== 'income' && section.rows.length > 0)
    .map((section) => section.id);
const SECTION_CHILD_ROW_IDS = Object.fromEntries(SECTIONS.map((section) => [section.id, section.rows.map((item) => item.id)])) as Record<string, string[]>;

/**
 * Calculo puro del flujo: dadas las filas editables devuelve todas las filas con
 * los totales/subtotales recalculados (ingreso, costos, utilidades, acumulados).
 * Se usa tanto para pintar la tabla como para persistir el flujo dinamico, de modo
 * que el Estado de Resultados lea exactamente los mismos ids y valores.
 */
function calculateRows(input: Row[]): Row[] {
    const next = input.map((item) => ({ ...item, values: normalizeValues(item.values) }));
    const get = (id: string) => next.find((item) => item.id === id)?.values || empty();
    const set = (id: string, values: number[]) => { const item = next.find((candidate) => candidate.id === id); if (item) item.values = values; };
    const childrenByParent = next.reduce<Record<string, Row[]>>((map, item) => {
        if (!item.parentId) return map;
        map[item.parentId] = [...(map[item.parentId] || []), item];
        return map;
    }, {});
    const sumTree = (id: string): number[] => {
        const children = childrenByParent[id] || [];
        if (!children.length) return get(id);
        const values = empty().map((_, year) => children.reduce((sum, child) => sum + Number(sumTree(child.id)[year] || 0), 0));
        set(id, values);
        return values;
    };
    const initialFee = sumTree('initial-fee');
    const financingFee = sumTree('financing-fee');
    const revenue = initialFee.map((_, year) => initialFee[year] + financingFee[year]);
    const construction = sumTree('construction');
    const cascadeTotals = Object.fromEntries(CASCADE_TOTAL_SECTION_IDS.map((id) => [id, sumTree(id)])) as Record<string, number[]>;
    const land = cascadeTotals.land || empty();
    const direct = cascadeTotals.direct || empty();
    const indirect = cascadeTotals.indirect || empty();
    const costSales = empty().map((_, year) => land[year] + direct[year] + indirect[year]);
    const selling = cascadeTotals.selling || empty();
    const financial = (childrenByParent.financial || []).length ? sumTree('financial') : get('financial');
    const tax = (childrenByParent.tax || []).length ? sumTree('tax') : get('tax');
    const igv = (childrenByParent.igv || []).length ? sumTree('igv') : get('igv');
    const gross = revenue.map((value, year) => value - costSales[year]);
    const operating = gross.map((value, year) => value - selling[year]);
    const preTax = operating.map((value, year) => value - financial[year]);
    const net = preTax.map((value, year) => value - tax[year]);
    const adjusted = net.map((value, year) => value - igv[year]);
    const accumulate = (values: number[]) => values.reduce<number[]>((totals, value, year) => {
        totals.push((totals[year - 1] || 0) + value);
        return totals;
    }, []);
    const computedValues: Record<string, number[]> = {
        income: revenue,
        ...cascadeTotals,
        construction,
        direct,
        'cost-sales': costSales,
        gross,
        operating,
        financial,
        'pre-tax': preTax,
        tax,
        net,
        igv,
        adjusted,
        'pre-tax-accumulated': accumulate(preTax),
        'adjusted-accumulated': accumulate(adjusted),
    };
    Object.entries(computedValues).forEach(([id, values]) => set(id, values));
    return next;
}

function SectionTitle({ section, color, label }: { section: { id: string; label: string }; color: string; label?: ReactNode }) {
    const Icon = SECTION_ICONS[section.id] || FiClipboard;
    const isCostDetail = COST_DETAIL_SECTIONS.has(section.id);

    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border bg-white/80" style={{ borderColor: `${color}40`, color }}>
                <Icon size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden">
                    {isCostDetail && (
                        <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ borderColor: '#0EA5A94D', color: '#0F766E', background: '#ECFEFF' }}>
                            Costo
                        </span>
                    )}
                    {label || <span className="truncate">{section.label}</span>}
                </div>
            </div>
        </div>
    );
}

export default function CashflowExcelTestView({ projectId }: { projectId: number }) {
    const { currency, setCurrency, exchangeRate, setExchangeRate, toDisplay, format: show } = useDisplayCurrency();
    const [rows, setRows] = useState<Row[]>([]);
    const [manual, setManual] = useState({
        landArea: 0,
        lotArea: 0,
        totalLots: 0,
        priceM2: 0,
        initialPercent: 10,
        years: 10,
        startYear: new Date().getFullYear(),
        alcabalaPercent: 3,
        supervisionPercent: 4,
        servicesPercent: 1,
        designPercent: 3,
        managementPercent: 4,
        indemnityPercent: 1,
        contingencyPercent: 5,
        discountRate: 10,
    });
    const projectionYears = Math.max(1, Math.min(MAX_PROJECTION_YEARS, Math.round(Number(manual.years) || 10)));
    const visibleYears = YEARS.slice(0, projectionYears + 1);
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [overrides, setOverrides] = useState<Record<string, number[]>>({});
    const [assumptionsOpen, setAssumptionsOpen] = useState(false);
    const [draftManual, setDraftManual] = useState(manual);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const rowsRef = useRef<Row[]>([]);
    const editSnapshot = useRef<{ id: string; year: number; value: number } | null>(null);
    const [pendingEdit, setPendingEdit] = useState<{ id: string; year: number; value: number; original: number } | null>(null);
    const [editingDrafts, setEditingDrafts] = useState<Record<string, string>>({});
    const autosaveInFlight = useRef(false);
    const autosaveQueued = useRef(false);
    const [mode, setMode] = useState<CashflowMode>('estatico');
    const [modeSwitchOpen, setModeSwitchOpen] = useState(false);
    const [pendingMode, setPendingMode] = useState<CashflowMode | null>(null);
    const [hasSavedModel, setHasSavedModel] = useState(false);
    const [savingModel, setSavingModel] = useState(false);
    const [baseYear, setBaseYear] = useState(new Date().getFullYear());
    // Primer año con data real del sistema en el flujo dinamico: a su izquierda el
    // cliente carga el historico a mano (el sistema es nuevo, sin años previos).
    const [firstDataYear, setFirstDataYear] = useState(new Date().getFullYear());
    const [editingLabel, setEditingLabel] = useState<string | null>(null);
    const [hidePastYears, setHidePastYears] = useState(false);
    const [subpartidaModal, setSubpartidaModal] = useState<{ parentId: string; parentLabel: string } | null>(null);
    const [subpartidaName, setSubpartidaName] = useState('');

    /**
     * Construye las filas base ("seed") con la data real del sistema.
     * `anchorYear` es el Año 0 definido por el cliente (`startYear`): la data se
     * coloca en la columna `añoRegistro - anchorYear`. En dinamico SIEMPRE manda
     * el cliente, porque las columnas se rotulan `startYear + year`; si no se
     * pasara, una venta de 2026 caeria en la columna rotulada 2021.
     * En estatico se pasa `null` para dejar que el sembrado elija el año base
     * (año actual sin historial, o el año real mas antiguo si hay historial).
     */
    async function buildSeedRows(anchorYear: number | null = null): Promise<{ rows: Row[]; manualFields: Partial<typeof manual>; project: any; baseYear: number; firstDataYear: number }> {
        const [projectData, plan, budget, statement, salesData, paymentsData] = await Promise.all([
            api.get<any>(`/projects/${projectId}`),
            api.get<any>(`/plan/project/${projectId}`).catch(() => ({ lots: [] })),
            api.get<any>(`/construction-budget?projectId=${projectId}`).catch(() => ({ items: [], summary: {} })),
            api.get<any>(`/finances/income-statement?projectId=${projectId}`).catch(() => ({})),
            api.get<any>(`/sales?projectId=${projectId}&limit=${SALES_EXPORT_LIMIT}`).catch(() => ({ items: [] })),
            api.get<any>(`/payments?projectId=${projectId}&status=pagado&limit=500`).catch(() => ({ items: [] })),
        ]);
        const sales = Array.isArray(salesData) ? salesData : (salesData?.items || []);
        const payments = Array.isArray(paymentsData) ? paymentsData : (paymentsData?.items || []);
        const lots = plan?.lots || [];
        const budgetItems = budget?.items || [];
        const budgetByCategory = (category: string) => budgetItems
            .filter((item: any) => item.category === category)
            .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
        const budgetByName = (names: string[]) => budgetItems
            .filter((item: any) => names.some((name) => String(item.name || '').toLowerCase().includes(name)))
            .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
        // Partidas del presupuesto dentro de una categoria, filtradas por nombre.
        const budgetInCategory = (category: string, names: string[]) => budgetItems
            .filter((item: any) => item.category === category && names.some((name) => String(item.name || '').toLowerCase().includes(name)))
            .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
        const totalLots = lots.length || Number(projectData?.stats?.total || 0);
        const price = Number(projectData?.referencePrice || 0);
        const lotSaleValue = lots.reduce((sum: number, lot: any) => sum + Number(lot.finalPrice || lot.salePrice || lot.price || 0), 0);
        const landArea = lots.reduce((sum: number, lot: any) => sum + Number(lot.areaM2 || lot.area || 0), 0);
        const lotArea = totalLots > 0 ? landArea / totalLots : 0;
        const saleValue = lotSaleValue || landArea * price;
        const landLegal = budgetByName(['gastos legales y notariales', 'legal de compra', 'notarial']);
        const land = Math.max(0, budgetByCategory('costo_terreno') - landLegal);
        const direct = budgetByCategory('costo_directo');
        const indirect = budgetByCategory('costo_indirecto');
        const sellingAdmin = budgetByCategory('gastos_ventas_admin');
        const financing = Number(statement?.egresos_clasificados?.financiamiento || 0);
        const tax = Number(statement?.egresos_clasificados?.impuestos || 0);
        const TOTAL_ONLY_IDS = ['cost-sales', 'gross', 'operating', 'pre-tax', 'net', 'adjusted', 'accumulated-title', 'pre-tax-accumulated', 'adjusted-accumulated'];
        const seedRows = SECTIONS.flatMap((section) => {
            if (TOTAL_ONLY_IDS.includes(section.id)) return [row(section.id, section.label, empty(), true)];
            if (section.id === 'financial') return [row(section.id, section.label, [financing])];
            if (section.id === 'tax') return [row(section.id, section.label, [tax])];

            return [
                row(section.id, section.label, empty(), section.rows.length > 0),
                ...section.rows.map((item) => ({
                    ...row(item.id, item.label, empty(), Boolean(item.computed)),
                    parentId: item.parentId || section.id,
                    depth: item.parentId ? 2 : 1,
                })),
            ];
        });
        const yearOf = (rawDate: any): number | null => {
            if (!rawDate) return null;
            const date = new Date(rawDate);
            return Number.isNaN(date.getTime()) ? null : date.getFullYear();
        };
        const saleYears = sales.map((sale: any) => yearOf(sale.saleDate)).filter((year: number | null): year is number => year !== null);
        const paidPayments = payments.filter((payment: any) => String(payment.status || '').toLowerCase() === 'pagado');
        const paymentYearOf = (payment: any) => yearOf(payment.paidAt || payment.paid_at || payment.createdAt);
        const paymentYears = paidPayments.map(paymentYearOf).filter((year: number | null): year is number => year !== null);
        // El Año 0 lo define el cliente con `startYear` (editable en supuestos) y las
        // columnas de la tabla se rotulan `startYear + indice`. Por eso la data debe
        // posicionarse contra ESE año:
        //  - anchorYear presente (dinamico): el año base es tal cual, y un registro
        //    muy antiguo simplemente cae en Años anteriores, no en Año 0.
        //  - sin anchor (estatico): se acota al rango [año actual - 1, ...] para que
        //    una fecha de prueba vieja (2021) no arrastre la proyeccion hacia atras,
        //    y sin historial se usa el año actual.
        const currentYear = new Date().getFullYear();
        const earliestAllowedYear = currentYear - 1;
        const realYears = [...saleYears, ...paymentYears].filter((year) => year >= earliestAllowedYear);
        const calculatedBaseYear = anchorYear
            || (realYears.length ? Math.min(...realYears) : currentYear);
        const baseYear = calculatedBaseYear;
        // Primer año con data real del sistema dentro del horizonte. Es el limite
        // del historico: a su izquierda el cliente carga a mano, de ahi en adelante
        // manda el sistema. Sin data real se asume el año actual.
        const firstDataYear = [...saleYears, ...paymentYears]
            .filter((year) => year >= baseYear)
            .sort((left, right) => left - right)[0] || currentYear;
        /**
         * Convierte un año calendario al indice de columna. Un año nulo (fecha de
         * venta/pago invalida o ausente) NO cae en Año 0: devuelve null para que
         * el registro se ignore en lugar de inflar el primer año.
         */
        const toSlot = (year: number | null): number | null => {
            if (year === null) return null;
            if (year < baseYear) return null;
            const slot = year - baseYear;
            return slot < YEAR_COUNT ? slot : null;
        };
        const emptySeries = () => Array.from({ length: YEAR_COUNT }, () => 0);
        const setSeries = (id: string, values: number[]) => {
            const item = seedRows.find((candidate) => candidate.id === id);
            if (item) item.values = values;
        };
        const spreadByDates = (total: number, years: Array<number | null>) => {
            const series = emptySeries();
            const slots = years.map((year) => toSlot(year)).filter((slot: number | null): slot is number => slot !== null);
            // Sin fechas utiles no se inventa un Año 0: todo queda en cero.
            if (!slots.length) return series;
            const counts = emptySeries();
            slots.forEach((slot) => { counts[slot] += 1; });
            const totalCount = counts.reduce((sum, value) => sum + value, 0) || 1;
            return series.map((_, index) => total * (counts[index] / totalCount));
        };
        const atYearZero = (total: number) => { const series = emptySeries(); series[0] = total; return series; };

        // Estatico = proyeccion del cuadro general; Dinamico = data real del sistema.
        // Por eso el estatico arranca con el total base de lotes, mientras que el
        // dinamico solo toma los lotes realmente vendidos.
        const isStaticSeed = anchorYear === null;
        const soldLots = isStaticSeed ? totalLots : sales.length;
        const salesYearsList = isStaticSeed
            ? Array.from({ length: Math.round(soldLots) }, () => baseYear)
            : sales.map((sale: any) => yearOf(sale.saleDate));
        setSeries('lots-sold', spreadByDates(soldLots, salesYearsList));
        const realSoldValue = sales.reduce((sum: number, sale: any) => sum + Number(sale.salePrice || 0), 0);
        const soldValue = realSoldValue || (sales.length ? saleValue : 0);
        const paymentSeries = (types: string[]) => {
            const series = emptySeries();
            for (const payment of paidPayments) {
                if (!types.includes(String(payment.type || '').toLowerCase())) continue;
                const slot = toSlot(paymentYearOf(payment));
                if (slot === null) continue;
                series[slot] += Number(payment.amount || 0);
            }
            return series;
        };
        const initialPaymentTypes = ['reserva', 'adelanto', 'primera_cuota', 'cuota_inicial', 'otros'];
        setSeries('initial-fee', sales.length ? paymentSeries(initialPaymentTypes) : emptySeries());
        setSeries('financing-fee', sales.length ? paymentSeries(['cuota']) : emptySeries());
        setSeries('land-cost', atYearZero(land));
        setSeries('alcabala', atYearZero(land * 0.03));
        setSeries('legal', atYearZero(landLegal));
        const constructionBreakdown = [
            { id: 'construction-earthworks', names: ['movimiento de tierras'] },
            { id: 'construction-sanitation', names: ['saneamiento'] },
            { id: 'construction-roads', names: ['pavimentacion', 'pavimentación', 'vias', 'vías'] },
            { id: 'construction-electric', names: ['electricas', 'eléctricas', 'alumbrado'] },
            { id: 'construction-complementary', names: ['complementarias'] },
        ];
        let assignedConstruction = 0;
        constructionBreakdown.forEach((item) => {
            const value = budgetByName(item.names);
            assignedConstruction += value;
            setSeries(item.id, atYearZero(value));
        });
        if (assignedConstruction <= 0) setSeries('construction-earthworks', atYearZero(direct));
        setSeries('supervision', atYearZero(direct * 0.04));
        setSeries('services', atYearZero(direct * 0.01));
        setSeries('design', atYearZero(indirect || direct * 0.03));
        setSeries('indemnity', atYearZero(direct * 0.01));
        setSeries('legal-contingency', atYearZero(direct * 0.05));
        setSeries('management', spreadByDates(soldValue * 0.04, salesYearsList));

        // Gastos de ventas y administrativos: cada partida sale del presupuesto
        // (categoria gastos_ventas_admin, filtrando por nombre); Publicidad recibe lo
        // que no se haya asignado a las demas. Comision y descuentos caen a los datos
        // de las ventas si el presupuesto no los trae.
        const sellingCat = 'gastos_ventas_admin';
        const payrollBudget = budgetInCategory(sellingCat, ['planilla', 'sueldo', 'personal']);
        const commissionBudget = budgetInCategory(sellingCat, ['comisi'])
            || sales.reduce((sum: number, sale: any) => sum + Number(sale.commissionAmount || sale.commission || 0), 0);
        const postSaleBudget = budgetInCategory(sellingCat, ['post venta', 'postventa', 'post-venta']);
        const discountBudget = budgetInCategory(sellingCat, ['descuento', 'bono'])
            || sales.reduce((sum: number, sale: any) => sum + Number(sale.discountAmount || sale.discount || 0), 0);
        const marketingBudget = Math.max(0, sellingAdmin - payrollBudget - commissionBudget - postSaleBudget - discountBudget);
        setSeries('sales-plan', spreadByDates(payrollBudget, salesYearsList));
        setSeries('marketing', spreadByDates(marketingBudget, salesYearsList));
        setSeries('commission', spreadByDates(commissionBudget, salesYearsList));
        setSeries('post-sale', spreadByDates(postSaleBudget, salesYearsList));
        setSeries('discounts', spreadByDates(discountBudget, salesYearsList));

        return { rows: seedRows, manualFields: { landArea, lotArea, totalLots, priceM2: price }, project: projectData, baseYear: calculatedBaseYear, firstDataYear };
    }

    /**
     * El flujo dinamico es siempre una foto de la data real del sistema. Se guarda en
     * BD cada vez que se reconstruye (al abrir esta pantalla o al pulsar "Actualizar
     * data") para que el Estado de Resultados lea de ahi su columna "Real".
     */
    async function persistDynamic(seed: { rows: Row[]; manualFields: Partial<typeof manual>; baseYear: number; firstDataYear: number }) {
        try {
            const dynamicRows = calculateRows(seed.rows).map((item) => ({
                id: item.id,
                label: item.label,
                values: item.values,
                computed: item.computed,
                parentId: item.parentId,
                depth: item.depth,
            }));
            // El historico cargado a mano se guarda aparte del sembrado: asi al
            // reconstruir el dinamico desde el sistema se puede volver a aplicar
            // sin reescribir las columnas que si manda el sistema.
            const historicalValues = collectHistoricalValues(seed.rows, seed.baseYear, seed.firstDataYear);
            await api.post('/cashflow/model', {
                projectId,
                mode: 'dinamico',
                assumptions: {
                    ...seed.manualFields,
                    startYear: seed.baseYear,
                    firstDataYear: seed.firstDataYear,
                    historicalValues,
                    years: Number(manual.years) || 10,
                },
                rows: dynamicRows,
            });
        } catch {
            // Silencioso: es una copia derivada, no debe interrumpir la pantalla.
        }
    }

    const loadModel = useCallback(async (target: CashflowMode) => {
        setLoading(true);
        try {
            if (target === 'dinamico') {
                // Dinamico = data real del sistema ubicada segun el Año 0 que el
                // cliente define en 'startYear'. El modelo dinamico guarda ese
                // startYear, asi que se lee antes de sembrar para no mover la data
                // de columna.
                const savedDynamic = await api.get<any>(`/cashflow/model?projectId=${projectId}&mode=dinamico`).catch(() => null);
                const savedDynamicAssumptions = savedDynamic?.assumptions || {};
                const clientAnchorYear = Number(savedDynamicAssumptions.startYear || 0) || null;
                const seed = await buildSeedRows(clientAnchorYear);
                // El historico (años previos a la data real) lo carga el cliente a
                // mano: se re-aplica sobre el sembrado para que no se pierda al
                // reconstruir el dinamico desde el sistema.
                const savedFirstDataYear = Number(savedDynamicAssumptions.firstDataYear || 0) || 0;
                const historicalValues: Record<string, number[]> = savedDynamicAssumptions.historicalValues || {};
                const restoredRows = Object.keys(historicalValues).length
                    ? seed.rows.map((item) => {
                        const saved = historicalValues[item.id];
                        if (!saved) return item;
                        return {
                            ...item,
                            values: normalizeValues(item.values).map((cell, year) => {
                                // Solo se respetan las columnas historicas: del año
                                // con data real en adelante manda el sistema.
                                const calendarYear = seed.baseYear + year;
                                const limit = savedFirstDataYear || seed.firstDataYear;
                                return calendarYear < limit && saved[year] !== undefined ? Number(saved[year] || 0) : cell;
                            }),
                        };
                    })
                    : seed.rows;
                setProject(seed.project);
                setBaseYear(seed.baseYear);
                setFirstDataYear(savedFirstDataYear || seed.firstDataYear);
                // Se persiste siempre, se este viendo el estatico o el dinamico.
                void persistDynamic({ ...seed, rows: restoredRows });
                // Dinamico = data real del sistema (nunca el estatico guardado).
                rowsRef.current = restoredRows;
                setRows(restoredRows);
                setManual((current) => ({
                    ...current,
                    ...seed.manualFields,
                    ...savedDynamicAssumptions,
                    initialPercent: current.initialPercent || 10,
                    years: Number(savedDynamicAssumptions.years || current.years || 10),
                    startYear: seed.baseYear,
                    totalLots: Number(seed.manualFields.totalLots || 0),
                    discountRate: current.discountRate || 10,
                }));
                setHasSavedModel(Boolean(savedDynamic?.rows?.length));
            } else {
                const seed = await buildSeedRows();
                setProject(seed.project);
                setBaseYear(seed.baseYear);
                setFirstDataYear(seed.firstDataYear);
                // Se persiste siempre, se este viendo el estatico o el dinamico.
                void persistDynamic(seed);
                const savedModel = await api.get<any>(`/cashflow/model?projectId=${projectId}&mode=estatico`).catch(() => null);
                if (savedModel?.rows?.length) {
                    const savedById = new Map((savedModel.rows || []).map((item: any) => [item.id, item]));
                    const seedIds = new Set(seed.rows.map((item) => item.id));
                    // Los modelos guardados antes de v2 traen en 'initial-fee' y
                    // 'financing-fee' el resultado de la formula del % de cuota
                    // inicial. Son celdas planas: su valor valido es solo el de los
                    // pagos reales del sistema, por eso se restauran desde el seed.
                    const savedSeedVersion = Number((savedModel.assumptions || {}).seedVersion || 0);
                    const legacyAssumptionCells = savedSeedVersion < CASHFLOW_SEED_VERSION;
                    const savedRows: Row[] = seed.rows.map((seedRow) => {
                        const item: any = savedById.get(seedRow.id);
                        const useSeedValues = legacyAssumptionCells && PLAIN_NUMBER_ROW_IDS.includes(seedRow.id);
                        return {
                            id: seedRow.id,
                            label: item?.label || seedRow.label,
                            values: normalizeValues(!useSeedValues && Array.isArray(item?.values) ? item.values : seedRow.values),
                            computed: item?.computed ?? seedRow.computed,
                            parentId: item?.parentId ?? seedRow.parentId,
                            depth: item?.depth ?? seedRow.depth,
                        };
                    });
                    const customRows: Row[] = (savedModel.rows || [])
                        .filter((item: any) => !seedIds.has(item.id))
                        .map((item: any) => ({
                            id: String(item.id),
                            label: String(item.label || 'Nueva subpartida'),
                            values: normalizeValues(Array.isArray(item.values) ? item.values : []),
                            computed: Boolean(item.computed),
                            parentId: item.parentId ? String(item.parentId) : undefined,
                            depth: Number(item.depth || 1),
                        }));
                    savedRows.push(...customRows);
                    rowsRef.current = savedRows;
                    setRows(savedRows);
                    const savedAssumptions = savedModel.assumptions || {};
                    const savedStartYear = Number(savedAssumptions.startYear ?? savedAssumptions.baseYear ?? seed.baseYear) || seed.baseYear;
                    const savedTotalLots = Number(seed.manualFields.totalLots || 0);
                    setManual((current) => ({
                        ...current,
                        ...seed.manualFields,
                        discountRate: current.discountRate || 10,
                        ...savedAssumptions,
                        startYear: savedStartYear,
                        totalLots: savedTotalLots,
                    }));
                    setHasSavedModel(true);
                    // Si el modelo era v1 (o anterior) se re-guarda ya limpio para que
                    // las filas de numero plano no vuelvan a aparecer con formula.
                    if (legacyAssumptionCells) {
                        rowsRef.current = savedRows;
                        const cleanedRows = calculateRows(savedRows);
                        const cleanedById = new Map(cleanedRows.map((item) => [item.id, item]));
                        void api.post('/cashflow/model', {
                            projectId,
                            mode: 'estatico',
                            assumptions: { ...savedAssumptions, seedVersion: CASHFLOW_SEED_VERSION },
                            rows: savedRows.map((item) => {
                                const clean = cleanedById.get(item.id);
                                return {
                                    id: item.id,
                                    label: item.label,
                                    values: item.computed && clean ? clean.values : normalizeValues(item.values),
                                    computed: item.computed,
                                    parentId: item.parentId,
                                    depth: item.depth,
                                };
                            }),
                        }).catch(() => {
                            // Silencioso: la pantalla ya muestra los valores limpios.
                        });
                    }
                } else {
                    rowsRef.current = seed.rows;
                    setRows(seed.rows);
                    setManual((current) => ({ ...current, ...seed.manualFields, initialPercent: current.initialPercent || 10, years: current.years || 10, startYear: seed.baseYear, discountRate: current.discountRate || 10 }));
                    setHasSavedModel(false);
                }
            }
            setOverrides({});
        } finally { setLoading(false); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    useEffect(() => { loadModel(mode); }, [mode, loadModel]);

    useEffect(() => { rowsRef.current = rows; }, [rows]);

    const parseFormattedNumber = (value: string) => Number(String(value || '0').replace(/,/g, '').replace(/\s/g, '')) || 0;
    const baseNumber = (value: string) => {
        const numeric = parseFormattedNumber(value);
        return currency === 'USD' ? numeric * exchangeRate : numeric;
    };

    const calculated = useMemo(() => {
        // Base: filas con los borradores de edición superpuestos para que los totales
        // de categorías y las columnas de total se recalculen EN VIVO mientras se tipea.
        const base = rows.map((item) => ({ ...item, values: normalizeValues(item.values) }));
        const draftValue = (id: string, value: string) => (id === 'lots-sold' ? parseFormattedNumber(value) : baseNumber(value));
        Object.entries(editingDrafts).forEach(([key, draft]) => {
            const [id, rawYear] = key.split(':');
            const year = Number(rawYear);
            if (!id || Number.isNaN(year)) return;
            const item = base.find((candidate) => candidate.id === id);
            if (!item || item.computed) return;
            item.values = item.values.map((cell, index) => index === year ? draftValue(id, draft) : cell);
        });
        return calculateRows(base);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, overrides, editingDrafts]);

    const childRowsByParent = useMemo(() => calculated.reduce<Record<string, Row[]>>((map, item) => {
        if (!item.parentId) return map;
        map[item.parentId] = [...(map[item.parentId] || []), item];
        return map;
    }, {}), [calculated]);

    const displayNumber = (value: number) => Math.round(toDisplay(value));
    const formatInteger = (value: number) => displayNumber(value).toLocaleString('en-US');
    const formatPlainInteger = (value: number) => Math.round(Number(value || 0)).toLocaleString('en-US');
    const displayRowTotal = (values: number[]) => formatInteger(values.slice(0, visibleYears.length).reduce((sum, value) => sum + Number(value || 0), 0));
    const displayPlainRowTotal = (values: number[]) => formatPlainInteger(values.slice(0, visibleYears.length).reduce((sum, value) => sum + Number(value || 0), 0));
    const canEditRow = (item?: Row) => !item?.computed;
    /**
     * Columna historica del dinamico. El sistema es nuevo, asi que los años que
     * aun no tienen data real (los anteriores al primer año con registros del
     * sistema) los carga el cliente A MANO. En dinamico solo esas celdas son
     * editables; desde la primera columna con data real manda el sistema.
     * En estatico todo es editable.
     * Se usa `manual.startYear` directamente (no la constante `startYear`) para no
     * depender del orden de declaracion dentro del render.
     */
    const isHistoricalColumn = (year: number) => mode === 'dinamico'
        && year >= 0
        && (Number(manual.startYear) || baseYear) + year < firstDataYear;
    const isCellEditable = (item: Row | undefined, year: number) => mode === 'estatico'
        ? canEditRow(item)
        : Boolean(canEditRow(item) && isHistoricalColumn(year));
    const writeCellValue = (id: string, year: number, numeric: number) => {
        const apply = (current: Row[]) => current.map((candidate) => candidate.id !== id ? candidate : { ...candidate, values: normalizeValues(candidate.values).map((cell, index) => index === year ? numeric : cell) });
        rowsRef.current = apply(rowsRef.current.length ? rowsRef.current : rows);
        setRows(() => rowsRef.current);
    };

    const cellKey = (id: string, year: number) => `${id}:${year}`;

    /**
     * Extrae del juego de filas SOLO las columnas historicas (las anteriores al
     * primer año con data real del sistema). Es lo unico que el cliente escribe a
     * mano en el flujo dinamico, y es lo que se persiste junto al modelo para no
     * perderlo al reconstruirlo desde el sistema.
     */
    function collectHistoricalValues(sourceRows: Row[], anchorYear: number, dataYear: number) {
        const collected: Record<string, number[]> = {};
        sourceRows.forEach((item) => {
            if (item.computed) return;
            const values = normalizeValues(item.values);
            values.forEach((value, year) => {
                if (anchorYear + year >= dataYear) return;
                if (!Number(value || 0)) return;
                collected[item.id] = collected[item.id] || [];
                collected[item.id][year] = Number(value || 0);
            });
        });
        return collected;
    }

    /**
     * Guarda el flujo dinamico con el historico cargado a mano. El dinamico se
     * reconstruye desde el sistema, pero el historico es del cliente: sin esto al
     * pulsar "Actualizar data" o recargar se perderia lo tecleado.
     */
    async function saveDynamicModel() {
        if (mode !== 'dinamico') return;
        const sourceRows = rowsRef.current.length ? rowsRef.current : rows;
        await persistDynamic({ rows: sourceRows, manualFields: manual, baseYear, firstDataYear });
        setSaved(true);
        setHasSavedModel(true);
    }

    function scheduleDynamicSave() {
        if (mode !== 'dinamico') return;
        setSaved(false);
        window.setTimeout(() => { void saveDynamicModel(); }, 0);
    }

    function editCell(id: string, year: number, value: string) {
        // onChange mientras el usuario escribe: solo conservamos el TEXTO CRUDO.
        // Ninguna conversion/parseo aqui para no romper el cursor ni el tipeo.
        setSaved(false);
        setHasSavedModel(false);
        setEditingDrafts((current) => ({ ...current, [cellKey(id, year)]: value }));
    }

    function beginCellEdit(id: string, year: number, value: number) {
        editSnapshot.current = { id, year, value };
        setEditingDrafts((current) => ({
            ...current,
            [cellKey(id, year)]: id === 'lots-sold' ? (value ? formatPlainInteger(value) : '') : (value ? formatInteger(value) : ''),
        }));
    }

    function finishCellEdit(id: string, year: number, value: string) {
        const snapshot = editSnapshot.current;
        editSnapshot.current = null;
        setEditingDrafts((current) => {
            const next = { ...current };
            delete next[cellKey(id, year)];
            return next;
        });
        const baseValue = id === 'lots-sold' ? parseFormattedNumber(value) : baseNumber(value);
        const item = rows.find((candidate) => candidate.id === id);
        if (!item?.computed) writeCellValue(id, year, baseValue);
        if (snapshot && snapshot.id === id && snapshot.year === year && snapshot.value === baseValue) return;
        setSaved(false);
        setHasSavedModel(false);
        if (mode === 'dinamico') { scheduleDynamicSave(); return; }
        scheduleAutosave();
    }

    function cancelCellEdit() {
        if (!pendingEdit) return;
        const item = rows.find((candidate) => candidate.id === pendingEdit.id);
        if (!item?.computed) writeCellValue(pendingEdit.id, pendingEdit.year, pendingEdit.original);
        setEditingDrafts((current) => {
            const next = { ...current };
            delete next[cellKey(pendingEdit.id, pendingEdit.year)];
            return next;
        });
        setPendingEdit(null);
    }

    function applyCellEdit() {
        if (pendingEdit) {
            const item = rows.find((candidate) => candidate.id === pendingEdit.id);
            if (!item?.computed) writeCellValue(pendingEdit.id, pendingEdit.year, pendingEdit.value);
            setEditingDrafts((current) => {
                const next = { ...current };
                delete next[cellKey(pendingEdit.id, pendingEdit.year)];
                return next;
            });
        }
        setSaved(false);
        setHasSavedModel(false);
        setPendingEdit(null);
        if (mode === 'dinamico') scheduleDynamicSave();
    }

    function materializedEditableRows() {
        const sourceRows = rowsRef.current.length ? rowsRef.current : rows;
        const next = sourceRows.map((item) => ({ ...item, values: normalizeValues(item.values) }));
        const write = (id: string, year: number, numeric: number) => {
            const item = next.find((candidate) => candidate.id === id);
            if (!item || item.computed) return;
            item.values = item.values.map((cell, index) => index === year ? numeric : cell);
        };
        Object.entries(editingDrafts).forEach(([key, draft]) => {
            const [id, rawYear] = key.split(':');
            const year = Number(rawYear);
            if (!id || Number.isNaN(year)) return;
            write(id, year, id === 'lots-sold' ? parseFormattedNumber(draft) : baseNumber(draft));
        });
        if (pendingEdit) write(pendingEdit.id, pendingEdit.year, pendingEdit.value);
        return next;
    }

    /**
     * Supuestos que se persisten junto al modelo. `seedVersion` marca la version
     * del sembrado para poder limpiar los modelos viejos que traian formulas en
     * las celdas de numero plano.
     */
    function modelAssumptions() {
        return { ...manual, overrides, seedVersion: CASHFLOW_SEED_VERSION };
    }

    function payloadRows(labelPatch?: { id: string; label: string }) {
        const editableById = new Map(materializedEditableRows().map((item) => [item.id, item]));
        return calculated.map((item) => {
            const editable = editableById.get(item.id);
            return {
                id: item.id,
                label: labelPatch?.id === item.id ? labelPatch.label : (editable?.label || item.label),
                values: editable && !editable.computed ? editable.values : item.values,
                computed: editable?.computed ?? item.computed,
                parentId: editable?.parentId ?? item.parentId,
                depth: editable?.depth ?? item.depth,
            };
        });
    }

    function toggleSection(sectionId: string) { setExpanded((current) => ({ ...current, [sectionId]: !(current[sectionId] ?? false) })); }

    async function updateRowLabel(id: string, label: string) {
        const nextLabel = label.trim();
        if (!nextLabel) { setEditingLabel(null); return; }
        const currentLabel = calculated.find((item) => item.id === id)?.label;
        if (currentLabel === nextLabel) { setEditingLabel(null); return; }
        setRows((current) => current.map((item) => item.id === id ? { ...item, label: nextLabel } : item));
        setSaved(false);
        setHasSavedModel(false);
        setEditingLabel(null);
        // El dinamico se regenera desde el sistema: solo el estatico guarda nombres.
        if (mode === 'dinamico') return;
        try {
            await api.post('/cashflow/model', {
                projectId,
                mode,
                assumptions: modelAssumptions(),
                rows: payloadRows({ id, label: nextLabel }),
            });
            setHasSavedModel(true);
            setSaved(true);
            toast('Nombre actualizado');
        } catch (error: any) {
            toast(error?.message || 'No se pudo guardar el nombre', 'err');
        }
    }

    function rowLabel(id: string, fallback: string) {
        return calculated.find((item) => item.id === id)?.label || fallback;
    }

    function editableConcept(id: string, label: string, className = 'block min-w-0 truncate md:whitespace-normal') {
        if (editingLabel === id) {
            return (
                <input
                    autoFocus
                    className="w-full min-w-0 rounded border border-[#1877F2] bg-white px-1.5 py-1 text-sm font-semibold outline-none"
                    defaultValue={label}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onBlur={(event) => { void updateRowLabel(id, event.currentTarget.value); }}
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
            <span
                className={className}
                title={label}
                onDoubleClick={(event) => {
                    event.stopPropagation();
                    setEditingLabel(id);
                }}
            >
                {label}
            </span>
        );
    }

    function openSubpartidaModal(parentId: string, parentLabel: string) {
        if (!canAddSubpartida(parentId)) return;
        setSubpartidaModal({ parentId, parentLabel });
        setSubpartidaName('');
    }

    function closeSubpartidaModal() {
        setSubpartidaModal(null);
        setSubpartidaName('');
    }

    function addSubpartida() {
        if (mode === 'dinamico') return;
        const parentId = subpartidaModal?.parentId;
        const parentLabel = subpartidaModal?.parentLabel;
        if (!parentId || !parentLabel) return;
        if (!canAddSubpartida(parentId)) return;
        const nextLabel = subpartidaName.trim();
        if (!nextLabel) return;
        const sourceRows = rowsRef.current.length ? rowsRef.current : rows;
        const parent = sourceRows.find((item) => item.id === parentId) || calculated.find((item) => item.id === parentId);
        const newRow: Row = {
            id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            label: nextLabel,
            values: empty(),
            parentId,
            depth: Math.min(4, Number(parent?.depth || 0) + 1),
        };
        rowsRef.current = [
            ...sourceRows.map((item) => item.id === parentId ? { ...item, computed: true } : item),
            newRow,
        ];
        setRows(rowsRef.current);
        setExpanded((current) => ({ ...current, [parentId]: true }));
        closeSubpartidaModal();
        setSaved(false);
        setHasSavedModel(false);
        window.setTimeout(() => scheduleAutosave(), 0);
        toast('Subpartida agregada');
    }

    function canAddSubpartida(parentId: string) {
        if (mode === 'dinamico') return false;
        const noAdd = new Set([
            'lots-sold', 'cost-sales', 'gross', 'operating', 'pre-tax', 'tax', 'net', 'igv', 'adjusted',
            'accumulated-title', 'pre-tax-accumulated', 'adjusted-accumulated',
            // Filas que ya vienen definidas (no requieren crear subpartidas):
            'alcabala',
            'initial-fee',
            'supervision',
            'services',
            // Filas de formula fija: su monto sale de un % del modelo, agregarle
            // subpartidas descuadraria el flujo. Tampoco aplican a financiamiento
            // (por eso tambien se quitan en el boton "+" de cada grupo).
            'financing-fee',
            'design', 'management', 'indemnity', 'legal-contingency',
            'sales-plan', 'marketing', 'commission', 'post-sale', 'discounts',
        ]);
        return !noAdd.has(parentId);
    }

    function addSubpartidaButton(parentId: string, parentLabel: string) {
        if (!canAddSubpartida(parentId)) return <span className="cashflow-no-print h-6 w-6 shrink-0" aria-hidden="true" />;
        return (
            <button
                type="button"
                className="cashflow-no-print grid h-6 w-6 shrink-0 place-items-center rounded border bg-white text-[#1259C4] transition hover:bg-[#EAF2FD]"
                title={`Agregar subpartida a ${parentLabel}`}
                onClick={(event) => {
                    event.stopPropagation();
                    openSubpartidaModal(parentId, parentLabel);
                }}
            >
                <FiPlus size={13} aria-hidden="true" />
            </button>
        );
    }

    function openAssumptions() {
        const lots = Number(totalLots || manual.totalLots || 0);
        const area = Number(manual.landArea || 0);
        setDraftManual({
            ...manual,
            totalLots: lots,
            lotArea: lots > 0 ? area / lots : 0,
        });
        setAssumptionsOpen(true);
    }

    async function saveModel() {
        // Solo el estatico se guarda a mano; el dinamico se regenera desde el sistema.
        if (mode !== 'estatico') return;
        setSavingModel(true);
        try {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            if (pendingEdit) {
                const item = rowsRef.current.find((candidate) => candidate.id === pendingEdit.id);
                if (!item?.computed) writeCellValue(pendingEdit.id, pendingEdit.year, pendingEdit.value);
            }
            const sentRows = payloadRows();
            await api.post('/cashflow/model', {
                projectId,
                mode,
                assumptions: { ...manual, overrides },
                rows: sentRows,
            });
            const nextRows = rowsRef.current.map((item) => {
                const sent = sentRows.find((candidate) => candidate.id === item.id);
                return sent ? { ...item, label: sent.label, values: normalizeValues(sent.values) } : item;
            });
            rowsRef.current = nextRows;
            setRows(nextRows);
            setEditingDrafts({});
            setPendingEdit(null);
            setHasSavedModel(true);
            setSaved(true);
            toast(`${MODE_LABEL[mode]} guardado`);
        } catch (error: any) {
            toast(error?.message || 'No se pudo guardar el flujo de caja', 'err');
        } finally { setSavingModel(false); }
    }

    // Guardado automático: al confirmar una celda (Enter/blur) se persiste en BD de
    // inmediato. Si ya hay una petición en curso se encola la más reciente para no
    // perder ningún cambio (evita la ventana de debounce que podía perderse al navegar).
    async function runAutosave() {
        do {
            autosaveQueued.current = false;
            try {
                const sentRows = payloadRows();
                await api.post('/cashflow/model', {
                    projectId,
                    mode,
                    assumptions: modelAssumptions(),
                    rows: sentRows,
                });
                setHasSavedModel(true);
                setSaved(true);
            } catch (error: any) {
                toast(error?.message || 'No se pudo guardar el flujo de caja', 'err');
            }
        } while (autosaveQueued.current);
        autosaveInFlight.current = false;
    }

    function scheduleAutosave() {
        // Nunca se autoguarda el dinamico: se reconstruye desde el sistema.
        if (mode !== 'estatico') return;
        if (autosaveInFlight.current) {
            autosaveQueued.current = true;
            return;
        }
        autosaveInFlight.current = true;
        void runAutosave();
    }

    async function refreshDynamic() {
        // El historico cargado a mano se conserva: se guarda antes de reconstruir
        // para que el refresco del sistema no borre lo tecleado por el cliente.
        const sourceRows = rowsRef.current.length ? rowsRef.current : rows;
        const historyBackup = collectHistoricalValues(sourceRows, baseYear, firstDataYear);
        await loadModel('dinamico');
        if (Object.keys(historyBackup).length) {
            const merged = (rowsRef.current.length ? rowsRef.current : rows).map((item) => {
                const saved = historyBackup[item.id];
                if (!saved) return item;
                return {
                    ...item,
                    values: normalizeValues(item.values).map((cell, year) => {
                        if (baseYear + year >= firstDataYear) return cell;
                        return saved[year] !== undefined ? Number(saved[year] || 0) : cell;
                    }),
                };
            });
            rowsRef.current = merged;
            setRows(merged);
            void saveDynamicModel();
        }
        toast('Data del sistema actualizada');
    }

    function requestModeSwitch(next: CashflowMode) {
        if (next === mode) return;
        setPendingMode(next);
        setModeSwitchOpen(true);
    }

    function exportPdf() {
        setExpanded({});
        window.setTimeout(() => window.print(), 80);
    }

    function applyModeSwitch() {
        if (pendingMode) setMode(pendingMode);
        setPendingMode(null);
        setModeSwitchOpen(false);
    }
    async function applyAssumptions() {
        const normalizedTotalLots = Math.max(0, Math.round(Number(totalLots || draftManual.totalLots) || 0));
        const normalizedLandArea = Math.max(0, Number(draftManual.landArea) || 0);
        const normalizedManual = {
            ...draftManual,
            landArea: normalizedLandArea,
            lotArea: normalizedTotalLots > 0 ? normalizedLandArea / normalizedTotalLots : 0,
            years: Math.max(1, Math.min(MAX_PROJECTION_YEARS, Math.round(Number(draftManual.years) || 10))),
            startYear: Math.max(1900, Math.min(9999, Math.round(Number(draftManual.startYear) || new Date().getFullYear()))),
            totalLots: normalizedTotalLots,
        };
        const anchorChanged = Number(normalizedManual.startYear) !== Number(manual.startYear);
        setManual(normalizedManual);
        const saleValue = calculatedRowTotal('income') || draftManual.landArea * draftManual.priceM2;
        const percent = (value: number) => Math.max(0, Math.min(100, Number(value) || 0)) / 100;
        setRows((current) => current.map((item) => {
            const values = normalizeValues(item.values);
            // 'initial-fee' y 'financing-fee' NO se reescriben desde los supuestos:
            // son celdas de numero plano (por defecto 0) que solo cambian si el
            // usuario escribe un valor o si vienen de pagos reales del sistema.
            if (item.id === 'alcabala') return { ...item, values: values.map((value, year) => year === 0 ? calculatedValue('land-cost') * percent(normalizedManual.alcabalaPercent) : value) };
            if (item.id === 'supervision') return { ...item, values: values.map((value, year) => year === 0 ? calculatedValue('construction') * percent(normalizedManual.supervisionPercent) : value) };
            if (item.id === 'services') return { ...item, values: values.map((value, year) => year === 0 ? calculatedValue('construction') * percent(normalizedManual.servicesPercent) : value) };
            if (item.id === 'design') return { ...item, values: values.map((value, year) => year === 0 ? calculatedValue('construction') * percent(normalizedManual.designPercent) : value) };
            if (item.id === 'management') return { ...item, values: values.map((value, year) => year === 0 ? saleValue * percent(normalizedManual.managementPercent) : value) };
            if (item.id === 'indemnity') return { ...item, values: values.map((value, year) => year === 0 ? calculatedValue('construction') * percent(normalizedManual.indemnityPercent) : value) };
            if (item.id === 'legal-contingency') return { ...item, values: values.map((value, year) => year === 0 ? calculatedValue('construction') * percent(normalizedManual.contingencyPercent) : value) };
            return item;
        }));
        setAssumptionsOpen(false);
        setSaved(false);
        setHasSavedModel(false);
        // Si el cliente movio el Año 0, el dinamico se re-siembra contra el nuevo
        // ancla: la data real (ventas, pagos) debe caer en `añoRegistro - startYear`.
        if (mode === 'dinamico' && anchorChanged) {
            // El historico tecleado a mano se conserva re-anclandolo por AÑO
            // CALENDARIO (que no cambia) en lugar de por indice de columna.
            const previousRows = rowsRef.current.length ? rowsRef.current : rows;
            const historyByCalendarYear: Record<string, Record<number, number>> = {};
            previousRows.forEach((item) => {
                if (item.computed) return;
                normalizeValues(item.values).forEach((value, year) => {
                    if (baseYear + year >= firstDataYear) return;
                    if (!Number(value || 0)) return;
                    historyByCalendarYear[item.id] = historyByCalendarYear[item.id] || {};
                    historyByCalendarYear[item.id][baseYear + year] = Number(value || 0);
                });
            });
            setBaseYear(normalizedManual.startYear);
            const rescoped = await buildSeedRows(normalizedManual.startYear);
            const restored = rescoped.rows.map((item) => {
                const saved = historyByCalendarYear[item.id];
                if (!saved) return item;
                return {
                    ...item,
                    values: normalizeValues(item.values).map((cell, year) => {
                        const calendarYear = rescoped.baseYear + year;
                        if (calendarYear >= rescoped.firstDataYear) return cell;
                        return saved[calendarYear] !== undefined ? Number(saved[calendarYear] || 0) : cell;
                    }),
                };
            });
            rowsRef.current = restored;
            setRows(restored);
            setFirstDataYear(rescoped.firstDataYear);
            setManual((current) => ({ ...current, ...rescoped.manualFields, startYear: rescoped.baseYear }));
            void persistDynamic({ ...rescoped, rows: restored });
            setSaved(true);
            setHasSavedModel(true);
            return;
        }
        // Lo aplicado se persiste de inmediato: si no, al recargar volvian los
        // valores anteriores del modelo guardado.
        window.setTimeout(() => scheduleAutosave(), 0);
    }

    const lotsSoldRow = calculated.find((item) => item.id === 'lots-sold') || row('lots-sold', 'Venta de lotes por año');
    const calculatedValue = (id: string, year = 0) => calculated.find((item) => item.id === id)?.values[year] || 0;
    const calculatedRowTotal = (id: string) => (calculated.find((item) => item.id === id)?.values || empty()).reduce((sum, value) => sum + Number(value || 0), 0);
    const accumulateSeries = (values: number[]) => normalizeValues(values).reduce<number[]>((totals, value, year) => {
        totals.push((totals[year - 1] || 0) + Number(value || 0));
        return totals;
    }, []);
    const lotsSoldTotal = lotsSoldRow.values.slice(0, visibleYears.length).reduce((sum, value) => sum + Number(value || 0), 0);
    const baseTotalLots = Number(manual.totalLots || 0);
    const totalLots = lotsSoldTotal || baseTotalLots;
    const saleValue = calculatedRowTotal('income');
    const landAcquisitionTotal = calculatedRowTotal('land-cost') || calculatedRowTotal('land');
    const averageLotArea = totalLots > 0 ? Number(manual.landArea || 0) / totalLots : 0;
    const averageLotPrice = totalLots > 0 ? saleValue / totalLots : 0;

    const netProfitSeries = calculated.find((item) => item.id === 'net')?.values || empty();
    const adjustedProfitSeries = calculated.find((item) => item.id === 'adjusted')?.values || netProfitSeries;
    const revenueSeries = calculated.find((item) => item.id === 'income')?.values || empty();
    const preTaxAccumulated = accumulateSeries(calculated.find((item) => item.id === 'pre-tax')?.values || empty());
    const accumulatedProfit = accumulateSeries(adjustedProfitSeries);
    const totalRevenue = saleValue;
    const totalAdjustedProfit = adjustedProfitSeries.reduce((sum, value) => sum + value, 0);
    const costRowIds = [
        'cost-sales', 'selling', 'financial', 'tax', 'igv',
    ];
    const totalCosts = costRowIds.reduce((sum, id) => {
        const values = calculated.find((item) => item.id === id)?.values || [];
        return sum + values.reduce((inner, value) => inner + Number(value || 0), 0);
    }, 0);
    const cumulativeProfit = adjustedProfitSeries.reduce<number[]>((acc, value) => {
        acc.push((acc[acc.length - 1] || 0) + value);
        return acc;
    }, []);
    const minCumulative = cumulativeProfit.reduce((minVal, value) => Math.min(minVal, value), 0);
    const maxCapitalRequired = Math.max(0, -minCumulative);

    const DISCOUNT_RATE = Math.max(0, Number(manual.discountRate) || 10) / 100; // tasa configurable en supuestos
    const van = adjustedProfitSeries.reduce((sum, value, year) => sum + value / Math.pow(1 + DISCOUNT_RATE, year), 0);
    const tir = computeIRR(adjustedProfitSeries);
    const roi = totalCosts > 0 ? (totalAdjustedProfit / totalCosts) * 100 : null;
    const margin = totalRevenue > 0 ? (totalAdjustedProfit / totalRevenue) * 100 : null;
    const firstNegative = cumulativeProfit.findIndex((value) => value < 0);
    const paybackYear = firstNegative === -1 ? -1 : cumulativeProfit.findIndex((value, year) => year > firstNegative && value >= 0);
    const paybackValue = paybackYear >= 0 ? `Año ${paybackYear}` : 'No aplica';
    const paybackHelper = paybackYear >= 0
        ? 'Año en que se cubre la inversión'
        : firstNegative === -1
            ? 'No hay déficit acumulado que recuperar'
            : 'Hay déficit acumulado y no se recupera en el horizonte';
    const breakEvenLots = averageLotPrice > 0 ? totalCosts / averageLotPrice : null;
    const startYear = Number(manual.startYear) || baseYear;
    const calendarYear = new Date().getFullYear();
    const visibleYearIndexes = visibleYears.map((_, year) => year);
    const hiddenPastYearIndexes = hidePastYears
        ? visibleYearIndexes.filter((year) => year > 0 && startYear + year < calendarYear)
        : [];
    const displayedYearIndexes = visibleYearIndexes.filter((year) => !hiddenPastYearIndexes.includes(year));
    const displayedYearIndexesBeforeHistory = displayedYearIndexes.filter((year) => year === 0);
    const displayedYearIndexesAfterHistory = displayedYearIndexes.filter((year) => year !== 0);
    const showHistoricalColumn = hiddenPastYearIndexes.length > 0;
    const historicalTotal = (values: number[]) => hiddenPastYearIndexes.reduce((sum, year) => sum + Number(values[year] || 0), 0);
    const lastVisibleAccumulated = (values: number[]) => Number(values[visibleYears.length - 1] || 0);
    const hiddenAccumulated = (values: number[]) => {
        const lastHiddenIndex = hiddenPastYearIndexes[hiddenPastYearIndexes.length - 1];
        return Number(values[lastHiddenIndex] || 0);
    };
    const renderedYearColumnCount = displayedYearIndexes.length + (showHistoricalColumn ? 1 : 0);
    const renderChildRows = (parentId: string): ReactNode[] => (childRowsByParent[parentId] || []).flatMap((item) => {
        if (item.id === 'lots-sold') return [];
        const childRows = childRowsByParent[item.id] || [];
        const hasChildren = childRows.length > 0;
        const isExpanded = expanded[item.id] ?? false;
        const depth = Math.max(1, Number(item.depth || 1));
        const conceptPadding = Math.min(72, 20 + depth * 14);
        const rowNode = (
            <tr key={item.id} className="hover:bg-slate-50" onClick={() => hasChildren && toggleSection(item.id)}>
                <td
                    className={`${CONCEPT_COL} border border-slate-200 bg-white py-2 pr-2 text-slate-700 md:sticky md:left-0 md:z-[1]`}
                    style={{ paddingLeft: conceptPadding }}
                >
                    <div className="flex min-w-0 items-center gap-2">
                        {addSubpartidaButton(item.id, item.label)}
                        {editableConcept(item.id, item.label)}
                    </div>
                </td>
                <td className="border border-[#B9D2F4] bg-[#F4F8FE] px-2 py-2 text-right tabular-nums text-[#5277A8] md:sticky md:left-[232px] md:z-[1]">{displayRowTotal(item.values)}</td>
                {displayedYearIndexesBeforeHistory.map((year) => {
                    const value = item.values[year] || 0;
                    const editable = isCellEditable(item, year);
                    const historical = isHistoricalColumn(year);
                    return (
                        <td key={`${item.id}-${year}`} className="border border-slate-200 bg-white px-1 py-1">
                            <input
                                aria-label={`${item.label} ${YEARS[year]}`}
                                className={`w-full min-w-[88px] rounded border border-transparent px-1 py-1.5 text-right tabular-nums outline-none transition ${editable ? 'focus:border-[#1877F2] focus:bg-[#F5F9FF]' : 'cursor-default'} ${historical && mode === 'dinamico' ? 'bg-[#FFFBF0]' : 'bg-white'}`}
                                value={editingDrafts[cellKey(item.id, year)] ?? (value ? formatInteger(value) : '')}
                                inputMode="numeric"
                                readOnly={!editable}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => editable && editCell(item.id, year, event.target.value)}
                                onFocus={() => editable && beginCellEdit(item.id, year, value)}
                                onBlur={(event) => editable && finishCellEdit(item.id, year, event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                            />
                        </td>
                    );
                })}
                {showHistoricalColumn && (
                    <td className="border border-slate-200 bg-[#F1F5F9] px-2 py-2 text-right tabular-nums text-slate-600">{formatInteger(historicalTotal(item.values))}</td>
                )}
                {displayedYearIndexesAfterHistory.map((year) => {
                    const value = item.values[year] || 0;
                    const editable = isCellEditable(item, year);
                    const historical = isHistoricalColumn(year);
                    return (
                        <td key={`${item.id}-${year}`} className="border border-slate-200 bg-white px-1 py-1">
                            <input
                                aria-label={`${item.label} ${YEARS[year]}`}
                                className={`w-full min-w-[88px] rounded border border-transparent px-1 py-1.5 text-right tabular-nums outline-none transition ${editable ? 'focus:border-[#1877F2] focus:bg-[#F5F9FF]' : 'cursor-default'} ${historical && mode === 'dinamico' ? 'bg-[#FFFBF0]' : 'bg-white'}`}
                                value={editingDrafts[cellKey(item.id, year)] ?? (value ? formatInteger(value) : '')}
                                inputMode="numeric"
                                readOnly={!editable}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => editable && editCell(item.id, year, event.target.value)}
                                onFocus={() => editable && beginCellEdit(item.id, year, value)}
                                onBlur={(event) => editable && finishCellEdit(item.id, year, event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                            />
                        </td>
                    );
                })}
            </tr>
        );
        return isExpanded ? [rowNode, ...renderChildRows(item.id)] : [rowNode];
    });

    if (loading) return <div className="card text-sm text-slate-500">Cargando datos del proyecto...</div>;
    return (
        <div className="space-y-5">
            <Toaster />
            <style jsx global>{`
                @media print {
                    @page {
                        size: A4 landscape;
                        margin: 10mm;
                    }
                    body * {
                        visibility: hidden !important;
                    }
                    .cashflow-print-area,
                    .cashflow-print-area * {
                        visibility: visible !important;
                    }
                    .cashflow-print-area {
                        position: absolute !important;
                        inset: 0 auto auto 0 !important;
                        width: 100% !important;
                        background: #ffffff !important;
                    }
                    .cashflow-no-print {
                        display: none !important;
                    }
                    .cashflow-print-header {
                        display: flex !important;
                    }
                    .cashflow-print-area,
                    .cashflow-print-area section {
                        box-shadow: none !important;
                    }
                    .cashflow-print-area table {
                        width: 100% !important;
                    }
                }
            `}</style>
            <div className="cashflow-print-area space-y-5">
            <div className="cashflow-print-header hidden items-center justify-between gap-5 border-b pb-4" style={{ borderColor: BRAND.border }}>
                <div className="flex items-center gap-3">
                    {project?.logoImageUrl ? <img src={project.logoImageUrl} alt={project?.name || 'Proyecto'} className="h-12 max-w-36 object-contain" /> : null}
                    <img src="/logo/dunacon.png" alt="Dunacon" className="h-12 max-w-36 object-contain" />
                </div>
                <div className="text-center">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: BRAND.blue }}>Dunacon CRM</p>
                    <h1 className="mt-1 text-xl font-bold" style={{ color: BRAND.ink }}>Flujo de Caja</h1>
                    <p className="mt-1 text-xs" style={{ color: BRAND.muted }}>{project?.name || `Proyecto ${projectId}`} - {MODE_LABEL[mode]}</p>
                </div>
                <div className="text-right text-xs" style={{ color: BRAND.muted }}>
                    <p className="font-semibold" style={{ color: BRAND.ink }}>Fecha</p>
                    <p>{new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>
            </div>
            <section className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: BRAND.border }}>
                <div className="cashflow-no-print flex flex-col gap-4 border-b px-5 py-5 lg:flex-row lg:items-start lg:justify-between" style={{ borderColor: BRAND.border }}>
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold" style={{ background: `${BRAND.blue}14`, color: BRAND.blue }}><FiTrendingUp /> Flujo de caja</div>
                        <h2 className="mt-3 text-2xl font-bold" style={{ color: BRAND.ink }}>{project?.name || 'Proyecto'} · FLUJO DE CAJA</h2>
                        <p className="mt-1 text-sm text-slate-500">Moneda de visualización: {currency === 'USD' ? 'dólares' : 'soles'}</p>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center">
                        <div className="col-span-2 lg:col-span-1">
                            <CurrencyToggle currency={currency} setCurrency={setCurrency} exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} />
                        </div>
                        <button className="btn-neutral min-w-0 justify-center whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm" onClick={exportPdf}><FiDownload /> Exportar PDF</button>
                        <button className="btn-neutral min-w-0 justify-center whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm" onClick={() => (mode === 'dinamico' ? refreshDynamic() : loadModel('estatico'))}><FiRefreshCw /> {mode === 'dinamico' ? 'Actualizar data' : 'Recargar'}</button>
                        <button className="btn-primary min-w-0 justify-center whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm" onClick={openAssumptions}><FiEdit3 /> Ajustar supuestos</button>
                    </div>
                </div>

                <div className="cashflow-no-print flex flex-col gap-3 border-b bg-[#F8FAFC] px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: BRAND.border }}>
                    <div className="flex flex-wrap items-center gap-2">
                        {(['estatico', 'dinamico'] as CashflowMode[]).map((option) => {
                            const active = mode === option;
                            return (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => requestModeSwitch(option)}
                                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors sm:text-sm"
                                    style={{
                                        borderColor: active ? BRAND.blue : BRAND.border,
                                        background: active ? BRAND.blue : '#fff',
                                        color: active ? '#fff' : BRAND.ink,
                                    }}
                                >
                                    {option === 'dinamico' ? <FiZap /> : <FiClipboard />} {MODE_LABEL[option]}
                                </button>
                            );
                        })}
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: mode === 'dinamico' ? '#E7F0FE' : '#F1F5F9', color: mode === 'dinamico' ? BRAND.blueDark : '#475569' }}>
                            {mode === 'dinamico' ? <><FiZap /> Se carga con la data real del sistema</> : <><FiClipboard /> Tú llenas los datos manualmente</>}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {mode === 'estatico' ? (
                            <>
                                {hasSavedModel && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><FiCheck /> Modelo guardado</span>}
                                <button className="btn-primary min-w-0 justify-center whitespace-nowrap px-3 text-xs sm:text-sm" onClick={saveModel} disabled={savingModel}>
                                    <FiSave /> {savingModel ? 'Guardando...' : 'Guardar flujo estático'}
                                </button>
                            </>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: BRAND.blueDark }}><FiRefreshCw /> Los datos se refrescan desde el sistema</span>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 border-b bg-[#F8FAFC] p-4 lg:grid-cols-6" style={{ borderColor: BRAND.border }}>
                    {[['Área venta (m²)', 'landArea'], ['Área promedio lote (m²)', 'lotArea'], [`Precio ${currency === 'USD' ? 'US$' : 'S/'}/m²`, 'priceM2'], ['Cuota inicial %', 'initialPercent'], ['Años de proyección', 'years'], ['Año de inicio', 'startYear']].map(([label, key]) => {
                        const editable = key === 'initialPercent' || key === 'years' || key === 'startYear';
                        const displayValue = key === 'lotArea'
                            ? formatPlainInteger(averageLotArea)
                            : key === 'priceM2'
                                ? formatInteger((manual as any)[key])
                                : key === 'landArea'
                                    ? formatPlainInteger((manual as any)[key])
                                    : formatPlainInteger((manual as any)[key]);
                        const content = <><p className="text-xs font-semibold text-slate-500">{label}</p><div className="mt-1 flex h-10 items-center justify-between rounded-md border bg-white px-2 text-sm font-semibold tabular-nums sm:px-3" style={{ borderColor: editable ? '#B9D2F4' : BRAND.border, color: BRAND.ink }}><span>{displayValue}</span>{editable && <FiEdit3 className="text-[#1259C4]" aria-hidden="true" />}</div></>;
                        return editable ? <button type="button" key={key} onClick={openAssumptions} className="min-w-0 text-left">{content}</button> : <div key={key} className="min-w-0">{content}</div>;
                    })}
                </div>
            </section>

            <section className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: BRAND.border }}>
                <div className="cashflow-no-print flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: BRAND.border }}>
                    <div>
                        <h3 className="font-semibold" style={{ color: BRAND.ink }}>Indicadores del proyecto</h3>
                        <p className="text-xs text-slate-500">Se recalculan en tiempo real con la data del modelo · Base contable (utilidad ajustada) · VAN con tasa de descuento del {Number(manual.discountRate) || 10}%.</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-7">
                    {[
                        { label: 'VAN contable', value: show(van), helper: `Tasa ${Number(manual.discountRate) || 10}% · utilidad ajustada descontada`, tone: BRAND.blue },
                        { label: 'TIR contable', value: tir === null ? '—' : `${(tir * 100).toFixed(2)}%`, helper: tir === null ? 'Requiere utilidad negativa en algún año' : 'Tasa interna de retorno', tone: '#15803D' },
                        { label: 'ROI contable', value: roi === null ? '—' : `${roi.toFixed(1)}%`, helper: 'Utilidad ajustada / costos totales', tone: '#0EA5A9' },
                        { label: 'Margen de utilidad', value: margin === null ? '—' : `${margin.toFixed(1)}%`, helper: 'Utilidad ajustada / ventas', tone: '#D97706' },
                        { label: 'Payback', value: paybackValue, helper: paybackHelper, tone: '#8064A2' },
                        { label: 'Punto de equilibrio', value: breakEvenLots === null ? '—' : `${formatPlainInteger(breakEvenLots)} lotes`, helper: `Lotes para cubrir costos · ${formatPlainInteger(totalLots)} totales`, tone: '#E11D48' },
                        { label: 'Capital máximo requerido', value: show(maxCapitalRequired), helper: 'Máx. déficit de caja acumulado', tone: BRAND.blueDark },
                    ].map(({ label, value, helper, tone }) => (
                        <div key={label} className="min-w-0 rounded-xl border bg-white px-3 py-3" style={{ borderColor: `${tone}40` }}>
                            <p className="truncate text-[11px] font-semibold uppercase tracking-wide" style={{ color: tone }} title={label}>{label}</p>
                            <p className="mt-1 truncate text-center text-lg font-bold tabular-nums" style={{ color: BRAND.ink }} title={value}>{value}</p>
                            <p className="mt-1 truncate text-[11px] text-slate-400" title={helper}>{helper}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: BRAND.border }}>
                <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: BRAND.border }}>
                    <div>
                        <h3 className="font-semibold" style={{ color: BRAND.ink }}>Estado de resultados proyectado</h3>
                        <p className="cashflow-no-print text-xs text-slate-500">Valores en US$ · al salir de una celda se te pedirá confirmar el cambio.</p>
                    </div>
                    <div className="cashflow-no-print flex items-center gap-2">
                        <button
                            type="button"
                            className="btn-neutral min-w-0 justify-center whitespace-nowrap px-3 text-xs sm:text-sm"
                            onClick={() => setHidePastYears((current) => !current)}
                            title={hidePastYears ? 'Mostrar todos los años de la proyección' : 'Ocultar años anteriores al año actual y agruparlos'}
                        >
                            {hidePastYears ? 'Vista completa' : 'Ocultar años pasados'}
                        </button>
                        {hiddenPastYearIndexes.length > 0 && (
                            <span className="hidden text-[11px] font-semibold text-slate-500 sm:inline">
                                {hiddenPastYearIndexes.length} año(s) en histórico
                            </span>
                        )}
                        <FiEdit3 style={{ color: BRAND.blue }} />
                    </div>
                </div>
                <p className="cashflow-no-print px-4 py-2 text-xs text-slate-400 md:hidden">Desliza la tabla hacia la derecha para ver los años.</p>
                {/* [container-type:inline-size] permite usar `cqw` (ancho visible) en las columnas
                    fijas: en movil Concepto + Total llenan la pantalla y los años se ven al deslizar. */}
                <div className="overflow-auto [container-type:inline-size]" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <table className="w-max border-collapse text-xs">
                        <thead className="sticky top-0 z-[15]">
                            <tr>
                                <th className={`${CONCEPT_COL} border border-slate-200 bg-[#F8FAFC] px-3 py-3 text-left align-middle font-semibold text-slate-500 md:sticky md:left-0 md:z-20 md:px-4`}>Concepto</th>
                                <th className={`${TOTAL_COL} border border-slate-200 px-2 py-3 text-center align-middle font-semibold md:sticky md:left-[232px] md:z-20`} style={{ background: BRAND.blue, color: '#fff' }}>
                                    <span className="block whitespace-normal">Total</span>
                                </th>
                                {displayedYearIndexesBeforeHistory.map((year) => (
                                    <th key={year} className={`${YEAR_COL} border border-slate-200 px-2 py-3 text-center font-semibold`} style={{ background: BRAND.blue, color: '#fff' }}>{YEARS[year]}</th>
                                ))}
                                {showHistoricalColumn && (
                                    <th className={`${YEAR_COL} border border-slate-200 px-2 py-3 text-center font-semibold`} style={{ background: '#475569', color: '#fff' }}>Años anteriores</th>
                                )}
                                {displayedYearIndexesAfterHistory.map((year) => (
                                    <th key={year} className={`${YEAR_COL} border border-slate-200 px-2 py-3 text-center font-semibold`} style={{ background: BRAND.blue, color: '#fff' }}>{YEARS[year]}</th>
                                ))}
                            </tr>
                            <tr>
                                <th className={`${CONCEPT_COL} border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-left text-[11px] font-semibold md:sticky md:left-0 md:z-20 md:px-4`} style={{ color: BRAND.muted }}><span className="block truncate md:whitespace-normal">Proyección anual</span></th>
                                <th className={`${TOTAL_COL} border border-[#B9D2F4] bg-[#EAF2FD] px-2 py-2 text-center text-[11px] font-bold text-[#1259C4] md:sticky md:left-[232px] md:z-20`}>Ppto. de Obra</th>
                                {displayedYearIndexesBeforeHistory.map((year) => {
                                    const historical = isHistoricalColumn(year);
                                    return (
                                        <th key={year} className={`${YEAR_COL} border border-slate-200 px-2 py-2 text-center text-[11px] font-medium`} style={{ background: historical ? '#FFF4D6' : year === 0 ? '#D3E4FD' : '#EAF7EE', color: historical ? '#8A5A00' : year === 0 ? BRAND.blueDark : '#125A3B' }}>
                                            {startYear + year}
                                            {historical && <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wide">Manual</span>}
                                        </th>
                                    );
                                })}
                                {showHistoricalColumn && (
                                    <th className={`${YEAR_COL} border border-slate-200 px-2 py-2 text-center text-[11px] font-medium`} style={{ background: '#E2E8F0', color: '#334155' }}>
                                        &lt; {calendarYear}
                                    </th>
                                )}
                                {displayedYearIndexesAfterHistory.map((year) => {
                                    const historical = isHistoricalColumn(year);
                                    return (
                                        <th key={year} className={`${YEAR_COL} border border-slate-200 px-2 py-2 text-center text-[11px] font-medium`} style={{ background: historical ? '#FFF4D6' : year === 0 ? '#D3E4FD' : '#EAF7EE', color: historical ? '#8A5A00' : year === 0 ? BRAND.blueDark : '#125A3B' }}>
                                            {startYear + year}
                                            {historical && <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wide">Manual</span>}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="hover:bg-slate-50">
                                <td className={`${CONCEPT_COL} border border-slate-200 bg-[#F8FAFC] px-3 py-2.5 font-semibold text-slate-700 md:sticky md:left-0 md:z-[1] md:px-4`}>
                                    <div className="flex items-center gap-2">
                                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border bg-white text-[#1259C4]" style={{ borderColor: '#B9D2F4' }}>
                                            <FiHome size={15} aria-hidden="true" />
                                        </span>
                                        {editableConcept('lots-sold', lotsSoldRow.label)}
                                    </div>
                                </td>
                                <td className="border border-[#B9D2F4] bg-[#EAF2FD] px-2 py-2.5 text-right font-semibold tabular-nums text-[#1259C4] md:sticky md:left-[232px] md:z-[1]">{displayPlainRowTotal(lotsSoldRow.values)}</td>
                                {displayedYearIndexesBeforeHistory.map((year) => {
                                    const value = lotsSoldRow.values[year] || 0;
                                    const editable = isCellEditable(lotsSoldRow, year);
                                    const historical = isHistoricalColumn(year);
                                    return (
                                    <td key={`lots-sold-top-${year}`} className="border border-slate-200 bg-[#F8FAFC] px-1 py-1">
                                        <input
                                            aria-label={`${lotsSoldRow.label} ${YEARS[year]}`}
                                            className={`w-full min-w-[88px] rounded border border-transparent px-1 py-1.5 text-right tabular-nums outline-none transition ${editable ? 'focus:border-[#1877F2] focus:bg-[#F5F9FF]' : 'cursor-default'} ${historical && mode === 'dinamico' ? 'bg-[#FFFBF0]' : 'bg-white'}`}
                                            value={editingDrafts[cellKey('lots-sold', year)] ?? (value ? formatPlainInteger(value) : '')}
                                            inputMode="numeric"
                                            readOnly={!editable}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={(event) => editable && editCell('lots-sold', year, event.target.value)}
                                            onFocus={() => editable && beginCellEdit('lots-sold', year, value)}
                                            onBlur={(event) => editable && finishCellEdit('lots-sold', year, event.target.value)}
                                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                        />
                                    </td>
                                    );
                                })}
                                {showHistoricalColumn && (
                                    <td className="border border-slate-200 bg-[#F1F5F9] px-2 py-2.5 text-right font-semibold tabular-nums text-slate-600">{formatPlainInteger(historicalTotal(lotsSoldRow.values))}</td>
                                )}
                                {displayedYearIndexesAfterHistory.map((year) => {
                                    const value = lotsSoldRow.values[year] || 0;
                                    const editable = isCellEditable(lotsSoldRow, year);
                                    const historical = isHistoricalColumn(year);
                                    return (
                                    <td key={`lots-sold-top-${year}`} className="border border-slate-200 bg-[#F8FAFC] px-1 py-1">
                                        <input
                                            aria-label={`${lotsSoldRow.label} ${YEARS[year]}`}
                                            className={`w-full min-w-[88px] rounded border border-transparent px-1 py-1.5 text-right tabular-nums outline-none transition ${editable ? 'focus:border-[#1877F2] focus:bg-[#F5F9FF]' : 'cursor-default'} ${historical && mode === 'dinamico' ? 'bg-[#FFFBF0]' : 'bg-white'}`}
                                            value={editingDrafts[cellKey('lots-sold', year)] ?? (value ? formatPlainInteger(value) : '')}
                                            inputMode="numeric"
                                            readOnly={!editable}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={(event) => editable && editCell('lots-sold', year, event.target.value)}
                                            onFocus={() => editable && beginCellEdit('lots-sold', year, value)}
                                            onBlur={(event) => editable && finishCellEdit('lots-sold', year, event.target.value)}
                                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                        />
                                    </td>
                                    );
                                })}
                            </tr>
                            {SECTIONS.filter((section) => !['accumulated-title', 'pre-tax-accumulated', 'adjusted-accumulated', ...COST_SALES_CHILD_SECTION_IDS].includes(section.id)).map((section) => {
                                const sectionRow = calculated.find((item) => item.id === section.id);
                                const surface = sectionSurface(section.id, section.computed);
                                const hasChildren = section.id === 'cost-sales' || (childRowsByParent[section.id] || []).some((item) => item.id !== 'lots-sold');
                                const isExpanded = expanded[section.id] ?? false;

                                return (
                                    <Fragment key={section.id}>
                                        {sectionRow && (
                                            <tr onClick={() => hasChildren && toggleSection(section.id)} className={hasChildren ? 'cursor-pointer' : undefined}>
                                                <td className={`${CONCEPT_COL} border border-slate-200 px-3 py-2.5 font-bold md:sticky md:left-0 md:z-[1] md:px-4`} style={{ background: surface.background, color: surface.color }}>
                                                    <SectionTitle
                                                        section={section}
                                                        color={COST_DETAIL_SECTIONS.has(section.id) ? '#0EA5A9' : surface.color}
                                                        label={(
                                                            <>
                                                                {addSubpartidaButton(section.id, sectionRow.label)}
                                                                {editableConcept(section.id, sectionRow.label, 'truncate')}
                                                            </>
                                                        )}
                                                    />
                                                </td>
                                                <td className="border border-[#B9D2F4] bg-[#EAF2FD] px-2 py-2.5 text-right font-semibold tabular-nums text-[#1259C4] md:sticky md:left-[232px] md:z-[1]">{displayRowTotal(sectionRow.values)}</td>
                                                {displayedYearIndexesBeforeHistory.map((year) => {
                                                    const value = sectionRow.values[year] || 0;
                                                    const editable = isCellEditable(sectionRow, year);
                                                    const historical = isHistoricalColumn(year);
                                                    return (
                                                    <td key={year} className="border border-slate-200 px-1 py-1" style={{ background: surface.background }}>
                                                        <input
                                                            aria-label={`${sectionRow.label} ${YEARS[year]}`}
                                                            className={`w-full min-w-[88px] border border-transparent bg-transparent px-1 py-1.5 text-right font-bold tabular-nums outline-none transition ${editable ? 'focus:border-[#1877F2] focus:bg-white' : 'cursor-default'}`}
                                                            style={historical && mode === 'dinamico' ? { background: '#FFFBF0' } : undefined}
                                                            value={editingDrafts[cellKey(section.id, year)] ?? (value ? formatInteger(value) : '')}
                                                            inputMode="numeric"
                                                            readOnly={!editable}
                                                            onClick={(event) => event.stopPropagation()}
                                                            onChange={(event) => editable && editCell(section.id, year, event.target.value)}
                                                            onFocus={() => editable && beginCellEdit(section.id, year, value)}
                                                            onBlur={(event) => editable && finishCellEdit(section.id, year, event.target.value)}
                                                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                                        />
                                                    </td>
                                                    );
                                                })}
                                                {showHistoricalColumn && (
                                                    <td className="border border-slate-200 px-2 py-2.5 text-right font-bold tabular-nums text-slate-600" style={{ background: '#F1F5F9' }}>{formatInteger(historicalTotal(sectionRow.values))}</td>
                                                )}
                                                {displayedYearIndexesAfterHistory.map((year) => {
                                                    const value = sectionRow.values[year] || 0;
                                                    const editable = isCellEditable(sectionRow, year);
                                                    const historical = isHistoricalColumn(year);
                                                    return (
                                                    <td key={year} className="border border-slate-200 px-1 py-1" style={{ background: surface.background }}>
                                                        <input
                                                            aria-label={`${sectionRow.label} ${YEARS[year]}`}
                                                            className={`w-full min-w-[88px] border border-transparent bg-transparent px-1 py-1.5 text-right font-bold tabular-nums outline-none transition ${editable ? 'focus:border-[#1877F2] focus:bg-white' : 'cursor-default'}`}
                                                            style={historical && mode === 'dinamico' ? { background: '#FFFBF0' } : undefined}
                                                            value={editingDrafts[cellKey(section.id, year)] ?? (value ? formatInteger(value) : '')}
                                                            inputMode="numeric"
                                                            readOnly={!editable}
                                                            onClick={(event) => event.stopPropagation()}
                                                            onChange={(event) => editable && editCell(section.id, year, event.target.value)}
                                                            onFocus={() => editable && beginCellEdit(section.id, year, value)}
                                                            onBlur={(event) => editable && finishCellEdit(section.id, year, event.target.value)}
                                                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                                        />
                                                    </td>
                                                    );
                                                })}
                                            </tr>
                                        )}

                                        {section.id === 'cost-sales' && isExpanded && COST_SALES_CHILD_SECTION_IDS.map((childSectionId) => {
                                            const childSection = SECTIONS.find((candidate) => candidate.id === childSectionId);
                                            const childSectionRow = calculated.find((item) => item.id === childSectionId);
                                            if (!childSection || !childSectionRow) return null;
                                            const childSurface = sectionSurface(childSection.id, childSection.computed);
                                            const childHasChildren = (childRowsByParent[childSection.id] || []).some((item) => item.id !== 'lots-sold');
                                            const childIsExpanded = expanded[childSection.id] ?? false;

                                            return (
                                                <Fragment key={childSection.id}>
                                                    <tr onClick={() => childHasChildren && toggleSection(childSection.id)} className={childHasChildren ? 'cursor-pointer' : undefined}>
                                                        <td className={`${CONCEPT_COL} border border-slate-200 py-2.5 pr-3 font-bold md:sticky md:left-0 md:z-[1] md:pr-4`} style={{ paddingLeft: 28, background: childSurface.background, color: childSurface.color }}>
                                                            <SectionTitle
                                                                section={childSection}
                                                                color="#0EA5A9"
                                                                label={(
                                                                    <>
                                                                        {addSubpartidaButton(childSection.id, childSectionRow.label)}
                                                                        {editableConcept(childSection.id, childSectionRow.label, 'truncate')}
                                                                    </>
                                                                )}
                                                            />
                                                        </td>
                                                        <td className="border border-[#B9D2F4] bg-[#EAF2FD] px-2 py-2.5 text-right font-semibold tabular-nums text-[#1259C4] md:sticky md:left-[232px] md:z-[1]">{displayRowTotal(childSectionRow.values)}</td>
                                                        {displayedYearIndexesBeforeHistory.map((year) => {
                                                            const value = childSectionRow.values[year] || 0;
                                                            const editable = isCellEditable(childSectionRow, year);
                                                            const historical = isHistoricalColumn(year);
                                                            return (
                                                            <td key={year} className="border border-slate-200 px-1 py-1" style={{ background: childSurface.background }}>
                                                                <input
                                                                    aria-label={`${childSectionRow.label} ${YEARS[year]}`}
                                                                    className={`w-full min-w-[88px] border border-transparent bg-transparent px-1 py-1.5 text-right font-bold tabular-nums outline-none transition ${editable ? 'focus:border-[#1877F2] focus:bg-white' : 'cursor-default'}`}
                                                                    style={historical && mode === 'dinamico' ? { background: '#FFFBF0' } : undefined}
                                                                    value={editingDrafts[cellKey(childSection.id, year)] ?? (value ? formatInteger(value) : '')}
                                                                    inputMode="numeric"
                                                                    readOnly={!editable}
                                                                    onClick={(event) => event.stopPropagation()}
                                                                    onChange={(event) => editable && editCell(childSection.id, year, event.target.value)}
                                                                    onFocus={() => editable && beginCellEdit(childSection.id, year, value)}
                                                                    onBlur={(event) => editable && finishCellEdit(childSection.id, year, event.target.value)}
                                                                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                                                />
                                                            </td>
                                                            );
                                                        })}
                                                        {showHistoricalColumn && (
                                                            <td className="border border-slate-200 px-2 py-2.5 text-right font-bold tabular-nums text-slate-600" style={{ background: '#F1F5F9' }}>{formatInteger(historicalTotal(childSectionRow.values))}</td>
                                                        )}
                                                        {displayedYearIndexesAfterHistory.map((year) => {
                                                            const value = childSectionRow.values[year] || 0;
                                                            const editable = isCellEditable(childSectionRow, year);
                                                            const historical = isHistoricalColumn(year);
                                                            return (
                                                            <td key={year} className="border border-slate-200 px-1 py-1" style={{ background: childSurface.background }}>
                                                                <input
                                                                    aria-label={`${childSectionRow.label} ${YEARS[year]}`}
                                                                    className={`w-full min-w-[88px] border border-transparent bg-transparent px-1 py-1.5 text-right font-bold tabular-nums outline-none transition ${editable ? 'focus:border-[#1877F2] focus:bg-white' : 'cursor-default'}`}
                                                                    style={historical && mode === 'dinamico' ? { background: '#FFFBF0' } : undefined}
                                                                    value={editingDrafts[cellKey(childSection.id, year)] ?? (value ? formatInteger(value) : '')}
                                                                    inputMode="numeric"
                                                                    readOnly={!editable}
                                                                    onClick={(event) => event.stopPropagation()}
                                                                    onChange={(event) => editable && editCell(childSection.id, year, event.target.value)}
                                                                    onFocus={() => editable && beginCellEdit(childSection.id, year, value)}
                                                                    onBlur={(event) => editable && finishCellEdit(childSection.id, year, event.target.value)}
                                                                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                                                />
                                                            </td>
                                                            );
                                                        })}
                                                    </tr>
                                                    {childHasChildren && childIsExpanded && renderChildRows(childSection.id)}
                                                </Fragment>
                                            );
                                        })}
                                        {section.id !== 'cost-sales' && hasChildren && isExpanded && renderChildRows(section.id)}
                                    </Fragment>
                                );
                            })}
                            <tr>
                                <td colSpan={2 + renderedYearColumnCount} className="border border-slate-200 bg-white px-4 py-2 text-left text-sm font-bold" style={{ color: BRAND.blue }}>
                                    Utilidad Acumulada
                                </td>
                            </tr>
                            {[
                                { id: 'pre-tax-accumulated', label: rowLabel('pre-tax-accumulated', 'Utilidad Antes de Imp. Acumulada'), values: preTaxAccumulated, tone: '#15803D' },
                                { id: 'adjusted-accumulated', label: rowLabel('adjusted-accumulated', 'Utilidad Ajustada Referencial Acumulada Neta'), values: accumulatedProfit, tone: BRAND.blue },
                            ].map((item) => (
                                <tr key={item.id}>
                                    <td className={`${CONCEPT_COL} border border-slate-200 px-3 py-2.5 font-bold md:sticky md:left-0 md:z-[1] md:px-4`} style={{ background: '#D3E4FD', color: item.tone }}>
                                        {editableConcept(item.id, item.label, 'truncate')}
                                    </td>
                                    <td className={`${TOTAL_COL} border border-[#B9D2F4] bg-[#EAF2FD] px-2 py-2.5 text-right font-semibold tabular-nums text-[#1259C4] md:sticky md:left-[232px] md:z-[1]`}>{formatInteger(lastVisibleAccumulated(item.values))}</td>
                                    {displayedYearIndexesBeforeHistory.map((year) => {
                                        const value = item.values[year] || 0;
                                        return (
                                        <td key={`${item.id}-${year}`} className={`${YEAR_COL} border border-slate-200 px-2 py-2.5 text-right font-bold tabular-nums`} style={{ background: '#D3E4FD', color: BRAND.ink }}>{formatInteger(value)}</td>
                                        );
                                    })}
                                    {showHistoricalColumn && (
                                        <td className={`${YEAR_COL} border border-slate-200 bg-[#F1F5F9] px-2 py-2.5 text-right font-bold tabular-nums text-slate-600`}>{formatInteger(hiddenAccumulated(item.values))}</td>
                                    )}
                                    {displayedYearIndexesAfterHistory.map((year) => {
                                        const value = item.values[year] || 0;
                                        return (
                                        <td key={`${item.id}-${year}`} className={`${YEAR_COL} border border-slate-200 px-2 py-2.5 text-right font-bold tabular-nums`} style={{ background: '#D3E4FD', color: BRAND.ink }}>{formatInteger(value)}</td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,2fr)]">
                <div className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: BRAND.border }}>
                    <div className="border-b px-5 py-4" style={{ borderColor: BRAND.border }}>
                        <h3 className="font-semibold" style={{ color: BRAND.ink }}>Datos</h3>
                        <p className="mt-1 text-xs text-slate-500">Información base del proyecto</p>
                    </div>
                    <div className="space-y-2 p-4">
                        {[
                            { label: `Terreno ${currency === 'USD' ? 'US$' : 'S/'}`, value: show(landAcquisitionTotal) },
                            { label: 'Área venta (m²)', value: formatPlainInteger(manual.landArea) },
                            { label: 'Nro. de lotes', value: formatPlainInteger(totalLots) },
                            { label: 'Área promedio por lote (m²)', value: formatPlainInteger(averageLotArea) },
                            { label: `Precio ${currency === 'USD' ? 'US$' : 'S/'}/m²`, value: show(manual.priceM2) },
                            { label: `Precio lote prom. ${currency === 'USD' ? 'US$' : 'S/'}`, value: show(averageLotPrice) },
                            { label: 'Cuota inicial', value: `${manual.initialPercent}%` },
                            { label: `Venta total lotes ${currency === 'USD' ? 'US$' : 'S/'}`, value: show(saleValue) },
                        ].map(({ label, value }) => (
                            <button key={String(label)} type="button" onClick={openAssumptions} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition hover:brightness-95" style={{ background: '#FFF0B3' }}>
                                <span className="text-xs font-medium text-slate-700">{label}</span>
                                <strong className="text-right text-sm tabular-nums" style={{ color: BRAND.ink }}>{value}</strong>
                            </button>
                        ))}
                    </div>
                    <div className="cashflow-no-print border-t px-5 py-3 text-xs text-slate-500" style={{ borderColor: BRAND.border }}>
                        Edita estos supuestos desde <button className="font-semibold" style={{ color: BRAND.blue }} onClick={openAssumptions}>Ajustar supuestos</button>.
                    </div>
                </div>

                <div className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: BRAND.border }}>
                    <div className="border-b px-5 py-4" style={{ borderColor: BRAND.border }}>
                        <h3 className="text-center font-semibold" style={{ color: BRAND.ink }}>UTILIDAD US$</h3>
                        <p className="text-center text-xs text-slate-500">Utilidad ajustada referencial acumulada</p>
                    </div>
                    <div className="h-[330px] px-2 pb-3 pt-4 sm:px-5">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={visibleYears.map((year, index) => ({ year, value: accumulatedProfit[index] || 0 }))} margin={{ top: 24, right: 10, left: 8, bottom: 4 }}>
                                <CartesianGrid stroke="#E5E7EB" vertical={false} />
                                <ReferenceLine y={0} stroke="#94A3B8" strokeWidth={1.5} />
                                <XAxis dataKey="year" tick={{ fontSize: 10, fill: BRAND.blueDark }} tickMargin={8} axisLine={false} tickLine={false} />
                                <YAxis domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} tickFormatter={(value) => show(Number(value))} tick={{ fontSize: 10, fill: BRAND.muted }} axisLine={false} tickLine={false} width={88} />
                                <Tooltip formatter={(value: number | string) => [show(Number(value)), 'Utilidad acumulada']} />
                                <Bar dataKey="value" fill={BRAND.blue} radius={[2, 2, 0, 0]}>
                                    {visibleYears.map((year, index) => {
                                        const value = accumulatedProfit[index] || 0;
                                        return <Cell key={`utility-bar-${year}`} fill={value >= 0 ? BRAND.blue : '#DC2626'} />;
                                    })}
                                    <LabelList dataKey="value" position="top" formatter={(value: number | string) => formatInteger(Number(value))} fill="#DC2626" fontSize={9} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>
            </div>
            {modeSwitchOpen && pendingMode && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/40" onClick={() => { setModeSwitchOpen(false); setPendingMode(null); }} />
                    <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-xl border bg-white p-5 shadow-2xl" style={{ borderColor: BRAND.border }}>
                        <div className="mb-4 flex items-start gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: `${BRAND.blue}14`, color: BRAND.blue }}>{pendingMode === 'dinamico' ? <FiZap /> : <FiClipboard />}</span>
                            <div>
                                <h3 className="font-semibold" style={{ color: BRAND.ink }}>Cambiar a {MODE_LABEL[pendingMode]}</h3>
                                <p className="mt-1 text-sm text-slate-500">
                                    {pendingMode === 'dinamico'
                                        ? 'El modelo se cargará con la data real del sistema (ventas, pagos, lotización, presupuesto y egresos). Los años anteriores a la data real quedarán editables para que cargues el histórico a mano; el resto lo calcula el sistema.'
                                        : 'Podrás editar todas las celdas sobre la data del sistema. El flujo dinámico siempre se reconstruye desde el sistema.'}
                                </p>
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <button className="btn-neutral" onClick={() => { setModeSwitchOpen(false); setPendingMode(null); }}>Cancelar</button>
                            <button className="btn-primary" onClick={applyModeSwitch}><FiCheck /> Cambiar flujo</button>
                        </div>
                    </div>
                </div>
            )}
            {subpartidaModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/40" onClick={closeSubpartidaModal} />
                    <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-xl border bg-white shadow-2xl" style={{ borderColor: BRAND.border }}>
                        <div className="border-b px-5 py-4" style={{ borderColor: BRAND.border }}>
                            <div className="flex items-start gap-3">
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: `${BRAND.blue}14`, color: BRAND.blue }}>
                                    <FiPlus />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.blue }}>Nueva subpartida</p>
                                    <h3 className="mt-1 text-lg font-semibold" style={{ color: BRAND.ink }}>Agregar detalle</h3>
                                    <p className="mt-1 text-sm text-slate-500">Se creará debajo de <b className="font-semibold text-slate-700">{subpartidaModal.parentLabel}</b>.</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-5">
                            <label className="label">
                                Nombre de la subpartida
                                <input
                                    autoFocus
                                    className="input mt-1"
                                    value={subpartidaName}
                                    onChange={(event) => setSubpartidaName(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            addSubpartida();
                                        }
                                        if (event.key === 'Escape') closeSubpartidaModal();
                                    }}
                                    placeholder="Ej. Habilitación urbana"
                                />
                            </label>
                        </div>
                        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4" style={{ borderColor: BRAND.border }}>
                            <button className="btn-neutral" onClick={closeSubpartidaModal}>Cancelar</button>
                            <button className="btn-primary" onClick={addSubpartida} disabled={!subpartidaName.trim()}><FiPlus /> Agregar subpartida</button>
                        </div>
                    </div>
                </div>
            )}
            {assumptionsOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/40" onClick={() => setAssumptionsOpen(false)} />
                    <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border bg-white shadow-2xl" style={{ borderColor: BRAND.border }}>
                        <div className="shrink-0 border-b px-5 py-4" style={{ borderColor: BRAND.border }}><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.blue }}>Supuestos del proyecto</p><h3 className="mt-1 text-lg font-semibold" style={{ color: BRAND.ink }}>Editar datos base</h3><p className="mt-1 text-sm text-slate-500">Estos valores afectan los cálculos de todo el modelo.</p></div>
                        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-5">
                            {[
                                ['Área venta (m²)', 'landArea'],
                                ['Área promedio lote (m²)', 'lotArea'],
                                [`Precio ${currency === 'USD' ? 'US$' : 'S/'}/m²`, 'priceM2'],
                                ['Cuota inicial %', 'initialPercent'],
                                ['Años de proyección', 'years'],
                                ['Año de inicio', 'startYear'],
                                ['Alcabala %', 'alcabalaPercent'],
                                ['Supervisión técnica %', 'supervisionPercent'],
                                ['Servicios públicos %', 'servicesPercent'],
                                ['Diseño y licencias %', 'designPercent'],
                                ['Gerencia de proyecto %', 'managementPercent'],
                                ['Indemnización y titulación %', 'indemnityPercent'],
                                ['Contingencia legal %', 'contingencyPercent'],
                                ['Tasa de descuento VAN %', 'discountRate'],
                            ].map(([label, key]) => {
                                const isCalculated = key === 'lotArea';
                                const modalTotalLots = Number(totalLots || draftManual.totalLots || 0);
                                const calculatedLotArea = modalTotalLots > 0
                                    ? Number(draftManual.landArea || 0) / modalTotalLots
                                    : 0;
                                const rawValue = (draftManual as any)[key];
                                const visibleValue = isCalculated
                                    ? formatPlainInteger(calculatedLotArea)
                                    : key === 'priceM2'
                                    ? formatInteger(rawValue)
                                    : ['landArea', 'lotArea'].includes(String(key))
                                        ? formatPlainInteger(rawValue)
                                        : rawValue;
                                return (
                                    <label key={key} className="label">
                                        {label}
                                        <input
                                            className={`input mt-1 ${isCalculated ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
                                            inputMode="numeric"
                                            value={visibleValue}
                                            readOnly={isCalculated}
                                            disabled={isCalculated}
                                            onChange={(event) => !isCalculated && setDraftManual((current) => ({ ...current, [key]: key === 'priceM2' ? baseNumber(event.target.value) : parseFormattedNumber(event.target.value) }))}
                                        />
                                    </label>
                                );
                            })}
                        </div>
                        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4" style={{ borderColor: BRAND.border }}><button className="btn-neutral" onClick={() => setAssumptionsOpen(false)}>Cancelar</button><button className="btn-primary" onClick={applyAssumptions}><FiSave /> Aplicar supuestos</button></div>
                    </div>
                </div>
            )}
            {pendingEdit && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/40" onClick={cancelCellEdit} />
                    <div className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-y-auto rounded-xl border bg-white p-5 shadow-2xl" style={{ borderColor: BRAND.border }}>
                        <div className="mb-4 flex items-start gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: `${BRAND.blue}14`, color: BRAND.blue }}><FiEdit3 /></span>
                            <div><h3 className="font-semibold" style={{ color: BRAND.ink }}>Confirmar cambio</h3><p className="mt-1 text-sm text-slate-500">¿Deseas aplicar este dato al modelo financiero?</p></div>
                        </div>
                        <div className="rounded-lg border bg-[#F8FAFC] px-3 py-2.5 text-sm" style={{ borderColor: BRAND.border }}><div className="flex justify-between gap-3"><span className="text-slate-500">Valor anterior</span><b>{show(pendingEdit.original)}</b></div><div className="mt-1 flex justify-between gap-3"><span className="text-slate-500">Nuevo valor</span><b style={{ color: BRAND.blue }}>{show(pendingEdit.value)}</b></div></div>
                        <div className="mt-5 flex justify-end gap-2"><button className="btn-neutral" onClick={cancelCellEdit}>Cancelar</button><button className="btn-primary" onClick={applyCellEdit}>Aplicar dato</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}

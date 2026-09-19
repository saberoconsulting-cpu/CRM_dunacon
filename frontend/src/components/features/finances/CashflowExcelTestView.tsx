'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { FiEdit3, FiRefreshCw, FiSave, FiTrendingUp } from 'react-icons/fi';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/types';
import { Toaster } from '@/components/ui/ui';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { useDisplayCurrency } from '@/lib/currency';

type Row = { id: string; label: string; group?: boolean; computed?: boolean; values: number[] };
const YEARS = Array.from({ length: 11 }, (_, index) => `Año ${index}`);
const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
const empty = () => Array(11).fill(0) as number[];

const SECTIONS: Array<{ id: string; label: string; tone: string; computed?: boolean; rows: Array<{ id: string; label: string; computed?: boolean }> }> = [
    {
        id: 'income', label: '1  Ingreso por venta de lotes', tone: BRAND.blue, rows: [
            { id: 'lots-sold', label: 'Venta de lotes por año' },
            { id: 'initial-fee', label: 'Cuota inicial' },
            { id: 'financing-fee', label: 'Cuota financiamiento (lotes que pagan cuota)' },
        ]
    },
    { id: 'cost-sales', label: '2  Costo de venta de lotes', tone: '#0EA5A9', rows: [] },
    {
        id: 'land', label: '3  - Costo de Terreno', tone: '#D97706', rows: [
            { id: 'land-cost', label: 'Costos de Terreno' },
            { id: 'alcabala', label: 'Alcabala (3%)' },
            { id: 'legal', label: 'Asesoria Legal, Gastos Notariales y Legales' },
        ]
    },
    {
        id: 'direct', label: '4  - Costo Directo', tone: '#16A36A', rows: [
            { id: 'construction', label: 'Costos de Construcción' },
            { id: 'supervision', label: 'Supervisión Técnica (4% de CC)' },
            { id: 'services', label: 'Conexión de Servicios Públicos (1% de CC)' },
        ]
    },
    {
        id: 'indirect', label: '5  - Costo Indirecto', tone: '#8064A2', rows: [
            { id: 'design', label: 'Diseño Proyecto, Licencias, etc. (3% de Costos)' },
            { id: 'management', label: 'Gerencia de Proyectos (4% de Ventas)' },
            { id: 'indemnity', label: 'Indemnización, Titulación, etc. (1% de Costos Const.)' },
            { id: 'legal-contingency', label: 'Gastos Legales, Imprevistos, Otros (5% CC)' },
        ]
    },
    { id: 'gross', label: '6  Utilidad bruta', tone: '#15803D', rows: [], computed: true },
    {
        id: 'selling', label: '7  Gastos de Ventas y Administrativos', tone: '#E11D48', rows: [
            { id: 'sales-plan', label: 'Pago de Planillas' },
            { id: 'marketing', label: 'Publicidad - MKT Digital (1.5% de Ventas)' },
            { id: 'commission', label: 'Comisión de Ventas (2.5% de Ventas)' },
            { id: 'post-sale', label: 'Post Venta (1% de Ventas)' },
            { id: 'discounts', label: 'Descuentos (bonos) (10% de Ventas)' },
        ]
    },
    { id: 'operating', label: '8  Utilidad operativa', tone: '#15803D', rows: [], computed: true },
    { id: 'financial', label: '9  Gastos financieros', tone: '#DC2626', rows: [] },
    { id: 'pre-tax', label: '10  Utilidad antes de Impuesto', tone: '#15803D', rows: [], computed: true },
    { id: 'tax', label: 'Impuesto a la renta', tone: '#64748B', rows: [] },
    { id: 'net', label: '11  Utilidad Neta', tone: '#15803D', rows: [], computed: true },
    { id: 'igv', label: '12  IGV Referencial Incluido en Ingresos (IGV Cajón)', tone: '#64748B', rows: [] },
    { id: 'adjusted', label: '13  Utilidad Ajustada Referencial (Neta)', tone: BRAND.blue, rows: [], computed: true },
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

export default function CashflowExcelTestView({ projectId }: { projectId: number }) {
    const { currency, setCurrency, exchangeRate, setExchangeRate, toDisplay, format: show } = useDisplayCurrency();
    const [rows, setRows] = useState<Row[]>([]);
    const [manual, setManual] = useState({
        landArea: 0,
        lotArea: 0,
        priceM2: 0,
        initialPercent: 10,
        years: 10,
        alcabalaPercent: 3,
        supervisionPercent: 4,
        servicesPercent: 1,
        designPercent: 3,
        managementPercent: 4,
        indemnityPercent: 1,
        contingencyPercent: 5,
    });
    const projectionYears = Math.max(1, Math.min(10, Math.round(Number(manual.years) || 10)));
    const visibleYears = YEARS.slice(0, projectionYears + 1);
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [overrides, setOverrides] = useState<Record<string, number[]>>({});
    const [assumptionsOpen, setAssumptionsOpen] = useState(false);
    const [draftManual, setDraftManual] = useState(manual);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({
        income: true,
        'cost-sales': true,
        land: true,
        direct: true,
        indirect: true,
        selling: true,
        financial: true,
        tax: true,
    });
    const editSnapshot = useRef<{ id: string; year: number; value: number } | null>(null);
    const [pendingEdit, setPendingEdit] = useState<{ id: string; year: number; value: number; original: number } | null>(null);

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const [projectData, plan, budget, statement] = await Promise.all([
                    api.get<any>(`/projects/${projectId}`),
                    api.get<any>(`/plan/project/${projectId}`).catch(() => ({ lots: [] })),
                    api.get<any>(`/construction-budget?projectId=${projectId}`).catch(() => ({ items: [], summary: {} })),
                    api.get<any>(`/finances/income-statement?projectId=${projectId}`).catch(() => ({})),
                ]);
                const lots = plan?.lots || [];
                const budgetItems = budget?.items || [];
                const budgetByCategory = (category: string) => budgetItems
                    .filter((item: any) => item.category === category)
                    .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
                const budgetByName = (names: string[]) => budgetItems
                    .filter((item: any) => names.some((name) => String(item.name || '').toLowerCase().includes(name)))
                    .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
                const totalLots = lots.length || Number(projectData?.stats?.total || 0);
                const price = Number(projectData?.referencePrice || 0);
                const lotSaleValue = lots.reduce((sum: number, lot: any) => sum + Number(lot.finalPrice || lot.salePrice || lot.price || 0), 0);
                const landArea = lots.reduce((sum: number, lot: any) => sum + Number(lot.areaM2 || lot.area || 0), 0);
                const lotArea = totalLots > 0 ? landArea / totalLots : 0;
                const saleValue = lotSaleValue || landArea * price;
                const land = budgetByCategory('costo_terreno');
                const direct = budgetByCategory('costo_directo');
                const indirect = budgetByCategory('costo_indirecto');
                const sellingAdmin = budgetByCategory('gastos_ventas_admin');
                const financing = Number(statement?.egresos_clasificados?.financiamiento || 0);
                const tax = Number(statement?.egresos_clasificados?.impuestos || 0);
                const igv = budgetByName(['igv']);
                const initialRows = SECTIONS.flatMap((section) => {
                    if (section.id === 'cost-sales') return [row(section.id, section.label)];
                    if (section.id === 'gross' || section.id === 'operating' || section.id === 'pre-tax' || section.id === 'net' || section.id === 'adjusted' || section.id === 'accumulated-title' || section.id === 'pre-tax-accumulated' || section.id === 'adjusted-accumulated') return [row(section.id, section.label, [0], true)];
                    if (section.id === 'financial') return [row(section.id, section.label, [financing])];
                    if (section.id === 'tax') return [row(section.id, section.label, [tax])];
                    if (section.id === 'igv') return [row(section.id, section.label, [igv])];
                    return [row(section.id, section.label), ...section.rows.map((item) => row(item.id, item.label))];
                });
                const setFirst = (id: string, value: number) => { const item = initialRows.find((candidate) => candidate.id === id); if (item) item.values[0] = value; };
                setFirst('lots-sold', totalLots);
                const initialPercent = 0.1;
                setFirst('initial-fee', saleValue * initialPercent);
                setFirst('financing-fee', saleValue * (1 - initialPercent));
                setFirst('land-cost', land);
                setFirst('alcabala', land * 0.03);
                setFirst('construction', direct);
                setFirst('supervision', direct * 0.04);
                setFirst('services', direct * 0.01);
                setFirst('design', indirect || direct * 0.03);
                setFirst('management', saleValue * 0.04);
                setFirst('indemnity', direct * 0.01);
                setFirst('legal-contingency', direct * 0.05);
                setFirst('marketing', sellingAdmin);
                setProject(projectData);
                setRows(initialRows);
                setManual((current) => ({ ...current, landArea, lotArea, priceM2: price, initialPercent: current.initialPercent || 10, years: current.years || 10 }));
                setOverrides({});
            } finally { setLoading(false); }
        }
        load();
    }, [projectId]);

    const calculated = useMemo(() => {
        const next = rows.map((item) => ({ ...item, values: [...item.values] }));
        const get = (id: string) => next.find((item) => item.id === id)?.values || empty();
        const set = (id: string, values: number[]) => { const item = next.find((candidate) => candidate.id === id); if (item) item.values = values; };
        const revenue = get('initial-fee').map((_, year) => get('initial-fee')[year] + get('financing-fee')[year]);
        const gross = revenue.map((value, year) => value
            - get('cost-sales')[year]
            - get('land-cost')[year]
            - get('alcabala')[year]
            - get('legal')[year]
            - get('construction')[year]
            - get('supervision')[year]
            - get('services')[year]
            - get('design')[year]
            - get('management')[year]
            - get('indemnity')[year]
            - get('legal-contingency')[year]);
        const operating = gross.map((value, year) => value - get('sales-plan')[year] - get('marketing')[year] - get('commission')[year] - get('post-sale')[year] - get('discounts')[year]);
        const preTax = operating.map((value, year) => value - get('financial')[year]);
        const net = preTax.map((value, year) => value - get('tax')[year]);
        const adjusted = net.map((value, year) => value - get('igv')[year]);
        const accumulate = (values: number[]) => values.reduce<number[]>((totals, value, year) => {
            totals.push((totals[year - 1] || 0) + value);
            return totals;
        }, []);
        const computedValues: Record<string, number[]> = {
            income: revenue,
            gross,
            operating,
            'pre-tax': preTax,
            net,
            adjusted,
            'pre-tax-accumulated': accumulate(preTax),
            'adjusted-accumulated': accumulate(adjusted),
        };
        Object.entries(computedValues).forEach(([id, values]) => set(id, overrides[id] || values));
        return next;
    }, [rows, overrides]);

    const displayNumber = (value: number) => Math.round(toDisplay(value));
    const displayPerSquareMeter = (value: number, area: number) => value === 0 || area <= 0 ? '-' : money(displayNumber(value) / area);
    const baseNumber = (value: string) => {
        const numeric = Number(value || 0);
        return currency === 'USD' ? numeric * exchangeRate : numeric;
    };

    function editCell(id: string, year: number, value: string) {
        setSaved(false);
        const numeric = baseNumber(value);
        const item = rows.find((candidate) => candidate.id === id);
        if (item?.computed) return;
        setRows((current) => current.map((candidate) => candidate.id !== id ? candidate : { ...candidate, values: candidate.values.map((cell, index) => index === year ? numeric : cell) }));
    }

    function beginCellEdit(id: string, year: number, value: number) { editSnapshot.current = { id, year, value }; }

    function finishCellEdit(id: string, year: number, value: number) {
        const snapshot = editSnapshot.current;
        editSnapshot.current = null;
        const baseValue = baseNumber(String(value));
        if (!snapshot || snapshot.id !== id || snapshot.year !== year || snapshot.value === baseValue) return;
        setPendingEdit({ id, year, value: baseValue, original: snapshot.value });
    }

    function cancelCellEdit() {
        if (!pendingEdit) return;
        const item = rows.find((candidate) => candidate.id === pendingEdit.id);
        if (item?.computed) {
            setOverrides((current) => ({ ...current, [pendingEdit.id]: (current[pendingEdit.id] || item.values).map((cell, index) => index === pendingEdit.year ? pendingEdit.original : cell) }));
        } else {
            setRows((current) => current.map((candidate) => candidate.id !== pendingEdit.id ? candidate : { ...candidate, values: candidate.values.map((cell, index) => index === pendingEdit.year ? pendingEdit.original : cell) }));
        }
        setPendingEdit(null);
    }

    function applyCellEdit() { setSaved(false); setPendingEdit(null); }

    function toggleSection(sectionId: string) { setExpanded((current) => ({ ...current, [sectionId]: !(current[sectionId] ?? true) })); }

    function openAssumptions() { setDraftManual(manual); setAssumptionsOpen(true); }

    function applyAssumptions() {
        setManual(draftManual);
        const saleValue = calculatedValue('income') || draftManual.landArea * draftManual.priceM2;
        const percent = (value: number) => Math.max(0, Math.min(100, Number(value) || 0)) / 100;
        const initialPercent = percent(draftManual.initialPercent);
        setRows((current) => current.map((item) => {
            if (item.id === 'initial-fee') return { ...item, values: item.values.map((value, year) => year === 0 ? saleValue * initialPercent : value) };
            if (item.id === 'financing-fee') return { ...item, values: item.values.map((value, year) => year === 0 ? saleValue * (1 - initialPercent) : value) };
            if (item.id === 'alcabala') return { ...item, values: item.values.map((value, year) => year === 0 ? calculatedValue('land-cost') * percent(draftManual.alcabalaPercent) : value) };
            if (item.id === 'supervision') return { ...item, values: item.values.map((value, year) => year === 0 ? calculatedValue('construction') * percent(draftManual.supervisionPercent) : value) };
            if (item.id === 'services') return { ...item, values: item.values.map((value, year) => year === 0 ? calculatedValue('construction') * percent(draftManual.servicesPercent) : value) };
            if (item.id === 'design') return { ...item, values: item.values.map((value, year) => year === 0 ? calculatedValue('construction') * percent(draftManual.designPercent) : value) };
            if (item.id === 'management') return { ...item, values: item.values.map((value, year) => year === 0 ? saleValue * percent(draftManual.managementPercent) : value) };
            if (item.id === 'indemnity') return { ...item, values: item.values.map((value, year) => year === 0 ? calculatedValue('construction') * percent(draftManual.indemnityPercent) : value) };
            if (item.id === 'legal-contingency') return { ...item, values: item.values.map((value, year) => year === 0 ? calculatedValue('construction') * percent(draftManual.contingencyPercent) : value) };
            return item;
        }));
        setAssumptionsOpen(false);
        setSaved(true);
    }

    const calculatedValue = (id: string, year = 0) => calculated.find((item) => item.id === id)?.values[year] || 0;
    const totalLots = calculatedValue('lots-sold');
    const saleValue = calculatedValue('income');
    const averageLotPrice = totalLots > 0 ? saleValue / totalLots : 0;
    const preTaxAccumulated = calculated.find((item) => item.id === 'pre-tax-accumulated')?.values || empty();
    const accumulatedProfit = calculated.find((item) => item.id === 'adjusted-accumulated')?.values || empty();

    if (loading) return <div className="card text-sm text-slate-500">Cargando datos del proyecto...</div>;
    return (
        <div className="space-y-5">
            <Toaster />
            <section className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: BRAND.border }}>
                <div className="flex flex-col gap-4 border-b px-5 py-5 lg:flex-row lg:items-start lg:justify-between" style={{ borderColor: BRAND.border }}>
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold" style={{ background: `${BRAND.blue}14`, color: BRAND.blue }}><FiTrendingUp /> Flujo de caja</div>
                        <h2 className="mt-3 text-2xl font-bold" style={{ color: BRAND.ink }}>{project?.name || 'Proyecto'} · FLUJO DE CAJA</h2>
                        <p className="mt-1 text-sm text-slate-500">Moneda de visualización: {currency === 'USD' ? 'dólares' : 'soles'}</p>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center">
                        <div className="col-span-2 lg:col-span-1">
                            <CurrencyToggle currency={currency} setCurrency={setCurrency} exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} />
                        </div>
                        <button className="btn-neutral min-w-0 justify-center whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm" onClick={() => window.location.reload()}><FiRefreshCw /> Actualizar base</button>
                        <button className="btn-primary min-w-0 justify-center whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm" onClick={openAssumptions}><FiEdit3 /> Ajustar supuestos</button>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 border-b bg-[#F8FAFC] p-4 lg:grid-cols-5" style={{ borderColor: BRAND.border }}>
                    {[['Área venta (m²)', 'landArea'], ['Área promedio lote (m²)', 'lotArea'], [`Precio ${currency === 'USD' ? 'US$' : 'S/'}/m²`, 'priceM2'], ['Cuota inicial %', 'initialPercent'], ['Años de proyección', 'years']].map(([label, key]) => {
                        const editable = key === 'initialPercent' || key === 'years';
                        const content = <><p className="text-xs font-semibold text-slate-500">{label}</p><div className="mt-1 flex h-10 items-center justify-between rounded-md border bg-white px-2 text-sm font-semibold tabular-nums sm:px-3" style={{ borderColor: editable ? '#B9D2F4' : BRAND.border, color: BRAND.ink }}><span>{key === 'priceM2' ? displayNumber((manual as any)[key]) : key === 'landArea' || key === 'lotArea' ? Number((manual as any)[key]).toLocaleString('es-PE', { maximumFractionDigits: 2 }) : (manual as any)[key]}</span>{editable && <FiEdit3 className="text-[#1259C4]" aria-hidden="true" />}</div></>;
                        return editable ? <button type="button" key={key} onClick={openAssumptions} className="min-w-0 text-left">{content}</button> : <div key={key} className="min-w-0">{content}</div>;
                    })}
                </div>
            </section>

            <section className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: BRAND.border }}>
                <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: BRAND.border }}><div><h3 className="font-semibold" style={{ color: BRAND.ink }}>Estado de resultados proyectado</h3><p className="text-xs text-slate-500">Valores en US$ · al salir de una celda se te pedirá confirmar el cambio.</p></div><FiEdit3 style={{ color: BRAND.blue }} /></div>
                <div className="overflow-auto">
                    <table className="min-w-[1360px] w-full border-collapse text-xs">
                        <thead>
                            <tr>
                                <th className="sticky left-0 z-10 min-w-[330px] border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-left text-slate-500">Concepto</th>
                                <th className="sticky left-[330px] z-10 min-w-[100px] border border-[#0F4C9A] bg-[#1259C4] px-2 py-3 text-right text-sm font-extrabold text-white shadow-sm">{currency === 'USD' ? 'US$/m²' : 'S/m²'}</th>
                                {visibleYears.map((year) => (
                                    <th key={year} className="min-w-[86px] border border-slate-200 px-2 py-3 text-right font-semibold" style={{ background: BRAND.blue, color: '#fff' }}>{year}</th>
                                ))}
                            </tr>
                            <tr>
                                <th className="sticky left-0 z-10 border border-slate-200 bg-[#F8FAFC] px-4 py-2 text-left text-[11px] font-semibold" style={{ color: BRAND.muted }}>Proyección anual</th>
                                <th className="sticky left-[330px] z-10 border border-[#B9D2F4] bg-[#EAF2FD] px-2 py-2 text-right text-[11px] font-bold text-[#1259C4]">Unidad</th>
                                {visibleYears.map((_, year) => (
                                    <th key={year} className="border border-slate-200 px-2 py-2 text-right text-[11px] font-medium" style={{ background: year === 0 ? '#D3E4FD' : '#EAF7EE', color: year === 0 ? BRAND.blueDark : '#125A3B' }}>{new Date().getFullYear() + year}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {SECTIONS.filter((section) => !['accumulated-title', 'pre-tax-accumulated', 'adjusted-accumulated'].includes(section.id)).map((section) => {
                                const sectionRow = calculated.find((item) => item.id === section.id);
                                const surface = sectionSurface(section.id, section.computed);
                                const isExpanded = expanded[section.id] ?? true;

                                return (
                                    <Fragment key={section.id}>
                                        {sectionRow && (
                                            <tr onClick={() => section.rows.length > 0 && toggleSection(section.id)} className="cursor-pointer">
                                                <td className="sticky left-0 z-[1] border border-slate-200 px-4 py-2.5 font-bold" style={{ background: surface.background, color: surface.color }}>{section.label}</td>
                                                <td className="sticky left-[330px] z-[1] border border-[#B9D2F4] bg-[#EAF2FD] px-2 py-2.5 text-right font-semibold tabular-nums text-[#1259C4]">{displayPerSquareMeter(sectionRow.values[0], manual.landArea)}</td>
                                                {sectionRow.values.slice(0, visibleYears.length).map((value, year) => (
                                                    <td key={year} className="border border-slate-200 px-1 py-1" style={{ background: surface.background }}>
                                                        <input
                                                            aria-label={`${section.label} ${YEARS[year]}`}
                                                            className="w-full min-w-[78px] border border-transparent bg-transparent px-1 py-1.5 text-right font-bold tabular-nums outline-none transition focus:border-[#1877F2] focus:bg-white"
                                                            value={value ? displayNumber(value) : ''}
                                                            readOnly={Boolean(sectionRow.computed)}
                                                            onFocus={() => beginCellEdit(section.id, year, value)}
                                                            onChange={(event) => editCell(section.id, year, event.target.value)}
                                                            onBlur={(event) => finishCellEdit(section.id, year, Number(event.target.value || 0))}
                                                        />
                                                    </td>
                                                ))}
                                            </tr>
                                        )}

                                        {section.rows.length > 0 && isExpanded && section.rows.map((definition) => {
                                            const item = calculated.find((candidate) => candidate.id === definition.id) || row(definition.id, definition.label);

                                            return (
                                                <tr key={definition.id} className="hover:bg-slate-50">
                                                    <td className="sticky left-0 z-[1] border border-slate-200 bg-white px-8 py-2 text-slate-700">{definition.label}</td>
                                                    <td className="sticky left-[330px] z-[1] border border-[#B9D2F4] bg-[#F4F8FE] px-2 py-2 text-right tabular-nums text-[#5277A8]">{displayPerSquareMeter(item.values[0], manual.landArea)}</td>
                                                    {item.values.slice(0, visibleYears.length).map((value, year) => (
                                                        <td key={`${definition.id}-${year}`} className="border border-slate-200 bg-white px-1 py-1">
                                                            <input
                                                                aria-label={`${definition.label} ${YEARS[year]}`}
                                                                className="w-full min-w-[78px] rounded border border-transparent bg-white px-1 py-1.5 text-right tabular-nums outline-none transition focus:border-[#1877F2] focus:bg-[#F5F9FF]"
                                                                value={value ? displayNumber(value) : ''}
                                                                onFocus={() => beginCellEdit(definition.id, year, value)}
                                                                onChange={(event) => editCell(definition.id, year, event.target.value)}
                                                                onBlur={(event) => finishCellEdit(definition.id, year, Number(event.target.value || 0))}
                                                            />
                                                        </td>
                                                    ))}
                                                </tr>
                                            );
                                        })}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: BRAND.border }} aria-label="Utilidad acumulada">
                <div className="overflow-auto">
                    <table className="min-w-[1360px] w-full border-collapse text-xs">
                        <thead>
                            <tr>
                                <th colSpan={visibleYears.length + 2} className="border border-slate-300 bg-white px-4 py-2 text-left text-base font-bold" style={{ color: BRAND.blue }}>Utilidad Acumulada</th>
                            </tr>
                            <tr>
                                <th className="min-w-[330px] border border-slate-300 bg-[#F8FAFC] px-4 py-2 text-left text-[11px] font-semibold text-slate-500">Concepto</th>
                                <th className="min-w-[100px] border border-[#0F4C9A] bg-[#1259C4] px-2 py-2 text-right text-sm font-extrabold text-white shadow-sm">{currency === 'USD' ? 'US$/m²' : 'S/m²'}</th>
                                {visibleYears.map((year) => <th key={year} className="min-w-[86px] border border-slate-300 bg-[#F8FAFC] px-2 py-2 text-right text-[11px] font-semibold text-slate-500">{year}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { label: 'Utilidad Antes de Imp. Acumulada', values: preTaxAccumulated, tone: '#15803D' },
                                { label: 'Utilidad Ajustada Referencial Acumulada Neta', values: accumulatedProfit, tone: BRAND.blue },
                            ].map((item) => (
                                <tr key={item.label}>
                                    <td className="min-w-[330px] border border-slate-300 px-4 py-2.5 font-bold" style={{ background: '#D3E4FD', color: item.tone }}>{item.label}</td>
                                    <td className="min-w-[100px] border border-[#B9D2F4] bg-[#EAF2FD] px-2 py-2.5 text-right font-semibold tabular-nums text-[#1259C4]">{displayPerSquareMeter(item.values[0], manual.landArea)}</td>
                                    {item.values.slice(0, visibleYears.length).map((value, year) => (
                                        <td key={`${item.label}-${year}`} className="min-w-[86px] border border-slate-300 px-2 py-2.5 text-right font-bold tabular-nums" style={{ background: '#D3E4FD', color: BRAND.ink }}>{displayNumber(value).toLocaleString('es-PE')}</td>
                                    ))}
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
                            { label: `Terreno ${currency === 'USD' ? 'US$' : 'S/'}`, value: show(calculatedValue('land-cost')) },
                            { label: 'Área venta (m²)', value: manual.landArea.toLocaleString('es-PE') },
                            { label: 'Nro. de lotes', value: totalLots.toLocaleString('es-PE') },
                            { label: 'Área promedio por lote (m²)', value: manual.lotArea.toLocaleString('es-PE') },
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
                    <div className="border-t px-5 py-3 text-xs text-slate-500" style={{ borderColor: BRAND.border }}>
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
                                <XAxis dataKey="year" tick={{ fontSize: 10, fill: BRAND.blueDark }} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={(value) => show(Number(value))} tick={{ fontSize: 10, fill: BRAND.muted }} axisLine={false} tickLine={false} width={88} />
                                <Tooltip formatter={(value: number | string) => [show(Number(value)), 'Utilidad acumulada']} />
                                <Bar dataKey="value" fill={BRAND.blue} radius={[2, 2, 0, 0]}>
                                    <LabelList dataKey="value" position="top" formatter={(value: number | string) => displayNumber(Number(value)).toLocaleString('es-PE')} fill="#DC2626" fontSize={9} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>
            {assumptionsOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/40" onClick={() => setAssumptionsOpen(false)} />
                    <div className="relative w-full max-w-xl rounded-xl border bg-white shadow-2xl" style={{ borderColor: BRAND.border }}>
                        <div className="border-b px-5 py-4" style={{ borderColor: BRAND.border }}><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.blue }}>Supuestos del proyecto</p><h3 className="mt-1 text-lg font-semibold" style={{ color: BRAND.ink }}>Editar datos base</h3><p className="mt-1 text-sm text-slate-500">Estos valores afectan los cálculos de todo el modelo.</p></div>
                        <div className="grid gap-3 p-5 sm:grid-cols-2">
                            {[
                                ['Área venta (m²)', 'landArea'],
                                ['Área promedio lote (m²)', 'lotArea'],
                                [`Precio ${currency === 'USD' ? 'US$' : 'S/'}/m²`, 'priceM2'],
                                ['Cuota inicial %', 'initialPercent'],
                                ['Años de proyección', 'years'],
                                ['Alcabala %', 'alcabalaPercent'],
                                ['Supervisión técnica %', 'supervisionPercent'],
                                ['Servicios públicos %', 'servicesPercent'],
                                ['Diseño y licencias %', 'designPercent'],
                                ['Gerencia de proyecto %', 'managementPercent'],
                                ['Indemnización y titulación %', 'indemnityPercent'],
                                ['Contingencia legal %', 'contingencyPercent'],
                            ].map(([label, key]) => <label key={key} className="label">{label}<input className="input mt-1" min={key === 'years' ? 1 : 0} max={key === 'years' ? 10 : key === 'priceM2' ? undefined : 100} type="number" value={key === 'priceM2' ? displayNumber((draftManual as any)[key]) : (draftManual as any)[key]} onChange={(event) => setDraftManual((current) => ({ ...current, [key]: key === 'priceM2' ? baseNumber(event.target.value) : Number(event.target.value) }))} /></label>)}
                        </div>
                        <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: BRAND.border }}><button className="btn-neutral" onClick={() => setAssumptionsOpen(false)}>Cancelar</button><button className="btn-primary" onClick={applyAssumptions}><FiSave /> Aplicar supuestos</button></div>
                    </div>
                </div>
            )}
            {pendingEdit && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/40" onClick={cancelCellEdit} />
                    <div className="relative w-full max-w-sm rounded-xl border bg-white p-5 shadow-2xl" style={{ borderColor: BRAND.border }}>
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

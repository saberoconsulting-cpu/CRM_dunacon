'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FiEdit3, FiPlus, FiRefreshCw, FiSave, FiTrendingUp, FiX } from 'react-icons/fi';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/types';
import { Toaster, toast } from '@/components/ui/ui';

type Row = { id: string; label: string; group?: boolean; computed?: boolean; values: number[] };
const YEARS = Array.from({ length: 11 }, (_, index) => `Año ${index}`);
const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
const amount = (value: number) => `US$ ${money(value)}`;
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
    const [rows, setRows] = useState<Row[]>([]);
    const [manual, setManual] = useState({ landArea: 24786, lotArea: 82, priceM2: 140, initialPercent: 10, years: 10 });
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [overrides, setOverrides] = useState<Record<string, number[]>>({});
    const [addOpen, setAddOpen] = useState(false);
    const [assumptionsOpen, setAssumptionsOpen] = useState(false);
    const [draftManual, setDraftManual] = useState(manual);
    const [savingAdd, setSavingAdd] = useState(false);
    const [addForm, setAddForm] = useState({ type: 'modelo', rowId: 'construction', year: 0, name: '', amount: '', category: 'costo_directo', currency: 'USD' });
    const editSnapshot = useRef<{ id: string; year: number; value: number } | null>(null);
    const [pendingEdit, setPendingEdit] = useState<{ id: string; year: number; value: number; original: number } | null>(null);

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const [projectData, plan, budget, finances] = await Promise.all([
                    api.get<any>(`/projects/${projectId}`),
                    api.get<any>(`/plan/project/${projectId}`).catch(() => ({ lots: [] })),
                    api.get<any>(`/construction-budget?projectId=${projectId}`).catch(() => ({ items: [], summary: {} })),
                    api.get<any>(`/finances/summary?period=monthly&projectId=${projectId}`).catch(() => ({})),
                ]);
                const lots = plan?.lots || [];
                const budgetItems = budget?.items || [];
                const budgetBy = (names: string[]) => budgetItems.filter((item: any) => names.some((name) => String(item.category || item.name).toLowerCase().includes(name))).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
                const totalLots = lots.length || Number(projectData?.stats?.total || 0);
                const price = Number(projectData?.referencePrice || 0) || 140;
                const saleValue = lots.reduce((sum: number, lot: any) => sum + Number(lot.finalPrice || lot.salePrice || lot.price || 0), 0);
                const land = budgetBy(['terreno']) || 607374;
                const direct = budgetBy(['directo', 'construccion']) || 1188644;
                const expense = Number(finances?.expense || 0);
                const initialRows = SECTIONS.flatMap((section) => {
                    if (section.id === 'cost-sales') return [row(section.id, section.label, [saleValue])];
                    if (section.id === 'gross') return [row(section.id, section.label, [0], true)];
                    if (section.id === 'operating') return [row(section.id, section.label, [0], true)];
                    if (section.id === 'financial') return [row(section.id, section.label, [expense])];
                    if (section.id === 'pre-tax') return [row(section.id, section.label, [0], true)];
                    if (section.id === 'tax') return [row(section.id, section.label, [204668])];
                    if (section.id === 'net') return [row(section.id, section.label, [0], true)];
                    if (section.id === 'igv') return [row(section.id, section.label, [267433])];
                    if (section.id === 'adjusted') return [row(section.id, section.label, [0], true)];
                    return [row(section.id, section.label), ...section.rows.map((item) => row(item.id, item.label))];
                });
                const setFirst = (id: string, value: number) => { const item = initialRows.find((candidate) => candidate.id === id); if (item) item.values[0] = value; };
                setFirst('lots-sold', totalLots);
                setFirst('initial-fee', saleValue * 0.1);
                setFirst('financing-fee', saleValue * 0.9);
                setFirst('land-cost', land);
                setFirst('construction', direct);
                setFirst('supervision', direct * 0.04);
                setFirst('services', direct * 0.01);
                setFirst('management', saleValue * 0.04);
                setFirst('design', direct * 0.03);
                setProject(projectData);
                let savedRows: Row[] | null = null;
                try { savedRows = JSON.parse(localStorage.getItem(`cashflow-model-rows-${projectId}`) || 'null'); } catch { }
                setRows(savedRows || initialRows);
                let savedManual: typeof manual | null = null;
                try { savedManual = JSON.parse(localStorage.getItem(`cashflow-model-${projectId}`) || 'null'); } catch { }
                setManual(savedManual || { ...manual, priceM2: price });
                try { setOverrides(JSON.parse(localStorage.getItem(`cashflow-model-overrides-${projectId}`) || '{}')); } catch { }
            } finally { setLoading(false); }
        }
        load();
    }, [projectId]);

    const calculated = useMemo(() => {
        const next = rows.map((item) => ({ ...item, values: [...item.values] }));
        const get = (id: string) => next.find((item) => item.id === id)?.values || empty();
        const set = (id: string, values: number[]) => { const item = next.find((candidate) => candidate.id === id); if (item) item.values = values; };
        const revenue = get('initial-fee').map((_, year) => get('initial-fee')[year] + get('financing-fee')[year]);
        const costOfSales = get('cost-sales');
        const gross = revenue.map((value, year) => value - costOfSales[year] - get('land-cost')[year] - get('construction')[year] - get('design')[year] - get('management')[year]);
        const operating = gross.map((value, year) => value - get('sales-plan')[year] - get('marketing')[year] - get('commission')[year] - get('post-sale')[year] - get('discounts')[year]);
        const preTax = operating.map((value, year) => value - get('financial')[year]);
        const net = preTax.map((value, year) => value - get('tax')[year]);
        const adjusted = net.map((value, year) => value - get('igv')[year]);
        const computedValues: Record<string, number[]> = { income: revenue, gross, operating, 'pre-tax': preTax, net, adjusted };
        Object.entries(computedValues).forEach(([id, values]) => set(id, overrides[id] || values));
        return next;
    }, [rows, overrides]);

    function editCell(id: string, year: number, value: string) {
        setSaved(false);
        const numeric = Number(value || 0);
        const item = rows.find((candidate) => candidate.id === id);
        if (item?.computed) {
            setOverrides((current) => ({ ...current, [id]: (current[id] || item.values).map((cell, index) => index === year ? numeric : cell) }));
            return;
        }
        setRows((current) => current.map((candidate) => candidate.id !== id ? candidate : { ...candidate, values: candidate.values.map((cell, index) => index === year ? numeric : cell) }));
    }

    function beginCellEdit(id: string, year: number, value: number) {
        editSnapshot.current = { id, year, value };
    }

    function finishCellEdit(id: string, year: number, value: number) {
        const snapshot = editSnapshot.current;
        editSnapshot.current = null;
        if (!snapshot || snapshot.id !== id || snapshot.year !== year || snapshot.value === value) return;
        setPendingEdit({ id, year, value, original: snapshot.value });
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

    function applyCellEdit() {
        setSaved(false);
        setPendingEdit(null);
    }

    function saveAssumptions() {
        localStorage.setItem(`cashflow-model-${projectId}`, JSON.stringify(manual));
        localStorage.setItem(`cashflow-model-overrides-${projectId}`, JSON.stringify(overrides));
        setSaved(true);
    }

    function openAssumptions() {
        setDraftManual(manual);
        setAssumptionsOpen(true);
    }

    function applyAssumptions() {
        setManual(draftManual);
        localStorage.setItem(`cashflow-model-${projectId}`, JSON.stringify(draftManual));
        setAssumptionsOpen(false);
        setSaved(true);
    }

    function updateAdd(key: string, value: string | number) {
        setAddForm((current) => ({ ...current, [key]: value }));
    }

    async function addData() {
        const numericAmount = Number(addForm.amount);
        if (!numericAmount || !addForm.name) return toast('Completa concepto y monto', 'err');
        setSavingAdd(true);
        try {
            if (addForm.type === 'modelo') {
                const target = rows.find((item) => item.id === addForm.rowId);
                if (!target) throw new Error('Selecciona una fila del modelo');
                const nextRows = rows.map((item) => item.id !== target.id ? item : { ...item, values: item.values.map((value, index) => index === Number(addForm.year) ? numericAmount : value) });
                setRows(nextRows);
                localStorage.setItem(`cashflow-model-rows-${projectId}`, JSON.stringify(nextRows));
                toast('Dato agregado al modelo');
            } else if (addForm.type === 'presupuesto') {
                await api.post('/construction-budget', { projectId, category: addForm.category, code: `M-${Date.now()}`, name: addForm.name, amount: numericAmount, currency: addForm.currency, sortOrder: 999 });
                toast('Partida guardada en presupuesto');
            } else {
                const isIncome = addForm.category === 'ingreso';
                await api.post(`/finances/${isIncome ? 'income' : 'expense'}`, isIncome
                    ? { projectId, concept: addForm.name, amount: numericAmount }
                    : { projectId, expenseClass: 'operacion', category: 'otros', concept: addForm.name, amount: numericAmount });
                toast(isIncome ? 'Ingreso registrado' : 'Egreso registrado');
            }
            setAddOpen(false);
            setAddForm((current) => ({ ...current, name: '', amount: '' }));
        } catch (error: any) {
            toast(error?.message || 'No se pudo guardar el dato', 'err');
        } finally { setSavingAdd(false); }
    }

    if (loading) return <div className="card text-sm text-slate-500">Cargando datos del proyecto...</div>;
    return (
        <div className="space-y-5">
            <Toaster />
            <section className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: BRAND.border }}>
                <div className="flex flex-col gap-4 border-b px-5 py-5 lg:flex-row lg:items-start lg:justify-between" style={{ borderColor: BRAND.border }}>
                    <div><div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold" style={{ background: `${BRAND.blue}14`, color: BRAND.blue }}><FiTrendingUp /> Modelo financiero editable</div><h2 className="mt-3 text-2xl font-bold" style={{ color: BRAND.ink }}>{project?.name || 'Proyecto'} · Proyección</h2><p className="mt-1 text-sm text-slate-500">Edita las celdas blancas. Las filas verdes se calculan automáticamente.</p></div>
                    <div className="flex flex-wrap items-center gap-2"><button className="btn-neutral" onClick={() => window.location.reload()}><FiRefreshCw /> Actualizar base</button><button className="btn-outline" onClick={() => setAddOpen(true)}><FiPlus /> Agregar dato</button><button className="btn-primary" onClick={openAssumptions}><FiEdit3 /> Editar supuestos</button></div>
                </div>
                <div className="grid gap-3 border-b bg-[#F8FAFC] p-4 sm:grid-cols-2 lg:grid-cols-5" style={{ borderColor: BRAND.border }}>
                    {[['Área venta (m²)', 'landArea'], ['Área promedio lote (m²)', 'lotArea'], ['Precio US$/m²', 'priceM2'], ['Cuota inicial %', 'initialPercent'], ['Años de proyección', 'years']].map(([label, key]) => <div key={key} className="min-w-0"><p className="text-xs font-semibold text-slate-500">{label}</p><div className="mt-1 flex h-10 items-center justify-between rounded-md border bg-white px-3 text-sm font-semibold tabular-nums" style={{ borderColor: BRAND.border, color: BRAND.ink }}><span>{(manual as any)[key]}</span><span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Bloqueado</span></div></div>)}
                </div>
            </section>

            <section className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: BRAND.border }}>
                <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: BRAND.border }}><div><h3 className="font-semibold" style={{ color: BRAND.ink }}>Estado de resultados proyectado</h3><p className="text-xs text-slate-500">Valores en US$ · al salir de una celda se te pedirá confirmar el cambio.</p></div><FiEdit3 style={{ color: BRAND.blue }} /></div>
                <div className="overflow-auto"><table className="min-w-[1250px] w-full border-collapse text-xs"><thead><tr><th className="sticky left-0 z-10 min-w-[330px] border-b bg-[#F8FAFC] px-4 py-3 text-left text-slate-500">Concepto / US$/m²</th>{YEARS.map((year) => <th key={year} className="min-w-[86px] border-b px-2 py-3 text-right font-semibold" style={{ background: BRAND.blue, color: '#fff' }}>{year}</th>)}</tr><tr><th className="sticky left-0 z-10 border-b bg-[#F8FAFC] px-4 py-2 text-left text-[11px] font-semibold" style={{ color: BRAND.muted }}>Proyección anual</th>{YEARS.map((_, year) => <th key={year} className="border-b px-2 py-2 text-right text-[11px] font-medium" style={{ background: year === 0 ? '#D3E4FD' : '#EAF7EE', color: year === 0 ? BRAND.blueDark : '#125A3B' }}>{new Date().getFullYear() + year}</th>)}</tr></thead><tbody>{SECTIONS.map((section) => { const sectionRow = calculated.find((item) => item.id === section.id); const surface = sectionSurface(section.id, section.computed); return <>{sectionRow && <tr key={`${section.id}-summary`}><td className="sticky left-0 z-[1] border-b px-4 py-2.5 font-bold" style={{ background: surface.background, color: surface.color }}>{section.label}</td>{sectionRow.values.map((value, year) => <td key={year} className="border-b px-1 py-1" style={{ background: surface.background }}><input aria-label={`${section.label} ${YEARS[year]}`} className="w-full min-w-[78px] border border-transparent bg-transparent px-1 py-1.5 text-right font-bold tabular-nums outline-none transition focus:border-[#1877F2] focus:bg-white" value={value || ''} onFocus={() => beginCellEdit(section.id, year, value)} onChange={(event) => editCell(section.id, year, event.target.value)} onBlur={(event) => finishCellEdit(section.id, year, Number(event.target.value || 0))} /></td>)}</tr>}{section.rows.map((definition) => { const item = calculated.find((candidate) => candidate.id === definition.id) || row(definition.id, definition.label); return <tr key={definition.id}><td className="sticky left-0 z-[1] border-b px-4 py-2 text-slate-600" style={{ background: '#fff' }}>- {definition.label}</td>{item.values.map((value, year) => <td key={year} className="border-b px-1 py-1"><input aria-label={`${definition.label} ${YEARS[year]}`} className="w-full min-w-[78px] border border-transparent bg-white px-1 py-1.5 text-right tabular-nums outline-none transition focus:border-[#1877F2] focus:bg-[#F5F9FF]" value={value || ''} onFocus={() => beginCellEdit(definition.id, year, value)} onChange={(event) => editCell(definition.id, year, event.target.value)} onBlur={(event) => finishCellEdit(definition.id, year, Number(event.target.value || 0))} /></td>)}</tr>; })}</>; })}</tbody></table></div>
            </section>
            {assumptionsOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/40" onClick={() => setAssumptionsOpen(false)} />
                    <div className="relative w-full max-w-xl rounded-xl border bg-white shadow-2xl" style={{ borderColor: BRAND.border }}>
                        <div className="border-b px-5 py-4" style={{ borderColor: BRAND.border }}><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.blue }}>Supuestos del proyecto</p><h3 className="mt-1 text-lg font-semibold" style={{ color: BRAND.ink }}>Editar datos base</h3><p className="mt-1 text-sm text-slate-500">Estos valores afectan los cálculos de todo el modelo.</p></div>
                        <div className="grid gap-3 p-5 sm:grid-cols-2">
                            {[['Área venta (m²)', 'landArea'], ['Área promedio lote (m²)', 'lotArea'], ['Precio US$/m²', 'priceM2'], ['Cuota inicial %', 'initialPercent'], ['Años de proyección', 'years']].map(([label, key]) => <label key={key} className="label">{label}<input className="input mt-1" type="number" value={(draftManual as any)[key]} onChange={(event) => setDraftManual((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}
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
                        <div className="rounded-lg border bg-[#F8FAFC] px-3 py-2.5 text-sm" style={{ borderColor: BRAND.border }}><div className="flex justify-between gap-3"><span className="text-slate-500">Valor anterior</span><b>{amount(pendingEdit.original)}</b></div><div className="mt-1 flex justify-between gap-3"><span className="text-slate-500">Nuevo valor</span><b style={{ color: BRAND.blue }}>{amount(pendingEdit.value)}</b></div></div>
                        <div className="mt-5 flex justify-end gap-2"><button className="btn-neutral" onClick={cancelCellEdit}>Cancelar</button><button className="btn-primary" onClick={applyCellEdit}>Aplicar dato</button></div>
                    </div>
                </div>
            )}
            {addOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/45" onClick={() => setAddOpen(false)} />
                    <div className="relative w-full max-w-lg overflow-hidden rounded-xl border bg-white shadow-2xl" style={{ borderColor: BRAND.border }}>
                        <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: BRAND.border }}>
                            <div><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.blue }}>Carga guiada</p><h3 className="mt-1 text-lg font-semibold" style={{ color: BRAND.ink }}>Agregar dato</h3><p className="mt-1 text-xs text-slate-500">Elige dónde debe vivir el dato para no perderlo entre las celdas.</p></div>
                            <button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setAddOpen(false)} aria-label="Cerrar"><FiX /></button>
                        </div>
                        <div className="space-y-4 p-5">
                            <label className="label">Guardar en
                                <select className="input mt-1" value={addForm.type} onChange={(event) => updateAdd('type', event.target.value)}>
                                    <option value="modelo">Modelo financiero (solo este año)</option>
                                    <option value="presupuesto">Presupuesto de obra (base de datos)</option>
                                    <option value="finanzas">Movimiento financiero (base de datos)</option>
                                </select>
                            </label>
                            {addForm.type === 'modelo' && <div className="grid gap-3 sm:grid-cols-2"><label className="label">Concepto<select className="input mt-1" value={addForm.rowId} onChange={(event) => updateAdd('rowId', event.target.value)}>{SECTIONS.flatMap((section) => section.rows.map((item) => <option key={item.id} value={item.id}>{item.label}</option>))}</select></label><label className="label">Año<select className="input mt-1" value={addForm.year} onChange={(event) => updateAdd('year', Number(event.target.value))}>{YEARS.map((year, index) => <option key={year} value={index}>{year}</option>)}</select></label></div>}
                            {addForm.type !== 'modelo' && <label className="label">Descripción<input className="input mt-1" value={addForm.name} onChange={(event) => updateAdd('name', event.target.value)} placeholder="Ej. Supervisión de obra" /></label>}
                            {addForm.type === 'modelo' && <label className="label">Referencia<input className="input mt-1" value={addForm.name} onChange={(event) => updateAdd('name', event.target.value)} placeholder="Nota del dato (opcional)" /></label>}
                            <div className="grid gap-3 sm:grid-cols-2"><label className="label">Monto<input className="input mt-1" type="number" value={addForm.amount} onChange={(event) => updateAdd('amount', event.target.value)} placeholder="0.00" /></label>{addForm.type === 'presupuesto' ? <label className="label">Categoría<select className="input mt-1" value={addForm.category} onChange={(event) => updateAdd('category', event.target.value)}><option value="costo_terreno">Costo de terreno</option><option value="costo_directo">Costo directo</option><option value="costo_indirecto">Costo indirecto</option><option value="gastos_ventas_admin">Ventas y administración</option><option value="gastos_financieros_impuestos">Financieros e impuestos</option></select></label> : addForm.type === 'finanzas' ? <label className="label">Tipo<select className="input mt-1" value={addForm.category} onChange={(event) => updateAdd('category', event.target.value)}><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select></label> : <div />}</div>
                            {addForm.type === 'presupuesto' && <label className="label">Moneda<select className="input mt-1" value={addForm.currency} onChange={(event) => updateAdd('currency', event.target.value)}><option value="USD">US$</option><option value="PEN">S/</option></select></label>}
                            <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: BRAND.border }}><button className="btn-neutral" onClick={() => setAddOpen(false)}>Cancelar</button><button className="btn-primary" disabled={savingAdd} onClick={addData}>{savingAdd ? 'Guardando...' : 'Agregar dato'}</button></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FiActivity, FiAward, FiBarChart2, FiBriefcase, FiCheckCircle, FiClipboard, FiCreditCard, FiDollarSign, FiDownload, FiEdit3, FiFileText, FiGrid, FiMapPin, FiPackage, FiPercent, FiPieChart, FiRefreshCw, FiTool, FiTrendingUp, FiUsers } from 'react-icons/fi';
import { Toaster, toast } from '@/components/ui/ui';
import { KpiCard as SharedKpiCard } from '@/components/ui/Metrics';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { api } from '@/lib/api';
import { printHtml } from '@/lib/print';
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
  label: string;
  projected: number;
  real: number;
  icon: JSX.Element;
  accent?: 'income' | 'subtotal' | 'tax' | 'final';
  group?: 'cost';
  child?: boolean;
  note?: string;
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

/** Participacion de cada linea sobre el ingreso total real (la primera linea es 100%). */
function incomeShare(real: number, totalIncome: number) {
  if (!totalIncome) return real ? 100 : 0;
  return (real / totalIncome) * 100;
}

function lotRevenue(lot: Lot) {
  return num(lot.finalPrice || lot.salePrice || lot.price);
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
    <div className="min-w-0 rounded-md border bg-white px-3 py-2 sm:px-4 sm:py-2.5" style={{ borderColor: BORDER }}>
      <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }} title={label}>{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums sm:text-base" style={{ color }} title={value}>{value}</p>
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
      const [projectData, statementData, lotData, cashflowData] = await Promise.all([
        api.get<Project>(`/projects/${projectId}`),
        api.get<IncomeStatement>(`/finances/income-statement?projectId=${projectId}`),
        loadAllLots(projectId),
        api.get<CashflowModel | null>(`/cashflow/model?projectId=${projectId}&mode=estatico`).catch(() => null),
      ]);
      setProject(projectData);
      setStatement(statementData);
      setLots(lotData);
      setCashflow(cashflowData && Array.isArray(cashflowData.rows) ? cashflowData : null);
    } catch (error: any) {
      toast(error?.message || 'No se pudo cargar el estado de resultados', 'err');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

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

    const rows: StatementRow[] = [
      { label: 'Ingreso por venta de lotes', projected: projectedRevenue, real: realRevenue, accent: 'income', icon: <FiDollarSign />, note: 'Proyectado del flujo de caja estático' },
      { label: 'Costo de venta de lotes', projected: projectedCostOfSales, real: costOfSales, accent: 'subtotal', group: 'cost', icon: <FiPackage />, note: 'Terreno + costos directos + costos indirectos del flujo de caja estático' },
      { label: 'Costo de terreno', projected: projectedLand, real: landCost, group: 'cost', child: true, icon: <FiMapPin /> },
      { label: 'Costo directo / inversion', projected: projectedDirect, real: directCost, group: 'cost', child: true, icon: <FiTool /> },
      { label: 'Costo indirecto', projected: projectedIndirect, real: indirectCost, group: 'cost', child: true, icon: <FiClipboard /> },
      { label: 'Utilidad bruta', projected: projectedGrossProfit, real: grossProfit, accent: 'subtotal', icon: <FiTrendingUp /> },
      { label: 'Gastos de ventas y administrativos', projected: projectedSalesAdmin, real: salesAdminCost, icon: <FiUsers /> },
      { label: 'Utilidad operativa', projected: projectedOperatingProfit, real: operatingProfit, accent: 'subtotal', icon: <FiActivity /> },
      { label: 'Gastos financieros', projected: projectedFinanceTax, real: financeCost, icon: <FiCreditCard /> },
      { label: 'Utilidad antes de impuesto', projected: projectedPreTaxProfit, real: preTaxProfit, accent: 'subtotal', icon: <FiPieChart /> },
      { label: 'Impuesto a la renta referencial', projected: projectedIncomeTax, real: Math.max(realTaxRegistered, incomeTax), accent: 'tax', icon: <FiPercent />, note: 'Real toma impuestos registrados o referencia 29.5%' },
      { label: 'Utilidad neta', projected: projectedNetProfit, real: netProfit, accent: 'final', icon: <FiAward /> },
      { label: 'IGV referencial incluido en ingresos', projected: projectedRevenue > 0 ? projectedRevenue * 18 / 118 : 0, real: igvReference, accent: 'tax', icon: <FiFileText />, note: 'Separacion referencial si los ingresos incluyen IGV' },
      { label: 'Utilidad ajustada referencial', projected: projectedNetProfit - (projectedRevenue > 0 ? projectedRevenue * 18 / 118 : 0), real: adjustedProfit, accent: 'final', icon: <FiCheckCircle /> },
    ];

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
  }, [lots, statement, cashflow]);

  function escapeHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Exporta las cards (KPI + metricas) y el cuadro completo del Estado de
   * Resultados a PDF usando el mismo helper `printHtml` que el resto del CRM.
   * Respeta la moneda activa (S/ o US$) mediante `show()` y `symbol`.
   */
  function exportPdf() {
    if (loading) return toast('Espera a que termine la carga', 'err');
    const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
    const projectName = project?.name || `Proyecto ${projectId}`;
    const today = new Date().toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' });

    const cards: Array<{ label: string; value: string; helper: string; tone: string }> = [
      { label: 'Ingreso real', value: show(report.realRevenue), helper: 'Ingresos de la operacion diaria (transacciones)', tone: GREEN },
      { label: 'Utilidad neta', value: show(report.netProfit), helper: `Margen neto ${pct(report.margin)}`, tone: report.netProfit >= 0 ? BLUE : RED },
      { label: 'Lotes vendidos', value: `${report.soldLots}/${lots.length}`, helper: 'Conteo desde lotizacion', tone: BLUE_DARK },
      { label: 'Area vendible', value: `${report.totalArea.toLocaleString('es-PE', { maximumFractionDigits: 0 })} m2`, helper: project?.location || 'Ubicacion del proyecto', tone: '#7C3AED' },
    ];
    const pills: Array<{ label: string; value: string }> = [
      { label: 'Precio proyectado m2', value: show(report.projectedM2) },
      { label: 'Ingreso real m2', value: show(report.realM2) },
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

    const rowsHtml = report.rows.map((row) => {
      const diff = deviation(row.real, row.projected);
      const share = incomeShare(row.real, report.realRevenue);
      const cls = row.accent === 'final' ? 'row-final'
        : row.accent === 'subtotal' ? 'row-subtotal'
          : row.accent === 'tax' ? 'row-tax'
            : row.accent === 'income' ? 'row-income'
              : (row.group === 'cost' ? 'row-cost' : '');
      const child = row.child ? ' cell-child' : '';
      return `
        <tr class="${cls}">
          <td class="concept${child}">
            <span class="concept-name">${escapeHtml(row.label)}</span>
            ${row.note ? `<span class="concept-note">${escapeHtml(row.note)}</span>` : ''}
          </td>
          <td class="num">${escapeHtml(show(row.projected))}</td>
          <td class="num">${escapeHtml(show(row.real))}</td>
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
                <button
                  type="button"
                  className="btn-neutral !h-10 w-full justify-center whitespace-nowrap text-sm"
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
          <div className="grid grid-cols-2 gap-3 border-t bg-[#F8FAFC] p-4 xl:grid-cols-4" style={{ borderColor: BORDER }}>
            <MetricPill label="Precio proyectado m2" value={show(report.projectedM2)} />
            <MetricPill label="Ingreso real m2" value={show(report.realM2)} color={GREEN} />
            <MetricPill label="Area venta m2" value={`${report.totalArea.toLocaleString('es-PE', { maximumFractionDigits: 2 })} m2`} color={BLUE_DARK} />
            <MetricPill label="Fecha de reporte" value={new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })} color={INK} />
          </div>
        </section>

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
                <h3 className="font-semibold" style={{ color: INK }}>Resultado economico del proyecto</h3>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>Proyectado vs real con desviacion porcentual y participacion de cada linea sobre el ingreso real.</p>
              </div>
              <button className="btn-neutral !h-9 text-xs" onClick={load} disabled={loading}>
                <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar
              </button>
            </div>
            <p className="px-4 py-2 text-xs text-slate-400 md:hidden">Desliza la tabla hacia la derecha para ver mas columnas.</p>
            {/* [container-type:inline-size] permite usar `cqw` (= ancho visible del
                contenedor). En movil la tabla mide "ancho visible + 300px": la primera
                columna se ajusta (texto con "...") y deja ver completa la columna
                Proyectado; el resto se alcanza deslizando. Desde md vuelve a porcentajes. */}
            <div className="overflow-x-auto [container-type:inline-size]">
              <table className="w-[calc(100cqw_+_300px)] table-fixed text-[13px] md:w-full md:min-w-[700px] md:text-sm">
                <colgroup>
                  <col className="w-[calc(100cqw_-_132px)] md:w-[34%]" />
                  <col className="w-[132px] md:w-[17%]" />
                  <col className="w-[130px] md:w-[17%]" />
                  <col className="w-[86px] md:w-[15%]" />
                  <col className="w-[84px] md:w-[17%]" />
                </colgroup>
                <thead>
                  <tr className="border-b text-left text-[11px] font-bold uppercase tracking-wide md:text-xs" style={{ borderColor: BORDER, color: MUTED, background: '#F8FAFC' }}>
                    <th className="px-4 py-3">Concepto</th>
                    <th className="whitespace-nowrap px-2 py-3 text-right md:px-3">Proyectado {symbol}</th>
                    <th className="whitespace-nowrap px-2 py-3 text-right md:px-3">Real {symbol}</th>
                    <th className="px-2 py-3 text-right md:px-3">% Ingreso</th>
                    <th className="px-4 py-3 text-right">Desviaci&oacute;n</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: BORDER }}>
                  {loading ? (
                    <tr>
                      <td className="py-10" colSpan={5}>
                        <div className="sticky left-0 w-[100cqw] text-center text-sm text-slate-400 md:w-full">Cargando estado de resultados...</div>
                      </td>
                    </tr>
                  ) : report.rows.map((row) => {
                    const tone = rowTone(row);
                    const diff = deviation(row.real, row.projected);
                    const share = incomeShare(row.real, report.realRevenue);
                    const rowBg = row.group === 'cost'
                      ? (row.child ? 'bg-[#F7F8FF] hover:bg-[#EEF1FF]' : 'bg-[#EEF2FF] hover:bg-[#E6EBFF]')
                      : 'hover:bg-slate-50';
                    return (
                      <tr key={row.label} className={`transition-colors ${rowBg}`}>
                        <td className="px-4 py-3" style={row.group === 'cost' ? { boxShadow: `inset ${row.child ? 3 : 4}px 0 0 ${COST}` } : undefined}>
                          <div className={`flex min-w-0 items-center gap-3 ${row.child ? 'pl-3' : ''}`}>
                            <span className={`grid shrink-0 place-items-center rounded-md ${row.child ? 'h-7 w-7' : 'h-8 w-8'}`} style={{ background: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}>
                              {row.icon}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold" style={{ color: tone.color }} title={row.label}>{row.label}</p>
                              {row.note && <p className="truncate text-[11px] leading-tight" style={{ color: MUTED }} title={row.note}>{row.note}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums md:px-3 md:py-3 md:text-sm" style={{ color: INK }}>{show(row.projected)}</td>
                        <td className="px-2 py-2.5 text-right font-bold tabular-nums md:px-3 md:py-3 md:text-sm" style={{ color: row.real < 0 ? RED : INK }}>{show(row.real)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums md:px-3 md:py-3 md:text-sm" style={{ color: row.real < 0 ? RED : row.accent === 'income' ? GREEN : MUTED, fontWeight: row.accent === 'income' || row.accent === 'final' || row.accent === 'subtotal' ? 700 : 500 }}>{pct(share)}</td>
                        <td className="px-2 py-2.5 text-right md:px-3 md:py-3">
                          <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums md:text-xs md:px-2.5 md:py-1" style={{ background: Math.abs(diff) <= 5 ? '#F1F5F9' : diff >= 0 ? '#EAF7EE' : '#FEE2E2', color: Math.abs(diff) <= 5 ? MUTED : diff >= 0 ? GREEN : RED }}>
                            {diff >= 0 ? '+' : ''}{pct(diff)}
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

            <section className="rounded-md border bg-white p-5 shadow-sm" style={{ borderColor: BORDER }}>
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
    </>
  );
}
'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { FiActivity, FiAlertTriangle, FiArrowDownCircle, FiChevronDown, FiCreditCard, FiDollarSign, FiMoreVertical, FiPieChart, FiTag, FiTrendingUp } from 'react-icons/fi';
import { BRAND } from '@/lib/types';

// --- Formato ---
// Formato por defecto: Soles. El contenedor inyecta el formateador de la moneda
// activa (S/ o US$) mediante el prop `formatter` para uniformizar la pantalla.
function penMoney(value: unknown): string {
  return `S/ ${Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(value: unknown): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.0%';
  return `${n.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function KpiTile({ label, value, helper, icon, accent }: { label: string; value: string; helper: string; icon: ReactNode; accent: string }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2.5 shadow-sm" style={{ borderColor: '#E5E7EB' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase" style={{ color: '#6B7280' }}>{label}</p>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs" style={{ background: `${accent}12`, color: accent }}>{icon}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-bold tabular-nums" style={{ color: '#111827' }}>{value}</p>
      <p className="mt-0.5 truncate text-[10px]" style={{ color: '#6B7280' }}>{helper}</p>
    </div>
  );
}

function ChartHeader({ title, subtitle, menuRows }: { title: string; subtitle: string; menuRows: Array<[string, string]> }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: '#E5E7EB' }}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold" style={{ color: '#111827' }}>{title}</h3>
        <p className="mt-0.5 text-xs" style={{ color: '#6B7280' }}>{subtitle}</p>
      </div>
      <details className="relative shrink-0">
        <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-md border bg-white text-slate-500 hover:bg-slate-50" style={{ borderColor: '#E5E7EB' }}>
          <FiMoreVertical />
        </summary>
        <div className="absolute right-0 top-9 z-20 w-56 rounded-md border bg-white p-2 shadow-xl" style={{ borderColor: '#E5E7EB' }}>
          {menuRows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-xs">
              <span style={{ color: '#6B7280' }}>{label}</span>
              <b className="tabular-nums" style={{ color: '#111827' }}>{value}</b>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function RangeFilter({ rangeMonths, onChange }: { rangeMonths: 1 | 6 | 12; onChange: (value: 1 | 6 | 12) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {([
        { value: 1 as const, label: 'Ultimo mes' },
        { value: 6 as const, label: '6 meses' },
        { value: 12 as const, label: 'Ultimo anio' },
      ]).map((option) => {
        const active = rangeMonths === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="h-8 rounded-md border px-3 text-xs font-semibold transition-colors"
            style={{
              borderColor: active ? BRAND.blue : BRAND.border,
              background: active ? BRAND.blue : '#fff',
              color: active ? '#fff' : '#6B7280',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Etiqueta corta para meses "YYYY-MM" -> "ene 25"
export function monthLabel(month: unknown): string {
  const [year, rawMonth] = String(month || '').split('-');
  const date = new Date(Number(year), Number(rawMonth || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return String(month || '-');
  return date.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' }).replace('.', '');
}

// Secuencia completa de los ultimos N meses (incluye meses sin datos en 0),
// para que las graficas de tendencia siempre muestren el eje temporal completo.
export function monthSequence(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

const CHART_COLORS = [BRAND.blue, BRAND.blueDark, '#16A36A', '#F59E0B', '#E11D48', '#8064A2', '#0EA5E9', '#64748B'];

function proportion(value: number, base: number, minimum = 0) {
  if (!base || value <= 0) return 0;
  return Math.max(minimum, (value / base) * 100);
}

function conicGradient(data: { value: number; color: string }[], total: number) {
  if (!total) return BRAND.mutedLight;
  let cursor = 0;
  const stops = data
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = cursor;
      cursor += (item.value / total) * 100;
      return `${item.color} ${start}% ${cursor}%`;
    });
  return `conic-gradient(${stops.join(', ')})`;
}

function EmptyChart({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-slate-400">{text}</p>;
}

// Envoltorio de grafica con el estilo del dashboard (borde + sombra suave).
export function ChartShell({ title, subtitle, children, className = '', flex1 = false }: { title: string; subtitle: string; children: ReactNode; className?: string; flex1?: boolean }) {
  return (
    <section className={`border bg-white p-4 ${flex1 ? 'flex flex-col' : ''} ${className}`} style={{ borderColor: BRAND.border, borderRadius: 6, boxShadow: '0 1px 2px rgba(16,24,40,.035)' }}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: BRAND.ink }}>{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className={flex1 ? 'flex min-h-0 flex-1 flex-col justify-center' : ''}>{children}</div>
    </section>
  );
}

// Donut con conic-gradient, total al centro y leyenda lateral.
function DonutChart({ data, formatter = penMoney, centered = false }: { data: { name: string; value: number; color: string }[]; formatter?: (value: number) => string; centered?: boolean }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  if (!total) return <EmptyChart text="Sin datos para graficar." />;

  return (
    <div className={centered ? 'flex flex-col items-center gap-4' : 'grid items-center gap-4'}>
      <div
        className="group relative grid h-44 w-44 place-items-center transition-transform duration-300 ease-out hover:scale-105"
        onMouseLeave={() => setHover(null)}
      >
        <div className="grid h-full w-full place-items-center transition-transform duration-300 ease-out group-hover:rotate-6" style={{ background: conicGradient(data, total), borderRadius: '50%' }}>
          <div className="grid h-28 w-28 place-items-center bg-white shadow-inner transition-transform duration-300 ease-out group-hover:scale-90" style={{ borderRadius: '50%' }}>
            <div className="px-2 text-center">
              <p className="text-sm font-bold tabular-nums" style={{ color: BRAND.ink }}>{formatter(total)}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">total</p>
            </div>
          </div>
        </div>
      </div>
      <div className={centered ? 'w-full max-w-sm space-y-2' : 'min-w-0 space-y-2'}>
        {data.filter((item) => item.value > 0).map((item, index) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition-colors duration-200"
            style={{ background: hover === index ? `${item.color}14` : 'transparent' }}
            onMouseEnter={() => setHover(index)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm transition-transform duration-200" style={{ background: item.color, transform: hover === index ? 'scale(1.4)' : 'none' }} />
              <span className="truncate font-medium text-slate-600">{item.name}</span>
            </span>
            <b className="shrink-0 tabular-nums" style={{ color: BRAND.ink }}>{formatter(item.value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// Grafico de LINEAS CON PUNTOS: una linea continua por serie, con un punto
// marcado sobre cada mes. Eje X = meses, Eje Y = montos con rejilla de fondo.
function LineSeriesChart({
  rows,
  series,
  formatter = penMoney,
}: {
  rows: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  formatter?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (!rows.length) return <EmptyChart text="Sin datos por mes." />;

  const flat = rows.flatMap((row) => row.values);
  const max = Math.max(...flat, 1);
  const ticks = [max, max * 0.75, max * 0.5, max * 0.25, 0];

  // Coordenadas en escala 0-100 para dibujar con un viewBox normalizado.
  const count = rows.length;
  const step = count > 1 ? 100 / (count - 1) : 100;
  const seriesPoints = series.map((_item, seriesIndex) =>
    rows.map((row, rowIndex) => {
      const value = Number(row.values[seriesIndex] || 0);
      return { x: count > 1 ? rowIndex * step : 50, y: proportion(value, max) };
    }),
  );

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="grid min-h-0 flex-1 grid-cols-[3rem_minmax(0,1fr)] gap-2">
        <div className="relative text-right text-[10px] tabular-nums text-slate-500">
          {ticks.map((tick, index) => (
            <span key={index} className="absolute right-0 -translate-y-1/2" style={{ top: `${index * 25}%` }}>
              {formatter(Math.round(tick)).replace('US$ ', '')}
            </span>
          ))}
        </div>

        <div className="relative">
          {Array.from({ length: 5 }).map((_, index) => (
            <span key={index} className="absolute inset-x-0 border-t" style={{ top: `${index * 25}%`, borderColor: BRAND.border }} />
          ))}

          <svg viewBox="-2 -6 104 112" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              {series.map((item, seriesIndex) => (
                <linearGradient key={item.name} id={`projLineFill${seriesIndex}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={item.color} stopOpacity="0.14" />
                  <stop offset="100%" stopColor={item.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {seriesPoints.map((points, seriesIndex) => {
              const line = points.map((point) => `${point.x},${100 - point.y}`).join(' ');
              const area = `${points[0]?.x ?? 0},100 ${line} ${points[points.length - 1]?.x ?? 100},100`;
              return (
                <g key={series[seriesIndex].name}>
                  <polygon points={area} fill={`url(#projLineFill${seriesIndex})`} />
                  <polyline
                    points={line}
                    fill="none"
                    stroke={series[seriesIndex].color}
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}

            {seriesPoints.map((points, seriesIndex) =>
              points.map((point, rowIndex) => (
                <circle
                  key={`${seriesIndex}-${rowIndex}`}
                  cx={point.x}
                  cy={100 - point.y}
                  r={hover === rowIndex ? 3.4 : 2.4}
                  fill="#fff"
                  stroke={series[seriesIndex].color}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  className="transition-all duration-200"
                />
              )),
            )}
          </svg>

          <div className="absolute inset-0 flex">
            {rows.map((row, index) => (
              <div
                key={row.label}
                className="relative h-full flex-1"
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              >
                {hover === index && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max -translate-x-1/2 rounded-md border bg-white px-2.5 py-1.5 shadow-xl" style={{ borderColor: BRAND.border }}>
                    <p className="mb-1 text-center text-[10px] font-semibold uppercase text-slate-500">{row.label}</p>
                    {series.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between gap-4 text-[11px]">
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                          {item.name}
                        </span>
                        <b className="tabular-nums" style={{ color: BRAND.ink }}>{formatter(row.values[i] || 0)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
        <span />
        <div className="flex">
          {rows.map((row, index) => (
            <span
              key={row.label}
              className="min-w-0 flex-1 truncate text-center text-[10px] font-semibold uppercase transition-colors"
              style={{ color: hover === index ? BRAND.blueDark : '#94A3B8' }}
            >
              {row.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t pt-3" style={{ borderColor: BRAND.border }}>
        {series.map((item) => (
          <span key={item.name} className="flex items-center gap-2 text-[11px] font-medium">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
            <span style={{ color: BRAND.ink }}>{item.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Barras verticales AGRUPADAS por mes: cada serie es una barra paralela.
function GroupedColumns({
  rows,
  series,
  formatter = penMoney,
}: {
  rows: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  formatter?: (value: number) => string;
}) {
  if (!rows.length) return <EmptyChart text="Sin datos por mes." />;

  const flat = rows.flatMap((row) => row.values);
  const max = Math.max(...flat, 1);
  const ticks = [max, max * 0.75, max * 0.5, max * 0.25, 0];

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="grid min-h-0 flex-1 grid-cols-[3rem_minmax(0,1fr)] gap-2">
        <div className="relative text-right text-[10px] tabular-nums text-slate-500">
          {ticks.map((tick, index) => (
            <span key={index} className="absolute right-0 -translate-y-1/2" style={{ top: `${index * 25}%` }}>
              {formatter(Math.round(tick)).replace('US$ ', '')}
            </span>
          ))}
        </div>
        <div className="relative">
          {Array.from({ length: 5 }).map((_, index) => (
            <span key={index} className="absolute inset-x-0 border-t" style={{ top: `${index * 25}%`, borderColor: BRAND.border }} />
          ))}
          <div className="relative flex h-full items-end gap-2">
            {rows.map((row) => (
              <div key={row.label} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1">
                {row.values.map((value, i) => (
                  <div
                    key={series[i]?.name || i}
                    className="w-full max-w-[1.2rem] transition-all duration-300"
                    style={{
                      height: `${proportion(value, max, value ? 3 : 0)}%`,
                      minHeight: value ? 4 : 2,
                      background: value ? (series[i]?.color || CHART_COLORS[i % CHART_COLORS.length]) : BRAND.mutedLight,
                      borderRadius: '3px 3px 0 0',
                    }}
                    title={`${row.label} - ${series[i]?.name || ''}: ${formatter(value)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t pt-3" style={{ borderColor: BRAND.border }}>
        {series.map((item) => (
          <span key={item.name} className="flex items-center gap-2 text-[11px] font-medium">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
            <span style={{ color: BRAND.ink }}>{item.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({ data, formatter = penMoney }: { data: { name: string; value: number; color: string }[]; formatter?: (value: number) => string }) {
  const visible = data.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  if (!visible.length) return <EmptyChart text="Sin datos para graficar." />;

  const max = Math.max(...visible.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {visible.map((item) => (
        <div key={item.name} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium" style={{ color: BRAND.ink }}>{item.name}</span>
            <b className="shrink-0 tabular-nums" style={{ color: BRAND.ink }}>{formatter(item.value)}</b>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: BRAND.mutedLight }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${proportion(item.value, max, 2)}%`, background: item.color }}
              title={`${item.name}: ${formatter(item.value)}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface ProjectReportsData {
  paidAmount: number;
  soldAmount: number;
  overdueAmount: number;
  delinquencyRate: number;
  collectedByMonth: { month: string; monto: number }[];
  salesByMonth: { month: string; monto: number }[];
  overdueByMonth: { month: string; monto: number }[];
  totalLots?: number;
  inventoryValue?: number;
  soldLotsCount?: number;
  pendingAmount?: number;
  costOfSales?: number;
  expenses?: number;
  tax?: number;
  netProfit?: number;
  lotCountData?: { name: string; value: number }[];
  lotAmountData?: { name: string; value: number }[];
  lotColorByLabel?: (name: string) => string;
  leadsChartData?: { name: string; value: number }[];
  leadColorByLabel?: (name: string) => string;
  totalLeads?: number;
  kpis?: {
    cards?: Record<string, number>;
    statement?: Record<string, number>;
    cash?: Record<string, number>;
  } | null;
}

export default function ProjectReports({ data, formatter }: { data: ProjectReportsData; formatter?: (value: number) => string }) {
  const [rangeMonths, setRangeMonths] = useState<1 | 6 | 12>(6);
  const [showIndicators, setShowIndicators] = useState(false);
  // Moneda unica de la pantalla: si el contenedor no inyecta un formateador,
  // se usa Soles por defecto (los montos llegan en soles desde la base de datos).
  const money = formatter || penMoney;

  const range = rangeMonths;
  const timeline = monthSequence(range);
  const find = (rows: { month: string; monto: number }[], month: string) =>
    Number(rows.find((row) => row.month === month)?.monto || 0);

  const cards = data.kpis?.cards || {};
  const st = data.kpis?.statement || {};
  const cashKpi = data.kpis?.cash || {};

  const totalLots = Number(cards.totalLots ?? data.totalLots ?? 0);
  const inventoryValue = Number(cards.inventoryValue ?? data.inventoryValue ?? 0);
  const soldLotsCount = Number(cards.soldLotsCount ?? data.soldLotsCount ?? 0);
  const soldAmount = Number(cards.soldListValue ?? data.soldAmount);
  const paidAmount = Number(cards.collectedAmount ?? data.paidAmount);
  const pendingAmount = Number(cashKpi.pendingAmount ?? cards.pendingAmount ?? data.pendingAmount ?? 0);
  const delinquencyRate = Number(cashKpi.delinquencyRate ?? data.delinquencyRate ?? 0);

  const costoVentas = Number(st.costOfSales ?? 0);
  const gastosProyecto = Number(st.salesAdminCost ?? 0) + Number(st.financeCost ?? 0);
  const utilidadBruta = Number(st.grossProfit ?? 0);
  const utilidadOperativa = Number(st.operatingProfit ?? 0);
  const utilidadAntes = Number(st.profitBeforeTax ?? 0);
  const igv = Number(st.incomeTax ?? 0);
  const utilidadNeta = Number(st.netProfit ?? 0);
  const ingresoReal = Number(st.revenue ?? 0);
  const utilidadBrutaPct = soldAmount > 0 ? (utilidadBruta / soldAmount) * 100 : 0;
  const margenNeto = Number(st.marginOnSales ?? 0);
  const collectionRate = Number(cashKpi.collectionRate ?? 0);
  const tir = Number(st.marginOnSales ?? 0);

  const lotCountData = data.lotCountData || [];
  const lotAmountData = data.lotAmountData || [];
  const lotColorByLabel = data.lotColorByLabel || (() => '#9AA1AB');
  const leadsChartData = data.leadsChartData || [];
  const leadColorByLabel = data.leadColorByLabel || (() => '#9AA1AB');
  const showLeadsChart = data.totalLeads != null ? data.totalLeads > 0 : leadsChartData.length > 0;

  const investmentData = timeline.map((month) => ({
    label: monthLabel(month),
    values: [find(data.salesByMonth, month), find(data.overdueByMonth, month)],
  }));
  const collectionData = timeline.map((month) => ({ label: monthLabel(month), values: [find(data.collectedByMonth, month)] }));
  const paymentVsDelinquency = timeline.map((month) => ({
    label: monthLabel(month),
    values: [find(data.collectedByMonth, month), find(data.overdueByMonth, month)],
  }));

  const rangeLabel = range === 1 ? 'Ultimo mes' : range === 6 ? 'Ultimos 6 meses' : 'Ultimos 12 meses';

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Columna izquierda (60%) */}
      <div className="grid min-w-0 gap-4 lg:grid-rows-[auto_1fr_1fr]">
        <ChartShell title="Ejecucion de la Obra" subtitle="Cobrado frente al saldo por cobrar">
          <div className="flex min-h-[230px] items-center justify-center">
            <DonutChart
              centered
              formatter={money}
              data={[
                { name: 'Cobrado', value: data.paidAmount, color: '#0F8B5F' },
                { name: 'Por cobrar', value: Math.max(0, data.soldAmount - data.paidAmount), color: '#E5E7EB' },
              ]}
            />
          </div>
        </ChartShell>

        <ChartShell title="Recaudacion por mes" subtitle={rangeLabel} flex1>
          <div className="mb-3 flex justify-end">
            <RangeFilter rangeMonths={rangeMonths} onChange={setRangeMonths} />
          </div>
          <div className="min-h-[190px] flex-1">
            <LineSeriesChart rows={collectionData} series={[{ name: 'Recaudado', color: BRAND.blue }]} formatter={money} />
          </div>
        </ChartShell>

        <ChartShell title="Pagos vs Morosidad" subtitle={rangeLabel} flex1>
          <div className="min-h-[190px] flex-1">
            <LineSeriesChart
              rows={paymentVsDelinquency}
              formatter={money}
              series={[
                { name: 'Pagado', color: BRAND.blue },
                { name: 'Moroso', color: '#E11D48' },
              ]}
            />
          </div>
        </ChartShell>

        <ChartShell title="Inversiones y Gastos" subtitle={rangeLabel} flex1>
          <div className="min-h-[190px] flex-1">
            <GroupedColumns
              rows={investmentData}
              formatter={money}
              series={[
                { name: 'Vendido', color: BRAND.blue },
                { name: 'Moroso', color: '#E11D48' },
              ]}
            />
          </div>
        </ChartShell>
      </div>

      {/* Columna derecha (40%) */}
      <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto lg:pr-1">
        <button
          type="button"
          onClick={() => setShowIndicators((value) => !value)}
          className="flex w-full items-center justify-between gap-3 rounded-md border bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
          style={{ borderColor: showIndicators ? BRAND.blue : BRAND.border }}
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold" style={{ color: BRAND.ink }}>
              {showIndicators ? 'Indicadores del proyecto' : 'Ver indicadores del proyecto'}
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-500">
              {showIndicators ? 'Ocultar para ver las graficas' : 'Estado de resultados y KPIs'}
            </span>
          </span>
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md transition-transform duration-200"
            style={{ background: showIndicators ? BRAND.blue : `${BRAND.blue}12`, color: showIndicators ? '#fff' : BRAND.blue, transform: showIndicators ? 'rotate(180deg)' : 'none' }}
          >
            <FiChevronDown />
          </span>
        </button>

        {showIndicators ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <KpiTile label="Lotes del proyecto" value={String(totalLots)} helper="Unidades registradas" icon={<FiPieChart />} accent="#1259C4" />
              <KpiTile label="Valor total" value={money(inventoryValue)} helper="Valor lista del inventario" icon={<FiDollarSign />} accent="#0F8B5F" />
              <KpiTile label="Lotes vendidos" value={String(soldLotsCount)} helper="Unidades vendidas" icon={<FiTag />} accent="#111827" />
              <KpiTile label="Venta lotes" value={money(soldAmount)} helper="Valor lista vendido" icon={<FiTrendingUp />} accent="#1259C4" />
              <KpiTile label="Pago lotes" value={money(paidAmount)} helper="Cuotas cobradas" icon={<FiCreditCard />} accent="#0F8B5F" />
              <KpiTile label="Pago pendiente" value={money(pendingAmount)} helper="Saldo por cobrar" icon={<FiAlertTriangle />} accent="#B45309" />
              <KpiTile label="Morosidad" value={pct(delinquencyRate)} helper="Mora sobre pendientes" icon={<FiActivity />} accent="#E11D48" />
              <KpiTile label="Tasa de cobro" value={pct(collectionRate)} helper="Cobrado sobre vendido" icon={<FiTrendingUp />} accent="#7C3AED" />
            </div>

            <div className="card overflow-hidden p-0">
              <ChartHeader
                title="Estado de resultados"
                subtitle="Resumen economico del proyecto"
                menuRows={[
                  ['Ingreso real', money(ingresoReal)],
                  ['Costo de ventas', money(costoVentas)],
                  ['Gastos operativos', money(gastosProyecto)],
                  ['Impuesto a la renta', money(igv)],
                  ['Utilidad neta', money(utilidadNeta)],
                ]}
              />
              <div className="grid grid-cols-2 gap-3 p-4">
                <KpiTile label="Ingreso real" value={money(ingresoReal)} helper="Cobrado registrado en finanzas" icon={<FiDollarSign />} accent="#1259C4" />
                <KpiTile label="Costo de ventas" value={money(costoVentas)} helper="Terreno + directo + indirecto" icon={<FiArrowDownCircle />} accent="#6B7280" />
                <KpiTile label="Utilidad bruta" value={money(utilidadBruta)} helper={`Margen ${pct(utilidadBrutaPct)}`} icon={<FiTrendingUp />} accent="#1259C4" />
                <KpiTile label="Gastos operativos" value={money(gastosProyecto)} helper="Ventas, admin y financieros" icon={<FiArrowDownCircle />} accent="#E11D48" />
                <KpiTile label="Utilidad operativa" value={money(utilidadOperativa)} helper="Bruta menos gastos" icon={<FiTrendingUp />} accent="#1259C4" />
                <KpiTile label="Utilidad antes de impuestos" value={money(utilidadAntes)} helper="Resultado operativo" icon={<FiTrendingUp />} accent="#B45309" />
                <KpiTile label="Impuesto a la renta" value={money(igv)} helper="29.5% sobre utilidad" icon={<FiActivity />} accent="#B45309" />
                <KpiTile label="Utilidad neta" value={money(utilidadNeta)} helper={`Margen neto ${pct(margenNeto)}`} icon={<FiTrendingUp />} accent="#0F8B5F" />
              </div>
            </div>
          </div>
        ) : (
          <>
            <ChartShell title="Lotes por estado" subtitle="Conteo real de unidades">
              <div className="flex min-h-[230px] items-center justify-center">
                <DonutChart centered data={lotCountData.map((item) => ({ ...item, color: lotColorByLabel(item.name) }))} formatter={(value) => value.toLocaleString('es-PE')} />
              </div>
            </ChartShell>

            <ChartShell title="Valor por estado" subtitle="Suma real del precio lista">
              <HorizontalBars data={lotAmountData.map((item) => ({ ...item, color: lotColorByLabel(item.name) }))} formatter={money} />
            </ChartShell>

            {showLeadsChart && (
              <ChartShell title="Origen de leads" subtitle="Clientes/leads asociados al proyecto">
                <div className="flex min-h-[230px] items-center justify-center">
                  <DonutChart centered data={leadsChartData.map((item) => ({ ...item, color: leadColorByLabel(item.name) }))} formatter={(value) => value.toLocaleString('es-PE')} />
                </div>
              </ChartShell>
            )}
          </>
        )}
      </div>
    </div>
  );
}

'use client';
import { ReactNode, useEffect, useState } from 'react';
import { FiArrowDown, FiCreditCard, FiDownload, FiFileText, FiLayers, FiTag, FiUsers } from 'react-icons/fi';
import { api } from '@/lib/api';
import { FormattedDashboard } from '@/lib/dboard';
import { BRAND, LOT_STATUS_COLOR } from '@/lib/types';
import { moneyGlobal, useCurrencyStoreSync } from '@/lib/currency';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { printHtml } from '@/lib/print';
import { Modal } from '@/components/ui/ui';

const LOT_LABEL: Record<string, string> = {
  disponible: 'Disponible',
  reservado: 'Reservado',
  adelanto: 'Con adelanto',
  primera_cuota: 'Primera cuota',
  vendido: 'Vendido',
  alquilado: 'Alquilado',
  promocion: 'En Promoción',
  segunda_etapa: '2da Etapa',
};

const PAGE_SIZE = 10;
const MOVEMENTS_PREVIEW_SIZE = 8;
const MOVEMENTS_HISTORY_SIZE = 10;
const MOVEMENTS_EXPORT_SIZE = 100000;
const CHART_COLORS = [BRAND.blue, BRAND.blueDark, '#16A36A', '#F59E0B', '#E11D48', '#8064A2', '#0EA5E9', '#64748B'];

// Los montos llegan en soles desde el backend; `moneyGlobal` los convierte a la
// moneda activa (S/ o US$) segun el almacen global de moneda.
function money(value: unknown): string {
  return moneyGlobal(value);
}

function pageCount(total: number, size: number) {
  return Math.max(1, Math.ceil(total / size));
}

function clampPage(page: number, total: number, size: number) {
  return Math.min(page, pageCount(total, size) - 1);
}

function proportion(value: number, base: number, minimum = 0) {
  if (!base || value <= 0) return 0;
  return Math.max(minimum, (value / base) * 100);
}

function movementDate(row: any) {
  return row.createdAt || row.paidAt || row.saleDate || row.dueDate || null;
}

function formatShortDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function movementQuery(params: { page: number; limit: number; projectId?: string; type?: string }) {
  const q = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.projectId) q.set('projectId', params.projectId);
  if (params.type) q.set('type', params.type);
  return q.toString();
}

function formatExportDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function sparklinePoints(values: number[], width: number, height: number) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = values.length > 1 ? index * step : width / 2;
      const y = height - proportion(value, max) * (height / 100);
      return `${x},${y}`;
    })
    .join(' ');
}

function Pagination({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (page: number) => void }) {
  const pages = pageCount(total, size);
  if (total <= size) return null;

  const current = clampPage(page, total, size);
  const visible: number[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - (current + 1)) <= 1) visible.push(i);
  }

  const items: ReactNode[] = [];
  visible.forEach((n, index) => {
    if (index > 0 && n > visible[index - 1] + 1) {
      items.push(<span key={`gap-${n}`} className="px-1 text-slate-400">...</span>);
    }
    items.push(
      <button
        key={n}
        type="button"
        onClick={() => onPage(n - 1)}
        className={`${n === current + 1 ? 'text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} h-7 min-w-7 rounded-md border px-2 text-xs font-semibold`}
        style={{ borderColor: BRAND.border, background: n === current + 1 ? BRAND.blue : undefined }}
      >
        {n}
      </button>,
    );
  });

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: BRAND.border }}>
      <span className="text-xs text-slate-500">
        {current * size + 1}-{Math.min(total, (current + 1) * size)} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="h-7 rounded-md border bg-white px-2 text-xs font-semibold text-slate-600 disabled:opacity-40" style={{ borderColor: BRAND.border }} disabled={current <= 0} onClick={() => onPage(current - 1)}>Anterior</button>
        {items}
        <button type="button" className="h-7 rounded-md border bg-white px-2 text-xs font-semibold text-slate-600 disabled:opacity-40" style={{ borderColor: BRAND.border }} disabled={current >= pages - 1} onClick={() => onPage(current + 1)}>Siguiente</button>
      </div>
    </div>
  );
}

function SectionShell({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`border bg-white p-4 ${className}`} style={{ borderColor: BRAND.border, borderRadius: 6, boxShadow: '0 1px 2px rgba(16,24,40,.035)' }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: BRAND.ink }}>{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <span className="mt-1 h-5 w-1" style={{ background: BRAND.blue }} />
      </div>
      {children}
    </section>
  );
}

function CommercialSummary({ d }: { d: FormattedDashboard }) {
  const income = Number(d.cards.income || 0);
  const costOfSales = Number(d.cards.expense || 0);
  const expenses = Number(d.cards.campaignSpend || 0);
  const adjustedUtility = income - costOfSales - expenses;
  const taxes = 0;
  const netUtility = adjustedUtility - taxes;
  const financialBoxes = [
    { label: 'Ingresos US$', value: income, color: BRAND.blue },
    { label: 'Costo de Ventas US$', value: costOfSales, color: '#E11D48' },
    { label: 'Gastos US$', value: expenses, color: '#F59E0B' },
    { label: 'Utilidad Adl', value: adjustedUtility, color: '#16A36A' },
    { label: 'Impuestos (IR+IGV)', value: taxes, color: '#64748B' },
    { label: 'Utilidad Neta US$', value: netUtility, color: BRAND.blueDark },
    { label: 'Utilidad Ajustada', value: netUtility, color: '#8064A2' },
  ];
  const secondary = [
    { label: 'Ventas del mes', value: d.cards.salesMonth, icon: <FiTag />, tone: BRAND.ink },
    { label: 'Lotes vendidos del periodo', value: d.lots.vendido || 0, icon: <FiLayers />, tone: BRAND.blue },
    { label: 'Leads del mes', value: d.cards.leadsMonth, icon: <FiUsers />, tone: BRAND.muted },
    { label: 'Egresos', value: money(d.cards.expense), icon: <FiArrowDown />, tone: BRAND.blueDark },
  ];

  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
      <div className="relative overflow-hidden border bg-white p-5" style={{ borderColor: BRAND.border, borderRadius: 6 }}>
        <div className="absolute left-0 top-0 h-full w-1.5" style={{ background: BRAND.blue }} />
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Resumen comercial</p>
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {financialBoxes.map((box) => (
            <div key={box.label} className="min-w-0 border bg-white p-3" style={{ borderColor: BRAND.border, borderRadius: 6 }}>
              <span className="block h-1 w-9" style={{ background: box.color }} />
              <p className="mt-3 min-h-[2rem] text-[10px] font-semibold leading-4 text-slate-500 sm:text-[11px]">{box.label}</p>
              <p className="mt-1 truncate text-base font-semibold tabular-nums tracking-tight sm:text-lg" style={{ color: box.color }}>{money(box.value)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {secondary.map((item) => (
          <div key={item.label} className="min-w-0 border bg-white p-3 sm:p-4" style={{ borderColor: BRAND.border, borderRadius: 6 }}>
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ background: `${item.tone}12`, color: item.tone }}>{item.icon}</span>
              <span className="h-1.5 w-1.5 shrink-0" style={{ background: BRAND.blue }} />
            </div>
            <p className="mt-3 truncate text-[10px] font-medium leading-tight text-slate-500 sm:mt-4 sm:text-[11px]">{item.label}</p>
            <p className="mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl" style={{ color: BRAND.ink }}>{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MoneyBreakdown({ d }: { d: FormattedDashboard }) {
  const rows = [
    { label: 'Ingresos US$', value: Number(d.cards.income || 0), color: BRAND.blue },
    { label: 'Costo de Ventas US$', value: Number(d.cards.expense || 0), color: '#E11D48' },
    { label: 'Gastos US$', value: Number(d.cards.campaignSpend || 0), color: '#F59E0B' },
    { label: 'Utilidad Neta US$', value: Number(d.cards.profit || 0), color: '#16A36A' },
    { label: 'Impuestos (IR+IGV)', value: 0, color: '#64748B' },
    { label: 'Utilidad Ajustada', value: Number(d.cards.profit || 0), color: BRAND.blueDark },
  ];
  const max = rows.reduce((largest, row) => Math.max(largest, Math.abs(row.value)), 1);

  return (
    <SectionShell title="Cajones financieros" subtitle="Resumen solicitado por el cliente" className="h-full">
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md border bg-white px-3 py-2" style={{ borderColor: BRAND.border }}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-600">{row.label}</span>
              <b className="tabular-nums" style={{ color: row.color }}>{money(row.value)}</b>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-sm" style={{ background: BRAND.mutedLight }}>
              <div className="h-full" style={{ width: `${proportion(Math.abs(row.value), max, row.value ? 7 : 0)}%`, background: row.color }} />
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function ProjectSales({ rows }: { rows: { name: string; value: number; color?: string }[] }) {
  const ranked = [...rows].filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  const max = ranked[0]?.value || 0;

  return (
    <SectionShell title="Proyectos con mayor venta" subtitle="Ranking visual por monto vendido" className="h-full">
      {ranked.length ? (
        <div className="space-y-3">
          {ranked.map((row, index) => {
            const width = proportion(row.value, max, 8);
            const color = row.color || CHART_COLORS[index % CHART_COLORS.length];
            return (
              <article
                key={`${row.name}-${index}`}
                className="group relative overflow-hidden border bg-white p-3 transition-transform duration-200 hover:-translate-y-0.5"
                style={{ borderColor: BRAND.border, borderRadius: 4 }}
                title={`${row.name}: ${money(row.value)}`}
              >
                <div className="absolute inset-y-0 left-0 transition-all duration-300 group-hover:opacity-90" style={{ width: `${width}%`, background: color, opacity: 0.08 }} />
                <div className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-sm text-xs font-semibold tabular-nums" style={{ color, background: `${color}14` }}>{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold" style={{ color: BRAND.ink }}>{row.name}</p>
                      <p className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: BRAND.ink }}>{money(row.value)}</p>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden" style={{ background: BRAND.mutedLight, borderRadius: 3 }}>
                      <div className="h-full transition-all duration-300 group-hover:brightness-95" style={{ width: `${width}%`, background: color }} />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-slate-400">Aun no hay ventas registradas en ningun proyecto.</p>
      )}
    </SectionShell>
  );
}

function ProjectBars({
  title,
  subtitle,
  rows,
  valueFormatter = money,
  className = 'h-full',
}: {
  title: string;
  subtitle: string;
  rows: { name: string; value: number; color?: string }[];
  valueFormatter?: (value: number) => string;
  className?: string;
}) {
  const data = [...rows].sort((a, b) => b.value - a.value);
  const max = data.reduce((largest, row) => Math.max(largest, row.value), 1);
  const ticks = [max, max * 0.75, max * 0.5, max * 0.25, 0];

  return (
    <SectionShell title={title} subtitle={subtitle} className={className}>
      {data.length ? (
        <div className="space-y-3">
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
            <div className="relative h-40 text-right text-[10px] tabular-nums text-slate-500">
              {ticks.map((tick, index) => (
                <span key={index} className="absolute right-0 -translate-y-1/2" style={{ top: `${index * 25}%` }}>
                  {Math.round(tick).toLocaleString('es-PE')}
                </span>
              ))}
            </div>
            <div className="relative h-40 border-l border-b pl-3" style={{ borderColor: BRAND.border }}>
              <div className="absolute inset-0 left-3 grid grid-rows-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <span key={index} className="border-t first:border-t-0" style={{ borderColor: BRAND.border }} />
                ))}
              </div>
              <div className="relative flex h-full items-end gap-3 overflow-x-auto pb-0">
                {data.map((row, index) => {
                  const color = row.color || CHART_COLORS[index % CHART_COLORS.length];
                  const height = proportion(row.value, max, row.value ? 5 : 0);
                  return (
                    <div key={row.name} className="flex h-full min-w-[3.6rem] flex-1 flex-col justify-end gap-2">
                      <div className="flex h-full items-end">
                        <div
                          className="mx-auto w-full max-w-[3.2rem] transition-all duration-300 hover:brightness-95"
                          style={{ height: `${height}%`, minHeight: row.value ? 10 : 0, background: color, borderRadius: '4px 4px 0 0' }}
                          title={`${row.name}: ${valueFormatter(row.value)}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex min-h-[3.25rem] flex-wrap gap-x-4 gap-y-2 overflow-visible border-t pt-3" style={{ borderColor: BRAND.border }}>
            {data.map((row, index) => {
              const color = row.color || CHART_COLORS[index % CHART_COLORS.length];
              return (
                <div key={row.name} className="flex min-w-0 items-center gap-1.5 text-[11px]">
                  <span className="h-2 w-2 shrink-0" style={{ background: color }} />
                  <span className="max-w-[8rem] truncate text-slate-600">{row.name}</span>
                  <b className="tabular-nums" style={{ color: BRAND.blueDark }}>{valueFormatter(row.value)}</b>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-slate-400">Sin datos por proyecto.</p>
      )}
    </SectionShell>
  );
}

function PieSummary({
  title,
  subtitle,
  rows,
  valueFormatter = (value: number) => String(value),
  className = 'h-full',
}: {
  title: string;
  subtitle: string;
  rows: { name: string; value: number; color?: string }[];
  valueFormatter?: (value: number) => string;
  className?: string;
}) {
  const data = rows.filter((row) => Number(row.value || 0) > 0).map((row, index) => ({ ...row, color: row.color || CHART_COLORS[index % CHART_COLORS.length] }));
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const formattedTotal = valueFormatter(total);
  // Separa el simbolo de moneda (S/ o US$) del numero para pintarlos en dos lineas.
  const moneyMatch = formattedTotal.match(/^(S\/|US\$)\s*(.+)$/);

  return (
    <SectionShell title={title} subtitle={subtitle} className={className}>
      {total ? (
        <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
          <div className="mx-auto grid h-40 w-40 place-items-center" style={{ background: conicGradient(data, total), borderRadius: '50%' }}>
            <div className="grid h-24 w-24 place-items-center bg-white" style={{ borderRadius: '50%' }}>
              <div className="text-center">
                {moneyMatch ? (
                  <>
                    <p className="text-base font-semibold leading-4" style={{ color: BRAND.ink }}>{moneyMatch[1]}</p>
                    <p className="whitespace-nowrap text-[20px] font-semibold tabular-nums leading-6" style={{ color: BRAND.ink }}>{moneyMatch[2]}</p>
                  </>
                ) : (
                  <p className="whitespace-nowrap text-[19px] font-semibold tabular-nums leading-6" style={{ color: BRAND.ink }}>{formattedTotal}</p>
                )}
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">total</p>
              </div>
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            {data.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-2 text-xs" title={`${row.name}: ${valueFormatter(row.value)}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: row.color }} />
                  <span className="truncate font-medium text-slate-600">{row.name}</span>
                </span>
                <b className="shrink-0 tabular-nums" style={{ color: BRAND.ink }}>{valueFormatter(row.value)}</b>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-slate-400">Sin datos por proyecto.</p>
      )}
    </SectionShell>
  );
}

function LotStatusDistribution({ data }: { data: { key: string; label: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const main = [...data].sort((a, b) => b.value - a.value)[0];

  return (
    <SectionShell title="Estados de lotes" subtitle={`Total registrado: ${total}`} className="h-full">
      {total ? (
        <div className="grid gap-4">
          <div className="group mx-auto grid h-44 w-44 place-items-center transition-transform duration-200 hover:scale-[1.02]" title={`${main?.label || 'Lotes'}: ${main?.value || 0}`}>
            <div
              className="grid h-full w-full place-items-center"
              style={{ background: conicGradient(data, total), borderRadius: '50%' }}
            >
              <div className="grid h-28 w-28 place-items-center bg-white transition-transform duration-200 group-hover:scale-95" style={{ borderRadius: '50%' }}>
                <div className="text-center">
                  <p className="text-3xl font-semibold tabular-nums" style={{ color: BRAND.ink }}>{total}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">lotes</p>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.map((item) => (
              <div key={item.key} className="group border p-2 transition-colors hover:bg-slate-50" style={{ borderColor: BRAND.border, borderRadius: 4 }} title={`${item.label}: ${item.value}`}>
                <span className="block h-1 w-8 transition-all group-hover:w-12" style={{ background: item.color }} />
                <p className="mt-2 truncate text-[11px] font-medium text-slate-500">{item.label}</p>
                <p className="text-lg font-semibold tabular-nums" style={{ color: BRAND.ink }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-slate-400">Aun no hay lotes registrados.</p>
      )}
    </SectionShell>
  );
}

function LeadOrigins({ rows }: { rows: { channel: string; total: number }[] }) {
  const data = rows.filter((item) => Number(item.total || 0) > 0);
  const total = data.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const max = data.reduce((largest, item) => Math.max(largest, Number(item.total || 0)), 0);
  const values = data.map((item) => Number(item.total || 0));
  const points = sparklinePoints(values, 260, 110);

  return (
    <SectionShell title="Origen de leads" subtitle="Lectura secundaria" className="h-full">
      {total ? (
        <div className="space-y-4">
          <div className="group relative h-36 overflow-hidden border p-3" style={{ borderColor: BRAND.border, borderRadius: 4 }}>
            <div className="absolute inset-0 grid grid-rows-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <span key={index} className="border-t first:border-t-0" style={{ borderColor: BRAND.border }} />
              ))}
            </div>
            <svg className="relative h-full w-full overflow-visible" viewBox="0 0 260 110" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={points} fill="none" stroke={BRAND.blue} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {data.map((item, index) => {
                const [x, y] = points.split(' ')[index].split(',').map(Number);
                return (
                  <g key={item.channel}>
                    <line x1={x} x2={x} y1={110} y2={y} stroke={BRAND.blue} strokeOpacity="0.14" strokeWidth="10" />
                    <circle cx={x} cy={y} r="4" fill="white" stroke={BRAND.blue} strokeWidth="2">
                      <title>{`${item.channel}: ${item.total}`}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
            <div className="pointer-events-none absolute right-3 top-3 border bg-white px-2 py-1 text-xs font-semibold tabular-nums opacity-0 transition-opacity group-hover:opacity-100" style={{ borderColor: BRAND.border, borderRadius: 3, color: BRAND.ink }}>
              Total {total}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.map((item) => {
              const value = Number(item.total || 0);
              return (
                <div key={item.channel} className="group border px-2 py-2" style={{ borderColor: BRAND.border, borderRadius: 4 }} title={`${item.channel}: ${value}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium capitalize text-slate-500">{item.channel}</span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: BRAND.ink }}>{value}</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden" style={{ background: BRAND.mutedLight, borderRadius: 2 }}>
                    <div className="h-full transition-all duration-300 group-hover:brightness-95" style={{ width: `${proportion(value, max, 8)}%`, background: BRAND.blue }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-slate-400">Sin leads registrados.</p>
      )}
    </SectionShell>
  );
}

function AgentRanking({ rows, projects }: { rows: FormattedDashboard['agentRanking']; projects: any[] }) {
  const [page, setPage] = useState(0);
  const [projectId, setProjectId] = useState('');
  const [projectRows, setProjectRows] = useState<FormattedDashboard['agentRanking'] | null>(null);
  const [loading, setLoading] = useState(false);
  const activeRows = projectId ? (projectRows || []) : rows;
  const safePage = clampPage(page, activeRows.length, PAGE_SIZE);
  const frame = activeRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
    if (!projectId) {
      setProjectRows(null);
      return;
    }

    let alive = true;
    setLoading(true);
    api.get<any>(`/dashboards/project/${projectId}`)
      .then((data) => {
        if (alive) setProjectRows(Array.isArray(data?.agentRanking) ? data.agentRanking : []);
      })
      .catch(() => {
        if (alive) setProjectRows([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [projectId]);

  return (
    <SectionShell title="Ranking de agentes" subtitle="Ventas, monto y comision">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-slate-500">Filtra el ranking por proyecto sin mezclar datos.</span>
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="h-9 min-w-[220px] border bg-white px-3 text-sm outline-none"
          style={{ borderColor: BRAND.border, borderRadius: 4, color: BRAND.ink }}
        >
          <option value="">Todos los proyectos</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 52 }} />
            <col />
            <col style={{ width: 92 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 132 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="th-base">#</th>
              <th className="th-base">Agente</th>
              <th className="th-base text-right">Ventas</th>
              <th className="th-base text-right">Monto</th>
              <th className="th-base text-right">Comision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {frame.map((agent, index) => {
              const rank = safePage * PAGE_SIZE + index + 1;
              return (
                <tr key={`${agent.agentId}-${rank}`} className={rank === 1 ? 'bg-softblue' : undefined}>
                  <td className="td-base font-semibold" style={{ color: BRAND.blue }}>{rank}</td>
                  <td className="td-base truncate font-medium">{agent.agentName || '-'}</td>
                  <td className="td-base text-right tabular-nums">{agent.salesCount}</td>
                  <td className="td-base text-right font-semibold tabular-nums">{money(agent.salesAmount)}</td>
                  <td className="td-base text-right tabular-nums">{money(agent.commission)}</td>
                </tr>
              );
            })}
            {activeRows.length === 0 && <tr><td className="td-base text-slate-400" colSpan={5}>{loading ? 'Cargando ranking...' : 'Sin ventas todavia'}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={safePage} total={activeRows.length} size={PAGE_SIZE} onPage={setPage} />
    </SectionShell>
  );
}

type DashboardMovement = {
  type: 'venta' | 'pago';
  label: string;
  amount: number;
  date?: string | null;
  projectId?: number | null;
  projectName?: string | null;
  lotCode?: string | null;
  agentName?: string | null;
  status?: string | null;
};

function MovementsCenter({ sales, payments, projects, projectName }: {
  sales: any[];
  payments: any[];
  projects: any[];
  projectName: (id: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<DashboardMovement[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyProjectId, setHistoryProjectId] = useState('');
  const [historyType, setHistoryType] = useState('');

  const preview = [...sales.map((sale) => ({
    type: 'venta' as const,
    label: sale.fromPayment ? `Pago - ${sale.type || 'confirmado'}` : 'Venta',
    amount: Number(sale.salePrice || 0),
    date: movementDate(sale),
    projectId: sale.projectId ? Number(sale.projectId) : null,
    projectName: sale.projectId ? projectName(Number(sale.projectId)) : null,
    lotCode: sale.lotCode || null,
    agentName: sale.agentName || null,
    status: sale.status || null,
  })), ...payments.map((payment) => ({
    type: 'pago' as const,
    label: String(payment.type || 'Pago'),
    amount: Number(payment.amount || 0),
    date: movementDate(payment),
    projectId: payment.projectId ? Number(payment.projectId) : null,
    projectName: payment.projectId ? projectName(Number(payment.projectId)) : null,
    lotCode: payment.lotCode || null,
    agentName: payment.agentName || null,
    status: payment.status || null,
  }))]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, MOVEMENTS_PREVIEW_SIZE);

  const loadHistory = (page: number) => {
    setLoading(true);
    api.get<any>(`/dashboards/movements?${movementQuery({
      page: page + 1,
      limit: MOVEMENTS_HISTORY_SIZE,
      projectId: historyProjectId,
      type: historyType,
    })}`)
      .then((data) => {
        setHistory(Array.isArray(data?.items) ? data.items : []);
        setHistoryTotal(Number(data?.total || 0));
        setHistoryPage(Math.max(0, Number(data?.page || 1) - 1));
      })
      .catch(() => {
        setHistory([]);
        setHistoryTotal(0);
      })
      .finally(() => setLoading(false));
  };

  const openHistory = () => {
    setShowHistory(true);
    loadHistory(0);
  };

  useEffect(() => {
    if (open && showHistory) loadHistory(0);
  }, [historyProjectId, historyType]);

  const exportRows = async (format: 'excel' | 'pdf') => {
    const data = await api.get<any>(`/dashboards/movements?${movementQuery({
      page: 1,
      limit: MOVEMENTS_EXPORT_SIZE,
      projectId: historyProjectId,
      type: historyType,
    })}`).catch(() => null);
    const rows: DashboardMovement[] = (Array.isArray(data?.items) ? data.items : history)
      .slice()
      .sort((a: DashboardMovement, b: DashboardMovement) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const selectedProject = historyProjectId ? projects.find((project) => String(project.id) === String(historyProjectId))?.name || projectName(Number(historyProjectId)) : 'Todos los proyectos';
    const selectedType = historyType === 'venta' ? 'Solo ventas' : historyType === 'pago' ? 'Solo pagos' : 'Ventas y pagos';
    const generatedAt = new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
    const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
    const totalAmount = rows.reduce((total, row) => total + Number(row.amount || 0), 0);
    const totalSales = rows.filter((row) => row.type === 'venta').reduce((total, row) => total + Number(row.amount || 0), 0);
    const totalPayments = rows.filter((row) => row.type === 'pago').reduce((total, row) => total + Number(row.amount || 0), 0);
    const columns = ['Fecha', 'Tipo', 'Movimiento', 'Proyecto', 'Lote', 'Agente', 'Estado', 'Monto'];
    const tableRows = rows.map((row) => ({
      Fecha: formatExportDate(row.date),
      Tipo: row.type === 'venta' ? 'Venta' : 'Pago',
      Movimiento: row.label || '-',
      Proyecto: row.projectName || (row.projectId ? projectName(Number(row.projectId)) : '-'),
      Lote: row.lotCode || '-',
      Agente: row.agentName || '-',
      Estado: row.status || '-',
      Monto: money(row.amount),
    }));
    const summaryHtml = `
      <div class="summary">
        <div><span>Proyecto</span><strong>${escapeHtml(selectedProject)}</strong></div>
        <div><span>Filtro</span><strong>${escapeHtml(selectedType)}</strong></div>
        <div><span>Movimientos</span><strong>${rows.length}</strong></div>
        <div><span>Total ventas</span><strong>${escapeHtml(money(totalSales))}</strong></div>
        <div><span>Total pagos</span><strong>${escapeHtml(money(totalPayments))}</strong></div>
        <div><span>Total general</span><strong>${escapeHtml(money(totalAmount))}</strong></div>
      </div>
    `;
    const tableHead = columns.map((key) => `<th>${escapeHtml(key)}</th>`).join('');
    const tableBody = tableRows.length
      ? tableRows.map((row) => `<tr>${columns.map((key) => `<td class="${key === 'Monto' ? 'amount' : ''}">${escapeHtml((row as any)[key])}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${columns.length}" class="empty">Sin movimientos registrados.</td></tr>`;
    const styles = `
      body{font-family:Arial,Helvetica,sans-serif;color:#171717;margin:28px}
      .brand{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:3px solid ${BRAND.blue};padding-bottom:14px;margin-bottom:18px}
      .brand img{height:44px;max-width:180px;object-fit:contain}
      .brand h1{margin:0;font-size:22px;color:#171717}
      .brand p{margin:4px 0 0 0;font-size:12px;color:#6B7280}
      .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0 18px}
      .summary div{border:1px solid ${BRAND.border};background:#F8FAFC;padding:9px 10px}
      .summary span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6B7280}
      .summary strong{display:block;margin-top:3px;font-size:13px;color:#171717}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      th{background:${BRAND.blue};color:white;border:1px solid ${BRAND.blue};padding:9px 8px;font-size:11px;text-align:left;text-transform:uppercase}
      td{border:1px solid ${BRAND.border};padding:8px;font-size:11px;vertical-align:top}
      tbody tr:nth-child(even){background:#F8FAFC}
      .amount{text-align:right;font-weight:700;color:#1259C4;white-space:nowrap}
      .empty{text-align:center;color:#6B7280;padding:18px}
      .watermark{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-28deg);font-size:72px;font-weight:800;color:rgba(24,119,242,.06);z-index:-1;white-space:nowrap}
      @media print{body{margin:18px}.brand{break-inside:avoid}.summary{break-inside:avoid}thead{display:table-header-group}.watermark{position:fixed}}
    `;

    if (format === 'excel') {
      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
          <head><meta charset="utf-8"><style>${styles}</style></head>
          <body>
            <div class="brand">
              <div><h1>Historial de movimientos</h1><p>Generado: ${escapeHtml(generatedAt)}</p></div>
              <img src="${escapeHtml(logoUrl)}" alt="Dunacon" />
            </div>
            ${summaryHtml}
            <table><thead><tr>${tableHead}</tr></thead><tbody>${tableBody}</tbody></table>
          </body>
        </html>
      `;
      const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'historial-movimientos.xls';
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    printHtml(`
      <html>
        <head><title>Historial de movimientos</title><style>${styles}</style></head>
        <body>
          <div class="watermark">DUNACON</div>
          <div class="brand">
            <div><h1>Historial de movimientos</h1><p>Generado: ${escapeHtml(generatedAt)}</p></div>
            <img src="${escapeHtml(logoUrl)}" alt="Dunacon" />
          </div>
          ${summaryHtml}
          <table><thead><tr>${tableHead}</tr></thead><tbody>${tableBody}</tbody></table>
        </body>
      </html>
    `);
  };

  const renderMovement = (row: DashboardMovement, index: number) => (
    <li key={`${row.type}-${row.date}-${index}`} className="grid gap-2 border p-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto]" style={{ borderColor: BRAND.border, borderRadius: 4 }}>
      <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: row.type === 'venta' ? BRAND.blue : BRAND.muted }}>
        {row.type === 'venta' ? 'Venta' : 'Pago'}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold capitalize" style={{ color: BRAND.ink }}>{row.label}</p>
        <p className="mt-1 truncate text-xs text-slate-500">
          {(row.projectName || (row.projectId ? projectName(Number(row.projectId)) : 'Proyecto general'))}
          {row.lotCode ? ` - Lote ${row.lotCode}` : ''}
          {row.agentName ? ` - ${row.agentName}` : ''}
        </p>
      </div>
      <div className="text-left sm:text-right">
        <p className="text-sm font-semibold tabular-nums" style={{ color: BRAND.ink }}>{money(row.amount)}</p>
        <p className="mt-1 text-xs text-slate-500">{formatShortDate(row.date)}</p>
      </div>
    </li>
  );

  return (
    <SectionShell title="Movimientos comerciales" subtitle="Vista general de ventas y pagos">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center bg-softblue" style={{ color: BRAND.blue, borderRadius: 4 }}><FiCreditCard /></span>
          <div>
            <p className="text-sm font-semibold" style={{ color: BRAND.ink }}>Ventas y pagos recientes</p>
            <p className="text-xs text-slate-500">Se muestran juntos desde el historial general.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(true); setShowHistory(false); }}
          className="inline-flex h-9 items-center justify-center gap-2 border px-3 text-sm font-semibold"
          style={{ borderColor: BRAND.blue, color: BRAND.blue, borderRadius: 4 }}
        >
          <FiFileText /> Ver ultimos movimientos
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={showHistory ? 'Historial de movimientos' : 'Ultimos movimientos'} width="max-w-5xl">
        <div className="space-y-4 p-4">
          {!showHistory ? (
            <>
              {preview.length ? (
                <ul className="grid gap-2">{preview.map(renderMovement)}</ul>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">Sin movimientos registrados.</p>
              )}
              <div className="flex justify-end border-t pt-4" style={{ borderColor: BRAND.border }}>
                <button type="button" onClick={openHistory} className="h-9 border px-3 text-sm font-semibold text-white" style={{ background: BRAND.blue, borderColor: BRAND.blue, borderRadius: 4 }}>
                  Ver historial
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500">{historyTotal} movimientos registrados</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select
                      value={historyProjectId}
                      onChange={(event) => setHistoryProjectId(event.target.value)}
                      className="h-8 min-w-[220px] border bg-white px-2 text-xs font-semibold outline-none"
                      style={{ borderColor: BRAND.border, borderRadius: 4, color: BRAND.ink }}
                    >
                      <option value="">Todos los proyectos</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                    <select
                      value={historyType}
                      onChange={(event) => setHistoryType(event.target.value)}
                      className="h-8 min-w-[130px] border bg-white px-2 text-xs font-semibold outline-none"
                      style={{ borderColor: BRAND.border, borderRadius: 4, color: BRAND.ink }}
                    >
                      <option value="">Ventas y pagos</option>
                      <option value="venta">Solo ventas</option>
                      <option value="pago">Solo pagos</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => exportRows('excel')} className="inline-flex h-8 items-center gap-2 border px-3 text-xs font-semibold" style={{ borderColor: BRAND.border, borderRadius: 4 }}><FiDownload /> Excel</button>
                  <button type="button" onClick={() => exportRows('pdf')} className="inline-flex h-8 items-center gap-2 border px-3 text-xs font-semibold" style={{ borderColor: BRAND.border, borderRadius: 4 }}><FiDownload /> PDF</button>
                </div>
              </div>
              {loading ? (
                <p className="py-8 text-center text-sm text-slate-400">Cargando historial...</p>
              ) : history.length ? (
                <ul className="grid gap-2">{history.map(renderMovement)}</ul>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">Sin movimientos registrados.</p>
              )}
              <Pagination page={historyPage} total={historyTotal} size={MOVEMENTS_HISTORY_SIZE} onPage={loadHistory} />
            </>
          )}
        </div>
      </Modal>
    </SectionShell>
  );
}

export default function GeneralView({ d, compact = false }: { d: FormattedDashboard | null; compact?: boolean }) {
  const [projects, setProjects] = useState<any[]>([]);
  // Sincroniza el almacen global de moneda para que todos los sub-componentes
  // (que llaman a `money()`) se repinten al cambiar S/ <-> US$.
  const { currency, setCurrency, exchangeRate, setExchangeRate } = useCurrencyStoreSync();

  useEffect(() => {
    api.get<any[]>('/projects')
      .then((data) => setProjects(Array.isArray(data) ? data : ((data as any)?.items || [])))
      .catch(() => {});
  }, []);

  if (!d) return <p className="text-slate-400">Sin datos</p>;

  const projectName = (id: number) => projects.find((project) => Number(project.id) === Number(id))?.name || `Proyecto ${id}`;
  const projectBase = projects.length
    ? projects.map((project, index) => ({ id: Number(project.id), name: project.name || `Proyecto ${project.id}`, color: CHART_COLORS[index % CHART_COLORS.length] }))
    : Array.from(new Set([...(d.salesByProject || []).map((row) => Number(row.projectId)), ...(d.investmentsByProject || []).map((row) => Number(row.projectId))]))
      .filter(Boolean)
      .map((id, index) => ({ id, name: projectName(id), color: CHART_COLORS[index % CHART_COLORS.length] }));
  const salesAmountByProject = new Map((d.salesByProject || []).map((row) => [Number(row.projectId), Number(row.amount || 0)]));
  const investmentAmountByProject = new Map((d.investmentsByProject || []).map((row) => [Number(row.projectId), Number(row.amount || 0)]));
  const salesByProject = projectBase.map((project) => ({ name: project.name, value: salesAmountByProject.get(project.id) || 0, color: project.color }));
  const investmentByProject = projectBase.map((project) => ({ name: project.name, value: investmentAmountByProject.get(project.id) || 0, color: project.color }));
  const availableLotsByProject = (d.availableLotsByProject || []).map((row, index) => ({
    name: projectName(row.projectId),
    value: Number(row.total || 0),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
  const paymentPie = (d.paymentsSummary || []).map((row, index) => ({
    name: row.label,
    value: Number(row.value || 0),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
  const lotStatusData = Object.keys(LOT_LABEL).map((key) => ({
    key,
    label: LOT_LABEL[key],
    value: Number(d.lots[key] || 0),
    color: LOT_STATUS_COLOR[key as keyof typeof LOT_STATUS_COLOR],
  })).filter((item) => item.value > 0 || !['promocion', 'segunda_etapa'].includes(item.key));

  if (compact) {
    return <CommercialSummary d={d} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Dashboard general</h3>
        <CurrencyToggle
          currency={currency}
          setCurrency={setCurrency}
          exchangeRate={exchangeRate}
          setExchangeRate={setExchangeRate}
        />
      </div>

      <CommercialSummary d={d} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
        <div className="grid gap-5">
          <LotStatusDistribution data={lotStatusData} />
          <ProjectSales rows={salesByProject} />
        </div>

        <aside className="grid max-h-none gap-5 overflow-y-visible pr-0 lg:max-h-[940px] lg:overflow-y-auto lg:pr-1">
          <PieSummary
            title="Lotes disponibles por proyectos"
            subtitle="Grafico PIE"
            rows={availableLotsByProject}
            valueFormatter={(value) => `${value} lotes`}
            className="min-h-[260px]"
          />
          <ProjectBars title="Inversiones por proyecto" subtitle="Grafico de barras" rows={investmentByProject} className="min-h-[320px]" />
          <ProjectBars title="Ventas US$ por proyecto" subtitle="Grafico de barras" rows={salesByProject} className="min-h-[320px]" />
          <PieSummary
            title="Pago de lotes"
            subtitle="Grafico PIE"
            rows={paymentPie}
            valueFormatter={money}
            className="min-h-[260px]"
          />
        </aside>
      </div>

      <MovementsCenter sales={d.recentSales || []} payments={d.recentPayments || []} projects={projects} projectName={projectName} />
    </div>
  );
}

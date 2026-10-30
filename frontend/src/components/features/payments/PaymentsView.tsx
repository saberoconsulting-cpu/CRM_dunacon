'use client';
import { lotPaymentUsd, extraordinaryPaymentBreakdown, savedPaymentBreakdown, savedPaymentInstallmentCount } from '@/lib/lot-payment-amount';
import WorkspacePanel from '@/components/layout/WorkspacePanel';
import { clientPaymentHistoryRows, clientPaymentHistoryTotals, formatClientHistoryDate } from '@/lib/client-payment-history';
import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { Toaster, toast, Field, EmptyState } from '@/components/ui/ui';
import { KpiCard } from '@/components/ui/Metrics';
import { api, getToken, uploadFile } from '@/lib/api';
import { financingCapitalAndInterest } from '@/lib/financing-interest';
import { lotPaymentSummary } from '@/lib/lot-payment-summary';
import { pendingInstallments, overdueInstallments, clientDelinquencyRate } from '@/lib/financing-pending';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { formatMoney, formatDate } from '@/lib/types';
import { useDisplayCurrency, DEFAULT_EXCHANGE_RATE, moneyGlobal, moneyGlobalShort, displayNumberGlobal, displaySymbol } from '@/lib/currency';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { Select } from '@/components/ui/Select';
import { printHtml } from '@/lib/print';
import { getSocket } from '@/lib/socket';
import { EvidenceButton } from './EvidenceViewer';
import { comparePaymentRows, PAYMENT_CONCEPT_LABEL } from './paymentOrder';
import { FiActivity, FiAlertTriangle, FiCamera, FiClock, FiCreditCard, FiDollarSign, FiEdit3, FiFileText, FiMoreVertical, FiRefreshCw, FiTrendingUp, FiUpload, FiX } from 'react-icons/fi';

type P = {
  isExtraordinary?: boolean;
  installmentAllocations?: { amount: number; kind: string }[];
  id: number; projectId: number; lotId: number; clientId?: number | null; type: string; amount: string;
  dueDate?: string | null; paidAt?: string | null; status: string; createdAt?: string | null;
  lotCode?: string | null; lotAreaM2?: number | null; clientName?: string | null; salePrice?: number | null;
  cuotaInicial?: number | null; valorCuota?: number | null; totalCuotas?: number | null;
  receivedByName?: string | null; paymentMethod?: string; reference?: string | null; voucherUrl?: string | null;
  exchangeRate?: number | null; amountUsd?: number | null;
  bankOperationNumber?: string | null; receiptNumber?: string | null; receiptValue?: number | null;
  approvalDocumentUrl?: string | null; receiptDocumentUrl?: string | null; approvedByName?: string | null; approvedAt?: string | null;
  concept?: 'reserva' | 'cuota_inicial' | 'cuota' | 'otro';
  conceptLabel?: string;
  conceptRank?: number;
  stage?: 'pagado' | 'pendiente';
};
const TYPE_LABEL: any = { reserva: 'Reserva', adelanto: 'Cuota inicial', cuota_inicial: 'Cuota inicial', primera_cuota: 'Cuota 1', cuota: 'Cuota' };
const BADGE: any = { pagado: ['#EAF7EE', '#257849'], pendiente: ['#FFF6E4', '#B45309'], vencido: ['#E7F0FE', '#1259C4'] };
const METHODS = [
  ['yape', 'Yape / Plin (QR)'], ['transferencia', 'Transferencia bancaria'], ['deposito', 'Depósito en banco'],
  ['cheque_gerencia', 'Cheque de gerencia'], ['tarjeta', 'Tarjeta de débito/crédito'],
  ['efectivo', 'Efectivo / oficina'], ['otro', 'Otro'],
];
const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHODS.map(([v, l]) => [v, l]));
const BLUE = '#1877F2';
const BLUE_DARK = '#1259C4';
const BORDER = '#E5E7EB';
const MUTED = '#64748B';
const INK = '#0F172A';
const GREEN = '#16A36A';
const RED = '#DC2626';
const AMBER = '#D97706';
// Tipo de cambio referencial para mostrar "Ventas por mes/ano" en US$ (mismo
// valor por defecto usado en Cotizaciones).
const SALES_CHART_EXCHANGE_RATE = 3.75;

function money(n: number) {
  return formatMoney(Number(n || 0));
}

function paymentReportHeader(title: string, range: string, generatedAt: string) {
  return `<div class="brand"><div><p class="eyebrow">${escapeHtml(title)}</p><h1>${escapeHtml(range)}</h1><p>Generado ${escapeHtml(generatedAt)}</p></div><div style="text-align:right"><p class="eyebrow">CRM Inmobiliario</p><strong>Dunacon</strong></div></div>`;
}

const PAYMENT_REPORT_STYLES = `
            *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#111827;background:white}
            .brand{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #1259C4;padding-bottom:12px;margin-bottom:16px}
            .eyebrow{margin:0 0 4px;color:#1259C4;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em}
            h1{margin:0;font-size:23px}
            p{margin:4px 0 0;color:#64748B;font-size:12px}
            .summary{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:14px 0;break-inside:avoid}
            .summary .kpi{min-width:0;border:1px solid #E5E7EB;border-top:3px solid;border-radius:9px;padding:10px 8px;background:#fff;box-shadow:0 2px 6px #0f172a08}.summary small{display:block;margin-top:6px;color:#64748B;font-size:8px;line-height:1.35}
            .summary .kpi-label{display:flex;align-items:center;gap:5px;min-height:32px}.kpi-label i{display:flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;border-radius:5px}.kpi-label svg{width:13px;height:13px}.summary span{display:block;color:#64748B;font-size:9px;font-weight:700;text-transform:uppercase}
            .summary strong{display:block;text-align:center;margin-top:4px;font-size:16px;color:#111827;white-space:nowrap;letter-spacing:-.4px}
            .charts{display:grid;grid-template-columns:minmax(0,30fr) minmax(0,70fr);gap:14px;margin:16px 0;align-items:stretch}
            .chart-container{min-width:0;overflow:hidden;border:1px solid #E5E7EB;border-radius:10px;padding:12px;background:#fff}.chart-container svg{max-width:100%;height:auto;max-height:230px}.recharts-cartesian-axis-tick text{font-family:Arial,Helvetica,sans-serif}
            .chart-container img{width:100%;height:auto;display:block}
            table{width:100%;border-collapse:collapse;table-layout:fixed}
            th{background:#808080;color:white;border:1px solid #808080;padding:7px 6px;font-size:9px;text-align:left;text-transform:uppercase}
            td{border:1px solid #E5E7EB;padding:7px 6px;font-size:10px;vertical-align:top;word-wrap:break-word}
            tbody tr:nth-child(even){background:#F8FAFC}.operations-table th,.operations-table td{font-size:8px;padding:6px 3px;overflow-wrap:anywhere}.operations-table .num{white-space:normal}.operations-table th{background:#52728F;border-color:#52728F}
            .num{text-align:right;font-weight:700;color:#1259C4;white-space:nowrap}
            tfoot td{background:#000080;color:#fff;font-weight:700}tfoot td.num{color:#fff}tr{break-inside:avoid}.footer{margin-top:14px;border-top:1px solid #E5E7EB;padding-top:8px;color:#64748B;font-size:10px;text-align:right}
            @page{size:A4 landscape;margin:9mm}@media print{body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}thead{display:table-header-group}tfoot{display:table-row-group}.charts,.brand{break-inside:avoid}}
`;

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function shortMoney(n: number) { return moneyGlobalShort(n); }

function shortUsd(n: number) { return moneyGlobalShort(n); }

function usdMoney(n: number) { return moneyGlobal(n); }

function paymentHistoryInstallmentTotals(sale: any) {
  return clientPaymentHistoryRows(sale || {}).filter(row => row.isFinancing).reduce((totals, row) => {
    totals.paid += row.realizedPayment || (row.paid ? row.monthlyInstallment : 0);
    if (!row.paid && !row.reduced) {
      const pending = Math.max(0, row.monthlyInstallment - row.realizedPayment);
      totals.pending += pending;
      if (row.overdue) totals.overdue += pending;
    }
    return totals;
  }, { paid: 0, pending: 0, overdue: 0 });
}
function paymentHistoryInitialFeeAmount(sale: any) {
  const fromSale = Number(sale?.sale?.cuotaInicial || 0);
  if (fromSale > 0) return fromSale;
  return (sale?.plan || sale?.installments || []).reduce((sum: number, item: any) => {
    const type = String(item?.type || item?.concept || '').toLowerCase();
    const label = String(item?.conceptLabel || '').toLowerCase();
    if (type === 'cuota_inicial' || label.includes('cuota inicial')) return sum + Number(item?.amount || 0);
    return sum;
  }, 0);
}

function salePaymentExchangeRate(sale: any, payment?: any): number | null {
  const recorded = Number(payment?.exchangeRate || 0);
  if (Number.isFinite(recorded) && recorded > 0) return recorded;
  const rate = Number(sale?.sale?.exchangeRate || 0);
  if (Number.isFinite(rate) && rate > 0) return rate;
  return null;
}

function paymentHistoryRate(sale: any, fallback = DEFAULT_EXCHANGE_RATE) {
  return Number(sale?.sale?.exchangeRate || sale?.sale?.currencyRate || sale?.sale?.tipoCambio || fallback || DEFAULT_EXCHANGE_RATE) || DEFAULT_EXCHANGE_RATE;
}

function paymentHistoryUsd(amount: number | string | null | undefined, _rate: number) {
  return `${displaySymbol()} ${displayNumberGlobal(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(n: number) {
  if (!Number.isFinite(n)) return '0.0%';
  return `${n.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function monthLabel(month: string) {
  const [year, rawMonth] = String(month || '').split('-');
  const date = new Date(Number(year), Number(rawMonth || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return month || '-';
  return date.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' }).replace('.', '');
}

// Version corta (solo el mes) para los ejes en pantallas angostas.
function monthLabelShort(month: string) {
  const [year, rawMonth] = String(month || '').split('-');
  const date = new Date(Number(year), Number(rawMonth || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return String(month || '-');
  return date.toLocaleDateString('es-PE', { month: 'short' }).replace('.', '');
}

function dateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function currentMonthValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function sumRows(items: any[], key = 'monto') {
  return (items || []).reduce((sum, item) => sum + Number(item?.[key] || 0), 0);
}

function lastValue(items: any[], key = 'monto') {
  const last = (items || [])[Math.max(0, (items || []).length - 1)];
  return Number(last?.[key] || 0);
}

function previousValue(items: any[], key = 'monto') {
  const prev = (items || [])[Math.max(0, (items || []).length - 2)];
  return Number(prev?.[key] || 0);
}

function variation(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function FinanceTooltip({ active, payload, label, formatter = money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-xl" style={{ borderColor: BORDER }}>
      <p className="mb-1 text-xs font-semibold" style={{ color: INK }}>{monthLabel(label)}</p>
      <div className="space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-5 text-xs">
            <span className="inline-flex items-center gap-1.5" style={{ color: MUTED }}>
              <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <b style={{ color: INK }}>{String(entry.dataKey).includes('Rate') || String(entry.name).includes('%') ? pct(Number(entry.value || 0)) : formatter(Number(entry.value || 0))}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function countInDescription<T extends { label: string; value: string; helper: string }>(item: T): T {
  const match = item.value.match(/\s+(\(\d+\))$/);
  if (!match) return item;
  const descriptions: Record<string, string> = {
    'Total Venta': 'lotes',
    'Cuotas Iniciales': 'cuotas iniciales',
    'Cuotas Pendientes': 'cuotas pendientes',
    'Pagos de cuotas de financiamiento': 'cuotas de financiamiento',
  };
  if (descriptions[item.label]) return { ...item, value: item.value.slice(0, match.index), helper: `${match[1].slice(1, -1)} ${descriptions[item.label]}` };
  return { ...item, value: item.value.slice(0, match.index), helper: `${match[1]} ${item.helper.replace(/^\(\d+\)\s*/, '')}` };
}

function KpiTile({ label, value, helper, icon, accent, truncateLabel = true }: {
  label: string;
  value: string;
  helper: string;
  icon: JSX.Element;
  accent: string;
  truncateLabel?: boolean;
}) {
  const count = helper.match(/^(\(?\d+\)?)\s/);
  const description = count ? <><strong>{count[1]}</strong> {helper.slice(count[0].length)}</> : helper;
  return <KpiCard label={label} value={value} helper={description} icon={icon} tone={accent} truncateLabel={truncateLabel} valueAlign="center" />;
}

function EmptyChart({ text }: { text: string }) {
  return <div className="grid h-[240px] place-items-center text-center text-sm text-slate-400">{text}</div>;
}

function MiniMetric({ label, value, color = INK }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2" style={{ borderColor: BORDER }}>
      <p className="text-[11px] font-medium" style={{ color: MUTED }}>{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  );
}

/**
 * Tarjeta de resumen del modal "Historial de pagos": se muestran en una rejilla
 * de 2 filas (5 columnas en escritorio) y todos los importes van en US$.
 */

function PaymentMethodRanking({ items, formatter = money }: { items: Array<{ name: string; value: number; count: number; method: string }>; formatter?: (value: number) => string }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const colors: Record<string, string> = {
    yape: '#7C3AED',
    plin: '#7C3AED',
    transferencia: BLUE,
    deposito: '#0EA5E9',
    cheque_gerencia: '#0F766E',
    tarjeta: INK,
    efectivo: BLUE_DARK,
    otro: '#94A3B8',
  };

  return (
    <div className="space-y-3 px-4 py-3">
      {items.map((item) => {
        const color = colors[item.method] || '#94A3B8';
        return (
          <div key={item.method} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-semibold" style={{ color: INK }}>{item.name}</span>
              <span className="shrink-0 tabular-nums" style={{ color: MUTED }}>{formatter(item.value)} · {item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${Math.max(5, (item.value / max) * 100)}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartMenu({ rows }: { rows: Array<[string, string]> }) {
  return (
    <details className="relative">
      <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-md border bg-white text-slate-500 hover:bg-slate-50" style={{ borderColor: BORDER }}>
        <FiMoreVertical />
      </summary>
      <div className="absolute right-0 top-9 z-20 w-56 rounded-md border bg-white p-2 shadow-xl" style={{ borderColor: BORDER }}>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-xs">
            <span style={{ color: MUTED }}>{label}</span>
            <b className="tabular-nums" style={{ color: INK }}>{value}</b>
          </div>
        ))}
      </div>
    </details>
  );
}
// Grid del cronograma: verde pagada, rojo en mora, ambar la que toca, gris pendiente.
function InstallmentGrid({ sale, compact = false, formatter = money }: { sale: any; compact?: boolean; formatter?: (value: number) => string }) {
  const rows = sale?.installments || [];
  if (!rows.length) {
    return <p className="text-xs text-slate-400">Esta venta no tiene cronograma de cuotas registrado.</p>;
  }
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: GREEN }} /> Pagadas ({sale.summary?.paidCount || 0})</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-blue-100" /> Reducidas por amortizacion ({sale.summary?.termReductionCount || 0})</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: AMBER }} /> Cuota a pagar</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: '#E5E7EB' }} /> Pendientes ({sale.summary?.pendingCount || 0})</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: RED }} /> En mora</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {rows.map((r: any) => {
          const bg = r.reduced ? '#DBEAFE' : r.paid ? GREEN : (r.overdue ? RED : (r.installmentNo === sale.summary?.nextInstallmentNo ? AMBER : '#E5E7EB'));
          const color = r.paid || r.overdue || r.installmentNo === sale.summary?.nextInstallmentNo ? '#fff' : INK;
          return (
            <div
              key={r.id || r.installmentNo}
              className="rounded-md border px-2 py-1.5 text-center"
              style={{ background: bg, borderColor: 'rgba(0,0,0,.06)', color }}
              title={`Cuota ${r.installmentNo} - ${formatter(r.amount)} - vence ${formatDate(r.dueDate)}`}
            >
              <p className="text-[10px] font-bold leading-none">Cuota {r.installmentNo}</p>
              <p className="mt-1 text-[10px] tabular-nums leading-none">{formatter(r.amount)}</p>
              <p className="mt-1 text-[9px] leading-none opacity-90">{r.reduced ? "Reducida por amortizacion" : formatDate(r.dueDate)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}



export function PaymentHistoryPdf({ sale }: { sale: any }) {
  const rows = sale?.installments || [];
  if (!rows.length) return;
  const rate = paymentHistoryRate(sale);
  const bodyRows = rows.map((r: any) => {
    const estado = r.reduced ? 'Reducida por amortizacion' : r.paid ? 'Pagada' : (r.overdue ? 'En mora' : (r.installmentNo === sale.summary?.nextInstallmentNo ? 'Por pagar' : 'Pendiente'));
    const color = r.paid ? '#16A34A' : (r.overdue ? '#DC2626' : (r.installmentNo === sale.summary?.nextInstallmentNo ? '#B45309' : '#64748B'));
    return `<tr><td>${r.installmentNo}</td><td>${escapeHtml(formatDate(r.dueDate))}</td><td class="num">${escapeHtml(paymentHistoryUsd(r.amount, rate))}</td><td style="color:${color};font-weight:700">${estado}</td></tr>`;
  }).join('');
  const generatedAt = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' });

  printHtml(`
    <html>
      <head>
        <title>Historial de cuotas - Lote ${escapeHtml(sale?.lot?.code || '')}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#111827;background:white}
          .brand{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #1259C4;padding-bottom:12px;margin-bottom:16px}
          .eyebrow{margin:0 0 4px;color:#1259C4;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em}
          h1{margin:0;font-size:23px}
          p{margin:4px 0 0;color:#64748B;font-size:12px}
          .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
          .summary div{border:1px solid #E5E7EB;background:#F8FAFC;border-radius:6px;padding:10px}
          .summary span{display:block;color:#64748B;font-size:9px;font-weight:700;text-transform:uppercase}
          .summary strong{display:block;margin-top:4px;font-size:14px;color:#111827}
          table{width:100%;border-collapse:collapse}
          th{background:#0B2F6E;color:white;border:1px solid #0B2F6E;padding:7px 6px;font-size:9px;text-align:left;text-transform:uppercase}
          td{border:1px solid #E5E7EB;padding:7px 6px;font-size:11px}
          .num{text-align:right}
          tfoot td{background:#F1F5F9;font-weight:700}
        </style>
      </head>
      <body>
        <div class="brand">
          <div>
            <p class="eyebrow">Dunacon</p>
            <h1>Historial de cuotas</h1>
            <p>Lote ${escapeHtml(sale?.lot?.code || '-')} ${sale?.client?.fullName ? '- ' + escapeHtml(sale.client.fullName) : ''}</p>
          </div>
          <div style="text-align:right">
            <p>Emitido: ${escapeHtml(generatedAt)}</p>
          </div>
        </div>
        <div class="summary">
          <div><span>Precio de venta US$</span><strong>${escapeHtml(paymentHistoryUsd(sale?.sale?.salePrice || 0, rate))}</strong></div>
          <div><span>Valor cuota US$</span><strong>${escapeHtml(paymentHistoryUsd(sale?.sale?.valorCuota || 0, rate))}</strong></div>
          <div><span>Cuotas pagadas</span><strong>${sale?.summary?.paidCount || 0} de ${sale?.summary?.totalCuotas || 0}</strong></div>
          <div><span>Cuota que toca</span><strong>${sale?.summary?.nextInstallmentNo ? 'N. ' + sale.summary.nextInstallmentNo : 'Sin pagos por registrar'}</strong></div>
        </div>
        <table>
          <thead><tr><th>Cuota</th><th>Vence</th><th class="num">Monto US$</th><th>Estado</th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
    </html>
  `);
}

// Estilos compartidos por los PDF de pagos (ficha e historial completo).
const PAYMENT_PDF_STYLE = `
  body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#171717;background:white}
  .brand{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;border-bottom:3px solid #1877F2;padding-bottom:14px;margin-bottom:16px}
  .logos{display:flex;align-items:center;gap:12px}
  .logos img{height:42px;max-width:150px;object-fit:contain}
  .eyebrow{margin:0 0 5px;color:#1877F2;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
  h1{margin:0;font-size:23px;line-height:1.15;color:#111827}
  h2{font-size:13px;margin:18px 0 8px;color:#1259C4;text-transform:uppercase;letter-spacing:.04em}
  p{margin:4px 0 0;color:#6B7280;font-size:12px}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:14px 0 18px}
  .history-summary{grid-template-columns:repeat(5,1fr)}
  .summary div{border:1px solid #E5E7EB;background:#F8FAFC;padding:9px 10px;border-radius:6px}
  .summary span{display:block;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
  .summary strong{display:block;margin-top:4px;color:#111827;font-size:12px}
  table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px;background:white}
  th{background:#1877F2;color:white;border:1px solid #1877F2;padding:8px 7px;font-size:9px;text-align:left;text-transform:uppercase}
  td{border:1px solid #E5E7EB;padding:8px 7px;font-size:11px;vertical-align:top}
  tbody tr:nth-child(even){background:#F8FAFC}
  .label{background:#D8E8FF;font-weight:700;color:#111827;width:34%}
  .num{text-align:right;white-space:nowrap;font-weight:700;color:#1259C4}
  .watermark{position:fixed;left:50%;top:54%;transform:translate(-50%,-50%) rotate(-28deg);opacity:.06;z-index:-1}
  .watermark img{width:560px;max-width:72vw}
  .evidence{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:16px}
  .evidence-item{border:1px solid #E5E7EB;border-radius:6px;padding:8px;background:#fff;break-inside:avoid}
  .evidence-item span{display:block;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
  .evidence-item img{width:100%;max-height:300px;object-fit:contain;border-radius:4px;border:1px solid #E5E7EB}
  .evidence-group{margin-bottom:14px;break-inside:avoid}
  .evidence-title{margin:0 0 6px;font-size:11px;font-weight:700;color:#1259C4;text-transform:uppercase;letter-spacing:.04em}
  .footer{margin-top:18px;border-top:1px solid #E5E7EB;padding-top:8px;color:#6B7280;font-size:10px;text-align:right}
  /* Solo pantalla: nunca aplicar el layout movil al imprimir/PDF. */
  @media screen and (max-width:640px){body{margin:12px}.brand{flex-direction:column;gap:10px}.logos img{height:32px;max-width:120px}h1{font-size:17px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}table{table-layout:auto}th,td{padding:5px 4px;font-size:9px}.watermark img{width:300px}.evidence{grid-template-columns:1fr}}
  @media print{body{margin:18px}thead{display:table-header-group}.brand,.summary,.evidence-item{break-inside:avoid}.watermark{position:fixed}}
`;

/** Resuelve una URL de archivo a absoluta para que se vea dentro del PDF. */
function absoluteUrl(url?: string | null) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  if (typeof window === 'undefined') return url;
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Ficha de un pago/cuota determinada (descarga individual). */
export function PaymentReceiptPdf({ sale, installment, projectName }: { sale: any; installment: any; projectName?: string }) {
  if (!sale || !installment) return;
  const pay = installment.payment || null;
  const adminLogoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
  const projectLogoUrl = sale.projectLogoUrl || '';
  const clientName = sale.client?.fullName || sale.clientName || '-';
  const lotCode = sale.lot?.code || sale.lotCode || `Lote ${sale.sale?.lotId ?? ''}`;
  const isInitial = !installment.installmentNo;
  const cuotaLabel = isInitial ? 'Cuota inicial' : `Cuota N° ${installment.installmentNo}`;
  const amountInUsd = Number(installment.amount || 0);
  const tc = salePaymentExchangeRate(sale, pay);
  const amountUsd = pay?.amountUsd != null ? Number(pay.amountUsd) : amountInUsd;
  const paidAt = pay?.paidAt ? formatDate(pay.paidAt) : (installment.paid ? formatDate(installment.dueDate) : '-');
  const estado = installment.paid ? 'Pagada' : (installment.overdue ? 'En mora' : 'Pendiente');

  // Imagenes de sustento del pago: voucher de la operacion bancaria y boleta.
  const bankOpImage = absoluteUrl(pay?.approvalDocumentUrl);
  const receiptImage = absoluteUrl(pay?.receiptDocumentUrl);
  const voucherImage = absoluteUrl(pay?.voucherUrl);
  const evidence: Array<{ label: string; url: string }> = [
    { label: 'Voucher de operacion bancaria', url: bankOpImage },
    { label: 'Boleta', url: receiptImage },
    { label: 'Comprobante del pago', url: voucherImage },
  ].filter((e) => !!e.url);

  const evidenceHtml = evidence.length
    ? `<h2>Evidencia del pago</h2>
       <div class="evidence">
         ${evidence.map((e) => `<div class="evidence-item"><span>${escapeHtml(e.label)}</span><img src="${escapeHtml(e.url)}" alt="${escapeHtml(e.label)}" /></div>`).join('')}
       </div>`
    : '';

  const detailRows: Array<[string, string]> = [
    ['Cliente', clientName],
    ['Lote', String(lotCode)],
    ['Proyecto', projectName || `Proyecto ${sale.sale?.projectId ?? ''}`],
    ['Cuota', cuotaLabel],
    ['Fecha de pago', paidAt],
    ['Tipo de cambio (TC)', tc ? String(tc) : '-'],
    ['Monto en dolares (US$)', amountUsd != null ? `US$ ${Number(amountUsd).toFixed(2)}` : '-'],
    ['N° operacion bancaria', pay?.bankOperationNumber || '-'],
    ['N° boleta', pay?.receiptNumber || '-'],
    ['Medio de pago', pay?.paymentMethod || '-'],
    ['Referencia', pay?.reference || '-'],
    ['Estado', estado],
  ];

  printHtml(`
    <html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Ficha de pago - ${escapeHtml(clientName)}</title><style>${PAYMENT_PDF_STYLE}</style></head><body>
      <div class="watermark"><img src="${escapeHtml(adminLogoUrl)}" alt="" /></div>
      <div class="brand">
        <div>
          <p class="eyebrow">Ficha de pago</p>
          <h1>${escapeHtml(cuotaLabel)}</h1>
          <p>${escapeHtml(clientName)} - ${escapeHtml(String(lotCode))}</p>
          <p>${escapeHtml(projectName || `Proyecto ${sale.sale?.projectId ?? ''}`)} - generado ${new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        </div>
        <div class="logos">${projectLogoUrl ? `<img src="${escapeHtml(projectLogoUrl)}" alt="Proyecto" />` : ''}<img src="${escapeHtml(adminLogoUrl)}" alt="Dunacon" /></div>
      </div>
      <div class="summary">
        <div><span>Monto US$</span><strong>${amountUsd != null ? 'US$ ' + Number(amountUsd).toFixed(2) : '-'}</strong></div>
        <div><span>Tipo de cambio</span><strong>${tc ? escapeHtml(String(tc)) : '-'}</strong></div>
        <div><span>Estado</span><strong>${escapeHtml(estado)}</strong></div>
      </div>
      <h2>Detalle del pago</h2>
      <table><tbody>${detailRows.map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table>
      ${evidenceHtml}
      <div class="footer">Dunacon - CRM Inmobiliario</div>
    </body></html>
  `);
}

/** Historial completo de financiamiento y pagos de un cliente. */
export function ClientPaymentHistoryPdf({ sale, projectName }: { sale: any; projectName?: string }) {
  if (!sale) return;
  const adminLogoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
  const projectLogoUrl = sale.projectLogoUrl || '';
  const clientName = sale.client?.fullName || sale.clientName || '-';
  const lotCode = sale.lot?.code || sale.lotCode || `Lote ${sale.sale?.lotId ?? ''}`;
  const rows = clientPaymentHistoryRows(sale);
  const totals = clientPaymentHistoryTotals(rows, sale.sale);
  const receiptIds = new Set(rows.flatMap(row => (row.paymentRecords || []).map((payment: any) => Number(payment.paymentId || payment.id))));
  const others = (sale.otherPayments || []).filter((payment: any) => !receiptIds.has(Number(payment.paymentId || payment.id)));
  const rate = paymentHistoryRate(sale);
  const installmentTotals = paymentHistoryInstallmentTotals(sale);
  const initialFeeAmount = paymentHistoryInitialFeeAmount(sale);

  const moneyFields = ['openingBalance','monthlyInstallment','realizedPayment','capitalAmortization','interest','extraordinaryAmortization','closingBalance'] as const;
  const rowHtml = (row: any) => `<tr${!row.isFinancing ? ' class="initial-row"' : ''}>
      <td>${escapeHtml(row.conceptLabel || (row.installmentNo ? `Cuota ${row.installmentNo}` : TYPE_LABEL[row.type] || 'Pago'))}</td>
      <td>${escapeHtml(formatClientHistoryDate(row.dueDate))}</td>
      ${moneyFields.map(field => `<td class="num ${field === 'realizedPayment' ? 'realized' : field === 'closingBalance' ? 'closing' : ''}">${row === rows[0] && (field === 'interest' || field === 'extraordinaryAmortization') ? '' : row === rows[0] && field === 'openingBalance' ? escapeHtml(paymentHistoryUsd(sale.sale?.salePrice || 0, rate)) : row === rows[0] && field === 'capitalAmortization' ? escapeHtml(paymentHistoryUsd(row.monthlyInstallment, rate)) : row === rows[0] && field === 'closingBalance' ? escapeHtml(paymentHistoryUsd(Math.max(0, Math.round(Number(sale.sale?.salePrice || 0) * 100) - Math.round(Number(sale.sale?.cuotaInicial || 0) * 100)) / 100, rate)) : row[field] == null ? '-' : escapeHtml(paymentHistoryUsd(row[field],rate))}</td>`).join('')}
      <td>${row.reduced ? 'Reducida por amortizacion' : row.paid ? 'Pagado' : row.overdue ? 'Vencido' : 'Pendiente'}</td>
      <td>${escapeHtml(formatClientHistoryDate(row.payment?.paidAt))}</td>
      <td>${escapeHtml(row.payment?.bankOperationNumber || '-')}</td>
    </tr>`;
  const bodyRows = rows.map(rowHtml).join('');
  const otherRows = clientPaymentHistoryRows({ sale: sale.sale, plan: others, allPayments: others }).map(rowHtml).join('');
  const ledgerHeaders = ['Concepto','Vence',`Saldo inicial ${displaySymbol()}`,`Cuota del mes ${displaySymbol()}`,`Pago realizado ${displaySymbol()}`,`Amortización de capital ${displaySymbol()}`,`Interés ${displaySymbol()}`,`Amortización extra ${displaySymbol()}`,`Saldo final ${displaySymbol()}`,'Estado','Fecha pago','N. Op. Bco'];

  printHtml(`
    <html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Historial de pagos - ${escapeHtml(clientName)}</title><style>${PAYMENT_PDF_STYLE}
      @page{size:A4 landscape;margin:10mm}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{margin:0;color:${INK};font-family:Arial,sans-serif}
      .brand{background:#1877F2;padding:12px;border-radius:6px;gap:12px}
      .brand h1,.brand p,.brand .eyebrow{color:white;overflow-wrap:anywhere}
      .brand>div{min-width:0}.logos{flex-shrink:0}
      .history-summary{grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
      .history-summary div{min-width:0;background:white;border-color:${BORDER}}
      .history-summary span{text-transform:none;letter-spacing:normal;font-weight:500;color:${MUTED}}
      .history-summary strong{font-size:12px;overflow-wrap:anywhere}
      table{width:100%;table-layout:fixed}
      th,td{padding:6px 4px;font-size:9px;line-height:1.3;overflow-wrap:anywhere}
      th{background:#52728F;border-color:#52728F;text-transform:none}
      td.num{color:${INK};white-space:normal;font-weight:400;font-variant-numeric:tabular-nums}
      tbody tr:nth-child(even){background:white}
      tbody tr.initial-row{background:#F8FBFF}
      td.realized{background:#FFFDE7;font-weight:700}
      td.closing{background:#F0FDF4;font-weight:700}
      tfoot td{background:#000080;color:white!important;font-weight:700!important}
      thead{display:table-header-group}tfoot{display:table-row-group}
      tr{break-inside:avoid}h2{break-after:avoid}
      .evidence-group{break-inside:auto}.evidence-title{break-after:avoid}
      .evidence-item img{max-height:125mm}
      @media print{body{margin:0}.brand,.summary{break-inside:avoid}}
      </style></head><body>
      <div class="watermark"><img src="${escapeHtml(adminLogoUrl)}" alt="" /></div>
      <div class="brand">
        <div>
          <p class="eyebrow">Historial de pagos</p>
          <h1>${escapeHtml(clientName)}</h1>
          <p>${escapeHtml(String(lotCode))} - ${escapeHtml(projectName || `Proyecto ${sale.sale?.projectId ?? ''}`)}</p>
          <p>Emitido: ${new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        </div>
        <div class="logos">${projectLogoUrl ? `<img src="${escapeHtml(projectLogoUrl)}" alt="Proyecto" />` : ''}<img src="${escapeHtml(adminLogoUrl)}" alt="Dunacon" /></div>
      </div>
      <div class="summary history-summary">
        <div><span>Precio final US$ (${Number(sale.sale?.totalCuotas ?? sale.summary?.totalCuotas ?? 0)})</span><strong>${escapeHtml(paymentHistoryUsd(sale.sale?.salePrice || 0, rate))}</strong></div>
        <div><span>Reserva US$</span><strong style="color:${sale.summary?.reservaAmount ? (sale.summary?.reservaPaid ? GREEN : AMBER) : MUTED}">${escapeHtml(paymentHistoryUsd(sale.summary?.reservaAmount || 0, rate))}</strong></div>
        <div><span>Cuota inicial US$</span><strong style="color:${sale.summary?.cuotaInicialPaid ? GREEN : AMBER}">${escapeHtml(paymentHistoryUsd(initialFeeAmount, rate))}</strong></div>
        <div><span>Cobrado US$</span><strong style="color:${GREEN}">${escapeHtml(paymentHistoryUsd(sale.summary?.collectedAmount || 0, rate))}</strong></div>
        <div><span>Saldo US$</span><strong style="color:${BLUE_DARK}">${escapeHtml(paymentHistoryUsd(sale.summary?.balanceAmount || 0, rate))}</strong></div>
        <div><span>Cuotas Pagadas US$ (${Number(sale.summary?.paidCount || 0)})</span><strong style="color:${GREEN}">${escapeHtml(paymentHistoryUsd(installmentTotals.paid, rate))}</strong></div>
        <div><span>Cuotas por pagar US$ (${Number(sale.summary?.pendingCount || 0)})</span><strong style="color:${BLUE_DARK}">${escapeHtml(paymentHistoryUsd(installmentTotals.pending, rate))}</strong></div>
        <div><span>Cuotas en Atraso US$</span><strong style="color:${RED}">${escapeHtml(paymentHistoryUsd(installmentTotals.overdue, rate))}</strong></div>
        <div><span>Le toca pagar</span><strong style="color:${AMBER}">${escapeHtml(sale.summary?.nextConceptLabel || (sale.summary?.nextInstallmentNo ? 'Cuota ' + sale.summary.nextInstallmentNo : 'Sin pagos por registrar'))}</strong></div>
        <div><span>Valor de la Cuota US$</span><strong>${escapeHtml(paymentHistoryUsd(sale.summary?.nextAmount || 0, rate))}</strong></div>
      </div>
      <h2>Plan de pagos (reserva, cuota inicial y cuotas, en orden)</h2>
      <table><colgroup><col style="width:10%" /><col style="width:7%" /><col style="width:8%" /><col style="width:8%" /><col style="width:8%" /><col style="width:8%" /><col style="width:8%" /><col style="width:8%" /><col style="width:8%" /><col style="width:4%" /><col style="width:7%" /><col style="width:16%" /></colgroup>
        <thead><tr>${ledgerHeaders.map(label=>`<th>${label.startsWith('Amortización extra ') ? `Amortización<br><span style="white-space:nowrap">extra ${escapeHtml(displaySymbol())}</span>` : escapeHtml(label)}</th>`).join('')}</tr></thead>
        <tbody>${bodyRows || '<tr><td colspan="12">Sin cronograma registrado.</td></tr>'}</tbody>
        <tfoot><tr><td colspan="2">Total</td>${moneyFields.map(field=>`<td class="num">${escapeHtml(paymentHistoryUsd(totals[field],rate))}</td>`).join('')}<td colspan="3"></td></tr></tfoot>
      </table>
      ${otherRows ? `<h2>Otros pagos (abonos extra)</h2>
      <table><colgroup><col style="width:10%" /><col style="width:7%" /><col style="width:8%" /><col style="width:8%" /><col style="width:8%" /><col style="width:8%" /><col style="width:8%" /><col style="width:8%" /><col style="width:8%" /><col style="width:4%" /><col style="width:7%" /><col style="width:16%" /></colgroup>
        <thead><tr>${ledgerHeaders.map(label=>`<th>${label.startsWith('Amortización extra ') ? `Amortización<br><span style="white-space:nowrap">extra ${escapeHtml(displaySymbol())}</span>` : escapeHtml(label)}</th>`).join('')}</tr></thead>
        <tbody>${otherRows}</tbody>
      </table>` : ''}
      <div class="footer">Dunacon - CRM Inmobiliario</div>
    </body></html>
  `);
}

function ChartHeader({ title, subtitle, menuRows, actions, grayHeader = false }: { title: string; subtitle: string; menuRows: Array<[string, string]>; actions?: ReactNode; grayHeader?: boolean }) {
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: BORDER, background: grayHeader ? '#808080' : undefined }}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold" style={{ color: grayHeader ? '#FFFFFF' : INK }}>{title}</h3>
        <p className="mt-0.5 text-xs" style={{ color: grayHeader ? '#FFFFFF' : MUTED }}>{subtitle}</p>
      </div>
      <div className="flex min-w-0 shrink-0 items-start gap-2">
        {actions}
        <ChartMenu rows={menuRows} />
      </div>
    </div>
  );
}

export default function PaymentsView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [rows, setRows] = useState<P[]>([]);
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState<P[]>([]);
  const [showOverdueAlert, setShowOverdueAlert] = useState(true);

  const [salesRange, setSalesRange] = useState<3 | 6>(6);
  const [salesPeriod, setSalesPeriod] = useState<'month' | 'year'>('month');
  const { currency, setCurrency, exchangeRate, setExchangeRate, format: show } = useDisplayCurrency();
  // Los importes de la venta y del historial ya vienen expresados en USD.
  const showUsd = useCallback(
    (amountInUsd: number | string | null | undefined) => paymentHistoryUsd(amountInUsd, 1),
    [currency, exchangeRate],
  );
  const [isNarrow, setIsNarrow] = useState(false);
  const [paySearch, setPaySearch] = useState('');
  const [payFromDate, setPayFromDate] = useState('');
  const [payToDate, setPayToDate] = useState('');
  const [historyView, setHistoryView] = useState<'operation' | 'client'>('operation');
  const [clientReportPayments, setClientReportPayments] = useState<P[]>([]);
  const [clientReportSales, setClientReportSales] = useState<any[]>([]);
  const [clientReportHistories, setClientReportHistories] = useState<Record<number, any>>({});
  const [payClientSearch, setPayClientSearch] = useState('');
  // Marca que el texto del buscador proviene de haber elegido un resultado de la
  // lista (no es un termino tecleado). Sirve para no repetir la busqueda ni
  // mostrar el aviso de "no se encontro" cuando el input ya quedo resuelto.
  const [paySearchPicked, setPaySearchPicked] = useState(false);
  const [payContextLoading, setPayContextLoading] = useState(false);
  // Contexto de la venta elegida (cronograma + cuota que toca + demas pagos).
  const contextRequest = useRef(0);
  const [paymentRevision, setPaymentRevision] = useState(0);
  const [activeSale, setActiveSale] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [meta, setMeta] = useState({ total: 0, totalPages: 1, distinctLots: 0, pendingCount: 0 });
  const [cash, setCash] = useState<any>({ methods: [], byMonth: [], overdueByMonth: [], salesByMonth: [] });
  const [lots, setLots] = useState<any[]>([]);
  const [payProjects, setPayProjects] = useState<any[]>([]);
  const [payProjectId, setPayProjectId] = useState(lockedProjectId || 0);
  const [clients, setClients] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [lotId, setLotId] = useState(0);
  const [clientId, setClientId] = useState(0);
  const [amount, setAmount] = useState(0);
  const [isExtraordinary, setIsExtraordinary] = useState(false);
  const [payCurrency, setPayCurrency] = useState('USD');
  const [payExchangeRate, setPayExchangeRate] = useState('');
  const [amountSoles, setAmountSoles] = useState(0);
  const [payType, setPayType] = useState('reserva');
  const cuotaAmount = Number(activeSale?.summary?.nextAmount || 0);
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const isInitialExtraordinary = ['adelanto', 'cuota_inicial'].includes(payType);
  const pendingInitialExtraordinary = Math.round((activeSale?.plan || []).filter((row: any) => row.kind === 'cuota_inicial' && !row.paid && !row.payment).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0) * 100) / 100;
  const extraordinaryBreakdown = isInitialExtraordinary
    ? {count: 0, covered: [], overdueCount: 0, overduePaid: 0, required: pendingInitialExtraordinary, installments: Math.min(amount, pendingInitialExtraordinary), extraordinary: Math.max(0, Math.round((amount - pendingInitialExtraordinary) * 100) / 100)}
    : extraordinaryPaymentBreakdown(activeSale?.installments || [], amount, paymentDate);
  const extraordinaryAmount = isExtraordinary ? extraordinaryBreakdown.extraordinary : 0;
  const cuotasLabel = isInitialExtraordinary ? 'Pago a cuota inicial US$'
    : `Pago a cuotas US$ (${extraordinaryBreakdown.count})`;
  useEffect(() => {
    if (open) {
      setIsExtraordinary(false); setPayCurrency('USD'); setPayExchangeRate(''); setAmountSoles(0);
      const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const part = (type: string) => parts.find(value => value.type === type)?.value || '';
      setPaymentDate(`${part('year')}-${part('month')}-${part('day')}`);
    }
  }, [open]);
  const [payMethod, setPayMethod] = useState('yape');
  const [reference, setReference] = useState('');
  const [voucher, setVoucher] = useState<File | null>(null);
  const [voucherUrl, setVoucherUrl] = useState('');
  // Datos para adjuntar durante el registro (op. bancaria como foto y boleta).
  const [regBankOp, setRegBankOp] = useState('');
  const [regBankOpFile, setRegBankOpFile] = useState<File | null>(null);
  const [regBankOpUrl, setRegBankOpUrl] = useState('');
  const [regReceiptNo, setRegReceiptNo] = useState('');
  const [regReceiptFile, setRegReceiptFile] = useState<File | null>(null);
  const [regReceiptUrl, setRegReceiptUrl] = useState('');
  const [regCuotaValue, setRegCuotaValue] = useState('');
  // Modal de historial de pagos por cliente (boton "Ver" en la tabla).
  const [historyRow, setHistoryRow] = useState<P | null>(null);
  const [historySale, setHistorySale] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequest = useRef(0);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditRows, setAuditRows] = useState<P[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditMeta, setAuditMeta] = useState({ total: 0, totalPages: 1 });
  // Resultados del buscador "Buscar cliente o lote" (lotes/clientes, con o sin venta).
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [editingPayment, setEditingPayment] = useState<P | null>(null);
  const [editVoucher, setEditVoucher] = useState<File | null>(null);
  const [editVoucherUrl, setEditVoucherUrl] = useState('');
  const [approvalBankOp, setApprovalBankOp] = useState('');
  const [approvalReceiptNo, setApprovalReceiptNo] = useState('');
  const [approvalReceiptValue, setApprovalReceiptValue] = useState('');
  const [approvalDoc, setApprovalDoc] = useState<File | null>(null);
  const [approvalDocUrl, setApprovalDocUrl] = useState('');
  const currentRole = (() => { try { return JSON.parse(localStorage.getItem('crm_user') || '{}').role || ''; } catch { return ''; } })();
  const payCanMark = currentRole === 'admin' || currentRole === 'superadmin';
  const canViewAudit = payCanMark;

  useEffect(() => { if (lockedProjectId) setPayProjectId(lockedProjectId); }, [lockedProjectId]);

  useEffect(() => {
    if (!open) return;
    const term = payClientSearch.trim();
    // Texto colocado por elegir un resultado: ya esta resuelto, no se busca ni se avisa.
    if (paySearchPicked) { setSearchResults([]); return; }
    if (!clientId && !lotId && term.length < 2) { setSearchResults([]); return; }
    // Si ya se eligio lote o cliente, no hace falta seguir buscando por texto.
    if (clientId || lotId) { setSearchResults([]); return; }
    let alive = true;
    setPayContextLoading(true);
    const q = new URLSearchParams();
    q.set('q', term);
    if (lockedProjectId) q.set('projectId', String(lockedProjectId));
    const timer = setTimeout(() => {
      api.get<any>(`/sales/payment-search?${q.toString()}`)
        .then((d) => { if (alive) setSearchResults(d?.results || []); })
        .catch(() => { if (alive) setSearchResults([]); })
        .finally(() => { if (alive) setPayContextLoading(false); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, clientId, lotId, payClientSearch, paySearchPicked, lockedProjectId]);

  /**
   * Aplica un resultado del buscador al formulario. Si el lote/cliente tiene
   * venta, carga su contexto (cronograma + cuota que toca) para autocompletar;
   * si no la tiene, igual deja lote/cliente seleccionados para registrar el pago.
   */
  function clearPaymentContext() {
    setIsExtraordinary(false); setPayCurrency('USD'); setPayExchangeRate(''); setAmountSoles(0);
    setActiveSale(null); setClientId(0); setAmount(0); setRegCuotaValue('');
    setDueDate(''); setReference(''); setNote(''); setPayType('reserva');
  }

  function applyPaymentContext(ctx: any, fallback: any = {}) {
    setIsExtraordinary(false); setPayCurrency('USD'); setPayExchangeRate(''); setAmountSoles(0);
    setActiveSale(ctx?.sale ? ctx : null);
    const resolvedLotId = Number(ctx?.sale?.lotId || ctx?.lot?.id || fallback.lotId || 0);
    const resolvedProjectId = Number(ctx?.sale?.projectId || ctx?.lot?.projectId || fallback.projectId || 0);
    if (resolvedLotId) setLotId(resolvedLotId);
    if (resolvedProjectId) setPayProjectId(resolvedProjectId);
    const client = ctx?.client;
    setClientId(Number(client?.id || ctx?.sale?.clientId || fallback.clientId || 0));
    if (client?.id) setClients(current => [...current.filter(c => Number(c.id) !== Number(client.id)), client]);
    if (ctx?.lot?.id) setLots(current => [...current.filter(l => Number(l.id) !== Number(ctx.lot.id)), { ...ctx.lot, projectId: resolvedProjectId, clientId: client?.id || ctx?.sale?.clientId, agentId: ctx?.agent?.id }]);
    const nextAmount = Number(ctx?.summary?.nextAmount || 0);
    const label = String(ctx?.summary?.nextConceptLabel || '');
    const nextLabel = label.toLowerCase();
    setAmount(nextAmount); setRegCuotaValue(nextAmount > 0 ? String(nextAmount) : '');
    setDueDate(String(ctx?.summary?.nextDueDate || '').slice(0, 10));
    if (nextLabel.includes('reserva')) setPayType('reserva');
    else if (nextLabel.includes('inicial')) setPayType('adelanto');
    else if (Number(ctx?.summary?.nextInstallmentNo) === 1) setPayType('primera_cuota');
    else setPayType('cuota');
    const detail = `Lote ${ctx?.lot?.code || fallback.lotCode || resolvedLotId} - ${label || 'Pago'}`;
    setReference(detail); setNote(detail);
  }

  async function selectSearchResult(r: any) {
    if (!r.lotId) { clearPaymentContext(); setClientId(Number(r.clientId || 0)); setPaySearchPicked(true); setPayClientSearch(r.clientName || ''); setSearchResults([]); return; }
    await selectLot(Number(r.lotId), r);
  }

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (lockedProjectId) q.set('projectId', String(lockedProjectId));
      if (payFromDate) q.set('from', payFromDate);
      if (payToDate) q.set('to', payToDate);
      q.set('page', String(page)); q.set('limit', String(limit));
      const back = (await api.get<any>(`/payments?${q.toString()}`)) || {};
      const arr: P[] = Array.isArray(back) ? back : (back.items || []);
      setRows(arr);
      setPaymentRevision(value => value + 1);
      setMeta({
        total: Number(back.total ?? arr.length),
        totalPages: Number(back.totalPages ?? Math.max(1, Math.ceil((back.total ?? arr.length) / limit))),
        distinctLots: Number(back.distinctLots || 0),
        pendingCount: Number(back.pendingCount || 0),
      });
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [status, lockedProjectId, payFromDate, payToDate, page, limit]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const socket = getSocket(token);
    let timer: ReturnType<typeof setTimeout>;
    const refresh = (payment: any) => {
      if (lockedProjectId && Number(payment?.projectId) !== Number(lockedProjectId)) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 200);
    };
    socket.on('payment.created', refresh); socket.on('payment.updated', refresh);
    return () => { clearTimeout(timer); socket.off('payment.created', refresh); socket.off('payment.updated', refresh); };
  }, [load, lockedProjectId]);

  const loadAudit = useCallback(async () => {
    if (!canViewAudit) return;
    setAuditLoading(true);
    try {
      const q = new URLSearchParams();
      if (lockedProjectId) q.set('projectId', String(lockedProjectId));
      q.set('page', String(auditPage));
      q.set('limit', '10');
      const back = (await api.get<any>(`/payments?${q.toString()}`)) || {};
      const arr: P[] = Array.isArray(back) ? back : (back.items || []);
      setAuditRows(arr);
      setAuditMeta({
        total: Number(back.total ?? arr.length),
        totalPages: Number(back.totalPages ?? Math.max(1, Math.ceil((back.total ?? arr.length) / 10))),
      });
    } catch (e: any) {
      toast(e.message || 'No se pudo cargar auditoria', 'err');
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, canViewAudit, lockedProjectId]);

  useEffect(() => {
    load();
    api.get<{ overdue: P[] }>('/payments/alerts').then((a) => setOverdue(a?.overdue || [])).catch(() => setOverdue([]));
    api.get<any[]>('/lots?limit=200').then((d) => setLots(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => { });
    api.get<any>('/projects').then((d) => setPayProjects(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => { });
    api.get<any[]>('/clients?limit=500').then((d) => setClients(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => { });
  }, [load]);

  useEffect(() => {
    if (auditOpen) loadAudit();
  }, [auditOpen, loadAudit]);

  useEffect(() => { setPage(1); }, [status, lockedProjectId, payFromDate, payToDate]);

  useEffect(() => {
    const q = lockedProjectId ? `?projectId=${lockedProjectId}` : '';
    api.get<any>(`/payments/caja${q}`).then(setCash).catch(() => { });
  }, [lockedProjectId, paymentRevision]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (lockedProjectId) q.set('projectId', String(lockedProjectId));
    if (payFromDate) q.set('from', payFromDate);
    if (payToDate) q.set('to', payToDate);
    q.set('limit', '100');
    let alive = true;
    async function loadPages(path: string) {
      const pageQuery = new URLSearchParams(q);
      const items: any[] = [];
      for (let pageNo = 1; alive; pageNo++) {
        pageQuery.set('page', String(pageNo));
        const back = await api.get<any>(`${path}?${pageQuery.toString()}`);
        items.push(...(Array.isArray(back) ? back : back?.items || []));
        if (Array.isArray(back) || pageNo >= Number(back?.totalPages || 1)) break;
      }
      return items;
    }
    Promise.all([loadPages('/payments'), loadPages('/sales')]).then(([payments, sales]) => {
      if (!alive) return;
      setClientReportPayments(payments); setClientReportSales(sales);
    }).catch(() => { if (alive) toast('No se pudo actualizar el reporte por lote. Recarga la pagina.', 'err'); });
    return () => { alive = false; };
  }, [lockedProjectId, payFromDate, payToDate, paymentRevision]);

  useEffect(() => {
    const ids = Array.from(new Set([
      ...clientReportSales.map((sale) => Number(sale.lotId || 0)).filter(Boolean),
      ...clientReportPayments.map((payment) => Number(payment.lotId || 0)).filter(Boolean),
    ]));
    if (!ids.length) {
      setClientReportHistories({});
      return;
    }
    let alive = true;
    Promise.all(ids.map((id) => api.get<any>(`/sales/lot/${id}/history`).then((history) => [id, history] as const).catch(() => [id, null] as const)))
      .then((entries) => {
        if (!alive) return;
        setClientReportHistories(Object.fromEntries(entries.filter(([, history]) => history)));
      });
    return () => { alive = false; };
  }, [clientReportSales, clientReportPayments]);

  // Detecta pantallas angostas para simplificar los ejes de los graficos.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const availableLots = payProjectId ? lots.filter((l: any) => Number(l.projectId) === Number(payProjectId)) : lots;
  // Indice de proyectos para resolver nombre y logo al generar los PDF.
  const projectsById = new Map<number, any>(payProjects.map((p: any) => [Number(p.id), p]));
  // Al elegir el lote, precargar su cliente asignado (si tiene) — igual se
  // puede cambiar a mano con el selector de Cliente.
  async function selectLot(id: number, fallback: any = {}) {
    const requestId = ++contextRequest.current;
    clearPaymentContext(); setLotId(id); setSearchResults([]);
    setPaySearchPicked(true);
    if (!id) { setPayContextLoading(false); return; }
    const lot = lots.find((l: any) => Number(l.id) === id);
    setPayClientSearch(String(fallback.lotCode || lot?.code || id));
    setPayContextLoading(true);
    try {
      const ctx = await api.get<any>(`/sales/lot/${id}/history`);
      if (requestId !== contextRequest.current) return;
      if (!ctx?.sale) throw new Error('Este lote no tiene una venta con cronograma para autocompletar el pago.');
      if (lockedProjectId && Number(ctx.sale.projectId) !== Number(lockedProjectId)) throw new Error('El lote pertenece a otro proyecto.');
      applyPaymentContext(ctx, { ...fallback, lotId: id, lotCode: fallback.lotCode || lot?.code });
      setPayClientSearch(String(ctx.lot?.code || fallback.lotCode || lot?.code || id));
    } catch (e: any) {
      if (requestId !== contextRequest.current) return;
      clearPaymentContext(); toast(e.message || 'No se pudo cargar la venta del lote. Intenta seleccionarlo otra vez.', 'err');
    } finally { if (requestId === contextRequest.current) setPayContextLoading(false); }
  }

  async function registrar() {
    if (savingPayment || payContextLoading) return;
    if (activeSale?.sale && !(Number(activeSale.summary?.nextAmount) > 0)) return toast('Este lote no tiene cuotas sin registrar. Revisa el historial y los pagos pendientes de aprobacion.', 'err');
    if (!lockedProjectId && !payProjectId) return toast('Selecciona un proyecto', 'err');
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!clientId) return toast('Selecciona un cliente', 'err');
    if (!payType) return toast('Selecciona el tipo de pago', 'err');
    if (!payMethod) return toast('Selecciona el medio de pago', 'err');
    if (!reference.trim()) return toast('Ingresa la referencia u operacion de pago', 'err');
    if (!voucher) return toast('Adjunta el comprobante del pago', 'err');
    if (isExtraordinary && payCurrency === 'PEN' && !(Number(payExchangeRate) > 0)) return toast('Ingresa un tipo de cambio válido', 'err');
    if (!Number.isFinite(amount) || amount <= 0) return toast('Ingresa un monto válido', 'err');
    if (isExtraordinary && isInitialExtraordinary && amount < pendingInitialExtraordinary) return toast('Primero debes cubrir la cuota inicial pendiente.', 'err');
    if (!dueDate) return toast('Ingresa la fecha de vencimiento', 'err');
    if (!note.trim()) return toast('Ingresa una nota', 'err');
    if (!paymentDate) return toast('Selecciona la fecha de pago', 'err');
    if (!regBankOp.trim()) return toast('Ingresa el N° de operacion bancaria', 'err');
    if (!regReceiptNo.trim()) return toast('Ingresa el N° de boleta', 'err');
    if (!(Number(regCuotaValue) > 0)) return toast('Ingresa el valor de la cuota', 'err');
    if (!regBankOpFile) return toast('Adjunta la foto de la operacion bancaria', 'err');
    if (!regReceiptFile) return toast('Adjunta la foto de la boleta', 'err');
    setSavingPayment(true);
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      const amountUsdFinal = !isExtraordinary ? Number(amount) : lotPaymentUsd(payCurrency === 'PEN' ? amountSoles : amount, payCurrency, Number(payExchangeRate));
      const saved: any = await api.post('/payments', { projectId: Number(activeSale?.sale?.projectId || payProjectId || lockedProjectId || lot?.projectId), lotId: Number(lotId), clientId: clientId || lot?.clientId || undefined, agentId: lot?.agentId || undefined, type: payType, amount: amountUsdFinal, dueDate: dueDate || undefined, paymentMethod: payMethod, reference: reference || undefined, note: note || undefined, paidAt: paymentDate, isExtraordinary, exchangeRate: isExtraordinary && payCurrency === 'PEN' ? Number(payExchangeRate) : undefined, amountUsd: Number(amountUsdFinal.toFixed(2)), bankOperationNumber: regBankOp.trim() || undefined, receiptNumber: regReceiptNo.trim() || undefined, receiptValue: isExtraordinary ? amountUsdFinal : regCuotaValue ? Number(regCuotaValue) : undefined });
      const attachments = [
        voucher ? uploadFile(`/payments/voucher/${saved?.id}`, voucher) : null,
        regBankOpFile ? uploadFile(`/payments/approval-doc/${saved?.id}`, regBankOpFile) : null,
        regReceiptFile ? uploadFile(`/payments/receipt-doc/${saved?.id}`, regReceiptFile) : null,
      ].filter(Boolean) as Promise<any>[];
      toast(attachments.length ? 'Pago registrado. Subiendo adjuntos...' : 'Pago registrado');
      setOpen(false); setIsExtraordinary(false); setPayCurrency('USD'); setPayExchangeRate(''); setAmountSoles(0); setAmount(0); setDueDate(''); setNote(''); setLotId(0); setClientId(0); setPayMethod('yape'); setReference(''); setVoucher(null); setVoucherUrl('');
      setPayClientSearch(''); setPaySearchPicked(false); setSearchResults([]); setActiveSale(null);
      setRegBankOp(''); setRegBankOpFile(null); setRegBankOpUrl(''); setRegReceiptNo(''); setRegReceiptFile(null); setRegReceiptUrl(''); setRegCuotaValue('');
      load();
      if (attachments.length) {
        Promise.allSettled(attachments).then((results) => {
          const failed = results.some((result) => result.status === 'rejected');
          toast(failed ? 'Pago guardado, pero algun adjunto no subio' : 'Adjuntos subidos');
          load();
        });
      }
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setSavingPayment(false); }
  }

  function pickRegBankOp(f?: File) {
    if (!f) { setRegBankOpFile(null); setRegBankOpUrl(''); return; }
    setRegBankOpFile(f);
    if (window) { try { if (regBankOpUrl.startsWith('blob:')) URL.revokeObjectURL(regBankOpUrl); } catch { } setRegBankOpUrl(URL.createObjectURL(f)); }
  }

  function pickRegReceipt(f?: File) {
    if (!f) { setRegReceiptFile(null); setRegReceiptUrl(''); return; }
    setRegReceiptFile(f);
    if (window) { try { if (regReceiptUrl.startsWith('blob:')) URL.revokeObjectURL(regReceiptUrl); } catch { } setRegReceiptUrl(URL.createObjectURL(f)); }
  }

  function pickVoucher(f?: File) {
    if (!f) { setVoucher(null); setVoucherUrl(''); return; }
    setVoucher(f);
    if (window) { try { if (voucherUrl.startsWith('blob:')) URL.revokeObjectURL(voucherUrl); } catch { } setVoucherUrl(URL.createObjectURL(f)); }
  }

  function openEditPayment(payment: P) {
    setEditingPayment(payment);
    setEditVoucher(null);
    setEditVoucherUrl(payment.voucherUrl || '');
    setApprovalBankOp(payment.bankOperationNumber || '');
    setApprovalReceiptNo(payment.receiptNumber || '');
    setApprovalReceiptValue(payment.isExtraordinary ? String(payment.amountUsd ?? payment.amount) : payment.receiptValue != null ? String(payment.receiptValue) : '');
    setApprovalDoc(null);
    setApprovalDocUrl(payment.approvalDocumentUrl || '');
  }

  function pickEditVoucher(f?: File) {
    if (!f) { setEditVoucher(null); setEditVoucherUrl(editingPayment?.voucherUrl || ''); return; }
    setEditVoucher(f);
    if (window) { try { if (editVoucherUrl.startsWith('blob:')) URL.revokeObjectURL(editVoucherUrl); } catch { } setEditVoucherUrl(URL.createObjectURL(f)); }
  }

  function pickApprovalDoc(f?: File) {
    if (!f) { setApprovalDoc(null); setApprovalDocUrl(editingPayment?.approvalDocumentUrl || ''); return; }
    setApprovalDoc(f);
    if (window) { try { if (approvalDocUrl.startsWith('blob:')) URL.revokeObjectURL(approvalDocUrl); } catch { } setApprovalDocUrl(URL.createObjectURL(f)); }
  }

  async function approvePayment() {
    const target = editingPayment;
    if (!target) return;
    if (!approvalBankOp.trim() || !approvalReceiptNo.trim() || !approvalReceiptValue) {
      return toast('Completa N° Op. Bco, N° Boleta y Valor Bol para aprobar el pago', 'err');
    }
    try {
      if (editVoucher) await uploadFile(`/payments/voucher/${target.id}`, editVoucher);
      if (approvalDoc) await uploadFile(`/payments/approval-doc/${target.id}`, approvalDoc);
      await api.post(`/payments/approve/${target.id}`, {
        bankOperationNumber: approvalBankOp.trim(),
        receiptNumber: approvalReceiptNo.trim(),
        receiptValue: target.isExtraordinary ? Number(target.amountUsd ?? target.amount) : Number(approvalReceiptValue),
      });
      toast('Pago aprobado');
      setEditingPayment(null);
      setEditVoucher(null); setEditVoucherUrl('');
      setApprovalBankOp(''); setApprovalReceiptNo(''); setApprovalReceiptValue(''); setApprovalDoc(null); setApprovalDocUrl('');
      await load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function saveEditVoucher() {
    if (!editingPayment) return;
    if (!editVoucher) return toast('Adjunta un voucher para guardar', 'err');
    try {
      await uploadFile(`/payments/voucher/${editingPayment.id}`, editVoucher);
      toast('Voucher adjuntado');
      setEditingPayment(null);
      setEditVoucher(null);
      setEditVoucherUrl('');
      await load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function openHistory(row: P) {
    const request = ++historyRequest.current;
    setHistoryRow(row);
    setHistorySale(null);
    setHistoryLoading(true);
    try {
      // Endpoint dedicado: devuelve la venta del lote (aunque sea una
      // separacion pendiente) con el cronograma y los datos de cada pago.
      const lotId = Number(row.lotId || 0);
      const path = lotId > 0 ? `/sales/lot/${lotId}/history` : `/sales/payment/${row.id}/history`;
      const data = await api.get<any>(path);
      if (request !== historyRequest.current) return;
      if (data) {
        data.projectLogoUrl = projectsById.get(Number(data.sale?.projectId || row.projectId))?.logoImageUrl || '';
      }
      setHistorySale(data);
    } catch (e: any) {
      if (request === historyRequest.current) { toast(e.message, 'err'); setHistorySale(null); }
    } finally {
      if (request === historyRequest.current) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (historyRow) void openHistory(historyRow);
    // Re-fetch after a payment mutation; opening a history fetches it directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentRevision]);

  function paymentReportVisuals(kpis = summaryKpis, breakdown = paymentBreakdown) {
    // Generar respaldo SVG del resumen por Cliente
    const pieSvg = (() => {
      const max = Math.max(1, ...breakdown.map(row => row.value));
      const bars = breakdown.map((row, index) =>
        `<rect x="10" y="${10 + index * 45}" width="${Math.max(0, row.value) / max * 280}" height="25" rx="3" fill="${row.color}" />`
      ).join('');
      return `<svg width="300" height="190" viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
    })();

    // Generar SVG del gráfico de barras
    const barSvg = (() => {
      if (!paymentVsDelinquency.length) return '';
      
      const width = 500;
      const height = 250;
      const padding = { top: 20, right: 20, bottom: 40, left: 60 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      
      const maxVal = Math.max(...paymentVsDelinquency.flatMap(d => [d.pagado, d.moroso]));
      const yScale = chartHeight / Math.max(1, maxVal);
      const barWidth = chartWidth / paymentVsDelinquency.length / 2.5;
      
      const bars = paymentVsDelinquency.map((d, i) => {
        const x = padding.left + (i * chartWidth / paymentVsDelinquency.length) + barWidth * 0.3;
        const h1 = d.pagado * yScale;
        const h2 = d.moroso * yScale;
        
        return `
          <rect x="${x}" y="${padding.top + chartHeight - h1}" width="${barWidth}" height="${h1}" fill="${BLUE}" rx="2" />
          <rect x="${x + barWidth}" y="${padding.top + chartHeight - h2}" width="${barWidth}" height="${h2}" fill="${RED}" rx="2" />
        `;
      }).join('');
      
      const labels = paymentVsDelinquency.map((d, i) => {
        const x = padding.left + (i * chartWidth / paymentVsDelinquency.length) + barWidth * 0.8;
        return `<text x="${x}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#64748B">${d.month}</text>`;
      }).join('');
      
      return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${bars}
        ${labels}
      </svg>`;
    })();
    

    
    const webPieSvg = (breakdown === paymentBreakdown ? document.querySelector('#payments-distribution-chart svg.recharts-surface')?.outerHTML : '') || pieSvg;
    const webBarSvg = document.querySelector('#chart-composed svg.recharts-surface')?.outerHTML || barSvg;
    const cards = kpis.map(({ label, value, helper, accent }) => [label, value, helper, accent]);
    const cardIcons = Array.from(document.querySelectorAll('#payments-primary-kpis .kpi-label svg')).map(svg => svg.outerHTML);
    const cardsHtml = cards.map(([label, value, helper, color], index) => `<div class="kpi" style="border-top-color:${color}"><span class="kpi-label"><i style="color:${color};background:${color}1F">${cardIcons[index] || ''}</i>${escapeHtml(label)}</span><strong style="color:${color}">${escapeHtml(value)}</strong><small>${escapeHtml(helper).replace(/^(\(?\d+\)?)(\s)/, '<b>$1</b>$2')}</small></div>`).join('');
    let chartImages = '';
    if (webPieSvg || webBarSvg) {
      chartImages = `
        <div class="charts">
          ${webPieSvg ? `<div class="chart-container">
            <h3 style="margin:0 0 10px 0;font-size:12px;font-weight:700;color:#0B2F6E">Pago de lotes - Resumen por Cliente</h3>
            <div style="text-align:center">${webPieSvg}</div>
            <div style="margin-top:10px;font-size:9px">
              ${breakdown.filter(r => r.value > 0).map(row => `
                <div style="display:flex;justify-content:space-between;margin:3px 0">
                  <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${row.color};margin-right:5px"></span>${row.name}</span>
                  <strong>${escapeHtml(usdMoney(row.value))}</strong>
                </div>
              `).join('')}
            </div>
          </div>` : ''}
          ${webBarSvg ? `<div class="chart-container">
            <h3 style="margin:0 0 10px 0;font-size:12px;font-weight:700;color:#0B2F6E">Pagos vs Morosidad</h3>
            <div style="text-align:center">${webBarSvg}</div>
            <div style="margin-top:10px;font-size:9px;display:flex;justify-content:center;gap:20px">
              <span><span style="display:inline-block;width:10px;height:10px;background:${BLUE};margin-right:5px"></span>Pagado</span>
              <span><span style="display:inline-block;width:10px;height:10px;background:${RED};margin-right:5px"></span>Moroso</span>
            </div>
          </div>` : ''}
        </div>
      `;
    }
    

    
    return { cardsHtml, chartImages };
  }

  async function exportMonthPdf() {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (lockedProjectId) q.set('projectId', String(lockedProjectId));
    q.set('page', '1');
    q.set('limit', '100');
    if (payFromDate) q.set('from', payFromDate);
    if (payToDate) q.set('to', payToDate);

    let sourceRows = rows;
    try {
      sourceRows = [];
      for (let pageNo = 1; ; pageNo++) {
        q.set('page', String(pageNo));
        const back = (await api.get<any>(`/payments?${q.toString()}`)) || {};
        sourceRows.push(...(Array.isArray(back) ? back : back.items || []));
        if (Array.isArray(back) || pageNo >= Number(back.totalPages || 1)) break;
      }
    } catch {
      sourceRows = rows;
    }

    const monthRows = sourceRows.filter((payment) => {
      const rawDate = String(payment.paidAt || payment.dueDate || '').slice(0, 10);
      const term = paySearch.trim().toLowerCase();
      if (term && !`${payment.lotCode || ''} ${payment.clientName || ''} ${payment.reference || ''}`.toLowerCase().includes(term)) return false;

      if (payFromDate && rawDate < payFromDate) return false;
      if (payToDate && rawDate > payToDate) return false;

      return true;
    });
    if (!monthRows.length && !clientReportRows.length) return toast('No hay datos para descargar', 'err');

    const total = monthRows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const dateRange = payFromDate && payToDate
      ? `${formatDate(payFromDate)} - ${formatDate(payToDate)}`
      : payFromDate
        ? `Desde ${formatDate(payFromDate)}`
        : payToDate
          ? `Hasta ${formatDate(payToDate)}`
          : 'Todos los registros';
    const generatedAt = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' });

    const { cardsHtml, chartImages } = paymentReportVisuals();

    const operationTotals = monthRows.reduce((acc, payment) => {
      acc.area += operationAreaOf(payment); acc.sale += Number(payment.salePrice || 0);
      acc.initial += operationInitialOf(payment); acc.installment += operationFinancingCuotaOf(payment);
      acc.registered += paymentUsd(payment);
      if (payment.status === 'pagado') acc.paid += paymentUsd(payment);
      return acc;
    }, { area: 0, sale: 0, initial: 0, installment: 0, registered: 0, paid: 0 });
    const bodyRows = [...monthRows].sort(comparePaymentRows).map((payment) => `
      <tr>
        <td>P${payment.id}</td>
        <td>${escapeHtml(payment.lotCode || `Lote ${payment.lotId}`)}</td>
        <td>${operationAreaOf(payment).toLocaleString('es-PE', { maximumFractionDigits: 2 })} m²</td>
        <td>${escapeHtml(payment.clientName || '-')}</td>
        <td class="num">${payment.salePrice ? usdMoney(payment.salePrice) : '-'}</td>
        <td>${escapeHtml(payment.conceptLabel || TYPE_LABEL[payment.type] || payment.type || '-')}</td>
        <td class="num">${operationInitialOf(payment) ? usdMoney(operationInitialOf(payment)) : '-'}</td>
        <td class="num">${operationFinancingCuotaOf(payment) ? usdMoney(operationFinancingCuotaOf(payment)) : '-'}</td>
        <td>${escapeHtml(METHOD_LABEL[payment.paymentMethod || ''] || payment.paymentMethod || '-')}</td>
        <td class="num">${usdMoney(paymentUsd(payment))}</td>
        <td class="num">${payment.status === 'pagado' ? usdMoney(paymentUsd(payment)) : '-'}</td>
        <td>${escapeHtml(payment.status || '-')}</td>
        <td>${escapeHtml(formatDate(payment.paidAt))}</td>
        <td>${escapeHtml(payment.receivedByName || '-')}</td>
      </tr>
    `).join('');

    const clientRowsHtml = clientReportRows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.lotCode)}</td><td class="num">${row.area.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</td><td>${escapeHtml(row.clientName)}</td><td class="num">${usdMoney(row.salePrice)}</td><td class="num">${usdMoney(row.initialUsd)}</td><td class="num">${usdMoney(row.paidUsd)} (${row.paidCount})</td><td class="num">${usdMoney(row.pendingUsd)} (${row.pendingCount})</td><td class="num">${usdMoney(row.interestUsd)}</td>
                            <td class="num">${usdMoney(row.overdueUsd)} (${row.overdueCount})</td></tr>`).join('');
    const clientTable = `<table><thead><tr><th>Id</th><th>Lote</th><th>Area (m²)</th><th>Cliente</th><th>Precio Venta<br>${displaySymbol()}</th><th>Cuota Inicial<br>${displaySymbol()}</th><th>Capital<br>pagado</th><th>Capital<br>por pagar</th><th>Interes pagado<br>${displaySymbol()}</th><th>Cuotas<br>en mora</th></tr></thead><tbody>${clientRowsHtml}</tbody><tfoot><tr><td colspan="2">Total</td><td>${clientReportTotals.area.toLocaleString('es-PE', { maximumFractionDigits: 2 })} m²</td><td></td><td>${usdMoney(clientReportTotals.salePrice)}</td><td>${usdMoney(clientReportTotals.initialUsd)}</td><td>${usdMoney(clientReportTotals.paidUsd)} (${clientReportTotals.paidCount})</td><td>${usdMoney(clientReportTotals.pendingUsd)} (${clientReportTotals.pendingCount})</td><td>${usdMoney(clientReportTotals.interestUsd)}</td>
                          <td>${usdMoney(clientReportTotals.overdueUsd)} (${clientReportTotals.overdueCount})</td></tr></tfoot></table>`;
    printHtml(`
      <html>
        <head>
          <meta charset="utf-8" /><meta name="viewport" content="width=1200, initial-scale=1" /><title>Historial de pagos - ${escapeHtml(dateRange)}</title>
          <style>${PAYMENT_REPORT_STYLES}</style>

        </head>
        <body>
          ${paymentReportHeader('Historial de pagos', dateRange, generatedAt)}
          <div class="summary">${cardsHtml}</div>
          ${chartImages}
          ${historyView === 'client' ? clientTable : `<table class="operations-table">
            <colgroup>${[3, 4, 5, 12, 8, 8, 7, 7, 7, 8, 7, 6, 7, 11].map(width => `<col style="width:${width}%">`).join('')}</colgroup>
            <thead>
              <tr><th>Id</th><th>Lote</th><th>Area m²</th><th>Cliente</th><th>Precio venta</th><th>Tipo de pago</th><th>Inicial ${displaySymbol()}</th><th>Cuota Financ. ${displaySymbol()}</th><th>Medio de pago</th><th>Monto registrado</th><th>Pagado ${displaySymbol()}</th><th>Estado</th><th>Pagado</th><th>Recepciona pago</th></tr>
            </thead>
            <tbody>${bodyRows}</tbody><tfoot><tr><td colspan="2">Totales (${monthRows.length})</td><td colspan="7"></td><td class="num">${usdMoney(operationTotals.registered)}</td><td class="num">${usdMoney(operationTotals.paid)}</td><td colspan="3"></td></tr></tfoot>
          </table>`}
          <div class="footer">Dunacon - CRM Inmobiliario</div>
        </body>
      </html>
    `);
  }

  function exportClientReportPdf(scope: 'general' | 'client') {
    const source = scope === 'client' ? clientReportRows : allClientReportRows;
    if (scope === 'client' && !paySearch.trim()) return toast('Busca primero el cliente que quieres descargar', 'err');
    if (!source.length) return toast(scope === 'client' ? 'No hay datos para ese cliente' : 'No hay datos para descargar', 'err');
    const title = scope === 'client' ? 'Pago de lotes por Cliente' : 'Pago de lotes Gerencial';
    const totals = source.reduce((acc, row) => {
      acc.area += row.area; acc.salePrice += row.salePrice; acc.initialUsd += row.initialUsd; acc.totalCuotas += row.totalCuotas;
      acc.paidCount += row.paidCount; acc.paidUsd += row.paidUsd; acc.pendingCount += row.pendingCount; acc.pendingUsd += row.pendingUsd;
      acc.interestUsd += row.interestUsd; acc.pendingInterestUsd += row.pendingInterestUsd; acc.overdueCount += row.overdueCount; acc.overdueUsd += row.overdueUsd;
      return acc;
    }, { area: 0, salePrice: 0, initialUsd: 0, totalCuotas: 0, paidCount: 0, paidUsd: 0, pendingCount: 0, pendingUsd: 0, interestUsd: 0, pendingInterestUsd: 0, overdueCount: 0, overdueUsd: 0 });
    const dateRange = payFromDate && payToDate ? `${formatDate(payFromDate)} - ${formatDate(payToDate)}`
      : payFromDate ? `Desde ${formatDate(payFromDate)}` : payToDate ? `Hasta ${formatDate(payToDate)}` : 'Todos los registros';
    const generatedAt = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' });
    const exportedKpis = summaryKpis.map(item => ({ ...item, value: ({
      'Total Venta': `${usdMoney(totals.salePrice)} (${source.length})`,
      'Cuotas Pendientes': `${usdMoney(totals.pendingUsd)} (${totals.pendingCount})`,
      'Cuotas Iniciales': `${usdMoney(totals.initialUsd)} (${source.filter(row => row.initialUsd > 0).length})`,
      'Pagos de cuotas de financiamiento': `${usdMoney(totals.paidUsd)} (${totals.paidCount})`,
      'Interes pagado': usdMoney(totals.interestUsd),
      'Cuotas en Mora': `${usdMoney(totals.overdueUsd)} (${totals.overdueCount})`,
      'Morosidad %': pct(clientDelinquencyRate(totals.pendingUsd, totals.overdueUsd)),
    } as Record<string, string>)[item.label] ?? item.value,
    helper: item.label === 'Pagos de cuotas de financiamiento' ? `Capital pagado de ${totals.totalCuotas} cuotas` : item.helper })).map(countInDescription);
    const exportedBreakdown = paymentBreakdown.map(item => ({ ...item, value: ({
      inicial: totals.initialUsd, cuotas: totals.paidUsd, pendientes: totals.pendingUsd, mora: totals.overdueUsd,
    } as Record<string, number>)[item.key] ?? 0 }));
    const { cardsHtml, chartImages } = paymentReportVisuals(exportedKpis, paySearch.trim() ? exportedBreakdown : paymentBreakdown);
    const bodyRows = source.map((row, index) => `
      <tr>
        <td>${index + 1}</td><td>${escapeHtml(row.lotCode)}</td><td class="num">${row.area.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</td>
        <td>${escapeHtml(row.clientName)}</td><td class="num">${usdMoney(row.salePrice)}</td><td class="num">${usdMoney(row.initialUsd)}</td>
        <td class="num">${row.totalCuotas}</td><td class="num">${row.paidCount}</td><td class="num">${usdMoney(row.paidUsd)}</td>
        <td class="num">${row.pendingCount}</td><td class="num">${usdMoney(row.pendingUsd)}</td><td class="num">${usdMoney(row.interestUsd)}</td>

        <td class="num">${row.overdueCount}</td><td class="num">${usdMoney(row.overdueUsd)}</td>
      </tr>
    `).join('');
    printHtml(`
      <html><head><meta charset="utf-8" /><meta name="viewport" content="width=1200, initial-scale=1" /><title>${escapeHtml(title)}</title><style>${PAYMENT_REPORT_STYLES}</style></head><body>
        ${paymentReportHeader(title, dateRange, generatedAt)}
        ${scope === 'general' ? `<div class="summary">${cardsHtml}</div>${chartImages}` : ''}
        <table class="operations-table"><colgroup>${[3, 5, 5, 15, 8, 8, 6, 5, 8, 5, 9, 8, 6, 9].map(width => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr>

          <th>Id</th><th>Lote</th><th>Area (m2)</th><th>Cliente</th><th>Precio Venta ${displaySymbol()}</th><th>Cuota Inicial ${displaySymbol()}</th>
          <th>Total Cuotas Financ.</th><th>Capital pagado (#)</th><th>Capital pagado ${displaySymbol()}</th>
          <th>Capital por pagar (#)</th><th>Capital por pagar ${displaySymbol()}</th><th>Interes pagado ${displaySymbol()}</th>
          <th>Cuotas en mora #</th><th>Cuotas en mora ${displaySymbol()}</th>
        </tr></thead><tbody>${bodyRows}</tbody><tfoot><tr>
          <td colspan="2">Total</td><td class="num">${totals.area.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</td><td></td>
          <td class="num">${usdMoney(totals.salePrice)}</td><td class="num">${usdMoney(totals.initialUsd)}</td>
          <td class="num">${totals.totalCuotas}</td><td class="num">${totals.paidCount}</td><td class="num">${usdMoney(totals.paidUsd)}</td>
          <td class="num">${totals.pendingCount}</td><td class="num">${usdMoney(totals.pendingUsd)}</td><td class="num">${usdMoney(totals.interestUsd)}</td>
          <td class="num">${totals.overdueCount}</td><td class="num">${usdMoney(totals.overdueUsd)}</td>
        </tr></tfoot></table><div class="footer">Dunacon - CRM Inmobiliario</div>
      </body></html>
    `);
  }

  const historyLedger = historySale ? clientPaymentHistoryRows(historySale) : [];
  const historyLedgerTotals = clientPaymentHistoryTotals(historyLedger, historySale?.sale);

  const st = (p: P) => { const bg = BADGE[p.status] || ['#eaedf1', '#6b7280']; return <span className="badge" style={{ background: bg[0], color: bg[1] }}>{p.status}</span>; };

  const filteredRows = (() => {
    const term = paySearch.trim().toLowerCase();
    const base = !term ? rows : rows.filter((p) => {
      const code = String(p.lotCode || `lote ${p.lotId ?? ''}`).toLowerCase();
      const name = String(p.clientName || '').toLowerCase();
      const ref = String(p.reference || '').toLowerCase();
      return code.includes(term) || name.includes(term) || ref.includes(term);
    });
    return [...base].sort(comparePaymentRows);
  })();

  function paymentUsd(payment: P) {
    const usd = payment.amountUsd != null ? Number(payment.amountUsd) : Number(payment.amount || 0);
    return Number.isFinite(usd) ? usd : 0;
  }
  const totalPagado = filteredRows.filter((p) => p.status === 'pagado').reduce((s, p) => s + paymentUsd(p), 0);
  const totalRegistrado = filteredRows.reduce((s, p) => s + paymentUsd(p), 0);
  const totalPrecioVenta = filteredRows.reduce((s, p) => s + Number(p.salePrice || 0), 0);
  const totalPagadoUsd = filteredRows
    .filter((p) => p.status === 'pagado')
    .reduce((sum, p) => sum + paymentUsd(p), 0);
  const pctPago = totalPrecioVenta > 0 ? (totalPagado / totalPrecioVenta) * 100 : 0;
  const saleForPayment = (payment: P) => clientReportSales.find((sale) => Number(sale.lotId) === Number(payment.lotId));
  const operationAreaOf = (payment: P) => Number(payment.lotAreaM2 ?? saleForPayment(payment)?.lotAreaM2 ?? 0);
  const operationInitialOf = (payment: P) => Number(payment.cuotaInicial ?? saleForPayment(payment)?.cuotaInicial ?? 0);
  const operationFinancingCuotaOf = (payment: P) => Number(payment.valorCuota ?? saleForPayment(payment)?.valorCuota ?? 0);
  const paymentSummaryRows = Array.from(clientReportPayments.reduce((map, payment) => {
    const key = `${Number(payment.lotId || 0)}-${Number(payment.clientId || 0)}-${payment.clientName || ''}`;
    const isFinancing = ['cuota', 'primera_cuota'].includes(String(payment.type || payment.concept || ''));
    const isInitial = operationInitialOf(payment) > 0;
    const isPaid = String(payment.status) === 'pagado';
    const isOverdue = !isPaid && !!payment.dueDate && String(payment.dueDate).slice(0, 10) < new Date().toISOString().slice(0, 10);
    const current = map.get(key) || {
      id: Number(payment.lotId || payment.id || 0),
      lotCode: payment.lotCode || `Lote ${payment.lotId}`,
      area: operationAreaOf(payment),
      clientName: payment.clientName || '-',
      salePrice: Number(payment.salePrice || 0),
      initialUsd: 0,
      initialPaidUsd: 0,
      initialPaidCount: 0,
      totalCuotas: 0,
      paidCount: 0,
      paidUsd: 0,
      pendingCount: 0,
      pendingUsd: 0,
      interestUsd: 0,
      totalInterestUsd: 0,
      pendingInterestUsd: 0,
      capitalDifference: 0,
      roundingDifference: 0,
      overdueCount: 0,
      overdueUsd: 0,
    };
    current.area = current.area || operationAreaOf(payment);
    current.salePrice = current.salePrice || Number(payment.salePrice || 0);
    current.initialUsd = Math.max(current.initialUsd, operationInitialOf(payment));
    if (isInitial && isPaid) {
      current.initialPaidUsd += paymentUsd(payment);
      current.initialPaidCount += 1;
    }
    if (operationFinancingCuotaOf(payment) > 0) current.totalCuotas += 1;
    if (isFinancing && isPaid) {
      current.paidCount += 1;
      current.paidUsd += paymentUsd(payment);
    }
    if (isFinancing && !isPaid) {
      current.pendingCount += 1;
      current.pendingUsd += paymentUsd(payment);
    }
    if (isFinancing && isOverdue) {
      current.overdueCount += 1;
      current.overdueUsd += paymentUsd(payment);
    }
    map.set(key, current);
    return map;
  }, new Map<string, any>()).values());
  const historyReportRows = Object.values(clientReportHistories).filter((history: any) => history?.sale).map((history: any) => {
    const installments = (history.installments || []) as any[];
    const paid = installments.filter(row => row.paid);
    const pending = installments.filter(row => !row.paid && !row.reduced);
    const financingPending = pendingInstallments(installments);
    const financing = financingCapitalAndInterest(history);
    const dashboardAmounts = lotPaymentSummary(history);
    const financingOverdue = overdueInstallments(installments);
    const initials = (history.plan || []).filter((row: any) => row.kind === 'cuota_inicial');
    const paidInitials = initials.filter((row: any) => row.paid);
    const sum = (items: any[]) => items.reduce((total, row) => total + Number(row.amount || 0), 0);
    return {
      id: Number(history.sale.lotId), lotId: Number(history.sale.lotId),
      lotCode: history.lot?.code || history.lotCode || `Lote ${history.sale.lotId}`,
      area: Number(history.lot?.areaM2 || 0), clientName: history.client?.fullName || history.clientName || '-',
      salePrice: Number(history.sale.salePrice || 0), initialUsd: dashboardAmounts.initial,
      initialPaidUsd: sum(paidInitials), initialPaidCount: paidInitials.length,
      totalCuotas: Number(history.summary?.effectiveTotalCuotas ?? installments.length), paidCount: paid.length, paidUsd: dashboardAmounts.capital,
      pendingCount: financingPending.count, pendingUsd: financing.pendingCapital, interestUsd: financing.paidInterest,
      totalInterestUsd: financing.paidInterest + financing.pendingInterest,
      pendingInterestUsd: financing.pendingInterest,
      capitalDifference: financing.capitalDifference,
      roundingDifference: financing.roundingDifference,
      overdueCount: financingOverdue.count, overdueUsd: financingOverdue.amount,
    };
  });
  const historyLotIds = new Set(historyReportRows.map(row => row.id));
  const allClientReportRows = [...historyReportRows, ...paymentSummaryRows.filter(row => !historyLotIds.has(row.id))];
  const clientReportRows = allClientReportRows.filter((row) => {
    const term = paySearch.trim().toLowerCase();
    if (!term) return true;
    return `${row.lotCode} ${row.clientName}`.toLowerCase().includes(term);
  });
  const clientReportTotals = clientReportRows.reduce((acc, row) => {
    acc.area += row.area;
    if (row.initialUsd > 0) acc.initialCount += 1;
    acc.salePrice += row.salePrice;
    acc.initialUsd += row.initialUsd;
    acc.initialPaidUsd += row.initialPaidUsd;
    acc.initialPaidCount += row.initialPaidCount;
    acc.totalCuotas += row.totalCuotas;
    acc.paidCount += row.paidCount;
    acc.paidUsd += row.paidUsd;
    acc.pendingCount += row.pendingCount;
    acc.pendingUsd += row.pendingUsd;
    acc.interestUsd += row.interestUsd;
    acc.totalInterestUsd += row.totalInterestUsd;
    acc.pendingInterestUsd += row.pendingInterestUsd;
    acc.capitalDifference += row.capitalDifference;
    acc.roundingDifference += row.roundingDifference;
    acc.overdueCount += row.overdueCount;
    acc.overdueUsd += row.overdueUsd;
    return acc;
  }, { area: 0, initialCount: 0, salePrice: 0, initialUsd: 0, initialPaidUsd: 0, initialPaidCount: 0, totalCuotas: 0, paidCount: 0, paidUsd: 0, pendingCount: 0, pendingUsd: 0, interestUsd: 0, totalInterestUsd: 0, pendingInterestUsd: 0, capitalDifference: 0, roundingDifference: 0, overdueCount: 0, overdueUsd: 0 });
  const pendingPct = meta.total > 0 ? (meta.pendingCount / meta.total) * 100 : 0;
  const byMonth = (cash?.byMonth || []) as { month: string; monto: number }[];
  const salesByMonth = (cash?.salesByMonth || []) as { month: string; monto: number }[];
  const overdueByMonth = (cash?.overdueByMonth || []) as { month: string; monto: number }[];
  const methods = (cash?.methods || []) as { method: string; total: number; monto: number }[];
  const metrics = cash?.metrics || {};
  // Los cuadros resumen siempre el reporte por Cliente; la vista solo cambia la tabla.
  const kpiSource = {
    initialPaymentAmount: clientReportTotals.initialUsd,
    initialPaymentCount: clientReportTotals.initialCount,
    financedCuotas: clientReportTotals.totalCuotas,
    pendingAmount: clientReportTotals.pendingUsd,
    overduePayments: clientReportTotals.overdueCount,
    overdueAmount: clientReportTotals.overdueUsd,
    upcomingPayments: clientReportTotals.pendingCount,
    upcomingAmount: clientReportTotals.pendingUsd,
    totalSaleLots: clientReportRows.length,
    totalSaleAmount: clientReportTotals.salePrice,
    financingAmount: clientReportTotals.paidUsd,
    paidCuotas: clientReportTotals.paidCount,
    paidCuotasAmount: clientReportTotals.paidUsd,
    delinquencyRate: clientDelinquencyRate(clientReportTotals.pendingUsd, clientReportTotals.overdueUsd),
  };
  const kpiMoney = usdMoney;
  const totalCollected = Number(metrics.paidCuotasAmount ?? sumRows(methods));
  const totalSalesApproved = Number(metrics.totalSaleAmount ?? sumRows(salesByMonth));
  const totalOverdue = Number(metrics.overdueAmount ?? sumRows(overdueByMonth));
  const collectionRate = totalSalesApproved > 0 ? (totalCollected / totalSalesApproved) * 100 : 0;
  const delinquencyRate = Number(kpiSource.delinquencyRate ?? ((totalCollected + totalOverdue) > 0 ? (totalOverdue / (totalCollected + totalOverdue)) * 100 : 0));
  const amountWithCount = (amount: number, count: number) => `${kpiMoney(amount || 0)} (${count || 0})`;
  const summaryKpis = [
    { label: 'Total Venta', value: amountWithCount(kpiSource.totalSaleAmount, kpiSource.totalSaleLots), helper: 'Ventas y separaciones', icon: <FiDollarSign />, accent: BLUE },
    { label: 'Cuotas Pendientes', value: amountWithCount(kpiSource.pendingAmount, kpiSource.upcomingPayments), helper: 'Capital pendiente, sin intereses', icon: <FiDollarSign />, accent: BLUE },
    { label: 'Cuotas Iniciales', value: amountWithCount(kpiSource.initialPaymentAmount, kpiSource.initialPaymentCount), helper: 'Iniciales registradas', icon: <FiCreditCard />, accent: GREEN },
    { label: 'Pagos de cuotas de financiamiento', value: amountWithCount(kpiSource.paidCuotasAmount, kpiSource.paidCuotas), helper: `Capital pagado de ${kpiSource.financedCuotas || 0} cuotas`, icon: <FiTrendingUp />, accent: GREEN },
    { label: 'Interes pagado', value: kpiMoney(clientReportTotals.interestUsd), helper: 'Solo interes de cuotas pagadas', icon: <FiDollarSign />, accent: BLUE_DARK },
    { label: 'Cuotas en Mora', value: amountWithCount(kpiSource.overdueAmount, kpiSource.overduePayments), helper: 'Cuotas vencidas', icon: <FiAlertTriangle />, accent: RED },
    { label: 'Morosidad %', value: pct(delinquencyRate), helper: 'Mora sobre pendientes', icon: <FiActivity />, accent: AMBER },
  ].map(countInDescription);
  const paymentBreakdown = [
    { key: 'inicial', name: 'Cuotas Iniciales', value: kpiSource.initialPaymentAmount, color: BLUE },
    { key: 'cuotas', name: 'Pagos de cuotas de financiamiento', value: kpiSource.paidCuotasAmount, color: GREEN },
    { key: 'pendientes', name: 'Cuotas Pendientes', value: kpiSource.pendingAmount, color: AMBER },
    { key: 'mora', name: 'Cuotas en Mora', value: kpiSource.overdueAmount, color: RED },
  ];

  const lastSixMonths = byMonth.slice(-6);
  const lastSixSalesMonths = salesByMonth.slice(-6);
  const rangeMonths = (() => {
    const now = new Date();
    const months: string[] = [];
    for (let offset = salesRange - 1; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  })();
  const salesRangeRows = rangeMonths.map((month) => ({
    month,
    monto: Number(salesByMonth.find((r) => r.month === month)?.monto || 0),
  }));
  const salesByYear = (() => {
    const totals: Record<string, number> = {};
    for (const row of salesByMonth) {
      const year = String(row.month || '').slice(0, 4);
      if (!year) continue;
      totals[year] = (totals[year] || 0) + Number(row.monto || 0);
    }
    return Object.keys(totals).sort().map((year) => ({ label: year, monto: totals[year] }));
  })();
  const salesChartRows = (
    salesPeriod === 'year' ? salesByYear : salesRangeRows.map((r) => ({ label: r.month, monto: r.monto }))
  ).map((r) => ({ label: r.label, monto: r.monto }));
  const salesChartTotal = salesChartRows.reduce((sum, r) => sum + r.monto, 0);
  const salesChartLast = salesChartRows[salesChartRows.length - 1];
  const salesChartPrev = salesChartRows[salesChartRows.length - 2];
  const salesChartTrend = salesChartPrev && salesChartPrev.monto > 0
    ? ((salesChartLast?.monto || 0) - salesChartPrev.monto) / salesChartPrev.monto * 100
    : ((salesChartLast?.monto || 0) > 0 ? 100 : 0);
  // Formato corto para ejes de graficos segun la moneda activa.
  const shortCurrency = currency === 'USD' ? shortUsd : shortMoney;
  const paymentVsDelinquency = (() => {
    if (salesPeriod === 'year') {
      // Agrupar por año
      const paidByYear: Record<string, number> = {};
      const overdueByYear: Record<string, number> = {};
      
      for (const row of byMonth) {
        const year = String(row.month || '').slice(0, 4);
        if (!year) continue;
        paidByYear[year] = (paidByYear[year] || 0) + Number(row.monto || 0);
      }
      
      for (const row of overdueByMonth) {
        const year = String(row.month || '').slice(0, 4);
        if (!year) continue;
        overdueByYear[year] = (overdueByYear[year] || 0) + Number(row.monto || 0);
      }
      
      const years = Array.from(new Set([...Object.keys(paidByYear), ...Object.keys(overdueByYear)])).sort();
      return years.map((year) => ({
        month: year,
        pagado: (paidByYear[year] || 0),
        moroso: (overdueByYear[year] || 0),
      }));
    } else {
      // Usar rango de meses
      const paidRange = byMonth.filter((r) => rangeMonths.includes(r.month));
      const overdueRange = overdueByMonth.filter((r) => rangeMonths.includes(r.month));
      
      return mergeByMonth(paidRange, overdueRange)
        .map((row) => ({
          ...row,
          pagado: Number(row.pagado || 0),
          moroso: Number(row.moroso || 0),
        }));
    }
  })();
  const currentCollected = lastValue(byMonth);
  const previousCollected = previousValue(byMonth);
  const collectedTrend = variation(currentCollected, previousCollected);
  const currentSales = lastValue(salesByMonth);
  const previousSales = previousValue(salesByMonth);
  const salesTrend = variation(currentSales, previousSales);
  const currentOverdue = lastValue(overdueByMonth);
  const previousOverdue = previousValue(overdueByMonth);
  const overdueTrend = variation(currentOverdue, previousOverdue);
  const currentDelinquencyRate = currentCollected + currentOverdue > 0 ? (currentOverdue / (currentCollected + currentOverdue)) * 100 : 0;

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        {overdue.length > 0 && showOverdueAlert && (
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm" style={{ background: '#E7F0FE', borderColor: '#A9C9FB', color: '#1259C4' }}>
            <span><b>{overdue.length}</b> cuotas vencidas detectadas. Regístralas para actualizar la cartera.</span>
            <button
              type="button"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-white/60"
              onClick={() => setShowOverdueAlert(false)}
              aria-label="Cerrar aviso"
              title="Cerrar aviso"
            >
              <FiX />
            </button>
          </div>
        )}
        <div className="min-w-0">
          <div id="payments-primary-kpis" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7 [&_.card-card-kpi]:!px-2 [&_.kpi-label]:gap-1 [&_.kpi-label>span:first-child]:!h-6 [&_.kpi-label>span:first-child]:!w-6 [&_.kpi-label-text]:!text-[9px] [&_.kpi-label-text]:tracking-normal [&_.kpi-helper]:!text-[9px]">
            {summaryKpis.map((item) => (
              <KpiTile key={item.label} {...item} truncateLabel={false} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[30%_70%]">
      <div id="payments-distribution-chart" className="card overflow-hidden p-0">
        <ChartHeader
          title="Pago de lotes"
              subtitle="Resumen de Pago de Lotes por Cliente"
              menuRows={paymentBreakdown.map((row) => [row.name, usdMoney(row.value)] as [string, string])}
            />
            {paymentBreakdown.some(row => row.value > 0) ? (
              <div className="px-3 pt-4 sm:px-4 sm:pt-5">
                <div className="mx-auto h-[220px] w-full max-w-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={paymentBreakdown} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={shortUsd} tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="name" hide />
                      <Tooltip formatter={(value: number) => usdMoney(Number(value || 0))} />
                      <Bar dataKey="value" name="Monto US$" radius={[0, 3, 3, 0]}>
                        {paymentBreakdown.map(row => <Cell key={row.key} fill={row.color} />)}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5 pb-4">
                  {paymentBreakdown.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3 text-xs">
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate" style={{ color: MUTED }}>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} /> {row.name}
                      </span>
                      <b className="shrink-0 tabular-nums" style={{ color: INK }}>
                        {usdMoney(row.value)}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            ) : <EmptyChart text="Sin montos para distribuir todavia." />}
          </div>

          <div id="chart-composed" className="card overflow-hidden p-0">
            <ChartHeader
              title={`Pagos vs Morosidad - ${salesPeriod === 'year' ? 'Año' : 'Mes'}`}
              subtitle={salesPeriod === 'year' ? 'Histórico por año' : (salesRange === 3 ? 'Últimos 3 meses' : 'Últimos 6 meses')}
              menuRows={[
                ['Pagado actual', show(currentCollected)],
                ['Moroso actual', show(currentOverdue)],
                ['Mora mes anterior', show(previousOverdue)],
                ['Morosidad', pct(currentDelinquencyRate || delinquencyRate)],
              ]}
              actions={
                <div className="flex flex-wrap items-center gap-1">
                  {([['month', 'Mes'], ['year', 'Año']] as const).map(([value, label]) => {
                    const active = salesPeriod === value;
                    return (
                      <button key={value} type="button" onClick={() => setSalesPeriod(value)} className="h-7 rounded-md border px-2 text-[11px] font-semibold transition-colors" style={{ borderColor: active ? BLUE : BORDER, background: active ? BLUE : '#fff', color: active ? '#fff' : MUTED }}>
                        {label}
                      </button>
                    );
                  })}
                  {salesPeriod === 'month' && ([3, 6] as const).map((value) => {
                    const active = salesRange === value;
                    return (
                      <button key={value} type="button" onClick={() => setSalesRange(value)} className="h-7 rounded-md border px-2 text-[11px] font-semibold transition-colors" style={{ borderColor: active ? BLUE : BORDER, background: active ? BLUE : '#fff', color: active ? '#fff' : MUTED }}>
                        {value}m
                      </button>
                    );
                  })}
                </div>
              }
            />
            {paymentVsDelinquency.length ? (
              <div className="w-full px-2 pt-4 pb-3 sm:h-[330px] sm:px-4 sm:pt-5">
                <div className="h-[260px] w-full sm:h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={paymentVsDelinquency} margin={{ left: 0, right: isNarrow ? 4 : 16, top: 12, bottom: 4 }}>
                      <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickFormatter={salesPeriod === 'year' ? (v: string) => v : (isNarrow ? monthLabelShort : monthLabel)}
                        tick={{ fontSize: isNarrow ? 10 : 11, fill: MUTED }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={isNarrow ? 16 : 8}
                        tickMargin={6}
                      />
                      <YAxis yAxisId="left" tickFormatter={shortCurrency} tick={{ fontSize: isNarrow ? 9 : 11, fill: MUTED }} axisLine={false} tickLine={false} width={isNarrow ? 40 : 62} tickMargin={4} />
                      {!isNarrow && (
                        <YAxis yAxisId="right" orientation="right" tickFormatter={shortCurrency} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={62} tickMargin={4} />
                      )}
                      <Tooltip content={<FinanceTooltip formatter={show} />} />
                      <Bar yAxisId="left" dataKey="pagado" name="Pagado" stackId="cash" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={46} />
                      <Bar yAxisId="left" dataKey="moroso" name="Moroso" stackId="cash" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={46} />
                      {!isNarrow && (
                        <Line yAxisId="right" type="monotone" dataKey="moroso" name="Moroso" stroke={RED} strokeWidth={2} dot={{ r: 3, fill: '#fff', stroke: RED, strokeWidth: 2 }} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 pb-3 text-xs">
                  <span className="inline-flex items-center gap-1.5" style={{ color: BLUE }}><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BLUE }} /> Pagado</span>
                  <span className="inline-flex items-center gap-1.5" style={{ color: RED }}><span className="h-2.5 w-2.5 rounded-full" style={{ background: RED }} /> Moroso</span>
                </div>
              </div>
            ) : <EmptyChart text="Sin pagos o morosidad para comparar." />}
          </div>
        </div>
        <div className="card min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
              <h3 className="w-full font-semibold sm:w-auto">Historial de pagos</h3>
              <div className="grid w-full min-w-0 grid-cols-2 overflow-hidden rounded-md border bg-white sm:inline-flex sm:w-auto" style={{ borderColor: BORDER }}>
                <button type="button" className={`min-w-0 whitespace-normal px-2 py-2 text-xs font-semibold sm:px-3 sm:py-1.5 ${historyView === 'operation' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`} style={historyView === 'operation' ? { background: '#000080' } : undefined} onClick={() => setHistoryView('operation')}>
                  Pago de lotes por Operacion
                </button>
                <button type="button" className={`min-w-0 whitespace-normal px-2 py-2 text-xs font-semibold sm:px-3 sm:py-1.5 ${historyView === 'client' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`} style={historyView === 'client' ? { background: '#000080' } : undefined} onClick={() => setHistoryView('client')}>
                  Pago de lotes por Cliente
                </button>
              </div>
              {canViewAudit && (
                <button
                  type="button"
                  className="btn-neutral hidden !h-8 !px-3 text-xs sm:inline-flex"
                  onClick={() => { setAuditPage(1); setAuditOpen(true); }}
                >
                  Auditoria
                </button>
              )}
              {historyView === 'client' && (
                <button className="btn-primary !h-8 whitespace-nowrap text-xs" onClick={() => setOpen(true)}>Registrar pago</button>
              )}
            </div>
            <div className="flex w-full min-w-0 flex-col gap-2 xl:w-full xl:flex-row xl:flex-nowrap xl:items-center">
              <div className="grid w-full min-w-0 grid-cols-2 gap-2 xl:flex xl:flex-wrap xl:items-center [&>*]:min-w-0 [&_.input]:min-w-0 [&_.input]:max-w-full max-sm:[&_.input]:px-2 max-sm:[&_.input]:text-xs max-sm:[&_button]:min-w-0 max-sm:[&_button]:max-w-full max-sm:[&_button]:whitespace-normal max-sm:[&_button]:px-2 max-sm:[&_button]:text-xs">
                <div className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:col-span-1 sm:block">
                  {canViewAudit && <button type="button" className="btn-neutral !h-8 !px-3 text-xs sm:hidden" onClick={() => { setAuditPage(1); setAuditOpen(true); }}>Auditoria</button>}
                <Select
                  value={status}
                  onChange={setStatus}
                  className="w-full xl:!w-auto"
                  options={[{ value: '', label: 'Estado: todos' }, { value: 'pagado', label: 'Pagado' }, { value: 'pendiente', label: 'Pendiente' }, { value: 'vencido', label: 'Vencido' }]}
                />
                </div>
                <input
                  className="input col-span-2 w-full sm:col-span-1 xl:!w-64"
                  placeholder="Buscar por lote, cliente o referencia"
                  value={paySearch}
                  onChange={(e) => setPaySearch(e.target.value)}
                  aria-label="Buscar por codigo de lote o nombre de cliente"
                />
                <input
                  className="input w-full xl:!w-auto"
                  type="date"
                  value={payFromDate}
                  onChange={(e) => setPayFromDate(e.target.value)}
                  aria-label="Fecha desde"
                  title="Desde"
                />
                <input
                  className="input w-full xl:!w-auto"
                  type="date"
                  value={payToDate}
                  onChange={(e) => setPayToDate(e.target.value)}
                  aria-label="Fecha hasta"
                  title="Hasta"
                />
              {(payFromDate || payToDate) && (
                <button type="button" className="btn-neutral !h-10 w-full whitespace-nowrap text-xs xl:w-auto" onClick={() => { setPayFromDate(''); setPayToDate(''); }}>
                  Limpiar fechas
                </button>
              )}
              {historyView === 'client' && (
                <>
                  <button className="btn-outline !h-8 whitespace-nowrap text-xs" type="button" onClick={() => exportClientReportPdf('client')}>Descargar PDF Cliente</button>
                  <button className="btn-outline !h-8 whitespace-nowrap text-xs" type="button" onClick={() => exportClientReportPdf('general')}>Descargar PDF Gerencial</button>
                </>
              )}
              {historyView === 'operation' ? (
                <button className="btn-outline w-full whitespace-nowrap xl:w-auto" type="button" onClick={exportMonthPdf}>Descargar PDF</button>
              ) : null}
              {historyView === 'operation' && (
                <button className="btn-primary w-full whitespace-nowrap xl:w-auto" onClick={() => setOpen(true)}>Registrar pago</button>
              )}
              </div>
            </div>
          </div>
        </div>
        {historyView === 'operation' ? (
          <div className="card p-0 overflow-auto">
            {loading ? <p className="p-4 text-slate-400">Cargando…</p>
              : filteredRows.length === 0 ? <EmptyState text={paySearch ? 'No hay pagos que coincidan con la busqueda.' : 'No hay pagos con esos filtros.'} />
                : (
                  <>
                    <p className="px-4 py-2 text-xs text-slate-400 md:hidden">Desliza la tabla hacia la derecha para ver mas columnas.</p>
                    <table className="table-base table-head-plomo [&_th]:!px-1.5 [&_th]:!py-1 [&_th]:!text-[9px] [&_th]:!whitespace-normal [&_th]:!leading-tight [&_td]:!px-1.5 [&_td]:!py-1 [&_td]:!text-[11px]" style={{ width: '100%' }}>
                      <thead><tr>
                        <th className="th-base">Id</th><th className="th-base">Lote</th><th className="th-base">Área m²</th><th className="th-base">Cliente</th>
                        <th className="th-base">Precio venta</th><th className="th-base">Tipo de pago</th>
                        <th className="th-base whitespace-nowrap">Inicial {displaySymbol()}</th><th className="th-base whitespace-nowrap">Cuota Financ. {displaySymbol()}</th>
                        <th className="th-base">Medio de pago</th><th className="th-base">Evidencia</th><th className="th-base">Monto registrado</th><th className="th-base">Pagado {displaySymbol()}</th>
                        <th className="th-base">Estado</th><th className="th-base">Pagado</th>
                        <th className="th-base">Recepciona pago</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredRows.map((p) => (
                          <tr key={p.id}>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] text-slate-400">P{p.id}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] font-medium">{p.lotCode || `Lote ${p.lotId}`}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] tabular-nums">{operationAreaOf(p) ? `${operationAreaOf(p).toLocaleString('es-PE', { maximumFractionDigits: 2 })} m²` : '—'}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]">{p.clientName || '—'}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]">{p.salePrice ? usdMoney(p.salePrice) : '—'}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] capitalize">{p.conceptLabel || TYPE_LABEL[p.type] || p.type}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] tabular-nums">{operationInitialOf(p) ? usdMoney(operationInitialOf(p)) : '—'}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] tabular-nums">{operationFinancingCuotaOf(p) ? usdMoney(operationFinancingCuotaOf(p)) : '—'}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] capitalize">{METHOD_LABEL[p.paymentMethod || ''] || p.paymentMethod || '—'}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]"><EvidenceButton pay={p} /></td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] font-medium">{usdMoney(paymentUsd(p))}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] tabular-nums">{(() => {
                              if (p.status !== 'pagado') return '—';
                              const usd = paymentUsd(p);
                              return usd > 0 ? paymentHistoryUsd(usd, 1) : '—';
                            })()}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]">
                              <div className="flex flex-col items-start gap-0.5">
                                {st(p)}
                                {p.status === 'pendiente' && (
                                  <button
                                    type="button"
                                    className="row-action row-action--primary !h-5 !text-[9px] !py-0 !px-1.5"
                                    onClick={() => openEditPayment(p)}
                                    title={payCanMark ? 'Aprobar o editar este pago' : 'Editar este pago'}
                                  >
                                    <FiEdit3 size={11} /> {payCanMark ? 'Aprobar' : 'Editar'}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]">{formatDate(p.paidAt)}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]">{p.receivedByName || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#0B2F6E' }}>
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white" colSpan={2}>Totales ({filteredRows.length})</td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px]" colSpan={8}></td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white">{usdMoney(totalRegistrado)}</td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white">{totalPagadoUsd > 0 ? paymentHistoryUsd(totalPagadoUsd, 1) : '—'}</td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white" colSpan={3} style={{ background: '#16A34A' }}>% Pago: {pctPago.toFixed(1)}%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </>
                )}
            <div className="bg-white p-3 border-t" style={{ borderColor: '#F0F1F3' }}>
              <PaginationBar compact label="Pagos" page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} />
            </div>
          </div>
        ) : (
          <div className="card p-0 overflow-auto">
            {clientReportRows.length === 0 ? <EmptyState text={paySearch ? 'No hay clientes que coincidan con la busqueda.' : 'No hay ventas para el reporte por cliente.'} />
              : (
                  <>
                   <p className="px-4 py-2 text-xs text-slate-400 md:hidden">Desliza la tabla hacia la derecha para ver mas columnas.</p>
                    <table className="table-base table-head-plomo table-fixed min-w-[1000px] [&_th]:!px-2 [&_th]:!py-3 [&_th]:!text-xs [&_th]:!font-semibold [&_th]:!tracking-normal [&_th]:!whitespace-normal [&_th]:!leading-snug [&_th]:!text-center [&_th]:!align-top [&_td]:!text-center [&_td]:!align-middle [&_td]:!px-2 [&_td]:!py-2 [&_td]:!text-[13px]" style={{ width: '100%' }}>
                      <colgroup>{[3, 5, 5, 15, 10, 10, 12, 12, 9, 11, 8].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
                      <thead>
                        <tr>
                          <th className="th-base"><div className="min-h-10">Id</div></th>
                          <th className="th-base"><div className="min-h-10">Lote</div></th>
                          <th className="th-base"><div className="min-h-10">Area (m²)</div></th>
                          <th className="th-base"><div className="min-h-10">Cliente</div></th>
                          <th className="th-base"><div className="min-h-10">Precio Venta<br />{displaySymbol()}</div></th>
                          <th className="th-base"><div className="min-h-10">Cuota Inicial<br />{displaySymbol()}</div></th>
                          <th className="th-base"><div className="min-h-10">Capital<br />pagado</div></th>
                          <th className="th-base"><div className="min-h-10">Capital<br />por pagar</div></th>
                          <th className="th-base"><div className="min-h-10">Interes pagado<br />{displaySymbol()}</div></th>
                          <th className="th-base"><div className="min-h-10">Cuotas<br />en mora</div></th>
                          <th className="th-base"><div className="min-h-10">Accion</div></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {clientReportRows.map((row, index) => (
                          <tr key={`${row.id}-${row.lotCode}`}>
                            <td className="td-base !px-1.5 !py-2 !text-[13px] text-center">{index + 1}</td>
                            <td className="td-base !px-1.5 !py-2 !text-[13px] font-medium">{row.lotCode}</td>
                            <td className="td-base !px-1.5 !py-2 !text-[13px] tabular-nums">{row.area.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</td>
                            <td className="td-base !px-1.5 !py-2 !text-[13px] !whitespace-normal break-words">{row.clientName}</td>
                            <td className="td-base !px-1.5 !py-2 !text-[13px] tabular-nums">{usdMoney(row.salePrice)}</td>
                            <td className="td-base !px-1.5 !py-2 !text-[13px] tabular-nums">{usdMoney(row.initialUsd)}</td>
                            <td className="td-base !px-1.5 !py-2 !text-[13px] tabular-nums">{usdMoney(row.paidUsd)} ({row.paidCount})</td>
                            <td className="td-base !px-1.5 !py-2 !text-[13px] tabular-nums">{usdMoney(row.pendingUsd)} ({row.pendingCount})</td>
                            <td className="td-base !px-1.5 !py-2 !text-[13px] tabular-nums">{usdMoney(row.interestUsd)}</td>
                            <td className="td-base !px-1.5 !py-2 !text-[13px] tabular-nums">{usdMoney(row.overdueUsd)} ({row.overdueCount})</td>
                            <td className="td-base !px-1.5 !py-2 !text-[13px]">
                              <button
                                type="button"
                                className="row-action !h-8 !text-xs !py-1 !px-2"
                                onClick={() => {
                                  const pay = filteredRows.find(p => p.lotCode === row.lotCode);
                                  const historySource = pay || { id: 0, projectId: lockedProjectId || payProjectId, lotId: row.id, clientName: row.clientName, lotCode: row.lotCode } as P;
                                  openHistory(historySource);
                                }}
                                title="Ver historial de cuotas del cliente"
                                aria-label={`Ver historial de ${row.clientName}`}
                              >
                                Historial
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#000080' }}>
                          <td className="td-base !px-1.5 !py-2 !text-[13px] font-bold text-white" colSpan={2}>Total</td>
                          <td className="td-base !px-1.5 !py-2 !text-[13px] font-bold text-white">{clientReportTotals.area.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</td>
                          <td className="td-base !px-1.5 !py-2 !text-[13px] font-bold text-white"></td>
                          <td className="td-base !px-1.5 !py-2 !text-[13px] font-bold text-white">{usdMoney(clientReportTotals.salePrice)}</td>
                          <td className="td-base !px-1.5 !py-2 !text-[13px] font-bold text-white">{usdMoney(clientReportTotals.initialUsd)}</td>
                          <td className="td-base !px-1.5 !py-2 !text-[13px] font-bold text-white">{usdMoney(clientReportTotals.paidUsd)} ({clientReportTotals.paidCount})</td>
                          <td className="td-base !px-1.5 !py-2 !text-[13px] font-bold text-white">{usdMoney(clientReportTotals.pendingUsd)} ({clientReportTotals.pendingCount})</td>
                          <td className="td-base !px-1.5 !py-2 !text-[13px] font-bold text-white">{usdMoney(clientReportTotals.interestUsd)}</td>
                          <td className="td-base !px-1.5 !py-2 !text-[13px] font-bold text-white">{usdMoney(clientReportTotals.overdueUsd)} ({clientReportTotals.overdueCount})</td>
                          <td className="td-base !px-1.5 !py-2 !text-[13px]"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </>
              )}
          </div>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            {/* Cabecera */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#EEF0F2', background: 'linear-gradient(135deg, #F8FAFF 0%, #FFFFFF 100%)' }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#1877F2' }}>Pagos de lotes</p>
                <h3 className="font-semibold" style={{ fontSize: 17 }}>Registrar pago</h3>
              </div>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50" style={{ borderColor: '#E5E7EB' }} onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
            </div>

            {/* Cuerpo */}
            <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-4">
              <div className="rounded-xl border p-3" style={{ borderColor: '#A9C9FB', background: '#F8FBFF' }}>
                <label className="block">
                  <span className="label">Buscar cliente o lote</span>
                  <input
                    className="input"
                    placeholder="Escribe el nombre del cliente o el codigo del lote..."
                    value={payClientSearch}
                    onChange={(e) => { contextRequest.current += 1; clearPaymentContext(); setPayClientSearch(e.target.value); setLotId(0); setPaySearchPicked(false); }}
                  />
                </label>
                {payContextLoading && <p className="mt-2 text-xs text-slate-400">Buscando...</p>}
                {!payContextLoading && searchResults.length > 0 && (
                  <div className="mt-2 rounded-md border bg-white" style={{ borderColor: BORDER }}>
                    <div className="border-b px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ borderColor: '#F1F5F9', color: MUTED }}>
                      {searchResults.length === 1
                        ? '1 resultado'
                        : `${searchResults.length} resultados — elige el lote a pagar`}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {searchResults.map((r: any, i: number) => (
                        <button
                          key={`${r.kind}-${r.lotId}-${r.clientId}-${i}`}
                          type="button"
                          onClick={() => selectSearchResult(r)}
                          className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                          style={{ borderColor: '#F1F5F9' }}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold" style={{ color: INK }}>
                              {r.lotCode ? `Lote ${r.lotCode}` : 'Sin lote asignado'}
                              {r.clientName ? ` · ${r.clientName}` : ''}
                            </span>
                            <span className="block truncate text-[11px]" style={{ color: MUTED }}>
                              {r.projectName ? `${r.projectName} · ` : ''}
                              {r.price ? show(r.price) : 'Sin precio'}
                              {r.summary?.nextInstallmentNo
                                ? ` · cuota ${r.summary.nextInstallmentNo} de ${r.summary.totalCuotas}`
                                : (r.hasSale ? ' · todas pagadas' : '')}
                            </span>
                          </span>
                          {r.hasSale ? (
                            <span className="badge shrink-0" style={{ background: '#EAF7EE', color: '#257849' }}>
                              {r.approvalStatus || 'con venta'}
                            </span>
                          ) : (
                            <span className="badge shrink-0" style={{ background: '#FFF6E4', color: '#B45309' }}>sin venta</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!payContextLoading && !paySearchPicked && searchResults.length === 0 && payClientSearch.trim().length >= 2 && (
                  <p className="mt-2 text-xs text-amber-600">
                    No se encontro ningun lote o cliente con «{payClientSearch.trim()}».
                  </p>
                )}
              </div>
              {activeSale && (
                <>
                  <div className="rounded-lg border bg-white p-3" style={{ borderColor: '#BBF7D0' }}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pago autocompletado</p>
                        {activeSale.summary?.nextConceptLabel || activeSale.summary?.nextInstallmentNo ? (
                          <p className="mt-0.5 truncate text-sm font-bold" style={{ color: activeSale.summary.nextIsOverdue ? RED : INK }}>
                            {activeSale.summary.nextConceptLabel || `Cuota ${activeSale.summary.nextInstallmentNo}`} - {usdMoney(activeSale.summary.nextAmount)}
                            {activeSale.summary.nextDueDate ? ` · vence ${formatDate(activeSale.summary.nextDueDate)}` : ''}
                            {activeSale.summary.nextIsOverdue ? ' · en mora' : ''}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-sm font-bold" style={{ color: GREEN }}>No hay cuotas sin registrar. Revisa los pagos pendientes de aprobación en el historial.</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">
                            Se registrara como: <b>{isExtraordinary ? 'Ingreso extraordinario' : activeSale.summary?.nextConceptLabel || (activeSale.summary?.nextInstallmentNo ? `Cuota ${activeSale.summary.nextInstallmentNo}` : 'Pago')}</b>
                          </span>
                          <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
                            Descuenta saldo: <b>si</b>
                          </span>
                          <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">
                            Saldo luego: <b>{usdMoney(Math.max(0, Number(activeSale.summary?.balanceAmount || 0) - Number(amount || 0)))}</b>
                          </span>
                        </div>
                        {/* Aviso de coherencia: si el monto capturado no cuadra con la
                          cuota que toca, el saldo quedaria descuadrado. */}
                        {Number(activeSale.summary?.nextAmount || 0) > 0
                          && !isExtraordinary && Math.abs(Number(amount || 0) - Number(activeSale.summary.nextAmount)) > 0.01 && (
                            <p className="mt-2 rounded-md px-2 py-1 text-[11px] font-semibold" style={{ background: '#FFF6E4', color: '#B45309' }}>
                              El monto capturado ({usdMoney(amount)}) no coincide con la cuota que le toca ({usdMoney(activeSale.summary.nextAmount)}). El pago debe cubrir la cuota que corresponde.
                            </p>
                          )}
                      </div>
                      <button type="button" className="row-action shrink-0" onClick={() => setShowHistory((v) => !v)}>
                        <FiClock /> {showHistory ? 'Ocultar' : 'Historial'}
                      </button>
                    </div>
                    {showHistory && (
                      <div className="mt-3 rounded-lg border bg-white p-3" style={{ borderColor: '#E5E7EB' }}>
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">Historial de cuotas</span>
                          <button type="button" className="btn-primary !h-7 text-xs" onClick={() => PaymentHistoryPdf({ sale: activeSale })}>Descargar PDF</button>
                        </div>
                        <InstallmentGrid sale={activeSale} compact formatter={usdMoney} />
                      </div>
                    )}
                  </div>
                  <div className="hidden">
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Lote</span><b>{activeSale.lot?.code || activeSale.sale.lotId}</b></div>
                      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Cliente</span><b>{activeSale.client?.fullName || 'Sin cliente'}</b></div>
                      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Forma de pago</span><b>{activeSale.sale.paymentMethod}</b></div>
                      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Precio de venta</span><b>{show(activeSale.sale.salePrice)}</b></div>
                      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Cuota inicial</span><b>{show(activeSale.sale.cuotaInicial)}</b></div>
                      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Plazo</span><b>{activeSale.sale.totalCuotas} meses</b></div>
                      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Interes</span><b>{activeSale.sale.interestType === 'tea' ? `TEA ${activeSale.sale.tea}%` : 'Sin intereses'}</b></div>
                      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Valor cuota</span><b>{show(activeSale.sale.valorCuota)}</b></div>
                      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Estado</span><b>{activeSale.sale.approvalStatus}</b></div>
                    </div>

                    <div className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: '#BBF7D0' }}>
                      <p className="text-[10px] font-bold uppercase text-slate-500">Cuota que le toca pagar</p>
                      {activeSale.summary?.nextConceptLabel || activeSale.summary?.nextInstallmentNo ? (
                        <p className="mt-0.5 text-sm font-bold" style={{ color: activeSale.summary.nextIsOverdue ? RED : AMBER }}>
                          {activeSale.summary.nextConceptLabel || `Cuota N. ${activeSale.summary.nextInstallmentNo}`} - {usdMoney(activeSale.summary.nextAmount)} - {formatDate(activeSale.summary.nextDueDate)}
                          {activeSale.summary.nextIsOverdue ? ' — EN MORA' : ''}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-sm font-bold" style={{ color: GREEN }}>Todas las cuotas estan pagadas.</p>
                      )}
                      <p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
                        Orden de cobro: reserva → cuota inicial → cuotas. Cobrado {show(activeSale.summary?.collectedAmount || 0)} de {show(activeSale.sale?.salePrice || 0)}.
                      </p>
                    </div>

                    <button type="button" className="btn-neutral !h-8 w-full text-xs" onClick={() => setShowHistory((v) => !v)}>
                      {showHistory ? 'Ocultar historial de pagos' : 'Ver historial de pagos'}
                    </button>

                    {showHistory && (
                      <div className="rounded-lg border bg-white p-3" style={{ borderColor: '#E5E7EB' }}>
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">Historial de cuotas</span>
                          <button type="button" className="btn-primary !h-7 text-xs" onClick={() => PaymentHistoryPdf({ sale: activeSale })}>Descargar PDF</button>
                        </div>
                        <InstallmentGrid sale={activeSale} compact formatter={usdMoney} />
                      </div>
                    )}
                  </div>
                </>
              )}

              {!lockedProjectId && (
                <Field label="Proyecto">
                  <Select
                    value={payProjectId}
                    onChange={(v) => { contextRequest.current += 1; clearPaymentContext(); setPayProjectId(Number(v)); setLotId(0); setPaySearchPicked(false); setPayClientSearch(''); }}
                    options={[{ value: 0, label: 'Selecciona el proyecto…' }, ...payProjects.map((pr: any) => ({ value: pr.id, label: pr.name }))]}
                  />
                </Field>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Lote">
                  <Select
                    value={lotId}
                    onChange={(v) => selectLot(Number(v))}
                    options={[{ value: 0, label: payProjectId ? 'Selecciona el lote…' : 'Primero elige un proyecto' }, ...availableLots.map((l: any) => ({ value: l.id, label: String(l.code) }))]}
                  />
                </Field>
                <Field label="Cliente">
                  <Select value={clientId} onChange={(v) => setClientId(Number(v))} options={[{ value: 0, label: '— Sin asignar —' }, ...clients.map((c: any) => ({ value: c.id, label: (c.fullName || c.full_name || '— Sin nombre —') }))]} />
                </Field>
                <Field label="Tipo de pago">
                  <Select value={payType} onChange={(value) => { setPayType(value); if (value === 'reserva' || value === 'adelanto') { setIsExtraordinary(false); setPayCurrency('USD'); setPayExchangeRate(''); setAmountSoles(0); setAmount(cuotaAmount); } }} options={[{ value: 'reserva', label: 'Reserva' }, { value: 'adelanto', label: 'Cuota inicial' }, { value: 'primera_cuota', label: 'Cuota normal' }, { value: 'cuota', label: 'Cuota' }]} />
                  <p className="mt-1 text-[11px]" style={{ color: MUTED }}>
                    {payType === 'reserva'
                      ? 'Reserva: se descuenta del saldo de la venta y va antes de la cuota inicial.'
                      : payType === 'adelanto'
                        ? `Cuota inicial${activeSale?.summary?.nextConceptLabel ? `: ${activeSale.summary.nextConceptLabel}` : ''}. Si fue pactada en partes, registra aqui la parte que corresponde.`
                        : payType === 'primera_cuota'
                          ? 'Primera cuota normal del cronograma.'
                          : 'Cuota o adelanto de cuotas del cronograma.'}
                  </p>
                </Field>
                <Field label="Medio de pago">
                  <Select value={payMethod} onChange={setPayMethod} options={METHODS.map(([v, label]) => ({ value: v, label }))} />
                </Field>
              </div>
              <Field label="Referencia (n.º operación Yape/banco)">
                <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: YAP-48592910 / 0293-4521-1000" />
              </Field>
              <Field label="Comprobante (baucher o captura)">
                <div className="grid grid-cols-3 items-center gap-1 sm:gap-2">
                  <label className="btn-neutral min-w-0 cursor-pointer whitespace-nowrap !px-1 !text-[10px] sm:!px-3 sm:!text-xs !gap-1 [&>svg]:shrink-0">
                    <FiUpload /> <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickVoucher(e.target.files?.[0]); e.target.value = ''; }} /> Subir imagen
                  </label>
                  <label className="btn-neutral min-w-0 cursor-pointer whitespace-nowrap !px-1 !text-[10px] sm:!px-3 sm:!text-xs !gap-1 [&>svg]:shrink-0">
                    <FiCamera /> <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickVoucher(e.target.files?.[0]); e.target.value = ''; }} /> Tomar foto
                  </label>
                  <button type="button" className={`btn-neutral min-w-0 whitespace-nowrap !px-1 !text-[9px] sm:!px-3 sm:!text-xs ${isExtraordinary ? '!border-emerald-500 !bg-emerald-100 !text-emerald-800' : ''}`} aria-pressed={isExtraordinary} disabled={payContextLoading || !activeSale?.sale || (!activeSale.summary?.nextInstallmentNo && !['adelanto', 'cuota_inicial'].includes(payType)) || savingPayment} onClick={() => { setIsExtraordinary(!isExtraordinary); setPayCurrency('USD'); setPayExchangeRate(''); setAmountSoles(0); setAmount(isInitialExtraordinary ? pendingInitialExtraordinary : cuotaAmount); if (!isInitialExtraordinary) setPayType('cuota'); }}>I.extrordinario</button>
                  {voucherUrl && (
                    <div className="col-span-3 flex items-center gap-2">
                      <img src={voucherUrl} alt="Voucher" className="w-20 h-20 rounded-lg object-cover border shadow-sm" />
                      <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => setVoucherUrl('')}>Quitar</button>
                    </div>
                  )}
                </div>
              </Field>
              {isExtraordinary ? <>
              <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <Field label="Moneda del pago">
                  <Select value={payCurrency} onChange={(value) => { setPayCurrency(value); setAmountSoles(Math.round(amount * Number(payExchangeRate || 0) * 100) / 100); if (value === 'PEN' && !(Number(payExchangeRate) > 0)) setAmount(0); }} options={[{ value: 'USD', label: 'Dólares (US$)' }, { value: 'PEN', label: 'Soles (S/)' }]} />
                </Field>
                <Field label="Vence"><input type="date" className="input min-w-0" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
                {payCurrency === 'PEN' && <Field label="Tipo de cambio (S/ por US$)">
                  <input type="number" min="0.000001" step="0.000001" className="input" value={payExchangeRate} onChange={(e) => { const rate = e.target.value; setPayExchangeRate(rate); setAmount(lotPaymentUsd(amountSoles, 'PEN', Number(rate))); }} />
                </Field>}
                <Field label={payCurrency === 'PEN' ? 'Pago a realizar S/' : 'Monto a pagar US$'}>
                  <input type="number" step="0.01" min="0.01" className="input tabular-nums" value={(payCurrency === 'PEN' ? amountSoles : amount) || ''} onChange={(e) => { const value = Number(e.target.value || 0); if (payCurrency === 'PEN') { setAmountSoles(value); setAmount(lotPaymentUsd(value, 'PEN', Number(payExchangeRate))); } else setAmount(lotPaymentUsd(value, 'USD', 0)); }} />
                </Field>
                {payCurrency === 'PEN' && <Field label="Pago a realizar US$"><input className="input tabular-nums" readOnly value={usdMoney(amount)} /></Field>}
              </div>
              <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <Field label={cuotasLabel}><input className="input tabular-nums" readOnly value={usdMoney(extraordinaryBreakdown.installments)} /></Field>
                <Field label={isNarrow ? 'Pago extraor' : 'Pago extraordinario US$'}><input className="input tabular-nums font-semibold text-emerald-700" readOnly value={usdMoney(extraordinaryAmount)} /></Field>
              </div>
              </> : <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <Field label="Monto US$">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: GREEN }}>US$</span>
                    <input type="number" step="0.01" min="0.01" className="input !pl-12 tabular-nums" readOnly={!!activeSale?.sale && !!activeSale.summary?.nextInstallmentNo} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value || 0))} />
                  </div>
                </Field>
                <Field label="Vence"><input type="date" className="input min-w-0" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
              </div>}
              <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <Field label="Nota"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                <Field label="Fecha de pago"><input type="date" className="input min-w-0" aria-label="Fecha de pago" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></Field>
              </div>

              {/* Datos de la operacion bancaria y boleta. Se adjuntan al registrar
                  el pago para que el admin los revise al aprobar. */}
              <div className="mt-4 space-y-3 rounded-lg border p-3" style={{ borderColor: BORDER, background: '#FAFBFC' }}>
                <p className="text-xs font-semibold" style={{ color: '#B45309' }}>
                  Operacion bancaria y boleta (se revisan al aprobar el pago)
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="N° Op. Bco"><input className="input" value={regBankOp} onChange={(e) => setRegBankOp(e.target.value)} placeholder="Ej: 0293-4521-1000" /></Field>
                  <Field label="N° Boleta"><input className="input" value={regReceiptNo} onChange={(e) => setRegReceiptNo(e.target.value)} placeholder="Ej: B001-4521" /></Field>
                </div>
                <div className={isExtraordinary ? "grid grid-cols-3 items-start gap-2 [&>*]:min-w-0 [&_label]:!text-[10px] sm:[&_label]:!text-xs [&_input]:min-w-0 [&_input]:!px-2 [&_input]:!text-xs" : undefined}>
                {isExtraordinary && <Field label="Valor de boleta"><input className="input tabular-nums" readOnly value={usdMoney(amount)} /></Field>}
                <Field label={isExtraordinary ? isInitialExtraordinary ? 'P. inicial' : `Valor cuotas (${extraordinaryBreakdown.count})` : "Valor de la cuota US$"}>
                  <div className="relative">
                    {!isExtraordinary && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: GREEN }}>US$</span>}
                    <input type="number" step="0.01" className="input !pl-12 tabular-nums" readOnly={isExtraordinary && !!activeSale?.sale} value={isExtraordinary ? extraordinaryBreakdown.installments : regCuotaValue} onChange={(e) => setRegCuotaValue(e.target.value)} placeholder="Se llena segun la cuota que le toca" />
                  </div>
                  {!(isExtraordinary && isInitialExtraordinary) && <p className="mt-1 text-[10px]" style={{ color: MUTED }}>{isExtraordinary ? `Cubre ${extraordinaryBreakdown.overdueCount ? `${extraordinaryBreakdown.overduePaid}/${extraordinaryBreakdown.overdueCount} cuotas en mora y ` : ""}${extraordinaryBreakdown.count - extraordinaryBreakdown.overduePaid} cuota normal. El excedente reduce las ultimas cuotas de abajo hacia arriba.` : `Se autocompleta con la cuota del cronograma. Actual: ${usdMoney(regCuotaValue ? Number(regCuotaValue) : 0)}`}</p>}
                </Field>
                {isExtraordinary && <Field label="P. extraordinario"><input className="input tabular-nums font-semibold text-emerald-700" readOnly value={usdMoney(extraordinaryAmount)} /></Field>}
                </div>
                <Field label="Adj. op. bancaria (foto)">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                      <FiUpload /> <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickRegBankOp(e.target.files?.[0]); e.target.value = ''; }} /> Subir imagen
                    </label>
                    <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                      <FiCamera /> <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickRegBankOp(e.target.files?.[0]); e.target.value = ''; }} /> Tomar foto
                    </label>
                    {regBankOpUrl && (
                      <div className="flex items-center gap-2">
                        <img src={regBankOpUrl} alt="Operacion bancaria" className="h-16 w-16 rounded-lg border object-cover shadow-sm" />
                        <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => pickRegBankOp(undefined)}>Quitar</button>
                      </div>
                    )}
                  </div>
                </Field>
                <Field label="Adj. boleta (foto)">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                      <FiUpload /> <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickRegReceipt(e.target.files?.[0]); e.target.value = ''; }} /> Subir imagen
                    </label>
                    <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                      <FiCamera /> <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickRegReceipt(e.target.files?.[0]); e.target.value = ''; }} /> Tomar foto
                    </label>
                    {regReceiptUrl && (
                      <div className="flex items-center gap-2">
                        <img src={regReceiptUrl} alt="Boleta" className="h-16 w-16 rounded-lg border object-cover shadow-sm" />
                        <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => pickRegReceipt(undefined)}>Quitar</button>
                      </div>
                    )}
                  </div>
                </Field>
              </div>
            </div>

            {/* Pie: agentes y gerentes solo guardan; el admin ademas aprueba. */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-canvas px-6 py-4" style={{ borderColor: '#EEF0F2' }}>
              <button className="btn-neutral" onClick={() => setOpen(false)} disabled={savingPayment}>Cancelar</button>
              <button className="btn-primary" onClick={registrar} disabled={savingPayment || payContextLoading}>{savingPayment ? 'Guardando...' : 'Guardar pago'}</button>
            </div>
          </div>
        </div>
      )}
      {auditOpen && canViewAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAuditOpen(false)} />
          <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: BORDER }}>
              <div>
                <h3 className="font-semibold" style={{ fontSize: 17 }}>Auditoria de pagos</h3>
                <p className="mt-1 text-sm text-slate-500">Movimientos registrados en pagos, ordenados por fecha y hora.</p>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-md border text-slate-500" style={{ borderColor: BORDER }} onClick={() => setAuditOpen(false)} aria-label="Cerrar">
                <FiX />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {auditLoading ? (
                <p className="p-6 text-center text-sm text-slate-400">Cargando auditoria...</p>
              ) : auditRows.length === 0 ? (
                <EmptyState text="No hay movimientos de pagos para mostrar." />
              ) : (
                <table className="table-base table-head-plomo" style={{ width: '100%', minWidth: 980 }}>
                  <thead>
                    <tr>
                      <th className="th-base">Fecha y hora</th>
                      <th className="th-base">Agente/Admin</th>
                      <th className="th-base">Cliente</th>
                      <th className="th-base">Lote</th>
                      <th className="th-base">Tipo de pago</th>
                      <th className="th-base">Medio</th>
                      <th className="th-base">Área</th>
                      <th className="th-base">Monto</th>
                      <th className="th-base">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditRows.map((p) => (
                      <tr key={p.id}>
                        <td className="td-base">{dateTime(p.paidAt || p.createdAt)}</td>
                        <td className="td-base">{p.receivedByName || p.approvedByName || '-'}</td>
                        <td className="td-base">{p.clientName || '-'}</td>
                        <td className="td-base">{p.lotCode || `Lote ${p.lotId}`}</td>
                        <td className="td-base">{p.conceptLabel || TYPE_LABEL[p.type] || p.type || '-'}</td>
                        <td className="td-base">{METHOD_LABEL[p.paymentMethod || ''] || p.paymentMethod || '-'}</td>
                        <td className="td-base">{p.reference || p.bankOperationNumber || '-'}</td>
                        <td className="td-base tabular-nums">{usdMoney(paymentUsd(p))}</td>
                        <td className="td-base">
                          <span className="badge capitalize" style={{ background: BADGE[p.status]?.[0] || '#F1F5F9', color: BADGE[p.status]?.[1] || MUTED }}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border-t px-4 py-3" style={{ borderColor: BORDER }}>
              <PaginationBar
                page={auditPage}
                totalPages={auditMeta.totalPages}
                total={auditMeta.total}
                limit={10}
                setPage={setAuditPage}
                compact
              />
            </div>
          </div>
        </div>
      )}
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingPayment(null)} />
          <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold" style={{ fontSize: 17 }}>Editar pago pendiente</h3>
                <p className="mt-1 text-sm text-slate-500">Lote {editingPayment.lotCode || editingPayment.lotId} - {show(editingPayment.amount)}</p>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-md border text-slate-500" style={{ borderColor: BORDER }} onClick={() => setEditingPayment(null)} aria-label="Cerrar">
                <FiX />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <MiniMetric label="Monto registrado" value={show(editingPayment.amount)} />
              <MiniMetric label="Monto pagado" value={editingPayment.status === 'pagado' ? show(editingPayment.amount) : show(0)} color={GREEN} />
              <MiniMetric label="Estado" value={editingPayment.status} color={editingPayment.status === 'pagado' ? GREEN : AMBER} />
              <MiniMetric label="Vence" value={formatDate(editingPayment.dueDate)} />
            </div>

            <Field label="Voucher">
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                  <FiUpload /> <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickEditVoucher(e.target.files?.[0]); e.target.value = ''; }} /> Subir voucher
                </label>
                <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                  <FiCamera /> <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickEditVoucher(e.target.files?.[0]); e.target.value = ''; }} /> Tomar foto
                </label>
                {editVoucherUrl && <a href={editVoucherUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#1877F2] hover:underline">Ver voucher</a>}
              </div>
              {editVoucherUrl && <img src={editVoucherUrl} alt="Voucher" className="mt-3 h-32 w-32 rounded-lg border object-cover" />}
            </Field>

            {payCanMark && (
              <div className="mt-4 space-y-3 rounded-lg border p-3" style={{ borderColor: BORDER, background: '#FAFBFC' }}>
                <p className="text-xs font-semibold" style={{ color: '#B45309' }}>Estos campos se llenan para aprobar el pago</p>
                {editingPayment.receiptDocumentUrl && (
                  <div>
                    <p className="mb-1 text-xs font-semibold" style={{ color: MUTED }}>Boleta adjuntada por el vendedor</p>
                    <a href={editingPayment.receiptDocumentUrl} target="_blank" rel="noreferrer">
                      <img src={editingPayment.receiptDocumentUrl} alt="Boleta" className="h-24 w-24 rounded-lg border object-cover" />
                    </a>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="N° Op. Bco"><input className="input" value={approvalBankOp} onChange={(e) => setApprovalBankOp(e.target.value)} /></Field>
                  <Field label="N° Boleta"><input className="input" value={approvalReceiptNo} onChange={(e) => setApprovalReceiptNo(e.target.value)} /></Field>
                </div>
                <div className={editingPayment.isExtraordinary ? 'grid grid-cols-3 items-start gap-2 [&>*]:min-w-0 [&_label]:!text-[10px] sm:[&_label]:!text-xs [&_input]:min-w-0 [&_input]:!px-2 [&_input]:!text-xs' : undefined}>
                  <Field label={editingPayment.isExtraordinary ? 'Valor de boleta' : 'Valor Bol'}><input type="number" step="0.01" className="input" readOnly={!!editingPayment.isExtraordinary} value={approvalReceiptValue} onChange={(e) => setApprovalReceiptValue(e.target.value)} /></Field>
                  {editingPayment.isExtraordinary && <>
                    <Field label={editingPayment.concept === 'cuota_inicial' || ['adelanto', 'cuota_inicial'].includes(editingPayment.type) ? 'P. inicial' : `Valor cuotas (${savedPaymentInstallmentCount(editingPayment)})`}><input className="input tabular-nums" readOnly value={savedPaymentBreakdown(editingPayment) ? usdMoney(savedPaymentBreakdown(editingPayment)!.installments) : 'Sin detalle'} /></Field>
                    <Field label="P. extraordinario"><input className="input tabular-nums text-emerald-700" readOnly value={savedPaymentBreakdown(editingPayment) ? usdMoney(savedPaymentBreakdown(editingPayment)!.extraordinary) : 'Sin detalle'} /></Field>
                  </>}
                </div>
                {editingPayment.isExtraordinary && !savedPaymentBreakdown(editingPayment) && <p className="text-xs text-amber-700">Este pago antiguo no tiene una distribución guardada. Revisa el cronograma antes de aprobar.</p>}
                <Field label="Adj. doc (opcional)">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                      <FiUpload /> <input type="file" className="hidden" onChange={(e) => { pickApprovalDoc(e.target.files?.[0]); e.target.value = ''; }} /> Adjuntar documento
                    </label>
                    {approvalDocUrl && <a href={approvalDocUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#1877F2] hover:underline">Ver documento</a>}
                  </div>
                </Field>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t pt-4" style={{ borderColor: BORDER }}>
              <button className="btn-neutral" onClick={() => setEditingPayment(null)}>Cancelar</button>
              <button className="btn-secondary" onClick={saveEditVoucher} disabled={!editVoucher}>Guardar voucher</button>
              {payCanMark && <button className="btn-primary" onClick={approvePayment}>Aprobar Pago</button>}
            </div>
          </div>
        </div>
      )}
      {historyRow && (
        <WorkspacePanel label="Historial de pagos del cliente" onClose={() => { historyRequest.current++; setHistoryRow(null); setHistorySale(null); }}>
          <div className="min-h-0 flex-1 overflow-auto bg-white p-4 sm:p-5">
            <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-4 flex items-start justify-between gap-3 px-4 py-4 text-white sm:-top-5 sm:-mx-5 sm:-mt-5 sm:px-5" style={{ background: '#1877F2' }}>
              <div className="min-w-0">
                <h3 className="font-semibold !text-white" style={{ fontSize: 15 }}>Historial de pagos</h3>
                <p className="mt-1 truncate text-xs !text-white">
                  {historySale?.client?.fullName || historyRow.clientName || 'Cliente'} - Lote {historySale?.lot?.code || historyRow.lotCode || historyRow.lotId}
                </p>
              </div>
              <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/40 text-white hover:bg-white/10" onClick={() => { historyRequest.current++; setHistoryRow(null); setHistorySale(null); }} aria-label="Cerrar">
                <FiX />
              </button>
            </div>

            {historyLoading && <p className="p-4 text-center text-xs text-slate-400">Cargando historial...</p>}
            {!historyLoading && !historySale && (
              <p className="p-4 text-center text-xs text-slate-400">No se encontro informacion de este lote.</p>
            )}

            {!historyLoading && historySale && (
              <div className="space-y-3">
                {(() => {
                  const installmentTotals = paymentHistoryInstallmentTotals(historySale);
                  const initialFeeAmount = paymentHistoryInitialFeeAmount(historySale);
                  return (
                    <>
                      {!historySale.sale && (
                        <p className="rounded-md border bg-amber-50 px-3 py-2 text-[11px]" style={{ borderColor: '#FDE68A', color: '#B45309' }}>
                          Este lote aun no tiene una venta o financiamiento registrado. Abajo se listan los pagos
                          que ya se registraron y de cada uno puedes descargar su ficha.
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                        <MiniMetric label={`Precio final (${Number(historySale.sale?.totalCuotas ?? historySale.summary?.totalCuotas ?? 0)})`} value={showUsd(historySale.sale?.salePrice || 0)} />
                        <MiniMetric
                          label="Reserva"
                          value={historySale.summary?.reservaAmount ? showUsd(historySale.summary.reservaAmount) : 'No aplica'}
                          color={historySale.summary?.reservaAmount ? (historySale.summary?.reservaPaid ? GREEN : AMBER) : MUTED}
                        />
                        <MiniMetric
                          label="Cuota inicial"
                          value={showUsd(initialFeeAmount)}
                          color={historySale.summary?.cuotaInicialPaid ? GREEN : AMBER}
                        />
                        <MiniMetric label="Cobrado" value={showUsd(historySale.summary?.collectedAmount || 0)} color={GREEN} />
                        <MiniMetric label="Saldo" value={showUsd(historySale.summary?.balanceAmount || 0)} color={BLUE_DARK} />
                        <MiniMetric label={`Cuotas Pagadas US$ (${Number(historySale.summary?.paidCount || 0)})`} value={showUsd(installmentTotals.paid)} color={GREEN} />
                        <MiniMetric label={`Cuotas por pagar US$ (${Number(historySale.summary?.pendingCount || 0)})`} value={showUsd(installmentTotals.pending)} color={BLUE_DARK} />
                        <MiniMetric label="Cuotas en Atraso US$" value={showUsd(installmentTotals.overdue)} color={RED} />
                        <MiniMetric label="Le toca pagar" value={historySale.summary?.nextConceptLabel || (historySale.summary?.nextInstallmentNo ? `Cuota ${historySale.summary.nextInstallmentNo}` : 'Sin pagos por registrar')} color={AMBER} />
                        <MiniMetric label="Valor de la Cuota US$" value={showUsd(historySale.summary?.nextAmount || 0)} />
                      </div>
                    </>
                  );
                })()}


                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold">Cronograma de cuotas <span className="font-normal text-slate-500">({historyLedger.filter(row => row.isFinancing).length} cuotas de financiamiento)</span></span>
                  <button
                    type="button"
                    className="btn-outline !h-8 text-[11px]"
                    onClick={() => ClientPaymentHistoryPdf({ sale: historySale, projectName: projectsById.get(Number(historySale.sale?.projectId))?.name })}
                  >
                    <FiFileText /> Descargar todo el historial (PDF)
                  </button>
                </div>

                {historyLedgerTotals.unappliedAmount > 0 && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Los pagos superan el saldo del cronograma en {showUsd(historyLedgerTotals.unappliedAmount)}. Ese excedente se conserva en los pagos registrados y no genera un saldo negativo.</p>}
                <div className="overflow-auto rounded-lg border border-slate-200">
                  <table className="table-base w-full min-w-[1100px] [&_th]:!px-1.5 [&_th]:!py-2 [&_th]:!text-[10px] [&_th]:!whitespace-normal [&_th]:!leading-tight [&_td]:!px-1.5 [&_td]:!py-2 [&_td]:!text-[11px]">
                    <thead><tr style={{ background: '#52728F' }}>
                      {['Concepto', 'Vence', `Saldo inicial ${displaySymbol()}`, `Cuota del mes ${displaySymbol()}`, `Pago realizado ${displaySymbol()}`, `Amortización de capital ${displaySymbol()}`, `Interés ${displaySymbol()}`, `Amortización extraordinaria ${displaySymbol()}`, `Saldo final ${displaySymbol()}`, 'Estado', 'Fecha pago', 'N. Op. Bco', 'Evidencia', 'Ficha'].map(label => {
                        const words = label.split(' ');
                        const firstLine = words.shift();
                        return <th key={label} className="th-base !text-white !bg-[#52728F]">{firstLine}{words.length > 0 && <><br /><span className="whitespace-nowrap">{words.join(' ')}</span></>}</th>;
                      })}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyLedger.map((row, index) => <tr key={row.id || index} style={!row.isFinancing ? { background: '#F8FBFF' } : undefined}>
                        <td className="td-base font-semibold">{row.conceptLabel || (row.installmentNo ? `Cuota ${row.installmentNo}` : TYPE_LABEL[row.type] || 'Pago')}</td>
                        <td className="td-base">{formatClientHistoryDate(row.dueDate)}</td>
                        <td className="td-base tabular-nums">{index === 0 ? showUsd(historySale.sale?.salePrice || 0) : row.openingBalance == null ? '-' : showUsd(row.openingBalance)}</td>
                        <td className="td-base tabular-nums">{showUsd(row.monthlyInstallment)}</td>
                        <td className="td-base tabular-nums font-semibold" style={{ background: '#FFFDE7' }}>{row.realizedPayment > 0 ? showUsd(row.realizedPayment) : '-'}</td>
                        <td className="td-base tabular-nums">{index === 0 ? showUsd(row.monthlyInstallment) : row.capitalAmortization == null ? '-' : showUsd(row.capitalAmortization)}</td>
                        <td className="td-base tabular-nums">{index === 0 ? '' : row.interest == null ? '-' : showUsd(row.interest)}</td>
                        <td className="td-base tabular-nums">{index === 0 ? '' : row.extraordinaryAmortization == null ? '-' : showUsd(row.extraordinaryAmortization)}</td>
                        <td className="td-base tabular-nums font-semibold" style={{ background: '#F0FDF4' }}>{index === 0 ? showUsd(Math.max(0, Math.round(Number(historySale.sale?.salePrice || 0) * 100) - Math.round(Number(historySale.sale?.cuotaInicial || 0) * 100)) / 100) : row.closingBalance == null ? '-' : showUsd(row.closingBalance)}</td>
                        <td className="td-base"><span className="badge" style={{ background: row.paid ? '#DCFCE7' : row.overdue ? '#FEE2E2' : '#FEF3C7', color: row.paid ? GREEN : row.overdue ? RED : AMBER }}>{row.reduced ? 'Reducida por amortizacion' : row.paid ? 'Pagado' : row.overdue ? 'Vencido' : 'Pendiente'}</span></td>
                        <td className="td-base">{formatClientHistoryDate(row.payment?.paidAt)}</td>
                          <td className="td-base">{row.payment?.bankOperationNumber || '-'}</td>
                          <td className="td-base"><span className="inline-flex gap-1">{(row.paymentRecords || []).map((payment: any) => <EvidenceButton key={payment.paymentId || payment.id} pay={payment} compact />)}</span></td>
                          <td className="td-base">{row.payment?.status === 'pagado' && <button type="button" className="row-action !h-5 !text-[9px] !py-0 !px-1.5" onClick={() => PaymentReceiptPdf({ sale: historySale, installment: { ...row, amount: row.payment?.amountUsd ?? row.realizedPayment, payment: row.payment }, projectName: projectsById.get(Number(historySale.sale?.projectId))?.name })}><FiFileText size={11} /> Ficha</button>}</td>
                      </tr>)}
                      {!historyLedger.length && <tr><td colSpan={14} className="p-4 text-center text-slate-400">Sin movimientos registrados.</td></tr>}
                    </tbody>
                    <tfoot><tr style={{ background: '#000080' }} className="[&_td]:!text-white">
                      <td className="td-base" colSpan={2}>Total</td>
                      {['openingBalance', 'monthlyInstallment', 'realizedPayment', 'capitalAmortization', 'interest', 'extraordinaryAmortization', 'closingBalance'].map(field => <td key={field} className="td-base tabular-nums">{showUsd(historyLedgerTotals[field as keyof typeof historyLedgerTotals])}</td>)}
                      <td colSpan={5} />
                    </tr></tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </WorkspacePanel>
      )}
    </>
  );
}

// Combina dos series mensuales (pagado / moroso) en un solo arreglo por mes,
// para el gráfico de doble eje.
function mergeByMonth(paid: { month: string; monto: number }[], overdue: { month: string; monto: number }[]) {
  const months = Array.from(new Set([...paid.map((r) => r.month), ...overdue.map((r) => r.month)])).sort();
  const paidMap = Object.fromEntries(paid.map((r) => [r.month, r.monto]));
  const overdueMap = Object.fromEntries(overdue.map((r) => [r.month, r.monto]));
  return months.map((month) => ({ month, pagado: paidMap[month] || 0, moroso: overdueMap[month] || 0 }));
}

function mergeFinancialMonths(
  paid: { month: string; monto: number }[],
  overdue: { month: string; monto: number }[],
  sales: { month: string; monto: number }[],
) {
  const months = Array.from(new Set([
    ...paid.map((r) => r.month),
    ...overdue.map((r) => r.month),
    ...sales.map((r) => r.month),
  ])).filter(Boolean).sort();
  const paidMap = Object.fromEntries(paid.map((r) => [r.month, Number(r.monto || 0)]));
  const overdueMap = Object.fromEntries(overdue.map((r) => [r.month, Number(r.monto || 0)]));
  const salesMap = Object.fromEntries(sales.map((r) => [r.month, Number(r.monto || 0)]));
  return months.map((month) => {
    const cobrado = paidMap[month] || 0;
    const moroso = overdueMap[month] || 0;
    const vendido = salesMap[month] || 0;
    return {
      month,
      cobrado,
      moroso,
      vendido,
      collectionRate: vendido > 0 ? Math.min(100, (cobrado / vendido) * 100) : 0,
      delinquencyRate: cobrado + moroso > 0 ? (moroso / (cobrado + moroso)) * 100 : 0,
    };
  });
}


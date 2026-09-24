'use client';
import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { Toaster, toast, Field, EmptyState } from '@/components/ui/ui';
import { KpiCard } from '@/components/ui/Metrics';
import { api, uploadFile } from '@/lib/api';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { formatMoney, formatDate } from '@/lib/types';
import { useDisplayCurrency, DEFAULT_EXCHANGE_RATE } from '@/lib/currency';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { printHtml } from '@/lib/print';
import { EvidenceButton } from './EvidenceViewer';
import { comparePaymentRows, PAYMENT_CONCEPT_LABEL } from './paymentOrder';
import { FiActivity, FiAlertTriangle, FiCamera, FiChevronDown, FiClock, FiCreditCard, FiDollarSign, FiEdit3, FiFileText, FiMoreVertical, FiRefreshCw, FiTrendingUp, FiUpload, FiX } from 'react-icons/fi';

type P = {
  id: number; projectId: number; lotId: number; clientId?: number | null; type: string; amount: string;
  dueDate?: string | null; paidAt?: string | null; status: string; createdAt?: string | null;
  lotCode?: string | null; clientName?: string | null; salePrice?: number | null;
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

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function shortMoney(n: number) {
  const value = Number(n || 0);
  if (Math.abs(value) >= 1000000) return `S/ ${(value / 1000000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(value) >= 1000) return `S/ ${(value / 1000).toLocaleString('es-PE', { maximumFractionDigits: 0 })}k`;
  return `S/ ${value.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
}

function shortUsd(n: number) {
  const value = Number(n || 0);
  if (Math.abs(value) >= 1000000) return `US$ ${(value / 1000000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(value) >= 1000) return `US$ ${(value / 1000).toLocaleString('es-PE', { maximumFractionDigits: 0 })}k`;
  return `US$ ${value.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
}

function usdMoney(n: number) {
  return `US$ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

function KpiTile({ label, value, helper, icon, accent }: {
  label: string;
  value: string;
  helper: string;
  icon: JSX.Element;
  accent: string;
}) {
  return <KpiCard label={label} value={value} helper={helper} icon={icon} tone={accent} truncateLabel />;
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
/**
 * Campo de monto con conversion S/ <-> US$ mediante un icono.
 *
 * El sistema guarda los montos en soles (moneda base), asi que el valor que
 * mantiene el estado del formulario SIEMPRE son soles. El icono solo cambia la
 * moneda en la que se captura/muestra: al escribir en US$ se hace la conversion
 * con el tipo de cambio antes de tocar el estado, y al capturar en soles se
 * escribe el valor tal cual.
 */
function AmountField({
  label, value, onChange, currency, onToggleCurrency, rate, placeholder, helper,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  currency: 'PEN' | 'USD';
  onToggleCurrency: () => void;
  rate: number;
  placeholder?: string;
  helper?: string;
}) {
  const safeRate = Number(rate) > 0 ? Number(rate) : DEFAULT_EXCHANGE_RATE;
  // Lo que se ve en pantalla: el monto base (soles) llevado a la moneda activa.
  const shown = currency === 'USD'
    ? Math.round((Number(value || 0) / safeRate) * 100) / 100
    : Math.round(Number(value || 0) * 100) / 100;

  // Al escribir, se regresa siempre a soles para mantener una sola base.
  function handleInput(raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) { onChange(0); return; }
    onChange(currency === 'USD' ? Math.round(parsed * safeRate * 100) / 100 : parsed);
  }

  return (
    <Field label={label}>
      <div className="flex items-stretch gap-1.5">
        <div className="relative min-w-0 flex-1">
          <span
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold"
            style={{ color: currency === 'USD' ? GREEN : MUTED }}
          >
            {currency === 'USD' ? 'US$' : 'S/'}
          </span>
          <input
            type="number"
            step="0.01"
            className="input !pl-11"
            value={shown || ''}
            placeholder={placeholder}
            onChange={(event) => handleInput(event.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={onToggleCurrency}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-white px-2 text-xs font-semibold transition-colors hover:bg-slate-50"
          style={{ borderColor: currency === 'USD' ? '#A9C9FB' : BORDER, color: currency === 'USD' ? BLUE : MUTED }}
          title={`Convertir a ${currency === 'USD' ? 'soles (S/)' : 'dolares (US$)'} con TC ${safeRate}`}
          aria-label={`Convertir a ${currency === 'USD' ? 'soles' : 'dolares'}`}
        >
          <FiRefreshCw style={{ fontSize: 12 }} />
          {currency === 'USD' ? 'US$' : 'S/'}
        </button>
      </div>
      {helper && (
        <p className="mt-1 text-[10px]" style={{ color: MUTED }}>
          {helper}
        </p>
      )}
    </Field>
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
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: AMBER }} /> Cuota a pagar</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: '#E5E7EB' }} /> Pendientes ({sale.summary?.pendingCount || 0})</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: RED }} /> En mora</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {rows.map((r: any) => {
          const bg = r.paid ? GREEN : (r.overdue ? RED : (r.installmentNo === sale.summary?.nextInstallmentNo ? AMBER : '#E5E7EB'));
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
              <p className="mt-1 text-[9px] leading-none opacity-90">{formatDate(r.dueDate)}</p>
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
  const bodyRows = rows.map((r: any) => {
    const estado = r.paid ? 'Pagada' : (r.overdue ? 'En mora' : (r.installmentNo === sale.summary?.nextInstallmentNo ? 'Por pagar' : 'Pendiente'));
    const color = r.paid ? '#16A34A' : (r.overdue ? '#DC2626' : (r.installmentNo === sale.summary?.nextInstallmentNo ? '#B45309' : '#64748B'));
    return `<tr><td>${r.installmentNo}</td><td>${escapeHtml(formatDate(r.dueDate))}</td><td class="num">${escapeHtml(formatMoney(r.amount))}</td><td style="color:${color};font-weight:700">${estado}</td></tr>`;
  }).join('');
  const generatedAt = new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });

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
          <div><span>Precio de venta</span><strong>${escapeHtml(formatMoney(sale?.sale?.salePrice || 0))}</strong></div>
          <div><span>Valor cuota</span><strong>${escapeHtml(formatMoney(sale?.sale?.valorCuota || 0))}</strong></div>
          <div><span>Cuotas pagadas</span><strong>${sale?.summary?.paidCount || 0} de ${sale?.summary?.totalCuotas || 0}</strong></div>
          <div><span>Cuota que toca</span><strong>${sale?.summary?.nextInstallmentNo ? 'N. ' + sale.summary.nextInstallmentNo : 'Todas pagadas'}</strong></div>
        </div>
        <table>
          <thead><tr><th>Cuota</th><th>Vence</th><th class="num">Monto</th><th>Estado</th></tr></thead>
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
  @media (max-width:640px){body{margin:12px}.brand{flex-direction:column;gap:10px}.logos img{height:32px;max-width:120px}h1{font-size:17px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}table{table-layout:auto}th,td{padding:5px 4px;font-size:9px}.watermark img{width:300px}.evidence{grid-template-columns:1fr}}
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
  const amountPen = Number(installment.amount || 0);
  const tc = pay?.exchangeRate != null ? Number(pay.exchangeRate) : null;
  const amountUsd = pay?.amountUsd != null ? Number(pay.amountUsd) : (tc && tc > 0 ? amountPen / tc : null);
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
    ['Monto en soles (S/)', formatMoney(amountPen)],
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
        <div><span>Monto S/</span><strong>${escapeHtml(formatMoney(amountPen))}</strong></div>
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
  const rows = sale.plan || [...(sale.installments || []), ...(sale.otherPayments || [])];
  const others = (sale.otherPayments || []).filter((p: any) => !rows.includes(p));

  // Evidencias: una tarjeta por cada pago con boleta o voucher de op. bancaria.
  const evidenceItems: string[] = [];
  for (const r of rows) {
    const p = r.payment;
    if (!p) continue;
    const bankOp = absoluteUrl(p.approvalDocumentUrl);
    const receipt = absoluteUrl(p.receiptDocumentUrl);
    const voucher = absoluteUrl(p.voucherUrl);
    const imgs = [
      bankOp ? { label: 'Op. bancaria', url: bankOp } : null,
      receipt ? { label: 'Boleta', url: receipt } : null,
      voucher ? { label: 'Comprobante', url: voucher } : null,
    ].filter(Boolean) as Array<{ label: string; url: string }>;
    if (!imgs.length) continue;
    evidenceItems.push(`<div class="evidence-group">
      <p class="evidence-title">${escapeHtml(r.conceptLabel || (r.installmentNo ? `Cuota ${r.installmentNo}` : 'Pago'))}${p.paidAt ? ' — pagada el ' + escapeHtml(formatDate(p.paidAt)) : ''}</p>
      <div class="evidence">${imgs.map((i) => `<div class="evidence-item"><span>${escapeHtml(i.label)}</span><img src="${escapeHtml(i.url)}" alt="${escapeHtml(i.label)}" /></div>`).join('')}</div>
    </div>`);
  }
  for (const p of others) {
    const bankOp = absoluteUrl(p.approvalDocumentUrl);
    const receipt = absoluteUrl(p.receiptDocumentUrl);
    const voucher = absoluteUrl(p.voucherUrl);
    const imgs = [
      bankOp ? { label: 'Op. bancaria', url: bankOp } : null,
      receipt ? { label: 'Boleta', url: receipt } : null,
      voucher ? { label: 'Comprobante', url: voucher } : null,
    ].filter(Boolean) as Array<{ label: string; url: string }>;
    if (!imgs.length) continue;
    const concepto = TYPE_LABEL[p.type] || p.type || 'Pago';
    evidenceItems.push(`<div class="evidence-group">
      <p class="evidence-title">${escapeHtml(concepto)}${p.paidAt ? ' — pagada el ' + escapeHtml(formatDate(p.paidAt)) : ''}</p>
      <div class="evidence">${imgs.map((i) => `<div class="evidence-item"><span>${escapeHtml(i.label)}</span><img src="${escapeHtml(i.url)}" alt="${escapeHtml(i.label)}" /></div>`).join('')}</div>
    </div>`);
  }
  const evidenceSection = evidenceItems.length
    ? `<h2>Evidencia de pagos (boletas y operaciones bancarias)</h2>${evidenceItems.join('')}`
    : '';

  const bodyRows = rows.map((r: any) => {
    const estado = r.paid
      ? (r.coveredByInitial ? 'Cubierta por la inicial' : 'Pagada')
      : (r.overdue ? 'En mora' : (r.installmentNo === sale.summary?.nextInstallmentNo ? 'Por pagar' : 'Pendiente'));
    const color = r.paid ? '#16A34A' : (r.overdue ? '#DC2626' : (r.installmentNo === sale.summary?.nextInstallmentNo ? '#B45309' : '#64748B'));
    const pay = r.payment;
    const tc = pay?.exchangeRate != null ? Number(pay.exchangeRate) : null;
    const usd = pay?.amountUsd != null ? Number(pay.amountUsd) : (tc && tc > 0 ? Number(r.amount || 0) / tc : null);
    return `<tr>
      <td>${escapeHtml(r.conceptLabel || (r.installmentNo ? `Cuota ${r.installmentNo}` : (TYPE_LABEL[r.type] || 'Pago')))}</td>
      <td>${escapeHtml(r.dueDate ? formatDate(r.dueDate) : '-')}</td>
      <td class="num">${escapeHtml(formatMoney(r.amount))}</td>
      <td>${tc != null ? escapeHtml(String(tc)) : '-'}</td>
      <td>${pay?.paidAt ? escapeHtml(formatDate(pay.paidAt)) : '-'}</td>
      <td class="num">${usd != null ? 'US$ ' + usd.toFixed(2) : '-'}</td>
      <td>${escapeHtml(pay?.bankOperationNumber || '-')}</td>
      <td style="color:${color};font-weight:700">${estado}</td>
    </tr>`;
  }).join('');

  const otherRows = others.map((p: any) => `<tr>
      <td>${escapeHtml(TYPE_LABEL[p.type] || p.type || 'Pago')}</td>
      <td>${escapeHtml(p.dueDate ? formatDate(p.dueDate) : '-')}</td>
      <td class="num">${escapeHtml(formatMoney(p.amount))}</td>
      <td>${p.exchangeRate != null ? escapeHtml(String(p.exchangeRate)) : '-'}</td>
      <td>${p.paidAt ? escapeHtml(formatDate(p.paidAt)) : '-'}</td>
      <td class="num">${p.amountUsd != null ? 'US$ ' + Number(p.amountUsd).toFixed(2) : '-'}</td>
      <td>${escapeHtml(p.bankOperationNumber || '-')}</td>
      <td style="color:#16A34A;font-weight:700">Pagada</td>
    </tr>`).join('');

  printHtml(`
    <html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Historial de pagos - ${escapeHtml(clientName)}</title><style>${PAYMENT_PDF_STYLE}</style></head><body>
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
      <div class="summary">
        <div><span>Precio de venta</span><strong>${escapeHtml(formatMoney(sale.sale?.salePrice || 0))}</strong></div>
        <div><span>Reserva</span><strong>${escapeHtml(formatMoney(sale.summary?.reservaAmount || 0))}</strong></div>
        <div><span>Cuota inicial</span><strong>${escapeHtml(formatMoney(sale.sale?.cuotaInicial || 0))}</strong></div>
        <div><span>Cobrado / Saldo</span><strong>${escapeHtml(formatMoney(sale.summary?.collectedAmount || 0))} / ${escapeHtml(formatMoney(sale.summary?.balanceAmount || 0))}</strong></div>
        <div><span>Cuotas pagadas</span><strong>${sale.summary?.paidCount || 0} de ${sale.summary?.totalCuotas || 0}</strong></div>
        <div><span>Le toca pagar</span><strong>${escapeHtml(sale.summary?.nextConceptLabel || (sale.summary?.nextInstallmentNo ? 'Cuota ' + sale.summary.nextInstallmentNo : 'Todo pagado'))}</strong></div>
      </div>
      <h2>Plan de pagos (reserva, cuota inicial y cuotas, en orden)</h2>
      <table>
        <thead><tr><th>Concepto</th><th>Vence</th><th class="num">Monto</th><th>TC</th><th>Fecha pago</th><th class="num">Pagado US$</th><th>N° Op. Bco</th><th>Estado</th></tr></thead>
        <tbody>${bodyRows || '<tr><td colspan="8">Sin cronograma registrado.</td></tr>'}</tbody>
      </table>
      ${otherRows ? `<h2>Otros pagos (abonos extra)</h2>
      <table>
        <thead><tr><th>Concepto</th><th>Vence</th><th class="num">Monto</th><th>TC</th><th>Fecha pago</th><th class="num">Pagado US$</th><th>N° Op. Bco</th><th>Estado</th></tr></thead>
        <tbody>${otherRows}</tbody>
      </table>` : ''}
      ${evidenceSection}
      <div class="footer">Dunacon - CRM Inmobiliario</div>
    </body></html>
  `);
}

function ChartHeader({ title, subtitle, menuRows, actions }: { title: string; subtitle: string; menuRows: Array<[string, string]>; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: BORDER }}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold" style={{ color: INK }}>{title}</h3>
        <p className="mt-0.5 text-xs" style={{ color: MUTED }}>{subtitle}</p>
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
  const [pdfMonth, setPdfMonth] = useState(currentMonthValue);
  const [overdue, setOverdue] = useState<P[]>([]);
  const [showOverdueAlert, setShowOverdueAlert] = useState(true);
  const [showMoreKpis, setShowMoreKpis] = useState(false);
  const [salesRange, setSalesRange] = useState<3 | 6>(6);
  const [salesPeriod, setSalesPeriod] = useState<'month' | 'year'>('month');
  const { currency, setCurrency, exchangeRate, setExchangeRate, format: show } = useDisplayCurrency();
  const [isNarrow, setIsNarrow] = useState(false);
  const [paySearch, setPaySearch] = useState('');
  const [payClientSearch, setPayClientSearch] = useState('');
  // Marca que el texto del buscador proviene de haber elegido un resultado de la
  // lista (no es un termino tecleado). Sirve para no repetir la busqueda ni
  // mostrar el aviso de "no se encontro" cuando el input ya quedo resuelto.
  const [paySearchPicked, setPaySearchPicked] = useState(false);
  const [payContextLoading, setPayContextLoading] = useState(false);
  // Contexto de la venta elegida (cronograma + cuota que toca + demas pagos).
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
  const [dueDate, setDueDate] = useState('');
  const [payType, setPayType] = useState('reserva');
  const [note, setNote] = useState('');
  const [payMethod, setPayMethod] = useState('yape');
  const [reference, setReference] = useState('');
  const [voucher, setVoucher] = useState<File | null>(null);
  const [voucherUrl, setVoucherUrl] = useState('');
  const [formExchangeRate, setFormExchangeRate] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  // Moneda en la que se capturan los montos del formulario. El sistema guarda en
  // soles (base), asi que al capturar en US$ se convierte con el TC antes de enviar.
  const [amountCurrency, setAmountCurrency] = useState<'PEN' | 'USD'>('PEN');
  const [cuotaCurrency, setCuotaCurrency] = useState<'PEN' | 'USD'>('PEN');
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
    // Al buscar por texto no se fuerza el proyecto: el lote puede pertenecer a
    // otro proyecto y aun asi debe encontrarse para registrar su pago.
    const timer = setTimeout(() => {
      api.get<any>(`/sales/payment-search?${q.toString()}`)
        .then((d) => { if (alive) setSearchResults(d?.results || []); })
        .catch(() => { if (alive) setSearchResults([]); })
        .finally(() => { if (alive) setPayContextLoading(false); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, clientId, lotId, payClientSearch, paySearchPicked]);

  /**
   * Aplica un resultado del buscador al formulario. Si el lote/cliente tiene
   * venta, carga su contexto (cronograma + cuota que toca) para autocompletar;
   * si no la tiene, igual deja lote/cliente seleccionados para registrar el pago.
   */
  function applyPaymentContext(ctx: any, fallback: any = {}) {
    setActiveSale(ctx || null);
    if (ctx?.client?.id) setClientId(Number(ctx.client.id));
    const nextAmount = Number(ctx?.summary?.nextAmount || 0);
    const nextLabel = String(ctx?.summary?.nextConceptLabel || '').toLowerCase();
    if (nextAmount > 0) {
      setAmount(nextAmount);
      setRegCuotaValue(String(nextAmount));
      const rate = Number(formExchangeRate || exchangeRate || 0);
      if (rate > 0) setAmountUsd(String(Math.round((nextAmount / rate) * 100) / 100));
    }
    if (ctx?.summary?.nextDueDate) setDueDate(ctx.summary.nextDueDate);
    if (nextLabel.includes('reserva')) setPayType('reserva');
    else if (nextLabel.includes('inicial')) setPayType('adelanto');
    else if (ctx?.summary?.nextInstallmentNo === 1) setPayType('primera_cuota');
    else setPayType('cuota');
    if (!formExchangeRate && exchangeRate) setFormExchangeRate(String(exchangeRate));
    if (!reference) setReference(`Lote ${ctx?.lot?.code || fallback.lotCode || fallback.lotId || ctx?.sale?.lotId || ''} - ${ctx?.summary?.nextConceptLabel || 'Pago'}`);
  }

  async function selectSearchResult(r: any) {
    if (r.projectId) setPayProjectId(Number(r.projectId));
    if (r.lotId) setLotId(Number(r.lotId));
    if (r.clientId) setClientId(Number(r.clientId));
    setSearchResults([]);
    setPayContextLoading(false);
    // El texto que se muestra es una etiqueta armada (cliente - lote), no un
    // termino buscable: se marca como elegido para no volver a consultar.
    setPaySearchPicked(true);
    setPayClientSearch(r.clientName ? `${r.clientName}${r.lotCode ? ' - Lote ' + r.lotCode : ''}` : `Lote ${r.lotCode || r.lotId}`);
    // Sin venta ni lote: se registra como reserva con lo que haya.
    if (!r.hasSale || !r.lotId) {
      setActiveSale(null);
      setPayType('reserva');
      if (r.lotId) {
        const lot = lots.find((l: any) => Number(l.id) === Number(r.lotId));
        if (lot) setAmount(Number(lot.price || 0));
      }
      return;
    }
    // Con venta: se trae el cronograma y la cuota que le toca pagar.
    try {
      const ctx = await api.get<any>(`/sales/lot/${r.lotId}/history`);
      if (ctx?.agent?.id) {
        const lot = lots.find((l: any) => Number(l.id) === Number(r.lotId));
        if (lot && !lot.agentId) lot.agentId = Number(ctx.agent.id);
      }
      applyPaymentContext(ctx, r);
    } catch {
      setActiveSale(null);
    }
  }

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (lockedProjectId) q.set('projectId', String(lockedProjectId));
      q.set('page', String(page)); q.set('limit', String(limit));
      const back = (await api.get<any>(`/payments?${q.toString()}`)) || {};
      const arr: P[] = Array.isArray(back) ? back : (back.items || []);
      setRows(arr);
      setMeta({
        total: Number(back.total ?? arr.length),
        totalPages: Number(back.totalPages ?? Math.max(1, Math.ceil((back.total ?? arr.length) / limit))),
        distinctLots: Number(back.distinctLots || 0),
        pendingCount: Number(back.pendingCount || 0),
      });
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [status, lockedProjectId, page, limit]);

  useEffect(() => {
    load();
    api.get<{ overdue: P[] }>('/payments/alerts').then((a) => setOverdue(a?.overdue || [])).catch(() => setOverdue([]));
    api.get<any[]>('/lots?limit=200').then((d) => setLots(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
    api.get<any>('/projects').then((d) => setPayProjects(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
    api.get<any[]>('/clients?limit=500').then((d) => setClients(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
  }, [load]);

  useEffect(() => { setPage(1); }, [status, lockedProjectId]);

  useEffect(() => {
    const q = lockedProjectId ? `?projectId=${lockedProjectId}` : '';
    api.get<any>(`/payments/caja${q}`).then(setCash).catch(() => {});
  }, [lockedProjectId]);

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
  async function selectLot(id: number) {
    setLotId(id);
    const lot = lots.find((l: any) => l.id === id);
    if (lot?.clientId) setClientId(Number(lot.clientId));
    if (!id) { setActiveSale(null); return; }
    try {
      const ctx = await api.get<any>(`/sales/lot/${id}/history`);
      applyPaymentContext(ctx, { lotCode: lot?.code, lotId: id });
    } catch {
      setActiveSale(null);
      if (lot) setAmount(Number(lot.price || 0));
      setPayType('reserva');
    }
  }

  async function registrar() {
    if (savingPayment) return;
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!amount) return toast('Ingresa monto', 'err');
    setSavingPayment(true);
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      const saved: any = await api.post('/payments', { projectId: lockedProjectId || lot?.projectId || 1, lotId: Number(lotId), clientId: clientId || lot?.clientId || undefined, agentId: lot?.agentId || undefined, type: payType, amount, dueDate: dueDate || undefined, paymentMethod: payMethod, reference: reference || undefined, note: note || undefined, exchangeRate: formExchangeRate ? Number(formExchangeRate) : undefined, amountUsd: amountUsd ? Number(amountUsd) : undefined, bankOperationNumber: regBankOp.trim() || undefined, receiptNumber: regReceiptNo.trim() || undefined, receiptValue: regCuotaValue ? Number(regCuotaValue) : undefined });
      const attachments = [
        voucher ? uploadFile(`/payments/voucher/${saved?.id}`, voucher) : null,
        regBankOpFile ? uploadFile(`/payments/approval-doc/${saved?.id}`, regBankOpFile) : null,
        regReceiptFile ? uploadFile(`/payments/receipt-doc/${saved?.id}`, regReceiptFile) : null,
      ].filter(Boolean) as Promise<any>[];
      toast(attachments.length ? 'Pago registrado. Subiendo adjuntos...' : 'Pago registrado');
      setOpen(false); setAmount(0); setDueDate(''); setNote(''); setLotId(0); setClientId(0); setPayMethod('yape'); setReference(''); setVoucher(null); setVoucherUrl(''); setFormExchangeRate(''); setAmountUsd('');
      setPayClientSearch(''); setPaySearchPicked(false); setSearchResults([]); setActiveSale(null);
      setAmountCurrency('PEN'); setCuotaCurrency('PEN');
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
    if (window) { try { if (regBankOpUrl.startsWith('blob:')) URL.revokeObjectURL(regBankOpUrl); } catch {} setRegBankOpUrl(URL.createObjectURL(f)); }
  }

  function pickRegReceipt(f?: File) {
    if (!f) { setRegReceiptFile(null); setRegReceiptUrl(''); return; }
    setRegReceiptFile(f);
    if (window) { try { if (regReceiptUrl.startsWith('blob:')) URL.revokeObjectURL(regReceiptUrl); } catch {} setRegReceiptUrl(URL.createObjectURL(f)); }
  }

  function pickVoucher(f?: File) {
    if (!f) { setVoucher(null); setVoucherUrl(''); return; }
    setVoucher(f);
    if (window) { try { if (voucherUrl.startsWith('blob:')) URL.revokeObjectURL(voucherUrl); } catch {} setVoucherUrl(URL.createObjectURL(f)); }
  }

  function openEditPayment(payment: P) {
    setEditingPayment(payment);
    setEditVoucher(null);
    setEditVoucherUrl(payment.voucherUrl || '');
    setApprovalBankOp(payment.bankOperationNumber || '');
    setApprovalReceiptNo(payment.receiptNumber || '');
    setApprovalReceiptValue(payment.receiptValue != null ? String(payment.receiptValue) : '');
    setApprovalDoc(null);
    setApprovalDocUrl(payment.approvalDocumentUrl || '');
  }

  function pickEditVoucher(f?: File) {
    if (!f) { setEditVoucher(null); setEditVoucherUrl(editingPayment?.voucherUrl || ''); return; }
    setEditVoucher(f);
    if (window) { try { if (editVoucherUrl.startsWith('blob:')) URL.revokeObjectURL(editVoucherUrl); } catch {} setEditVoucherUrl(URL.createObjectURL(f)); }
  }

  function pickApprovalDoc(f?: File) {
    if (!f) { setApprovalDoc(null); setApprovalDocUrl(editingPayment?.approvalDocumentUrl || ''); return; }
    setApprovalDoc(f);
    if (window) { try { if (approvalDocUrl.startsWith('blob:')) URL.revokeObjectURL(approvalDocUrl); } catch {} setApprovalDocUrl(URL.createObjectURL(f)); }
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
        receiptValue: Number(approvalReceiptValue),
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
    setHistoryRow(row);
    setHistorySale(null);
    setHistoryLoading(true);
    try {
      // Endpoint dedicado: devuelve la venta del lote (aunque sea una
      // separacion pendiente) con el cronograma y los datos de cada pago.
      const lotId = Number(row.lotId || 0);
      const path = lotId > 0 ? `/sales/lot/${lotId}/history` : `/sales/payment/${row.id}/history`;
      const data = await api.get<any>(path);
      if (data) {
        data.projectLogoUrl = projectsById.get(Number(data.sale?.projectId || row.projectId))?.logoImageUrl || '';
      }
      setHistorySale(data);
    } catch (e: any) {
      toast(e.message, 'err');
      setHistorySale(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function exportMonthPdf() {
    if (!pdfMonth) return toast('Selecciona un mes para descargar el PDF', 'err');

    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (lockedProjectId) q.set('projectId', String(lockedProjectId));
    q.set('page', '1');
    q.set('limit', '500');

    let sourceRows = rows;
    try {
      const back = (await api.get<any>(`/payments?${q.toString()}`)) || {};
      sourceRows = Array.isArray(back) ? back : (back.items || rows);
    } catch {
      sourceRows = rows;
    }

    const monthRows = sourceRows.filter((payment) => {
      const rawDate = payment.paidAt || payment.dueDate || '';
      return rawDate ? String(rawDate).slice(0, 7) === pdfMonth : false;
    });
    if (!monthRows.length) return toast('No hay pagos para ese mes', 'err');

    const total = monthRows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const monthName = monthLabel(pdfMonth);
    const generatedAt = new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
    const bodyRows = monthRows.map((payment) => `
      <tr>
        <td>${escapeHtml(payment.lotCode || `Lote ${payment.lotId}`)}</td>
        <td>${escapeHtml(payment.clientName || '-')}</td>
        <td>${escapeHtml(TYPE_LABEL[payment.type] || payment.type || '-')}</td>
        <td>${escapeHtml(METHOD_LABEL[payment.paymentMethod || ''] || payment.paymentMethod || '-')}</td>
        <td>${escapeHtml(payment.reference || '-')}</td>
        <td class="num">${escapeHtml(formatMoney(payment.amount))}</td>
        <td>${escapeHtml(payment.status || '-')}</td>
        <td>${escapeHtml(formatDate(payment.paidAt || payment.dueDate || ''))}</td>
      </tr>
    `).join('');

    printHtml(`
      <html>
        <head>
          <title>Historial de pagos - ${escapeHtml(monthName)}</title>
          <style>
            body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#111827;background:white}
            .brand{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #1259C4;padding-bottom:12px;margin-bottom:16px}
            .eyebrow{margin:0 0 4px;color:#1259C4;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em}
            h1{margin:0;font-size:23px}
            p{margin:4px 0 0;color:#64748B;font-size:12px}
            .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
            .summary div{border:1px solid #E5E7EB;background:#F8FAFC;border-radius:6px;padding:10px}
            .summary span{display:block;color:#64748B;font-size:9px;font-weight:700;text-transform:uppercase}
            .summary strong{display:block;margin-top:4px;font-size:14px;color:#111827}
            table{width:100%;border-collapse:collapse;table-layout:fixed}
            th{background:#0B2F6E;color:white;border:1px solid #0B2F6E;padding:7px 6px;font-size:9px;text-align:left;text-transform:uppercase}
            td{border:1px solid #E5E7EB;padding:7px 6px;font-size:10px;vertical-align:top;word-wrap:break-word}
            tbody tr:nth-child(even){background:#F8FAFC}
            .num{text-align:right;font-weight:700;color:#1259C4;white-space:nowrap}
            .footer{margin-top:14px;border-top:1px solid #E5E7EB;padding-top:8px;color:#64748B;font-size:10px;text-align:right}
            @media print{body{margin:18px}thead{display:table-header-group}}
          </style>
        </head>
        <body>
          <div class="brand">
            <div>
              <p class="eyebrow">Historial de pagos</p>
              <h1>${escapeHtml(monthName)}</h1>
              <p>Generado ${escapeHtml(generatedAt)}</p>
            </div>
            <div style="text-align:right">
              <p class="eyebrow">CRM Inmobiliario</p>
              <strong>Dunacon</strong>
            </div>
          </div>
          <div class="summary">
            <div><span>Pagos</span><strong>${monthRows.length}</strong></div>
            <div><span>Total</span><strong>${escapeHtml(formatMoney(total))}</strong></div>
            <div><span>Filtro</span><strong>${escapeHtml(status || 'Todos')}</strong></div>
          </div>
          <table>
            <thead>
              <tr><th>Lote</th><th>Cliente</th><th>Tipo</th><th>Medio</th><th>Referencia</th><th>Monto</th><th>Estado</th><th>Fecha</th></tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
          <div class="footer">Dunacon - CRM Inmobiliario</div>
        </body>
      </html>
    `);
  }

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

  const totalPagado = filteredRows.filter((p) => p.status === 'pagado').reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalRegistrado = filteredRows.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalPrecioVenta = filteredRows.reduce((s, p) => s + Number(p.salePrice || 0), 0);
  const totalPagadoUsd = filteredRows
    .filter((p) => p.status === 'pagado')
    .reduce((sum, p) => {
      const tc = Number(p.exchangeRate || exchangeRate || 0);
      const usd = p.amountUsd != null ? Number(p.amountUsd) : (tc > 0 ? Number(p.amount || 0) / tc : 0);
      return sum + (Number.isFinite(usd) ? usd : 0);
    }, 0);
  const pctPago = totalPrecioVenta > 0 ? (totalPagado / totalPrecioVenta) * 100 : 0;
  const pendingPct = meta.total > 0 ? (meta.pendingCount / meta.total) * 100 : 0;
  const byMonth = (cash?.byMonth || []) as { month: string; monto: number }[];
  const salesByMonth = (cash?.salesByMonth || []) as { month: string; monto: number }[];
  const overdueByMonth = (cash?.overdueByMonth || []) as { month: string; monto: number }[];
  const methods = (cash?.methods || []) as { method: string; total: number; monto: number }[];
  const metrics = cash?.metrics || {};
  const totalCollected = Number(metrics.paidCuotasAmount ?? sumRows(methods));
  const totalSalesApproved = Number(metrics.totalSaleAmount ?? sumRows(salesByMonth));
  const totalOverdue = Number(metrics.overdueAmount ?? sumRows(overdueByMonth));
  const collectionRate = totalSalesApproved > 0 ? (totalCollected / totalSalesApproved) * 100 : 0;
  const delinquencyRate = Number(metrics.delinquencyRate ?? ((totalCollected + totalOverdue) > 0 ? (totalOverdue / (totalCollected + totalOverdue)) * 100 : 0));
  const paymentBreakdown = [
    { key: 'inicial', name: 'Pago de Inicial', value: Number(metrics.initialPaymentAmount || 0), color: BLUE },
    { key: 'cuotas', name: 'Pago de Cuotas', value: Number(metrics.paidCuotasAmount || 0), color: GREEN },
    { key: 'pendientes', name: 'Cuotas Pendientes', value: Number(metrics.pendingAmount || 0), color: AMBER },
    { key: 'atraso', name: 'Cuotas en Atraso', value: Number(metrics.overdueAmount || 0), color: RED },
  ].filter((row) => row.value > 0);
  const totalPaymentBreakdown = paymentBreakdown.reduce((sum, row) => sum + row.value, 0);
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
  ).map((r) => ({ label: r.label, monto: currency === 'USD' ? r.monto / exchangeRate : r.monto }));
  const salesChartTotal = salesChartRows.reduce((sum, r) => sum + r.monto, 0);
  const salesChartLast = salesChartRows[salesChartRows.length - 1];
  const salesChartPrev = salesChartRows[salesChartRows.length - 2];
  const salesChartTrend = salesChartPrev && salesChartPrev.monto > 0
    ? ((salesChartLast?.monto || 0) - salesChartPrev.monto) / salesChartPrev.monto * 100
    : ((salesChartLast?.monto || 0) > 0 ? 100 : 0);
  // Formato corto para ejes de graficos segun la moneda activa.
  const shortCurrency = currency === 'USD' ? shortUsd : shortMoney;
  const paymentVsDelinquency = mergeByMonth(lastSixMonths, overdueByMonth.slice(-6))
    .map((row) => ({
      ...row,
      pagado: currency === 'USD' ? Number(row.pagado || 0) / exchangeRate : Number(row.pagado || 0),
      moroso: currency === 'USD' ? Number(row.moroso || 0) / exchangeRate : Number(row.moroso || 0),
    }));
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
        <div className="relative">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 xl:gap-3">
            <KpiTile label="Cuotas Pendientes" value={String(metrics.pendingCuotas || 0)} helper={show(metrics.pendingAmount || 0)} icon={<FiCreditCard />} accent={BLUE} />
            <KpiTile label="Cuotas Pendientes US$" value={show(metrics.pendingAmount || 0)} helper="Saldo pendiente" icon={<FiDollarSign />} accent={BLUE} />
            <KpiTile label="Pagos en Mora" value={String(metrics.overduePayments || 0)} helper={show(metrics.overdueAmount || 0)} icon={<FiAlertTriangle />} accent={RED} />
            <KpiTile label="Pago en mora US$" value={show(metrics.overdueAmount || 0)} helper="Cuotas vencidas" icon={<FiAlertTriangle />} accent={RED} />
            <KpiTile label="Morosidad %" value={pct(delinquencyRate)} helper="Mora sobre pendientes" icon={<FiActivity />} accent={AMBER} />
            <KpiTile label="Pagos por vencer" value={String(metrics.upcomingPayments || 0)} helper="Max 30 dias" icon={<FiCreditCard />} accent={BLUE_DARK} />
            <KpiTile label="Pago por vencer US$" value={show(metrics.upcomingAmount || 0)} helper="Max 30 dias" icon={<FiDollarSign />} accent={BLUE_DARK} />
          </div>

          <button
            type="button"
            className="mx-auto mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto lg:absolute lg:-right-1 lg:top-1/2 lg:mt-0 lg:h-7 lg:w-7 lg:-translate-y-1/2 lg:rounded-full lg:p-0"
            style={{ borderColor: BORDER }}
            onClick={() => setShowMoreKpis((v) => !v)}
            aria-label={showMoreKpis ? 'Ocultar indicadores' : 'Ver mas indicadores'}
            aria-expanded={showMoreKpis}
            title={showMoreKpis ? 'Ocultar indicadores' : 'Ver mas indicadores'}
          >
            <span className="lg:hidden">{showMoreKpis ? 'Ocultar indicadores' : 'Ver más indicadores'}</span>
            <FiChevronDown style={{ transform: showMoreKpis ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
          </button>
        </div>

        {showMoreKpis && (
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 xl:gap-3">
            <KpiTile label="Total venta (lotes)" value={String(metrics.totalSaleLots || 0)} helper={show(metrics.totalSaleAmount || 0)} icon={<FiTrendingUp />} accent={BLUE} />
            <KpiTile label="Total Venta" value={show(metrics.totalSaleAmount || 0)} helper="Ventas y separaciones" icon={<FiDollarSign />} accent={BLUE} />
            <KpiTile label="Pago Inicial US$" value={show(metrics.initialPaymentAmount || 0)} helper="Iniciales pagadas" icon={<FiCreditCard />} accent={GREEN} />
            <KpiTile label="Financiamiento D." value={show(metrics.financingAmount || 0)} helper="Monto financiado" icon={<FiTrendingUp />} accent={BLUE_DARK} />
            <KpiTile label="Cuotas Financiam." value={String(metrics.financedCuotas || 0)} helper="Cronograma generado" icon={<FiCreditCard />} accent={BLUE} />
            <KpiTile label="Pago de Cuotas" value={String(metrics.paidCuotas || 0)} helper={show(metrics.paidCuotasAmount || 0)} icon={<FiCreditCard />} accent={GREEN} />
            <KpiTile label="Pago de Cuotas US$" value={show(metrics.paidCuotasAmount || 0)} helper="Cuotas pagadas" icon={<FiDollarSign />} accent={GREEN} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="card overflow-hidden p-0">
            <ChartHeader
              title="Pago de lotes"
              subtitle="Distribucion del cobro por tipo"
              menuRows={paymentBreakdown.map((row) => [row.name, show(row.value)] as [string, string])}
            />
            {paymentBreakdown.length ? (
              <div className="px-3 pt-4 sm:px-4 sm:pt-5">
                <div className="mx-auto h-[220px] w-full max-w-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentBreakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {paymentBreakdown.map((row) => <Cell key={row.key} fill={row.color} />)}
                      </Pie>
                      <Tooltip formatter={(value: number) => show(Number(value || 0))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5 pb-4">
                  {paymentBreakdown.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3 text-xs">
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate" style={{ color: MUTED }}>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} /> {row.name}
                      </span>
                      <b className="shrink-0 tabular-nums" style={{ color: INK }}>
                        {show(row.value)} · {totalPaymentBreakdown > 0 ? pct((row.value / totalPaymentBreakdown) * 100) : '0.0%'}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            ) : <EmptyChart text="Sin montos para distribuir todavia." />}
          </div>

          <div className="card overflow-hidden p-0 xl:col-span-2">
            <ChartHeader
              title={`Ventas por ${salesPeriod === 'year' ? 'ano' : 'mes'} (${currency === 'USD' ? 'US$' : 'S/'})`}
              subtitle={salesPeriod === 'year' ? 'Historico por ano' : (salesRange === 3 ? 'Ultimos 3 meses' : 'Ultimos 6 meses')}
              menuRows={[
                [salesPeriod === 'year' ? 'Ano actual' : 'Mes actual', show(salesChartLast?.monto || 0)],
                [salesPeriod === 'year' ? 'Ano anterior' : 'Mes anterior', show(salesChartPrev?.monto || 0)],
                ['Variacion', pct(salesChartTrend)],
                ['Total vendido', show(salesChartTotal)],
              ]}
              actions={
                <div className="flex flex-wrap items-center gap-1">
                  <div className="flex items-center gap-1">
                    {([['month', 'Mes'], ['year', 'Ano']] as const).map(([value, label]) => {
                      const active = salesPeriod === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setSalesPeriod(value)}
                          className="h-7 rounded-md border px-2 text-[11px] font-semibold transition-colors sm:px-2.5 sm:text-xs"
                          style={{ borderColor: active ? BLUE : BORDER, background: active ? BLUE : '#fff', color: active ? '#fff' : MUTED }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {salesPeriod === 'month' && (
                    <div className="flex items-center gap-1">
                      {([3, 6] as const).map((value) => {
                        const active = salesRange === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setSalesRange(value)}
                            className="h-7 rounded-md border px-2 text-[11px] font-semibold transition-colors sm:px-2.5 sm:text-xs"
                            style={{
                              borderColor: active ? BLUE : BORDER,
                              background: active ? BLUE : '#fff',
                              color: active ? '#fff' : MUTED,
                            }}
                          >
                            {value}m
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              }
            />
            {salesChartRows.length ? (
              <div className="w-full px-2 pt-4 pb-3 sm:h-[300px] sm:px-4 sm:pt-5">
                <div className="h-[240px] w-full sm:h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesChartRows} margin={{ left: 0, right: 12, top: 12, bottom: 4 }}>
                      <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickFormatter={salesPeriod === 'year' ? (v: string) => v : (isNarrow ? monthLabelShort : monthLabel)}
                        tick={{ fontSize: isNarrow ? 10 : 11, fill: MUTED }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={isNarrow ? 16 : 8}
                        tickMargin={6}
                      />
                      <YAxis
                        tickFormatter={shortCurrency}
                        tick={{ fontSize: isNarrow ? 10 : 11, fill: MUTED }}
                        axisLine={false}
                        tickLine={false}
                        width={isNarrow ? 44 : 62}
                        tickMargin={4}
                      />
                      <Tooltip formatter={(value: number) => show(Number(value || 0))} labelFormatter={(label: string) => (salesPeriod === 'year' ? label : monthLabel(label))} cursor={{ stroke: BLUE, strokeWidth: 1, strokeDasharray: '4 4' }} />
                      <Area type="monotone" dataKey="monto" name="Vendido" stroke={BLUE} strokeWidth={3} fill={BLUE} fillOpacity={0.08} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : <EmptyChart text="Sin ventas para mostrar." />}
          </div>

          <div className="card overflow-hidden p-0 xl:col-span-3">
            <ChartHeader
              title="Pagos vs Morosidad"
              subtitle="Ultimos 6 meses"
              menuRows={[
                ['Pagado actual', show(currentCollected)],
                ['Moroso actual', show(currentOverdue)],
                ['Mora mes anterior', show(previousOverdue)],
                ['Morosidad', pct(currentDelinquencyRate || delinquencyRate)],
              ]}
            />
            {paymentVsDelinquency.length ? (
              <div className="w-full px-2 pt-4 pb-3 sm:h-[330px] sm:px-4 sm:pt-5">
                <div className="h-[260px] w-full sm:h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={paymentVsDelinquency} margin={{ left: 0, right: isNarrow ? 4 : 16, top: 12, bottom: 4 }}>
                      <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickFormatter={isNarrow ? monthLabelShort : monthLabel}
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
        <div className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h3 className="font-semibold">Historial de pagos</h3>
            <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <select className="input w-full sm:!w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Estado: todos</option>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
                <option value="vencido">Vencido</option>
              </select>
              <input
                className="input w-full sm:!w-56"
                placeholder="Buscar por lote, cliente o referencia"
                value={paySearch}
                onChange={(e) => setPaySearch(e.target.value)}
                aria-label="Buscar por codigo de lote o nombre de cliente"
              />
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <input
                  className="input w-full sm:!w-auto"
                  type="month"
                  value={pdfMonth}
                  onChange={(e) => setPdfMonth(e.target.value)}
                  aria-label="Mes para descargar PDF"
                />
                <button className="btn-outline w-full whitespace-nowrap sm:w-auto" type="button" onClick={exportMonthPdf}>Descargar PDF</button>
                <button className="btn-primary w-full whitespace-nowrap sm:w-auto" onClick={() => setOpen(true)}>Registrar pago</button>
              </div>
            </div>
          </div>
        </div>
        <div className="card p-0 overflow-auto">
          {loading ? <p className="p-4 text-slate-400">Cargando…</p>
            : filteredRows.length === 0 ? <EmptyState text={paySearch ? 'No hay pagos que coincidan con la busqueda.' : 'No hay pagos con esos filtros.'} />
            : (
            <>
            <p className="px-4 py-2 text-xs text-slate-400 md:hidden">Desliza la tabla hacia la derecha para ver mas columnas.</p>
            <table className="table-base" style={{ width: '100%', minWidth: 1180 }}>
              <thead><tr>
                <th className="th-base">Id</th><th className="th-base">Lote</th><th className="th-base">Cliente</th>
                <th className="th-base">Precio venta</th><th className="th-base">Tipo de pago</th>
                <th className="th-base">Medio de pago</th><th className="th-base">Referencia</th>
                <th className="th-base">Evidencia</th><th className="th-base">Monto registrado</th><th className="th-base">Monto pagado</th><th className="th-base">Pagado US$</th>
                <th className="th-base">Estado</th><th className="th-base">Vence</th><th className="th-base">Pagado</th>
                <th className="th-base">Recepciona pago</th>
                <th className="th-base">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((p) => (
                  <tr key={p.id}>
                    <td className="td-base text-slate-400">P{p.id}</td>
                    <td className="td-base font-medium">{p.lotCode || `Lote ${p.lotId}`}</td>
                    <td className="td-base">{p.clientName || '—'}</td>
                    <td className="td-base">{p.salePrice ? show(p.salePrice) : '—'}</td>
                    <td className="td-base capitalize">{p.conceptLabel || TYPE_LABEL[p.type] || p.type}</td>
                    <td className="td-base capitalize">{METHOD_LABEL[p.paymentMethod || ''] || p.paymentMethod || '—'}</td>
                    <td className="td-base">{p.reference || '—'}</td>
                    <td className="td-base"><EvidenceButton pay={p} /></td>
                    <td className="td-base font-medium">{show(p.amount)}</td>
                    <td className="td-base font-medium" style={{ color: p.status === 'pagado' ? GREEN : MUTED }}>{p.status === 'pagado' ? show(p.amount) : '—'}</td>
                    <td className="td-base tabular-nums">{(() => {
                      if (p.status !== 'pagado') return '—';
                      const tc = Number(p.exchangeRate || exchangeRate || 0);
                      const usd = p.amountUsd != null ? Number(p.amountUsd) : (tc > 0 ? Number(p.amount || 0) / tc : 0);
                      return usd > 0 ? `US$ ${usd.toFixed(2)}` : '—';
                    })()}</td>
                    <td className="td-base">
                      <div className="flex flex-col items-start gap-1.5">
                        {st(p)}
                        {p.status === 'pendiente' && (
                          <button
                            type="button"
                            className="row-action row-action--primary"
                            onClick={() => openEditPayment(p)}
                            title={payCanMark ? 'Aprobar o editar este pago' : 'Editar este pago'}
                          >
                            <FiEdit3 /> {payCanMark ? 'Aprobar' : 'Editar'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="td-base">{formatDate(p.dueDate)}</td>
                    <td className="td-base">{formatDate(p.paidAt)}</td>
                    <td className="td-base">{p.receivedByName || '—'}</td>
                    <td className="td-base">
                      <button
                        type="button"
                        className="row-action"
                        onClick={() => openHistory(p)}
                        title="Ver historial de cuotas del cliente"
                      >
                        <FiClock /> Historial
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0B2F6E' }}>
                  <td className="td-base font-bold text-white" colSpan={3}>Totales ({filteredRows.length})</td>
                  <td className="td-base font-bold text-white">{show(totalPrecioVenta)}</td>
                  <td className="td-base" colSpan={4}></td>
                  <td className="td-base font-bold text-white">{show(totalRegistrado)}</td>
                  <td className="td-base font-bold text-white">{show(totalPagado)}</td>
                  <td className="td-base font-bold text-white">{totalPagadoUsd > 0 ? `US$ ${totalPagadoUsd.toFixed(2)}` : '—'}</td>
                  <td className="td-base font-bold text-white" colSpan={4} style={{ background: '#16A34A' }}>% Pago: {pctPago.toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
            </>
            )}
            <div className="bg-white p-3 border-t" style={{ borderColor: '#F0F1F3' }}>
              <PaginationBar compact label="Pagos" page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} />
            </div>
        </div>
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
                    onChange={(e) => { setPayClientSearch(e.target.value); setClientId(0); setLotId(0); setPaySearchPicked(false); }}
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
                          {activeSale.summary.nextConceptLabel || `Cuota ${activeSale.summary.nextInstallmentNo}`} · {show(activeSale.summary.nextAmount)}
                          {activeSale.summary.nextDueDate ? ` · vence ${formatDate(activeSale.summary.nextDueDate)}` : ''}
                          {activeSale.summary.nextIsOverdue ? ' · en mora' : ''}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-sm font-bold" style={{ color: GREEN }}>No hay cuotas pendientes.</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">
                          Se registrara como: <b>{activeSale.summary?.nextConceptLabel || (activeSale.summary?.nextInstallmentNo ? `Cuota ${activeSale.summary.nextInstallmentNo}` : 'Pago')}</b>
                        </span>
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
                          Descuenta saldo: <b>si</b>
                        </span>
                        <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">
                          Saldo luego: <b>{show(Math.max(0, Number(activeSale.summary?.balanceAmount || 0) - Number(activeSale.summary?.nextAmount || 0)))}</b>
                        </span>
                      </div>
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
                      <InstallmentGrid sale={activeSale} compact formatter={show} />
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
                        {activeSale.summary.nextConceptLabel || `Cuota N. ${activeSale.summary.nextInstallmentNo}`} — {show(activeSale.summary.nextAmount)} — {formatDate(activeSale.summary.nextDueDate)}
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
                      <InstallmentGrid sale={activeSale} compact formatter={show} />
                    </div>
                  )}
                </div>
                </>
              )}

              {!lockedProjectId && (
                <Field label="Proyecto">
                  <select className="input" value={payProjectId} onChange={(e) => { setPayProjectId(Number(e.target.value)); setLotId(0); setClientId(0); }}>
                    <option value={0}>Selecciona el proyecto…</option>
                    {payProjects.map((pr: any) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Lote">
                  <select className="input" value={lotId} onChange={(e) => selectLot(Number(e.target.value))}>
                    <option value={0}>{payProjectId ? 'Selecciona el lote…' : 'Primero elige un proyecto'}</option>
                    {availableLots.map((l: any) => <option key={l.id} value={l.id}>Lote {l.code} — {show(l.price)}</option>)}
                  </select>
                </Field>
                <Field label="Cliente">
                  <select className="input" value={clientId} onChange={(e) => setClientId(Number(e.target.value))}>
                    <option value={0}>— Sin asignar —</option>
                    {clients.map((c: any) => <option key={c.id} value={c.id}>{c.fullName || c.full_name || '— Sin nombre —'}</option>)}
                  </select>
                </Field>
                <Field label="Tipo de pago">
                  <select className="input" value={payType} onChange={(e) => setPayType(e.target.value)}>
                    <option value="reserva">Reserva</option><option value="adelanto">Cuota inicial</option>
                    <option value="primera_cuota">Cuota normal</option><option value="cuota">Cuota</option>
                  </select>
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
                  <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    {METHODS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Referencia (n.º operación Yape/banco)">
                <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: YAP-48592910 / 0293-4521-1000" />
              </Field>
              <Field label="Comprobante (baucher o captura)">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                    <FiUpload /> <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickVoucher(e.target.files?.[0]); e.target.value = ''; }} /> Subir imagen
                  </label>
                  <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                    <FiCamera /> <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickVoucher(e.target.files?.[0]); e.target.value = ''; }} /> Tomar foto
                  </label>
                  {voucherUrl && (
                    <div className="flex items-center gap-2">
                      <img src={voucherUrl} alt="Voucher" className="w-20 h-20 rounded-lg object-cover border shadow-sm" />
                      <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => setVoucherUrl('')}>Quitar</button>
                    </div>
                  )}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="TC (opcional)"><input type="number" step="0.0001" className="input" value={formExchangeRate} onChange={(e) => setFormExchangeRate(e.target.value)} placeholder="Ej: 3.75" /></Field>
                <AmountField
                  label="Monto US$"
                  value={amountUsd ? Number(amountUsd) : 0}
                  onChange={(next) => setAmountUsd(next ? String(next) : '')}
                  currency="USD"
                  onToggleCurrency={() => setAmountUsd('')}
                  rate={Number(formExchangeRate) || exchangeRate}
                  placeholder="Equivalente en dolares"
                  helper="Se guarda como monto referencial en dolares."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <AmountField
                  label="Monto"
                  value={amount}
                  onChange={setAmount}
                  currency={amountCurrency}
                  onToggleCurrency={() => setAmountCurrency((c) => (c === 'PEN' ? 'USD' : 'PEN'))}
                  rate={Number(formExchangeRate) || exchangeRate}
                  helper={amountCurrency === 'USD' ? `Se guardara ${money(amount)} con TC ${Number(formExchangeRate) || exchangeRate}` : undefined}
                />
                <Field label="Vence (opcional)"><input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
              </div>
              <Field label="Nota (opcional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>

              {/* Datos de la operacion bancaria y boleta. Se adjuntan al registrar
                  el pago para que el admin los revise al aprobar. */}
              <div className="mt-4 space-y-3 rounded-lg border p-3" style={{ borderColor: BORDER, background: '#FAFBFC' }}>
                <p className="text-xs font-semibold" style={{ color: '#B45309' }}>
                  Operacion bancaria y boleta (se revisan al aprobar el pago)
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="N° Op. Bco (opcional)"><input className="input" value={regBankOp} onChange={(e) => setRegBankOp(e.target.value)} placeholder="Ej: 0293-4521-1000" /></Field>
                  <Field label="N° Boleta (opcional)"><input className="input" value={regReceiptNo} onChange={(e) => setRegReceiptNo(e.target.value)} placeholder="Ej: B001-4521" /></Field>
                </div>
                <AmountField
                  label="Valor de la cuota"
                  value={regCuotaValue ? Number(regCuotaValue) : 0}
                  onChange={(next) => setRegCuotaValue(next ? String(next) : '')}
                  currency={cuotaCurrency}
                  onToggleCurrency={() => setCuotaCurrency((c) => (c === 'PEN' ? 'USD' : 'PEN'))}
                  rate={Number(formExchangeRate) || exchangeRate}
                  placeholder="Se llena solo segun la cuota que le toca"
                  helper={cuotaCurrency === 'USD' ? `Se guardara ${money(regCuotaValue ? Number(regCuotaValue) : 0)} con TC ${Number(formExchangeRate) || exchangeRate}` : undefined}
                />
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
              <button className="btn-primary" onClick={registrar} disabled={savingPayment}>{savingPayment ? 'Guardando...' : 'Guardar pago'}</button>
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
                <Field label="Valor Bol"><input type="number" step="0.01" className="input" value={approvalReceiptValue} onChange={(e) => setApprovalReceiptValue(e.target.value)} /></Field>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setHistoryRow(null); setHistorySale(null); }} />
          <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold" style={{ fontSize: 17 }}>Historial de pagos</h3>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {historySale?.client?.fullName || historyRow.clientName || 'Cliente'} — Lote {historySale?.lot?.code || historyRow.lotCode || historyRow.lotId}
                </p>
              </div>
              <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-md border text-slate-500" style={{ borderColor: BORDER }} onClick={() => { setHistoryRow(null); setHistorySale(null); }} aria-label="Cerrar">
                <FiX />
              </button>
            </div>

            {historyLoading && <p className="p-6 text-center text-sm text-slate-400">Cargando historial...</p>}
            {!historyLoading && !historySale && (
              <p className="p-6 text-center text-sm text-slate-400">No se encontro informacion de este lote.</p>
            )}

            {!historyLoading && historySale && (
              <div className="space-y-4">
                {!historySale.sale && (
                  <p className="rounded-md border bg-amber-50 px-3 py-2 text-xs" style={{ borderColor: '#FDE68A', color: '#B45309' }}>
                    Este lote aun no tiene una venta o financiamiento registrado. Abajo se listan los pagos
                    que ya se registraron y de cada uno puedes descargar su ficha.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <MiniMetric label="Precio de venta" value={show(historySale.sale?.salePrice || 0)} />
                  <MiniMetric label="Reserva" value={historySale.summary?.reservaAmount ? show(historySale.summary.reservaAmount) : 'No aplica'} color={historySale.summary?.reservaAmount ? (historySale.summary?.reservaPaid ? GREEN : AMBER) : MUTED} />
                  <MiniMetric label="Cuota inicial" value={show(historySale.sale?.cuotaInicial || 0)} color={historySale.summary?.cuotaInicialPaid ? GREEN : AMBER} />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniMetric label="Cobrado" value={show(historySale.summary?.collectedAmount || 0)} color={GREEN} />
                  <MiniMetric label="Saldo" value={show(historySale.summary?.balanceAmount || 0)} color={BLUE_DARK} />
                  <MiniMetric label="Valor cuota" value={show(historySale.sale?.valorCuota || 0)} />
                  <MiniMetric label="Cuotas pagadas" value={`${historySale.summary?.paidCount || 0} de ${historySale.summary?.totalCuotas || 0}`} color={GREEN} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniMetric label="Le toca pagar" value={historySale.summary?.nextConceptLabel || (historySale.summary?.nextInstallmentNo ? `Cuota ${historySale.summary.nextInstallmentNo}` : 'Todo pagado')} color={AMBER} />
                  <MiniMetric label="Estado del plan" value={String(historySale.sale?.planStatus || 'pendiente')} color={MUTED} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Cronograma de cuotas</span>
                  <button
                    type="button"
                    className="btn-outline !h-9 text-xs"
                    onClick={() => ClientPaymentHistoryPdf({ sale: historySale, projectName: projectsById.get(Number(historySale.sale?.projectId))?.name })}
                  >
                    <FiFileText /> Descargar todo el historial (PDF)
                  </button>
                </div>

                <div className="overflow-auto">
                  <table className="table-base" style={{ width: '100%', minWidth: 820 }}>
                    <thead>
                      <tr>
                        <th className="th-base">Concepto</th>
                        <th className="th-base">Vence</th>
                        <th className="th-base">Monto</th>
                        <th className="th-base">TC</th>
                        <th className="th-base">Fecha pago</th>
                        <th className="th-base">Pagado US$</th>
                        <th className="th-base">N° Op. Bco</th>
                        <th className="th-base">Estado</th>
                        <th className="th-base">Evidencia</th>
                        <th className="th-base">Ficha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(historySale.plan || historySale.installments || []).map((r: any) => {
                        const pay = r.payment;
                        const stateLabel = r.paid
                          ? (r.coveredByInitial ? 'Cubierta por la inicial' : 'Pagada')
                          : (r.overdue ? 'En mora' : (r.installmentNo === historySale.summary?.nextInstallmentNo ? 'Por pagar' : 'Pendiente'));
                        const color = r.paid ? GREEN : (r.overdue ? RED : (r.installmentNo === historySale.summary?.nextInstallmentNo ? AMBER : MUTED));
                        const isInitial = r.kind === 'reserva' || r.kind === 'cuota_inicial';
                        return (
                          <tr key={r.id || r.installmentNo} style={isInitial ? { background: '#F8FBFF' } : undefined}>
                            <td className="td-base font-semibold">
                              {r.conceptLabel || (r.installmentNo ? `Cuota ${r.installmentNo}` : (TYPE_LABEL[r.type] || 'Pago'))}
                              {isInitial && <span className="ml-2 rounded-full bg-[#EEF5FF] px-2 py-0.5 text-[10px] font-semibold text-[#1259C4]">Primero</span>}
                            </td>
                            <td className="td-base">{r.dueDate ? formatDate(r.dueDate) : '—'}</td>
                            <td className="td-base tabular-nums">{show(r.amount)}</td>
                            <td className="td-base">{pay?.exchangeRate != null ? Number(pay.exchangeRate) : '—'}</td>
                            <td className="td-base">{pay?.paidAt ? formatDate(pay.paidAt) : '—'}</td>
                            <td className="td-base tabular-nums">{(() => {
                              const tc = Number(pay?.exchangeRate || exchangeRate || 0);
                              const usd = pay?.amountUsd != null ? Number(pay.amountUsd) : (tc > 0 ? Number(r.amount || 0) / tc : 0);
                              return usd > 0 ? `US$ ${usd.toFixed(2)}` : '—';
                            })()}</td>
                            <td className="td-base">{pay?.bankOperationNumber || '—'}</td>
                            <td className="td-base font-semibold" style={{ color }}>{stateLabel}</td>
                            <td className="td-base"><EvidenceButton pay={pay} compact /></td>
                            <td className="td-base">
                              {r.paid && (
                                <button
                                  type="button"
                                  className="row-action"
                                  onClick={() => PaymentReceiptPdf({ sale: historySale, installment: { ...r, payment: pay }, projectName: projectsById.get(Number(historySale.sale?.projectId))?.name })}
                                >
                                  <FiFileText /> Ficha
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
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

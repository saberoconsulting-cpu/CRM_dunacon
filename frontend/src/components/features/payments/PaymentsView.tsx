'use client';
import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { Toaster, toast, Field, EmptyState } from '@/components/ui/ui';
import { KpiCard } from '@/components/ui/Metrics';
import { api, getToken, uploadFile } from '@/lib/api';
import {
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
import { Select } from '@/components/ui/Select';
import { printHtml } from '@/lib/print';
import { getSocket } from '@/lib/socket';
import { EvidenceButton } from './EvidenceViewer';
import { comparePaymentRows, PAYMENT_CONCEPT_LABEL } from './paymentOrder';
import { FiActivity, FiAlertTriangle, FiCamera, FiClock, FiCreditCard, FiDollarSign, FiEdit3, FiFileText, FiMoreVertical, FiRefreshCw, FiTrendingUp, FiUpload, FiX } from 'react-icons/fi';

type P = {
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
  if (Math.abs(value) >= 1000000) return `US$ ${(value / 1000000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(value) >= 1000) return `US$ ${(value / 1000).toLocaleString('es-PE', { maximumFractionDigits: 0 })}k`;
  return `US$ ${value.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
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

function paymentHistoryInstallmentTotals(sale: any) {
  // La inicial se muestra aparte. Usar las mismas cuotas que el cuadro por cliente.
  const installments = sale?.installments ?? (sale?.plan || []).filter((item: any) => Number(item?.installmentNo || 0) > 0);
  return installments.reduce((totals: { paid: number; pending: number; overdue: number }, item: any) => {
    const amount = Number(item?.amount || 0);
    if (item?.paid) totals.paid += amount;
    else {
      totals.pending += amount;
      if (item?.overdue) totals.overdue += amount;
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

function paymentHistoryRate(sale: any, fallback = DEFAULT_EXCHANGE_RATE) {
  return Number(sale?.sale?.exchangeRate || sale?.sale?.currencyRate || sale?.sale?.tipoCambio || fallback || DEFAULT_EXCHANGE_RATE) || DEFAULT_EXCHANGE_RATE;
}

function paymentHistoryUsd(amount: number | string | null | undefined, rate: number) {
  return `US$ ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function KpiTile({ label, value, helper, icon, accent, truncateLabel = true }: {
  label: string;
  value: string;
  helper: string;
  icon: JSX.Element;
  accent: string;
  truncateLabel?: boolean;
}) {
  return <KpiCard label={label} value={value} helper={helper} icon={icon} tone={accent} truncateLabel={truncateLabel} valueAlign="center" />;
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
  const rate = paymentHistoryRate(sale);
  const bodyRows = rows.map((r: any) => {
    const estado = r.paid ? 'Pagada' : (r.overdue ? 'En mora' : (r.installmentNo === sale.summary?.nextInstallmentNo ? 'Por pagar' : 'Pendiente'));
    const color = r.paid ? '#16A34A' : (r.overdue ? '#DC2626' : (r.installmentNo === sale.summary?.nextInstallmentNo ? '#B45309' : '#64748B'));
    return `<tr><td>${r.installmentNo}</td><td>${escapeHtml(formatDate(r.dueDate))}</td><td class="num">${escapeHtml(paymentHistoryUsd(r.amount, rate))}</td><td style="color:${color};font-weight:700">${estado}</td></tr>`;
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
  const tc = pay?.exchangeRate != null ? Number(pay.exchangeRate) : null;
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
  const rows = sale.plan || [...(sale.installments || []), ...(sale.otherPayments || [])];
  const others = (sale.otherPayments || []).filter((p: any) => !rows.includes(p));
  const rate = paymentHistoryRate(sale);
  const installmentTotals = paymentHistoryInstallmentTotals(sale);
  const initialFeeAmount = paymentHistoryInitialFeeAmount(sale);

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
    const usd = pay?.amountUsd != null ? Number(pay.amountUsd) : (pay ? Number(r.amount || 0) : null);
    return `<tr>
      <td>${escapeHtml(r.conceptLabel || (r.installmentNo ? `Cuota ${r.installmentNo}` : (TYPE_LABEL[r.type] || 'Pago')))}</td>
      <td>${escapeHtml(r.dueDate ? formatDate(r.dueDate) : '-')}</td>
      <td class="num">${escapeHtml(paymentHistoryUsd(r.amount, rate))}</td>
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
      <td class="num">${escapeHtml(paymentHistoryUsd(p.amount, rate))}</td>
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
      <div class="summary history-summary">
        <div><span>Precio de venta US$</span><strong>${escapeHtml(paymentHistoryUsd(sale.sale?.salePrice || 0, rate))}</strong></div>
        <div><span>Reserva US$</span><strong>${escapeHtml(paymentHistoryUsd(sale.summary?.reservaAmount || 0, rate))}</strong></div>
        <div><span>Cuota inicial US$</span><strong>${escapeHtml(paymentHistoryUsd(initialFeeAmount, rate))}</strong></div>
        <div><span>Cobrado US$</span><strong>${escapeHtml(paymentHistoryUsd(sale.summary?.collectedAmount || 0, rate))}</strong></div>
        <div><span>Saldo US$</span><strong>${escapeHtml(paymentHistoryUsd(sale.summary?.balanceAmount || 0, rate))}</strong></div>
        <div><span>Cuotas Pagadas US$</span><strong>${escapeHtml(paymentHistoryUsd(installmentTotals.paid, rate))}</strong></div>
        <div><span>Cuotas por pagar US$</span><strong>${escapeHtml(paymentHistoryUsd(installmentTotals.pending, rate))}</strong></div>
        <div><span>Cuotas en Atraso US$</span><strong>${escapeHtml(paymentHistoryUsd(installmentTotals.overdue, rate))}</strong></div>
        <div><span>Le toca pagar</span><strong>${escapeHtml(sale.summary?.nextConceptLabel || (sale.summary?.nextInstallmentNo ? 'Cuota ' + sale.summary.nextInstallmentNo : 'Sin pagos por registrar'))}</strong></div>
        <div><span>Valor de la Cuota US$</span><strong>${escapeHtml(paymentHistoryUsd(sale.summary?.nextAmount || 0, rate))}</strong></div>
      </div>
      <h2>Plan de pagos (reserva, cuota inicial y cuotas, en orden)</h2>
      <table>
        <thead><tr><th>Concepto</th><th>Vence</th><th class="num">Monto US$</th><th>TC</th><th>Fecha pago</th><th class="num">Pagado US$</th><th>N° Op. Bco</th><th>Estado</th></tr></thead>
        <tbody>${bodyRows || '<tr><td colspan="8">Sin cronograma registrado.</td></tr>'}</tbody>
      </table>
      ${otherRows ? `<h2>Otros pagos (abonos extra)</h2>
      <table>
        <thead><tr><th>Concepto</th><th>Vence</th><th class="num">Monto US$</th><th>TC</th><th>Fecha pago</th><th class="num">Pagado US$</th><th>N° Op. Bco</th><th>Estado</th></tr></thead>
        <tbody>${otherRows}</tbody>
      </table>` : ''}
      ${evidenceSection}
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
    [],
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
  const [dueDate, setDueDate] = useState('');
  const [payType, setPayType] = useState('reserva');
  const [note, setNote] = useState('');
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
    setActiveSale(null); setClientId(0); setAmount(0); setRegCuotaValue('');
    setDueDate(''); setReference(''); setNote(''); setPayType('reserva');
  }

  function applyPaymentContext(ctx: any, fallback: any = {}) {
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
    setPayClientSearch(`Lote ${fallback.lotCode || lot?.code || id}`);
    setPayContextLoading(true);
    try {
      const ctx = await api.get<any>(`/sales/lot/${id}/history`);
      if (requestId !== contextRequest.current) return;
      if (!ctx?.sale) throw new Error('Este lote no tiene una venta con cronograma para autocompletar el pago.');
      if (lockedProjectId && Number(ctx.sale.projectId) !== Number(lockedProjectId)) throw new Error('El lote pertenece a otro proyecto.');
      applyPaymentContext(ctx, { ...fallback, lotId: id, lotCode: fallback.lotCode || lot?.code });
      setPayClientSearch(`${ctx.client?.fullName || fallback.clientName || 'Cliente'} - Lote ${ctx.lot?.code || lot?.code || id}`);
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
    if (!amount) return toast('Ingresa monto', 'err');
    if (!dueDate) return toast('Ingresa la fecha de vencimiento', 'err');
    if (!note.trim()) return toast('Ingresa una nota', 'err');
    if (!regBankOp.trim()) return toast('Ingresa el N° de operacion bancaria', 'err');
    if (!regReceiptNo.trim()) return toast('Ingresa el N° de boleta', 'err');
    if (!(Number(regCuotaValue) > 0)) return toast('Ingresa el valor de la cuota', 'err');
    if (!regBankOpFile) return toast('Adjunta la foto de la operacion bancaria', 'err');
    if (!regReceiptFile) return toast('Adjunta la foto de la boleta', 'err');
    setSavingPayment(true);
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      const amountUsdFinal = Number(amount || 0);
      const saved: any = await api.post('/payments', { projectId: Number(activeSale?.sale?.projectId || payProjectId || lockedProjectId || lot?.projectId), lotId: Number(lotId), clientId: clientId || lot?.clientId || undefined, agentId: lot?.agentId || undefined, type: payType, amount: amountUsdFinal, dueDate: dueDate || undefined, paymentMethod: payMethod, reference: reference || undefined, note: note || undefined, exchangeRate: 1, amountUsd: Number(amountUsdFinal.toFixed(2)), bankOperationNumber: regBankOp.trim() || undefined, receiptNumber: regReceiptNo.trim() || undefined, receiptValue: regCuotaValue ? Number(regCuotaValue) : undefined });
      const attachments = [
        voucher ? uploadFile(`/payments/voucher/${saved?.id}`, voucher) : null,
        regBankOpFile ? uploadFile(`/payments/approval-doc/${saved?.id}`, regBankOpFile) : null,
        regReceiptFile ? uploadFile(`/payments/receipt-doc/${saved?.id}`, regReceiptFile) : null,
      ].filter(Boolean) as Promise<any>[];
      toast(attachments.length ? 'Pago registrado. Subiendo adjuntos...' : 'Pago registrado');
      setOpen(false); setAmount(0); setDueDate(''); setNote(''); setLotId(0); setClientId(0); setPayMethod('yape'); setReference(''); setVoucher(null); setVoucherUrl('');
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
    setApprovalReceiptValue(payment.receiptValue != null ? String(payment.receiptValue) : '');
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

  useEffect(() => {
    if (historyRow) void openHistory(historyRow);
    // Re-fetch after a payment mutation; opening a history fetches it directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentRevision]);

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
    const generatedAt = new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
    
    // Generar SVG del gráfico pie
    const pieSvg = (() => {
      const validBreakdown = paymentBreakdown.filter(r => r.value > 0);
      if (!validBreakdown.length) return '';
      
      const size = 200;
      const cx = size / 2;
      const cy = size / 2;
      const radius = 70;
      const innerRadius = 45;
      let currentAngle = -Math.PI / 2;
      
      const paths = validBreakdown.map(row => {
        const percentage = row.value / totalPaymentBreakdown;
        if (percentage >= 1) return `<circle cx="${cx}" cy="${cy}" r="${(radius + innerRadius) / 2}" fill="none" stroke="${row.color}" stroke-width="${radius - innerRadius}" />`;
        const angle = percentage * 2 * Math.PI;
        
        const x1 = cx + radius * Math.cos(currentAngle);
        const y1 = cy + radius * Math.sin(currentAngle);
        const x2 = cx + radius * Math.cos(currentAngle + angle);
        const y2 = cy + radius * Math.sin(currentAngle + angle);
        
        const ix1 = cx + innerRadius * Math.cos(currentAngle);
        const iy1 = cy + innerRadius * Math.sin(currentAngle);
        const ix2 = cx + innerRadius * Math.cos(currentAngle + angle);
        const iy2 = cy + innerRadius * Math.sin(currentAngle + angle);
        
        const largeArc = angle > Math.PI ? 1 : 0;
        
        const path = `M ${ix1} ${iy1} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
        
        currentAngle += angle;
        
        return `<path d="${path}" fill="${row.color}" />`;
      }).join('');
      
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
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
    

    
    const webPieSvg = document.querySelector('#payments-distribution-chart svg.recharts-surface')?.outerHTML || pieSvg;
    const webBarSvg = document.querySelector('#chart-composed svg.recharts-surface')?.outerHTML || barSvg;
    const cards = summaryKpis.map(({ label, value, helper, accent }) => [label, value, helper, accent]);
    const cardIcons = Array.from(document.querySelectorAll('#payments-primary-kpis .kpi-label svg')).map(svg => svg.outerHTML);
    const cardsHtml = cards.map(([label, value, helper, color], index) => `<div class="kpi" style="border-top-color:${color}"><span class="kpi-label"><i style="color:${color};background:${color}1F">${cardIcons[index] || ''}</i>${escapeHtml(label)}</span><strong style="color:${color}">${escapeHtml(value)}</strong><small>${escapeHtml(helper)}</small></div>`).join('');
    let chartImages = '';
    if (webPieSvg || webBarSvg) {
      chartImages = `
        <div class="charts">
          ${webPieSvg ? `<div class="chart-container">
            <h3 style="margin:0 0 10px 0;font-size:12px;font-weight:700;color:#0B2F6E">Pago de lotes - Distribución del cobro por tipo</h3>
            <div style="text-align:center">${webPieSvg}</div>
            <div style="margin-top:10px;font-size:9px">
              ${paymentBreakdown.filter(r => r.value > 0).map(row => `
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

    const clientRowsHtml = clientReportRows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.lotCode)}</td><td class="num">${row.area.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</td><td>${escapeHtml(row.clientName)}</td><td class="num">${usdMoney(row.salePrice)}</td><td class="num">${usdMoney(row.initialUsd)}</td><td class="num">${usdMoney(row.paidUsd)} (${row.paidCount})</td><td class="num">${usdMoney(row.pendingUsd)} (${row.pendingCount})</td><td class="num">${usdMoney(row.interestUsd)}</td><td class="num">${usdMoney(row.overdueUsd)} (${row.overdueCount})</td></tr>`).join('');
    const clientTable = `<table><thead><tr><th>Id</th><th>Lote</th><th>Area (m²)</th><th>Cliente</th><th>Precio Venta<br>US$</th><th>Cuota Inicial<br>US$</th><th>Cuotas Financ.<br>Pagadas</th><th>Cuotas Financ.<br>por Pagar</th><th>Pago Intereses<br>US$</th><th>Cuotas<br>en mora</th></tr></thead><tbody>${clientRowsHtml}</tbody><tfoot><tr><td colspan="2">Total</td><td>${clientReportTotals.area.toLocaleString('es-PE', { maximumFractionDigits: 2 })} m²</td><td></td><td>${usdMoney(clientReportTotals.salePrice)}</td><td>${usdMoney(clientReportTotals.initialUsd)}</td><td>${usdMoney(clientReportTotals.paidUsd)} (${clientReportTotals.paidCount})</td><td>${usdMoney(clientReportTotals.pendingUsd)} (${clientReportTotals.pendingCount})</td><td>${usdMoney(clientReportTotals.interestUsd)}</td><td>${usdMoney(clientReportTotals.overdueUsd)} (${clientReportTotals.overdueCount})</td></tr></tfoot></table>`;
    printHtml(`
      <html>
        <head>
          <meta charset="utf-8" /><meta name="viewport" content="width=1200, initial-scale=1" /><title>Historial de pagos - ${escapeHtml(dateRange)}</title>
          <style>
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
            tfoot td{background:#000080;color:#fff;font-weight:700}tr{break-inside:avoid}.footer{margin-top:14px;border-top:1px solid #E5E7EB;padding-top:8px;color:#64748B;font-size:10px;text-align:right}
            @page{size:A4 landscape;margin:9mm}@media print{body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}thead{display:table-header-group}tfoot{display:table-row-group}.charts,.brand{break-inside:avoid}}
          </style>
        </head>
        <body>
          <div class="brand">
            <div>
              <p class="eyebrow">Historial de pagos</p>
              <h1>${escapeHtml(dateRange)}</h1>
              <p>Generado ${escapeHtml(generatedAt)}</p>
            </div>
            <div style="text-align:right">
              <p class="eyebrow">CRM Inmobiliario</p>
              <strong>Dunacon</strong>
            </div>
          </div>
          <div class="summary">${cardsHtml}</div>
          ${chartImages}
          ${historyView === 'client' ? clientTable : `<table class="operations-table">
            <colgroup>${[3, 4, 5, 12, 8, 8, 7, 7, 7, 8, 7, 6, 7, 11].map(width => `<col style="width:${width}%">`).join('')}</colgroup>
            <thead>
              <tr><th>Id</th><th>Lote</th><th>Area m²</th><th>Cliente</th><th>Precio venta</th><th>Tipo de pago</th><th>Inicial US$</th><th>Cuota Financ. US$</th><th>Medio de pago</th><th>Monto registrado</th><th>Pagado US$</th><th>Estado</th><th>Pagado</th><th>Recepciona pago</th></tr>
            </thead>
            <tbody>${bodyRows}</tbody><tfoot><tr><td colspan="2">Totales (${monthRows.length})</td><td>${operationTotals.area.toLocaleString('es-PE', { maximumFractionDigits: 2 })} m²</td><td></td><td class="num">${usdMoney(operationTotals.sale)}</td><td></td><td class="num">${usdMoney(operationTotals.initial)}</td><td class="num">${usdMoney(operationTotals.installment)}</td><td></td><td class="num">${usdMoney(operationTotals.registered)}</td><td class="num">${usdMoney(operationTotals.paid)}</td><td colspan="3"></td></tr></tfoot>
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
      acc.interestUsd += row.interestUsd; acc.overdueCount += row.overdueCount; acc.overdueUsd += row.overdueUsd;
      return acc;
    }, { area: 0, salePrice: 0, initialUsd: 0, totalCuotas: 0, paidCount: 0, paidUsd: 0, pendingCount: 0, pendingUsd: 0, interestUsd: 0, overdueCount: 0, overdueUsd: 0 });
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
      <html><head><title>${escapeHtml(title)}</title><style>
        body{font-family:Arial,Helvetica,sans-serif;margin:18px;color:#111827;background:white}
        .brand{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #000080;padding-bottom:10px;margin-bottom:12px}
        h1{margin:0;font-size:20px}.eyebrow{margin:0;color:#64748B;font-size:11px;font-weight:700;text-transform:uppercase}
        table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#808080;color:white;border:1px solid #666;padding:6px 4px;font-size:9px;text-align:center}
        td{border:1px solid #B7B7B7;padding:5px 4px;font-size:9px;vertical-align:middle}.num{text-align:right;white-space:nowrap}
        tfoot td{background:#000080;color:white;font-weight:800}.footer{margin-top:10px;text-align:right;color:#64748B;font-size:10px}
        @media print{@page{size:landscape}body{margin:10px}thead{display:table-header-group}}
      </style></head><body>
        <div class="brand"><div><p class="eyebrow">Pagos de lotes</p><h1>${escapeHtml(title)}</h1></div><strong>Dunacon</strong></div>
        <table><thead><tr>
          <th>Id</th><th>Lote</th><th>Area (m2)</th><th>Cliente</th><th>Precio Venta US$</th><th>Cuota Inicial US$</th>
          <th>Total Cuotas Financ.</th><th>Cuotas Financ. Pagadas (#)</th><th>Cuotas Financ. Pagadas US$</th>
          <th>Cuotas Financ. por Pagar (#)</th><th>Cuotas Financ. por Pagar US$</th><th>Pago Intereses US$</th>
          <th>Cuotas en mora #</th><th>Cuotas en mora US$</th>
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
  const totalOperationArea = filteredRows.reduce((sum, p) => sum + operationAreaOf(p), 0);
  const totalOperationInitial = filteredRows.reduce((sum, p) => sum + operationInitialOf(p), 0);
  const totalOperationFinancingCuota = filteredRows.reduce((sum, p) => sum + operationFinancingCuotaOf(p), 0);
  const historyAmountUsd = (history: any, amount: number) => {
    return Number(amount || 0);
  };
  const paidInterestFromHistory = (history: any) => {
    const installments = (history?.installments || []) as any[];
    const sale = history?.sale || {};
    const tea = Number(sale.tea || 0);
    if (!installments.length || String(sale.interestType || '') !== 'tea' || !(tea > 0)) return 0;
    const monthlyRate = Math.pow(1 + tea / 100, 1 / 12) - 1;
    let remaining = Math.max(0, Number(sale.salePrice || 0) - Number(sale.cuotaInicial || 0));
    return installments.reduce((sum, inst) => {
      const amount = Number(inst.amount || 0);
      const interest = Math.max(0, remaining * monthlyRate);
      const capital = Math.max(0, Math.min(remaining, amount - interest));
      remaining = Math.max(0, remaining - capital);
      return inst.paid ? sum + historyAmountUsd(history, interest) : sum;
    }, 0);
  };
  const paymentSummaryRows = Array.from(filteredRows.reduce((map, payment) => {
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
    const pending = installments.filter(row => !row.paid);
    const overdue = pending.filter(row => row.overdue);
    const initials = (history.plan || []).filter((row: any) => row.kind === 'cuota_inicial');
    const paidInitials = initials.filter((row: any) => row.paid);
    const sum = (items: any[]) => items.reduce((total, row) => total + Number(row.amount || 0), 0);
    return {
      id: Number(history.sale.lotId), lotId: Number(history.sale.lotId),
      lotCode: history.lot?.code || history.lotCode || `Lote ${history.sale.lotId}`,
      area: Number(history.lot?.areaM2 || 0), clientName: history.client?.fullName || history.clientName || '-',
      salePrice: Number(history.sale.salePrice || 0), initialUsd: Number(history.sale.cuotaInicial || 0),
      initialPaidUsd: sum(paidInitials), initialPaidCount: paidInitials.length,
      totalCuotas: installments.length, paidCount: paid.length, paidUsd: sum(paid),
      pendingCount: pending.length, pendingUsd: sum(pending), interestUsd: paidInterestFromHistory(history),
      overdueCount: overdue.length, overdueUsd: sum(overdue),
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
    acc.overdueCount += row.overdueCount;
    acc.overdueUsd += row.overdueUsd;
    return acc;
  }, { area: 0, initialCount: 0, salePrice: 0, initialUsd: 0, initialPaidUsd: 0, initialPaidCount: 0, totalCuotas: 0, paidCount: 0, paidUsd: 0, pendingCount: 0, pendingUsd: 0, interestUsd: 0, overdueCount: 0, overdueUsd: 0 });
  const pendingPct = meta.total > 0 ? (meta.pendingCount / meta.total) * 100 : 0;
  const byMonth = (cash?.byMonth || []) as { month: string; monto: number }[];
  const salesByMonth = (cash?.salesByMonth || []) as { month: string; monto: number }[];
  const overdueByMonth = (cash?.overdueByMonth || []) as { month: string; monto: number }[];
  const methods = (cash?.methods || []) as { method: string; total: number; monto: number }[];
  const metrics = cash?.metrics || {};
  const operationInitialCount = filteredRows.filter((p) => operationInitialOf(p) > 0).length;
  const operationFinancingCount = filteredRows.filter((p) => operationFinancingCuotaOf(p) > 0).length;
  const operationPendingRows = filteredRows.filter((p) => String(p.status) !== 'pagado');
  const operationOverdueRows = operationPendingRows.filter((p) => p.dueDate && String(p.dueDate).slice(0, 10) < new Date().toISOString().slice(0, 10));
  const operationOverdueUsd = operationOverdueRows.reduce((sum, p) => sum + paymentUsd(p), 0);
  const kpiSource = historyView === 'client'
    ? {
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
        delinquencyRate: (clientReportTotals.pendingUsd + clientReportTotals.overdueUsd) > 0
          ? (clientReportTotals.overdueUsd / (clientReportTotals.pendingUsd + clientReportTotals.overdueUsd)) * 100
          : 0,
      }
    : {
        initialPaymentAmount: totalOperationInitial,
        initialPaymentCount: operationInitialCount,
        financedCuotas: operationFinancingCount,
        pendingAmount: Math.max(0, totalRegistrado - totalPagadoUsd),
        overduePayments: operationOverdueRows.length,
        overdueAmount: operationOverdueUsd,
        upcomingPayments: operationPendingRows.length,
        upcomingAmount: Math.max(0, totalRegistrado - totalPagadoUsd),
        totalSaleLots: new Set(filteredRows.map((p) => Number(p.lotId || 0)).filter(Boolean)).size,
        totalSaleAmount: totalPrecioVenta,
        financingAmount: totalOperationFinancingCuota,
        paidCuotas: filteredRows.filter((p) => ['cuota', 'primera_cuota'].includes(String(p.type || p.concept || '')) && p.status === 'pagado').length,
        paidCuotasAmount: filteredRows
          .filter((p) => ['cuota', 'primera_cuota'].includes(String(p.type || p.concept || '')) && p.status === 'pagado')
          .reduce((sum, p) => sum + paymentUsd(p), 0),
        delinquencyRate: (Math.max(0, totalRegistrado - totalPagadoUsd) + operationOverdueUsd) > 0
          ? (operationOverdueUsd / (Math.max(0, totalRegistrado - totalPagadoUsd) + operationOverdueUsd)) * 100
          : 0,
      };
  const kpiMoney = usdMoney;
  const dueHelper = historyView === 'client' ? 'Cuotas por pagar' : 'Pagos pendientes';
  const totalCollected = Number(metrics.paidCuotasAmount ?? sumRows(methods));
  const totalSalesApproved = Number(metrics.totalSaleAmount ?? sumRows(salesByMonth));
  const totalOverdue = Number(metrics.overdueAmount ?? sumRows(overdueByMonth));
  const collectionRate = totalSalesApproved > 0 ? (totalCollected / totalSalesApproved) * 100 : 0;
  const delinquencyRate = Number(kpiSource.delinquencyRate ?? ((totalCollected + totalOverdue) > 0 ? (totalOverdue / (totalCollected + totalOverdue)) * 100 : 0));
  const amountWithCount = (amount: number, count: number) => `${kpiMoney(amount || 0)} (${count || 0})`;
  const summaryKpis = [
    { label: 'Total Venta', value: amountWithCount(kpiSource.totalSaleAmount, kpiSource.totalSaleLots), helper: 'Ventas y separaciones', icon: <FiDollarSign />, accent: BLUE },
    { label: 'Cuotas Iniciales', value: amountWithCount(kpiSource.initialPaymentAmount, kpiSource.initialPaymentCount), helper: 'Iniciales registradas', icon: <FiCreditCard />, accent: GREEN },
    { label: 'Pago de Cuotas', value: amountWithCount(kpiSource.paidCuotasAmount, kpiSource.paidCuotas), helper: `${kpiSource.financedCuotas || 0} cuotas de financiamiento`, icon: <FiTrendingUp />, accent: GREEN },
    { label: 'Cuotas Pendientes', value: amountWithCount(kpiSource.pendingAmount, kpiSource.upcomingPayments), helper: 'Saldo pendiente', icon: <FiDollarSign />, accent: BLUE },
    { label: 'Cuotas en Mora', value: amountWithCount(kpiSource.overdueAmount, kpiSource.overduePayments), helper: 'Cuotas vencidas', icon: <FiAlertTriangle />, accent: RED },
    { label: 'Pagos por vencer', value: amountWithCount(kpiSource.upcomingAmount, kpiSource.upcomingPayments), helper: dueHelper, icon: <FiClock />, accent: BLUE_DARK },
    { label: 'Morosidad %', value: pct(delinquencyRate), helper: 'Mora sobre pendientes', icon: <FiActivity />, accent: AMBER },
  ];
  const paymentBreakdown = [
    { key: 'inicial', name: 'Pago de Inicial', value: Number(metrics.initialPaymentAmount || 0), color: BLUE },
    { key: 'cuotas', name: 'Pago Cuotas Financ.', value: Number(metrics.paidCuotasAmount || 0), color: GREEN },
    { key: 'pendientes', name: 'Cuotas Pendientes', value: Number(Math.max(0, (metrics.totalSaleAmount || 0) - (metrics.initialPaymentAmount || 0) - (metrics.paidCuotasAmount || 0))), color: AMBER },
    { key: 'mora', name: 'Cuotas en Mora', value: Number(metrics.overdueAmount || 0), color: RED },
  ];
  
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
              subtitle="Distribucion del cobro por tipo"
              menuRows={paymentBreakdown.map((row) => [row.name, usdMoney(row.value)] as [string, string])}
            />
            {paymentBreakdown.length ? (
              <div className="px-3 pt-4 sm:px-4 sm:pt-5">
                <div className="mx-auto h-[220px] w-full max-w-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentBreakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {paymentBreakdown.map((row) => <Cell key={row.key} fill={row.color} />)}
                      </Pie>
                      <Tooltip formatter={(value: number) => usdMoney(Number(value || 0))} />
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
                        {usdMoney(row.value)} - {totalPaymentBreakdown > 0 ? pct((row.value / totalPaymentBreakdown) * 100) : '0.0%'}
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
        <div className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Historial de pagos</h3>
              <div className="inline-flex overflow-hidden rounded-md border bg-white" style={{ borderColor: BORDER }}>
                <button type="button" className={`px-3 py-1.5 text-xs font-semibold ${historyView === 'operation' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`} style={historyView === 'operation' ? { background: '#000080' } : undefined} onClick={() => setHistoryView('operation')}>
                  Pago de lotes por Operacion
                </button>
                <button type="button" className={`px-3 py-1.5 text-xs font-semibold ${historyView === 'client' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`} style={historyView === 'client' ? { background: '#000080' } : undefined} onClick={() => setHistoryView('client')}>
                  Pago de lotes por Cliente
                </button>
              </div>
              {canViewAudit && (
                <button
                  type="button"
                  className="btn-neutral !h-8 !px-3 text-xs"
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
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col xl:flex-row xl:flex-nowrap xl:items-center max-sm:[&_.input]:min-w-0 max-sm:[&_.input]:px-2 max-sm:[&_.input]:text-xs max-sm:[&_button]:min-w-0 max-sm:[&_button]:whitespace-normal max-sm:[&_button]:px-2 max-sm:[&_button]:text-xs">
                <Select
                  value={status}
                  onChange={setStatus}
                  className="w-full xl:!w-auto"
                  options={[{ value: '', label: 'Estado: todos' }, { value: 'pagado', label: 'Pagado' }, { value: 'pendiente', label: 'Pendiente' }, { value: 'vencido', label: 'Vencido' }]}
                />
                <input
                  className="input w-full xl:!w-64"
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
                        <th className="th-base whitespace-nowrap">Inicial US$</th><th className="th-base whitespace-nowrap">Cuota Financ. US$</th>
                        <th className="th-base">Medio de pago</th><th className="th-base">Evidencia</th><th className="th-base">Monto registrado</th><th className="th-base">Pagado US$</th>
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
                              return usd > 0 ? `US$ ${usd.toFixed(2)}` : '—';
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
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white">{totalOperationArea.toLocaleString('es-PE', { maximumFractionDigits: 2 })} m²</td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px]"></td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white">{usdMoney(totalPrecioVenta)}</td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px]"></td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white">{usdMoney(totalOperationInitial)}</td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white">{usdMoney(totalOperationFinancingCuota)}</td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px]" colSpan={2}></td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white">{usdMoney(totalRegistrado)}</td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white">{totalPagadoUsd > 0 ? `US$ ${totalPagadoUsd.toFixed(2)}` : '—'}</td>
                          <td className="td-base !px-1.5 !py-1 !text-[11px] font-bold text-white" colSpan={5} style={{ background: '#16A34A' }}>% Pago: {pctPago.toFixed(1)}%</td>
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
                      <colgroup>{[3, 5, 6, 17, 10, 10, 12, 12, 9, 9, 7].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
                      <thead>
                        <tr>
                          <th className="th-base"><div className="min-h-10">Id</div></th>
                          <th className="th-base"><div className="min-h-10">Lote</div></th>
                          <th className="th-base"><div className="min-h-10">Area (m²)</div></th>
                          <th className="th-base"><div className="min-h-10">Cliente</div></th>
                          <th className="th-base"><div className="min-h-10">Precio Venta<br />US$</div></th>
                          <th className="th-base"><div className="min-h-10">Cuota Inicial<br />US$</div></th>
                          <th className="th-base"><div className="min-h-10">Cuotas Financ.<br />Pagadas</div></th>
                          <th className="th-base"><div className="min-h-10">Cuotas Financ.<br />por Pagar</div></th>
                          <th className="th-base"><div className="min-h-10">Pago Intereses<br />US$</div></th>
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
                            Se registrara como: <b>{activeSale.summary?.nextConceptLabel || (activeSale.summary?.nextInstallmentNo ? `Cuota ${activeSale.summary.nextInstallmentNo}` : 'Pago')}</b>
                          </span>
                          <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
                            Descuenta saldo: <b>si</b>
                          </span>
                          <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">
                            Saldo luego: <b>{usdMoney(Math.max(0, Number(activeSale.summary?.balanceAmount || 0) - Number(activeSale.summary?.nextAmount || 0)))}</b>
                          </span>
                        </div>
                        {/* Aviso de coherencia: si el monto capturado no cuadra con la
                          cuota que toca, el saldo quedaria descuadrado. */}
                        {Number(activeSale.summary?.nextAmount || 0) > 0
                          && Math.abs(Number(amount || 0) - Number(activeSale.summary.nextAmount)) > 0.01 && (
                            <p className="mt-2 rounded-md px-2 py-1 text-[11px] font-semibold" style={{ background: '#FFF6E4', color: '#B45309' }}>
                              El monto capturado ({usdMoney(amount)}) no coincide con la cuota que le toca ({usdMoney(activeSale.summary.nextAmount)}). Se descontara el monto capturado.
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
                    options={[{ value: 0, label: payProjectId ? 'Selecciona el lote…' : 'Primero elige un proyecto' }, ...availableLots.map((l: any) => ({ value: l.id, label: `Lote ${l.code} — ${show(l.price)}` }))]}
                  />
                </Field>
                <Field label="Cliente">
                  <Select value={clientId} onChange={(v) => setClientId(Number(v))} options={[{ value: 0, label: '— Sin asignar —' }, ...clients.map((c: any) => ({ value: c.id, label: (c.fullName || c.full_name || '— Sin nombre —') }))]} />
                </Field>
                <Field label="Tipo de pago">
                  <Select value={payType} onChange={setPayType} options={[{ value: 'reserva', label: 'Reserva' }, { value: 'adelanto', label: 'Cuota inicial' }, { value: 'primera_cuota', label: 'Cuota normal' }, { value: 'cuota', label: 'Cuota' }]} />
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Monto US$">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: GREEN }}>US$</span>
                    <input type="number" step="0.01" className="input !pl-12 tabular-nums" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value || 0))} />
                  </div>
                </Field>
                <Field label="Vence"><input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
              </div>
              <Field label="Nota"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>

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
                <Field label="Valor de la cuota US$">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: GREEN }}>US$</span>
                    <input type="number" step="0.01" className="input !pl-12 tabular-nums" value={regCuotaValue} onChange={(e) => setRegCuotaValue(e.target.value)} placeholder="Se llena segun la cuota que le toca" />
                  </div>
                  <p className="mt-1 text-[10px]" style={{ color: MUTED }}>Se autocompleta con la cuota del cronograma. Actual: {usdMoney(regCuotaValue ? Number(regCuotaValue) : 0)}</p>
                </Field>
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
          <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
            <div className="-mx-4 -mt-4 mb-3 flex items-start justify-between gap-3 rounded-t-2xl px-4 py-3 text-white" style={{ background: '#52728F' }}>
              <div className="min-w-0">
                <h3 className="font-semibold" style={{ fontSize: 15 }}>Historial de pagos</h3>
                <p className="mt-1 truncate text-xs text-white/90">
                  {historySale?.client?.fullName || historyRow.clientName || 'Cliente'} - Lote {historySale?.lot?.code || historyRow.lotCode || historyRow.lotId}
                </p>
              </div>
              <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/40 text-white hover:bg-white/10" onClick={() => { setHistoryRow(null); setHistorySale(null); }} aria-label="Cerrar">
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
                        <MiniMetric label="Precio de venta" value={showUsd(historySale.sale?.salePrice || 0)} />
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
                        <MiniMetric label="Cuotas Pagadas US$" value={showUsd(installmentTotals.paid)} color={GREEN} />
                        <MiniMetric label="Cuotas por pagar US$" value={showUsd(installmentTotals.pending)} color={BLUE_DARK} />
                        <MiniMetric label="Cuotas en Atraso US$" value={showUsd(installmentTotals.overdue)} color={RED} />
                        <MiniMetric label="Le toca pagar" value={historySale.summary?.nextConceptLabel || (historySale.summary?.nextInstallmentNo ? `Cuota ${historySale.summary.nextInstallmentNo}` : 'Sin pagos por registrar')} color={AMBER} />
                        <MiniMetric label="Valor de la Cuota US$" value={showUsd(historySale.summary?.nextAmount || 0)} />
                      </div>
                    </>
                  );
                })()}


                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold">Cronograma de cuotas</span>
                  <button
                    type="button"
                    className="btn-outline !h-8 text-[11px]"
                    onClick={() => ClientPaymentHistoryPdf({ sale: historySale, projectName: projectsById.get(Number(historySale.sale?.projectId))?.name })}
                  >
                    <FiFileText /> Descargar todo el historial (PDF)
                  </button>
                </div>

                <div className="overflow-auto">
                  <table className="table-base [&_th]:!px-1.5 [&_th]:!py-1 [&_th]:!text-[9px] [&_th]:!whitespace-normal [&_th]:!leading-tight [&_td]:!px-1.5 [&_td]:!py-1 [&_td]:!text-[11px]" style={{ width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#52728F' }}>
                        <th className="th-base !text-white !bg-[#52728F]">Concepto</th>
                        <th className="th-base !text-white !bg-[#52728F]">Vence</th>
                        <th className="th-base !text-white !bg-[#52728F]">Monto</th>
                        <th className="th-base !text-white !bg-[#52728F]">TC</th>
                        <th className="th-base !text-white !bg-[#52728F]">Fecha pago</th>
                        <th className="th-base !text-white !bg-[#52728F]">Pagado US$</th>
                        <th className="th-base !text-white !bg-[#52728F]">N° Op. Bco</th>
                        <th className="th-base !text-white !bg-[#52728F]">Estado</th>
                        <th className="th-base !text-white !bg-[#52728F]">Evidencia</th>
                        <th className="th-base !text-white !bg-[#52728F]">Ficha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(historySale.plan || historySale.installments || []).map((r: any) => {
                        const pay = r.payment;
                        const stateLabel = r.paid
                          ? (r.coveredByInitial ? 'Cubierta por la inicial' : 'Pagada')
                          : (r.payment ? 'Pendiente de aprobación' : r.overdue ? 'En mora' : (r.installmentNo === historySale.summary?.nextInstallmentNo ? 'Por pagar' : 'Pendiente'));
                        const color = r.paid ? GREEN : (r.overdue ? RED : (r.installmentNo === historySale.summary?.nextInstallmentNo ? AMBER : MUTED));
                        const isInitial = r.kind === 'reserva' || r.kind === 'cuota_inicial';
                        return (
                          <tr key={r.id || r.installmentNo} style={isInitial ? { background: '#F8FBFF' } : undefined}>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] font-semibold">
                              {r.conceptLabel || (r.installmentNo ? `Cuota ${r.installmentNo}` : (TYPE_LABEL[r.type] || 'Pago'))}
                              {isInitial && <span className="ml-1.5 rounded-full bg-[#EEF5FF] px-1.5 py-0.5 text-[9px] font-semibold text-[#1259C4]">Primero</span>}
                            </td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]">{r.dueDate ? formatDate(r.dueDate) : '-'}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] tabular-nums">{showUsd(r.amount)}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]">{pay?.exchangeRate != null ? Number(pay.exchangeRate) : '-'}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]">{pay?.paidAt ? formatDate(pay.paidAt) : '-'}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] tabular-nums">{(() => {
                              const usd = pay?.amountUsd != null ? Number(pay.amountUsd) : Number(r.amount || 0);
                              return usd > 0 ? `US$ ${usd.toFixed(2)}` : '-';
                            })()}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]">{pay?.bankOperationNumber || '-'}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px] font-semibold" style={{ color }}>{stateLabel}</td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]"><EvidenceButton pay={pay} compact /></td>
                            <td className="td-base !px-1.5 !py-1 !text-[11px]">
                              {r.paid && (
                                <button
                                  type="button"
                                  className="row-action !h-5 !text-[9px] !py-0 !px-1.5"
                                  onClick={() => PaymentReceiptPdf({ sale: historySale, installment: { ...r, payment: pay }, projectName: projectsById.get(Number(historySale.sale?.projectId))?.name })}
                                >
                                  <FiFileText size={11} /> Ficha
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#1877F2' }}>
                        <td className="td-base !px-1.5 !py-1 !text-[11px] text-white" colSpan={2}>Total</td>
                        <td className="td-base !px-1.5 !py-1 !text-[11px] tabular-nums text-white">
                          {(() => {
                            const total = (historySale.plan || historySale.installments || []).reduce(
                              (sum: number, r: any) => {
                                const isInitial = r.kind === 'reserva' || r.kind === 'cuota_inicial';
                                return isInitial ? sum : sum + Number(r.amount || 0);
                              }, 0
                            );
                            return showUsd(total);
                          })()}
                        </td>
                        <td className="td-base !px-1.5 !py-1 !text-[11px]" colSpan={2}></td>
                        <td className="td-base !px-1.5 !py-1 !text-[11px] tabular-nums text-white">
                          {(() => {
                            const total = (historySale.plan || historySale.installments || []).reduce((sum: number, r: any) => {
                              const pay = r.payment;
                              if (!pay || !r.paid) return sum;
                              const usd = pay.amountUsd != null ? Number(pay.amountUsd) : Number(r.amount || 0);
                              return sum + usd;
                            }, 0);
                            return total > 0 ? `US$ ${total.toFixed(2)}` : '-';
                          })()}
                        </td>
                        <td className="td-base !px-1.5 !py-1 !text-[11px]" colSpan={4}></td>
                      </tr>
                    </tfoot>
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


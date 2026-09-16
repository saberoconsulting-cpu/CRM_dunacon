'use client';
import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { Toaster, toast, Field, EmptyState } from '@/components/ui/ui';
import { api, uploadFile } from '@/lib/api';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { formatMoney, formatDate } from '@/lib/types';
import { printHtml } from '@/lib/print';
import { FiActivity, FiAlertTriangle, FiCamera, FiChevronDown, FiCreditCard, FiDollarSign, FiMoreVertical, FiTrendingUp, FiUpload, FiX } from 'react-icons/fi';

type P = {
  id: number; projectId: number; lotId: number; type: string; amount: string;
  dueDate?: string | null; paidAt?: string | null; status: string;
  lotCode?: string | null; clientName?: string | null; salePrice?: number | null;
  receivedByName?: string | null; paymentMethod?: string; reference?: string | null; voucherUrl?: string | null;
  exchangeRate?: number | null; amountUsd?: number | null;
  bankOperationNumber?: string | null; receiptNumber?: string | null; receiptValue?: number | null;
  approvalDocumentUrl?: string | null; approvedByName?: string | null; approvedAt?: string | null;
};
const TYPE_LABEL: any = { reserva: 'Reserva', adelanto: 'Cuota inicial', primera_cuota: 'Cuota normal', cuota: 'Cuota' };
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

function FinanceTooltip({ active, payload, label }: any) {
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
            <b style={{ color: INK }}>{String(entry.dataKey).includes('Rate') || String(entry.name).includes('%') ? pct(Number(entry.value || 0)) : money(Number(entry.value || 0))}</b>
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
  return (
    <div className="rounded-md border bg-white px-4 py-3 shadow-sm" style={{ borderColor: BORDER }}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase" style={{ color: MUTED }}>{label}</p>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: `${accent}12`, color: accent }}>
          {icon}
        </span>
      </div>
      <p className="mt-2 truncate text-xl font-bold tabular-nums" style={{ color: INK }}>{value}</p>
      <p className="mt-0.5 truncate text-[11px]" style={{ color: MUTED }}>{helper}</p>
    </div>
  );
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

function PaymentMethodRanking({ items }: { items: Array<{ name: string; value: number; count: number; method: string }> }) {
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
              <span className="shrink-0 tabular-nums" style={{ color: MUTED }}>{money(item.value)} · {item.count}</span>
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

function ChartHeader({ title, subtitle, menuRows, actions }: { title: string; subtitle: string; menuRows: Array<[string, string]>; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: BORDER }}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold" style={{ color: INK }}>{title}</h3>
        <p className="mt-0.5 text-xs" style={{ color: MUTED }}>{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
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
  const [paySearch, setPaySearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1, distinctLots: 0, pendingCount: 0 });
  const [cash, setCash] = useState<any>({ methods: [], byMonth: [], overdueByMonth: [], salesByMonth: [] });
  const [lots, setLots] = useState<any[]>([]);
  const [payProjects, setPayProjects] = useState<any[]>([]);
  const [payProjectId, setPayProjectId] = useState(lockedProjectId || 0);
  const [clients, setClients] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
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
  const [exchangeRate, setExchangeRate] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [editingPayment, setEditingPayment] = useState<P | null>(null);
  const [editVoucher, setEditVoucher] = useState<File | null>(null);
  const [editVoucherUrl, setEditVoucherUrl] = useState('');
  const [approvalBankOp, setApprovalBankOp] = useState('');
  const [approvalReceiptNo, setApprovalReceiptNo] = useState('');
  const [approvalReceiptValue, setApprovalReceiptValue] = useState('');
  const [approvalDoc, setApprovalDoc] = useState<File | null>(null);
  const [approvalDocUrl, setApprovalDocUrl] = useState('');
  const payCanMark = (() => { try { const m = JSON.parse(localStorage.getItem('crm_user') || '{}'); return m.role === 'admin' || m.role === 'superadmin'; } catch { return false; } })();

  useEffect(() => { if (lockedProjectId) setPayProjectId(lockedProjectId); }, [lockedProjectId]);

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

  const availableLots = payProjectId ? lots.filter((l: any) => Number(l.projectId) === Number(payProjectId)) : lots;
  // Al elegir el lote, precargar su cliente asignado (si tiene) — igual se
  // puede cambiar a mano con el selector de Cliente.
  function selectLot(id: number) {
    setLotId(id);
    const lot = lots.find((l: any) => l.id === id);
    if (lot?.clientId) setClientId(Number(lot.clientId));
  }

  async function registrar() {
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!amount) return toast('Ingresa monto', 'err');
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      const saved: any = await api.post('/payments', { projectId: lockedProjectId || lot?.projectId || 1, lotId: Number(lotId), clientId: clientId || lot?.clientId || undefined, agentId: lot?.agentId || undefined, type: payType, amount, dueDate: dueDate || undefined, paymentMethod: payMethod, reference: reference || undefined, note: note || undefined, exchangeRate: exchangeRate ? Number(exchangeRate) : undefined, amountUsd: amountUsd ? Number(amountUsd) : undefined });
      if (voucher) { await uploadFile(`/payments/voucher/${saved?.id}`, voucher); }
      toast(voucher ? 'Pago registrado con comprobante adjunto' : 'Pago registrado');
      setOpen(false); setAmount(0); setDueDate(''); setNote(''); setLotId(0); setClientId(0); setPayMethod('yape'); setReference(''); setVoucher(null); setVoucherUrl(''); setExchangeRate(''); setAmountUsd('');
      load();
    } catch (e: any) { toast(e.message, 'err'); }
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
    if (!term) return rows;
    return rows.filter((p) => {
      const code = String(p.lotCode || `lote ${p.lotId ?? ''}`).toLowerCase();
      const name = String(p.clientName || '').toLowerCase();
      const ref = String(p.reference || '').toLowerCase();
      return code.includes(term) || name.includes(term) || ref.includes(term);
    });
  })();

  const totalPagado = filteredRows.filter((p) => p.status === 'pagado').reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalRegistrado = filteredRows.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalPrecioVenta = filteredRows.reduce((s, p) => s + Number(p.salePrice || 0), 0);
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
  const salesTrends = (() => {
    const nowKey = rangeMonths[rangeMonths.length - 1];
    const prevKey = rangeMonths[rangeMonths.length - 2] || '';
    const nowValue = Number(salesByMonth.find((r) => r.month === nowKey)?.monto || 0);
    const prevValue = Number(salesByMonth.find((r) => r.month === prevKey)?.monto || 0);
    const trend = prevValue > 0 ? ((nowValue - prevValue) / prevValue) * 100 : (nowValue > 0 ? 100 : 0);
    return { nowKey, prevKey, nowValue, prevValue, trend };
  })();
  const paymentVsDelinquency = mergeByMonth(lastSixMonths, overdueByMonth.slice(-6));
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            <KpiTile label="Cuotas Pendientes" value={String(metrics.pendingCuotas || 0)} helper={money(metrics.pendingAmount || 0)} icon={<FiCreditCard />} accent={BLUE} />
            <KpiTile label="Cuotas Pendientes US$" value={money(metrics.pendingAmount || 0)} helper="Saldo pendiente" icon={<FiDollarSign />} accent={BLUE} />
            <KpiTile label="Pagos en Mora" value={String(metrics.overduePayments || 0)} helper={money(metrics.overdueAmount || 0)} icon={<FiAlertTriangle />} accent={RED} />
            <KpiTile label="Pago en mora US$" value={money(metrics.overdueAmount || 0)} helper="Cuotas vencidas" icon={<FiAlertTriangle />} accent={RED} />
            <KpiTile label="Morosidad %" value={pct(delinquencyRate)} helper="Mora sobre pendientes" icon={<FiActivity />} accent={AMBER} />
            <KpiTile label="Pagos por vencer" value={String(metrics.upcomingPayments || 0)} helper="Max 30 dias" icon={<FiCreditCard />} accent={BLUE_DARK} />
            <KpiTile label="Pago por vencer US$" value={money(metrics.upcomingAmount || 0)} helper="Max 30 dias" icon={<FiDollarSign />} accent={BLUE_DARK} />
          </div>

          <button
            type="button"
            className="mx-auto mt-3 grid h-7 w-7 place-items-center rounded-full border bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 lg:absolute lg:-right-1 lg:top-1/2 lg:mt-0 lg:-translate-y-1/2"
            style={{ borderColor: BORDER }}
            onClick={() => setShowMoreKpis((v) => !v)}
            aria-label={showMoreKpis ? 'Ocultar indicadores' : 'Ver mas indicadores'}
            title={showMoreKpis ? 'Ocultar indicadores' : 'Ver mas indicadores'}
          >
            <FiChevronDown style={{ transform: showMoreKpis ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
          </button>
        </div>

        {showMoreKpis && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            <KpiTile label="Total venta (lotes)" value={String(metrics.totalSaleLots || 0)} helper={money(metrics.totalSaleAmount || 0)} icon={<FiTrendingUp />} accent={BLUE} />
            <KpiTile label="Total Venta" value={money(metrics.totalSaleAmount || 0)} helper="Ventas y separaciones" icon={<FiDollarSign />} accent={BLUE} />
            <KpiTile label="Pago Inicial US$" value={money(metrics.initialPaymentAmount || 0)} helper="Iniciales pagadas" icon={<FiCreditCard />} accent={GREEN} />
            <KpiTile label="Financiamiento D." value={money(metrics.financingAmount || 0)} helper="Monto financiado" icon={<FiTrendingUp />} accent={BLUE_DARK} />
            <KpiTile label="Cuotas Financiam." value={String(metrics.financedCuotas || 0)} helper="Cronograma generado" icon={<FiCreditCard />} accent={BLUE} />
            <KpiTile label="Pago de Cuotas" value={String(metrics.paidCuotas || 0)} helper={money(metrics.paidCuotasAmount || 0)} icon={<FiCreditCard />} accent={GREEN} />
            <KpiTile label="Pago de Cuotas US$" value={money(metrics.paidCuotasAmount || 0)} helper="Cuotas pagadas" icon={<FiDollarSign />} accent={GREEN} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="card overflow-hidden p-0">
            <ChartHeader
              title="Ventas por mes (S/)"
              subtitle={salesRange === 3 ? 'Ultimos 3 meses' : 'Ultimos 6 meses'}
              menuRows={[
                ['Mes actual', money(salesTrends.nowValue)],
                ['Mes anterior', money(salesTrends.prevValue)],
                ['Variacion', pct(salesTrends.trend)],
                ['Total vendido', money(totalSalesApproved)],
              ]}
              actions={
                <div className="flex items-center gap-1">
                  {([3, 6] as const).map((value) => {
                    const active = salesRange === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSalesRange(value)}
                        className="h-7 rounded-md border px-2.5 text-xs font-semibold transition-colors"
                        style={{
                          borderColor: active ? BLUE : BORDER,
                          background: active ? BLUE : '#fff',
                          color: active ? '#fff' : MUTED,
                        }}
                      >
                        {value} meses
                      </button>
                    );
                  })}
                </div>
              }
            />
            {salesRangeRows.length ? (
              <div className="mx-auto h-[260px] w-full max-w-[680px] px-3 pt-4 sm:h-[300px] sm:px-4 sm:pt-5">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesRangeRows.map((r) => ({ month: r.month, vendido: Number(r.monto || 0) }))} margin={{ left: 8, right: 20, top: 12, bottom: 16 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={62} />
                    <Tooltip content={<FinanceTooltip />} cursor={{ stroke: BLUE, strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Area type="monotone" dataKey="vendido" name="Vendido" stroke={BLUE} strokeWidth={3} fill={BLUE} fillOpacity={0.08} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyChart text="Sin ventas por mes para mostrar." />}
          </div>

          <div className="card overflow-hidden p-0">
            <ChartHeader
              title="Pagos vs Morosidad"
              subtitle="Ultimos 6 meses"
              menuRows={[
                ['Pagado actual', money(currentCollected)],
                ['Moroso actual', money(currentOverdue)],
                ['Mora mes anterior', money(previousOverdue)],
                ['Morosidad', pct(currentDelinquencyRate || delinquencyRate)],
              ]}
            />
            {paymentVsDelinquency.length ? (
              <div className="mx-auto h-[290px] w-full max-w-[680px] px-3 pt-4 sm:h-[330px] sm:px-4 sm:pt-5">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={paymentVsDelinquency} margin={{ left: 8, right: 24, top: 12, bottom: 16 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tickFormatter={shortMoney} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={62} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={shortMoney} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={62} />
                    <Tooltip content={<FinanceTooltip />} />
                    <Bar yAxisId="left" dataKey="pagado" name="Pagado" stackId="cash" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={46} />
                    <Bar yAxisId="left" dataKey="moroso" name="Moroso" stackId="cash" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={46} />
                    <Line yAxisId="right" type="monotone" dataKey="moroso" name="Moroso" stroke={RED} strokeWidth={2} dot={{ r: 3, fill: '#fff', stroke: RED, strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
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
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
              <div className="flex gap-2">
                <input
                  className="input flex-1 sm:!w-auto"
                  type="month"
                  value={pdfMonth}
                  onChange={(e) => setPdfMonth(e.target.value)}
                  aria-label="Mes para descargar PDF"
                />
                <button className="btn-ghost whitespace-nowrap" type="button" onClick={exportMonthPdf}>Descargar PDF</button>
                <button className="btn-primary whitespace-nowrap" onClick={() => setOpen(true)}>Registrar pago</button>
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
                <th className="th-base">Voucher</th><th className="th-base">Monto registrado</th><th className="th-base">Monto pagado</th>
                <th className="th-base">Estado</th><th className="th-base">Vence</th><th className="th-base">Pagado</th>
                <th className="th-base">Recepciona pago</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((p) => (
                  <tr key={p.id}>
                    <td className="td-base text-slate-400">P{p.id}</td>
                    <td className="td-base font-medium">{p.lotCode || `Lote ${p.lotId}`}</td>
                    <td className="td-base">{p.clientName || '—'}</td>
                    <td className="td-base">{p.salePrice ? formatMoney(p.salePrice) : '—'}</td>
                    <td className="td-base capitalize">{TYPE_LABEL[p.type] || p.type}</td>
                    <td className="td-base capitalize">{METHOD_LABEL[p.paymentMethod || ''] || p.paymentMethod || '—'}</td>
                    <td className="td-base">{p.reference || '—'}</td>
                    <td className="td-base">{p.voucherUrl ? <a href={p.voucherUrl} target="_blank" rel="noreferrer" className="text-[#1877F2] hover:underline">Ver voucher</a> : '—'}</td>
                    <td className="td-base font-medium">{formatMoney(p.amount)}</td>
                    <td className="td-base font-medium" style={{ color: p.status === 'pagado' ? GREEN : MUTED }}>{p.status === 'pagado' ? formatMoney(p.amount) : '—'}</td>
                    <td className="td-base">
                      <div className="flex flex-col items-start gap-1">
                        {st(p)}
                        {p.status === 'pendiente' && (
                          <button type="button" className="btn-secondary !h-6 !px-2 text-[11px] whitespace-nowrap" onClick={() => openEditPayment(p)}>{payCanMark ? 'Aprobar / Editar' : 'Editar'}</button>
                        )}
                      </div>
                    </td>
                    <td className="td-base">{formatDate(p.dueDate)}</td>
                    <td className="td-base">{formatDate(p.paidAt)}</td>
                    <td className="td-base">{p.receivedByName || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0B2F6E' }}>
                  <td className="td-base font-bold text-white" colSpan={3}>Totales ({filteredRows.length})</td>
                  <td className="td-base font-bold text-white">{formatMoney(totalPrecioVenta)}</td>
                  <td className="td-base" colSpan={4}></td>
                  <td className="td-base font-bold text-white">{formatMoney(totalRegistrado)}</td>
                  <td className="td-base font-bold text-white">{formatMoney(totalPagado)}</td>
                  <td className="td-base font-bold text-white" colSpan={4} style={{ background: '#16A34A' }}>% Pago: {pctPago.toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
            </>
            )}
            <div className="bg-white p-3 border-t" style={{ borderColor: '#F0F1F3' }}>
              <PaginationBar label="Pagos" page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} setLimit={setLimit} />
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
                    {availableLots.map((l: any) => <option key={l.id} value={l.id}>Lote {l.code} — {formatMoney(l.price)}</option>)}
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
                <Field label="TC (opcional)"><input type="number" step="0.0001" className="input" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="Ej: 3.75" /></Field>
                <Field label="Monto US$ (opcional)"><input type="number" step="0.01" className="input" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monto (S/)"><input type="number" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
                <Field label="Vence (opcional)"><input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
              </div>
              <Field label="Nota (opcional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </div>

            {/* Pie */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-canvas" style={{ borderColor: '#EEF0F2' }}>
              <button className="btn-neutral" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={registrar}>Registrar pago</button>
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
                <p className="mt-1 text-sm text-slate-500">Lote {editingPayment.lotCode || editingPayment.lotId} - {formatMoney(editingPayment.amount)}</p>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-md border text-slate-500" style={{ borderColor: BORDER }} onClick={() => setEditingPayment(null)} aria-label="Cerrar">
                <FiX />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <MiniMetric label="Monto registrado" value={formatMoney(editingPayment.amount)} />
              <MiniMetric label="Monto pagado" value={editingPayment.status === 'pagado' ? formatMoney(editingPayment.amount) : 'S/ 0'} color={GREEN} />
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

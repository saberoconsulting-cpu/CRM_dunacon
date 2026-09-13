'use client';
import { useEffect, useState, useCallback } from 'react';
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
import { FiActivity, FiAlertTriangle, FiArrowUpRight, FiCamera, FiCreditCard, FiDollarSign, FiTrendingUp, FiUpload } from 'react-icons/fi';

type P = {
  id: number; projectId: number; lotId: number; type: string; amount: string;
  dueDate?: string | null; paidAt?: string | null; status: string;
  lotCode?: string | null; clientName?: string | null; salePrice?: number | null;
  receivedByName?: string | null; paymentMethod?: string; reference?: string | null; voucherUrl?: string | null;
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

function shortMoney(n: number) {
  const value = Number(n || 0);
  if (Math.abs(value) >= 1000000) return `S/ ${(value / 1000000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(value) >= 1000) return `S/ ${(value / 1000).toLocaleString('es-PE', { maximumFractionDigits: 0 })}k`;
  return `S/ ${value.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
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

function TrendBadge({ value, label = 'vs mes ant.' }: { value: number; label?: string }) {
  const color = value >= 0 ? GREEN : RED;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${color}14`, color }}>
      {value >= 0 ? '+' : ''}{pct(value)} {label}
    </span>
  );
}

function KpiTile({ label, value, helper, icon, accent, trend }: {
  label: string;
  value: string;
  helper: string;
  icon: JSX.Element;
  accent: string;
  trend?: number;
}) {
  return (
    <div className="rounded-md border bg-white p-3 shadow-sm" style={{ borderColor: BORDER }}>
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ background: `${accent}14`, color: accent }}>
          {icon}
        </span>
        {trend != null && <TrendBadge value={trend} label="" />}
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase" style={{ color: MUTED }}>{label}</p>
      <p className="mt-0.5 truncate text-xl font-bold tabular-nums" style={{ color: INK }}>{value}</p>
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
    <div className="space-y-3 px-5 py-4">
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

export default function PaymentsView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [rows, setRows] = useState<P[]>([]);
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState<P[]>([]);
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
      const saved: any = await api.post('/payments', { projectId: lockedProjectId || lot?.projectId || 1, lotId: Number(lotId), clientId: clientId || lot?.clientId || undefined, agentId: lot?.agentId || undefined, type: payType, amount, dueDate: dueDate || undefined, paymentMethod: payMethod, reference: reference || undefined, note: note || undefined });
      if (voucher) { await uploadFile(`/payments/voucher/${saved?.id}`, voucher); }
      toast(voucher ? 'Pago registrado con comprobante adjunto' : 'Pago registrado');
      setOpen(false); setAmount(0); setDueDate(''); setNote(''); setLotId(0); setClientId(0); setPayMethod('yape'); setReference(''); setVoucher(null); setVoucherUrl('');
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  function pickVoucher(f?: File) {
    if (!f) { setVoucher(null); setVoucherUrl(''); return; }
    setVoucher(f);
    if (window) { try { if (voucherUrl.startsWith('blob:')) URL.revokeObjectURL(voucherUrl); } catch {} setVoucherUrl(URL.createObjectURL(f)); }
  }

  const st = (p: P) => { const bg = BADGE[p.status] || ['#eaedf1', '#6b7280']; return <span className="badge" style={{ background: bg[0], color: bg[1] }}>{p.status}</span>; };

  const totalPagado = rows.filter((p) => p.status === 'pagado').reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalPrecioVenta = rows.reduce((s, p) => s + Number(p.salePrice || 0), 0);
  const pctPago = totalPrecioVenta > 0 ? (totalPagado / totalPrecioVenta) * 100 : 0;
  const pendingPct = meta.total > 0 ? (meta.pendingCount / meta.total) * 100 : 0;
  const byMonth = (cash?.byMonth || []) as { month: string; monto: number }[];
  const salesByMonth = (cash?.salesByMonth || []) as { month: string; monto: number }[];
  const overdueByMonth = (cash?.overdueByMonth || []) as { month: string; monto: number }[];
  const methods = (cash?.methods || []) as { method: string; total: number; monto: number }[];
  const financialTimeline = mergeFinancialMonths(byMonth, overdueByMonth, salesByMonth);
  const totalCollected = sumRows(methods);
  const totalSalesApproved = sumRows(salesByMonth);
  const totalOverdue = sumRows(overdueByMonth);
  const collectionRate = totalSalesApproved > 0 ? (totalCollected / totalSalesApproved) * 100 : 0;
  const delinquencyRate = (totalCollected + totalOverdue) > 0 ? (totalOverdue / (totalCollected + totalOverdue)) * 100 : 0;
  const currentCollected = lastValue(byMonth);
  const previousCollected = previousValue(byMonth);
  const collectedTrend = variation(currentCollected, previousCollected);
  const currentSales = lastValue(salesByMonth);
  const previousSales = previousValue(salesByMonth);
  const salesTrend = variation(currentSales, previousSales);
  const currentOverdue = lastValue(overdueByMonth);
  const previousOverdue = previousValue(overdueByMonth);
  const overdueTrend = variation(currentOverdue, previousOverdue);
  const currentCollectionRate = currentSales > 0 ? (currentCollected / currentSales) * 100 : 0;
  const previousCollectionRate = previousSales > 0 ? (previousCollected / previousSales) * 100 : 0;
  const currentDelinquencyRate = currentCollected + currentOverdue > 0 ? (currentOverdue / (currentCollected + currentOverdue)) * 100 : 0;
  const previousDelinquencyRate = previousCollected + previousOverdue > 0 ? (previousOverdue / (previousCollected + previousOverdue)) * 100 : 0;
  const rateTrend = currentCollectionRate - previousCollectionRate;
  const delinquencyTrend = currentDelinquencyRate - previousDelinquencyRate;
  const methodBars = methods.map((m) => ({
    name: METHOD_LABEL[m.method] || m.method || 'Otro',
    value: Number(m.monto || 0),
    count: Number(m.total || 0),
    method: m.method || 'otro',
  }));

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        {overdue.length > 0 && (
          <div className="rounded-lg border px-3 py-2 text-sm" style={{ background: '#E7F0FE', borderColor: '#A9C9FB', color: '#1259C4' }}>
            <b>{overdue.length}</b> cuotas vencidas detectadas. Regístralas para actualizar la cartera.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Caja cobrada" value={money(totalCollected)} helper="Pagos confirmados en caja" icon={<FiDollarSign />} accent={GREEN} trend={collectedTrend} />
          <KpiTile label="Ventas aprobadas" value={money(totalSalesApproved)} helper={`${meta.distinctLots} lotes con movimiento`} icon={<FiTrendingUp />} accent={BLUE} trend={salesTrend} />
          <KpiTile label="Mora vencida" value={money(totalOverdue)} helper={`${overdue.length} cuotas vencidas detectadas`} icon={<FiAlertTriangle />} accent={RED} trend={overdueTrend} />
          <KpiTile label="Tasa de cobro" value={pct(collectionRate)} helper={`${pct(delinquencyRate)} de mora sobre cartera`} icon={<FiActivity />} accent={BLUE_DARK} trend={rateTrend} />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="card overflow-hidden p-0">
            <div className="space-y-3 border-b px-5 py-4" style={{ borderColor: BORDER }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold" style={{ color: INK }}>Flujo de caja cobrado</h3>
                  <p className="mt-1 text-xs" style={{ color: MUTED }}>Tendencia mensual de pagos confirmados. Pasa el mouse para ver el monto exacto.</p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: '#EAF7EE', color: GREEN }}>
                  Ultimo mes: {money(currentCollected)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <MiniMetric label="Mes actual" value={money(currentCollected)} color={GREEN} />
                <MiniMetric label="Mes anterior" value={money(previousCollected)} />
                <div className="col-span-2 flex items-center rounded-md border bg-white px-3 py-2 sm:col-span-1" style={{ borderColor: BORDER }}>
                  <TrendBadge value={collectedTrend} />
                </div>
              </div>
            </div>
            {byMonth.length ? (
              <div className="h-[260px] px-3 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={byMonth.map((r) => ({ month: r.month, cobrado: Number(r.monto || 0) }))} margin={{ left: 8, right: 20, top: 12, bottom: 8 }}>
                    <defs>
                      <linearGradient id="cashGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={BLUE} stopOpacity={0.34} />
                        <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={62} />
                    <Tooltip content={<FinanceTooltip />} cursor={{ stroke: BLUE, strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Area type="monotone" dataKey="cobrado" name="Caja cobrada" stroke={BLUE} strokeWidth={3} fill="url(#cashGradient)" activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyChart text="Sin pagos confirmados todavia." />}
          </div>

          <div className="card overflow-hidden p-0">
            <div className="border-b px-5 py-4" style={{ borderColor: BORDER }}>
              <h3 className="font-semibold" style={{ color: INK }}>Canales de cobro</h3>
              <p className="mt-1 text-xs" style={{ color: MUTED }}>Ranking por medio de pago confirmado, sin barras sobredimensionadas.</p>
            </div>
            {methodBars.length ? (
              <PaymentMethodRanking items={methodBars} />
            ) : <EmptyChart text="Aun no hay pagos pagados para mostrar canales." />}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="card overflow-hidden p-0">
            <div className="space-y-3 border-b px-5 py-4" style={{ borderColor: BORDER }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold" style={{ color: INK }}>Ventas aprobadas vs caja cobrada</h3>
                  <p className="mt-1 text-xs" style={{ color: MUTED }}>Compara lo vendido con lo efectivamente recaudado por mes.</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold" style={{ background: '#EAF3FF', color: BLUE }}>
                  <FiArrowUpRight /> Ratio {pct(collectionRate)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniMetric label="Vendido actual" value={money(currentSales)} color={BLUE} />
                <MiniMetric label="Caja actual" value={money(currentCollected)} color={GREEN} />
                <MiniMetric label="Ratio actual" value={pct(currentCollectionRate)} color={BLUE_DARK} />
                <div className="flex items-center rounded-md border bg-white px-3 py-2" style={{ borderColor: BORDER }}>
                  <TrendBadge value={rateTrend} />
                </div>
              </div>
            </div>
            {financialTimeline.length ? (
              <div className="h-[260px] px-3 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={financialTimeline} margin={{ left: 8, right: 18, top: 12, bottom: 8 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="money" tickFormatter={shortMoney} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={62} />
                    <YAxis yAxisId="rate" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 100]} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={38} />
                    <Tooltip content={<FinanceTooltip />} />
                    <Bar yAxisId="money" dataKey="vendido" name="Ventas aprobadas" fill="#D8E0EA" radius={[6, 6, 0, 0]} barSize={12} />
                    <Line yAxisId="money" type="monotone" dataKey="cobrado" name="Caja cobrada" stroke={GREEN} strokeWidth={3} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    <Line yAxisId="rate" type="monotone" dataKey="collectionRate" name="% cobro" stroke={BLUE} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyChart text="Aun no hay ventas o pagos para comparar." />}
          </div>

          <div className="card overflow-hidden p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: BORDER }}>
              <div>
                <h3 className="font-semibold" style={{ color: INK }}>Riesgo de morosidad</h3>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>Pagos cobrados frente a cuotas vencidas por mes.</p>
              </div>
              <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: '#FEE2E2', color: RED }}>
                Mora {pct(currentDelinquencyRate || delinquencyRate)}
              </span>
            </div>
            {financialTimeline.length ? (
              <>
              <div className="grid grid-cols-2 gap-2 px-5 pt-4 sm:grid-cols-4">
                <MiniMetric label="Cobrado actual" value={money(currentCollected)} color={GREEN} />
                <MiniMetric label="Mora actual" value={money(currentOverdue)} color={RED} />
                <MiniMetric label="Mes anterior" value={money(previousOverdue)} />
                <div className="flex items-center rounded-md border bg-white px-3 py-2" style={{ borderColor: BORDER }}>
                  <TrendBadge value={delinquencyTrend} />
                </div>
              </div>
              <div className="h-[260px] px-3 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={financialTimeline} margin={{ left: 8, right: 18, top: 12, bottom: 8 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="money" tickFormatter={shortMoney} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={62} />
                    <YAxis yAxisId="rate" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 100]} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={38} />
                    <Tooltip content={<FinanceTooltip />} />
                    <Bar yAxisId="money" dataKey="moroso" name="Mora vencida" fill="#FCA5A5" radius={[6, 6, 0, 0]} barSize={12} />
                    <Line yAxisId="money" type="monotone" dataKey="cobrado" name="Cobrado" stroke={GREEN} strokeWidth={3} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    <Line yAxisId="rate" type="monotone" dataKey="delinquencyRate" name="% mora" stroke={AMBER} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              </>
            ) : <EmptyChart text="Sin datos suficientes todavia." />}
          </div>
        </div>
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Historial de pagos</h3>
            <div className="flex flex-wrap gap-2">
              <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Estado: todos</option>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
                <option value="vencido">Vencido</option>
              </select>
              <button className="btn-primary" onClick={() => setOpen(true)}>Registrar pago</button>
            </div>
          </div>
        </div>
        <div className="card p-0 overflow-auto">
          {loading ? <p className="p-4 text-slate-400">Cargando…</p>
            : rows.length === 0 ? <EmptyState text="No hay pagos con esos filtros." />
            : (
            <table className="table-base" style={{ width: '100%', minWidth: 1180 }}>
              <thead><tr>
                <th className="th-base">Id</th><th className="th-base">Lote</th><th className="th-base">Cliente</th>
                <th className="th-base">Precio venta</th><th className="th-base">Tipo de pago</th>
                <th className="th-base">Medio de pago</th><th className="th-base">Referencia</th>
                <th className="th-base">Voucher</th><th className="th-base">Monto</th>
                <th className="th-base">Estado</th><th className="th-base">Vence</th><th className="th-base">Pagado</th>
                <th className="th-base">Recepciona pago</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => (
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
                    <td className="td-base">{st(p)}{p.status === 'pendiente' && p.voucherUrl && payCanMark && <button className="btn-primary !h-6 !px-2 text-xs ml-2 align-middle" onClick={(e) => { e.stopPropagation(); if (!confirm(`¿Confirmar como pagado el voucher del lote ${p.lotCode || p.lotId}?`)) return; api.post(`/payments/mark-paid/${p.id}`).then(() => { toast('Pago marcado como pagado'); load(); }).catch((err: any) => toast(err.message, 'err')); }}>Marcar pagado</button>}</td>
                    <td className="td-base">{formatDate(p.dueDate)}</td>
                    <td className="td-base">{formatDate(p.paidAt)}</td>
                    <td className="td-base">{p.receivedByName || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0B2F6E' }}>
                  <td className="td-base font-bold text-white" colSpan={3}>Totales ({rows.length})</td>
                  <td className="td-base font-bold text-white">{formatMoney(totalPrecioVenta)}</td>
                  <td className="td-base" colSpan={4}></td>
                  <td className="td-base font-bold text-white">{formatMoney(totalPagado)}</td>
                  <td className="td-base font-bold text-white" colSpan={4} style={{ background: '#16A34A' }}>% Pago: {pctPago.toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
            )}
            <div className="bg-white p-3 border-t" style={{ borderColor: '#F0F1F3' }}>
              <PaginationBar label="Pagos" page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} setLimit={setLimit} />
            </div>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Registrar pago</h3>
            {!lockedProjectId && (
              <Field label="Proyecto">
                <select className="input" value={payProjectId} onChange={(e) => { setPayProjectId(Number(e.target.value)); setLotId(0); setClientId(0); }}>
                  <option value={0}>Selecciona el proyecto…</option>
                  {payProjects.map((pr: any) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                </select>
              </Field>
            )}
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
            <Field label="Tipo">
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
            <Field label="Referencia (n.º operación Yape/banco)">
              <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: YAP-48592910 / 0293-4521-1000" />
            </Field>
            <Field label="Comprobante (baucher o captura)">
              <div className="flex flex-wrap gap-2">
                <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                  <FiUpload /> <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickVoucher(e.target.files?.[0]); e.target.value = ''; }} /> Subir imagen
                </label>
                <label className="btn-neutral cursor-pointer text-xs inline-flex items-center gap-1">
                  <FiCamera /> <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickVoucher(e.target.files?.[0]); e.target.value = ''; }} /> Tomar foto
                </label>
                {voucherUrl && <img src={voucherUrl} alt="Voucher" className="w-24 h-24 rounded-lg object-cover border" />}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto (S/)"><input type="number" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
              <Field label="Vence (opc.)"><input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            </div>
            <Field label="Nota (opcional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={registrar}>Registrar pago</button>
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

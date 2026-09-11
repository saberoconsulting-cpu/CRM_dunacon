'use client';
import { useEffect, useState, useCallback } from 'react';
import { Toaster, toast, Field, EmptyState, StatCard } from '@/components/ui/ui';
import { api, uploadFile } from '@/lib/api';
import { DistribucionPie, LineaTiempo, DobleEje } from '@/components/ui/charts/Charts';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { formatMoney, formatDate } from '@/lib/types';
import { FiUpload, FiCamera } from 'react-icons/fi';

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
  const [open, setOpen] = useState(false);
  const [lotId, setLotId] = useState(0);
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
  }, [load]);

  useEffect(() => { setPage(1); }, [status, lockedProjectId]);

  useEffect(() => {
    const q = lockedProjectId ? `?projectId=${lockedProjectId}` : '';
    api.get<any>(`/payments/caja${q}`).then(setCash).catch(() => {});
  }, [lockedProjectId]);

  const availableLots = payProjectId ? lots.filter((l: any) => Number(l.projectId) === Number(payProjectId)) : lots;

  async function registrar() {
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!amount) return toast('Ingresa monto', 'err');
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      const saved: any = await api.post('/payments', { projectId: lockedProjectId || lot?.projectId || 1, lotId: Number(lotId), clientId: lot?.clientId || undefined, agentId: lot?.agentId || undefined, type: payType, amount, dueDate: dueDate || undefined, paymentMethod: payMethod, reference: reference || undefined, note: note || undefined });
      if (voucher) { await uploadFile(`/payments/voucher/${saved?.id}`, voucher); }
      toast(voucher ? 'Pago registrado con comprobante adjunto' : 'Pago registrado');
      setOpen(false); setAmount(0); setDueDate(''); setNote(''); setLotId(0); setPayMethod('yape'); setReference(''); setVoucher(null); setVoucherUrl('');
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

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        {overdue.length > 0 && (
          <div className="rounded-lg border px-3 py-2 text-sm" style={{ background: '#E7F0FE', borderColor: '#A9C9FB', color: '#1259C4' }}>
            <b>{overdue.length}</b> cuotas vencidas detectadas. Regístralas para actualizar la cartera.
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Registros (filtrados)" value={meta.total} />
          <StatCard label="Total abonado (pagado)" value={'S/ ' + ((cash?.methods || []).reduce((s: number, m: any) => s + Number(m.monto || 0), 0)).toLocaleString('es-PE')} color="#257849" />
          <StatCard label="Medios usados" value={(cash?.methods || []).length} color="#B45309" />
          <StatCard label="Meses con recaudo" value={(cash?.byMonth || []).length} color="#1259C4" />
          <StatCard label="Total venta (lotes)" value={meta.distinctLots} color="#171717" />
          <StatCard label="Pagos pendientes" value={meta.pendingCount} color="#B45309" />
          <StatCard label="Pagos pendientes %" value={`${pendingPct.toFixed(1)}%`} color="#DC2626" />
        </div>

        {/* Caja / canales de ingreso */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="card">
            <h3 className="font-semibold mb-3">¿Por dónde entran más pagos?</h3>
            <div style={{ height: 240 }}>
              {cash?.methods?.length ? (
                <DistribucionPie data={cash.methods.map((m: any) => ({ name: String(m.method || 'otro'), value: Number(m.monto || 0) }))}
                  colorMap={(n) => ({ yape: '#7C3AED', plin: '#7C3AED', transferencia: '#2563EB', deposito: '#0EA5E9', cheque_gerencia: '#0F766E', tarjeta: '#171717', efectivo: '#1877F2', otro: '#9AA1AB' })[n] || '#9AA1AB'} />
              ) : <p className="py-10 text-center text-sm text-slate-400">Aún no hay pagos pagados para mostrar la distribución.</p>}
            </div>
          </div>
          <div className="card">
            <h3 className="font-semibold mb-3">Recaudación por mes</h3>
            <LineaTiempo data={(cash?.byMonth || []).map((r: any) => ({ mes: r.month, valor: Number(r.monto || 0) }))} xKey="mes" yKey="valor" color="#7C3AED" />
            {(cash?.byMonth || []).length === 0 && <p className="py-10 text-center text-sm text-slate-400">Sin datos de recaudación todavía.</p>}
          </div>
        </div>

        {/* Ventas por mes / Pagos vs Morosidad */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="card">
            <h3 className="font-semibold mb-3">Ventas por mes (S/)</h3>
            {cash?.salesByMonth?.length ? (
              <LineaTiempo data={cash.salesByMonth.map((r: any) => ({ mes: r.month, valor: Number(r.monto || 0) }))} xKey="mes" yKey="valor" color="#1877F2" />
            ) : <p className="py-10 text-center text-sm text-slate-400">Aún no hay ventas aprobadas para mostrar.</p>}
          </div>
          <div className="card">
            <h3 className="font-semibold mb-3">Pagos vs Morosidad</h3>
            {cash?.byMonth?.length || cash?.overdueByMonth?.length ? (
              <DobleEje
                data={mergeByMonth(cash?.byMonth || [], cash?.overdueByMonth || [])}
                barKey="pagado" barName="Pagado" lineKey="moroso" lineName="Moroso"
              />
            ) : <p className="py-10 text-center text-sm text-slate-400">Sin datos suficientes todavía.</p>}
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
                  <td className="td-base font-bold text-white" colSpan={4}>% Pago: {pctPago.toFixed(1)}%</td>
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
                <select className="input" value={payProjectId} onChange={(e) => { setPayProjectId(Number(e.target.value)); setLotId(0); }}>
                  <option value={0}>Selecciona el proyecto…</option>
                  {payProjects.map((pr: any) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Lote">
              <select className="input" value={lotId} onChange={(e) => setLotId(Number(e.target.value))}>
                <option value={0}>{payProjectId ? 'Selecciona el lote…' : 'Primero elige un proyecto'}</option>
                {availableLots.map((l: any) => <option key={l.id} value={l.id}>Lote {l.code} — {formatMoney(l.price)}</option>)}
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

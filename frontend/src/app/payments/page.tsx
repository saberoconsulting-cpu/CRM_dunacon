'use client';
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { Toaster, toast, Field, EmptyState, StatCard } from '@/components/ui';
import { api, uploadFile } from '@/lib/api';
import { DistribucionPie, LineaTiempo } from '@/components/charts/Charts';
import { PaginationBar } from '@/components/PaginationBar';
import { formatMoney, formatDate } from '@/lib/types';

type P = { id: number; projectId: number; lotId: number; type: string; amount: string; dueDate?: string | null; paidAt?: string | null; status: string };
const TYPE_LABEL: any = { reserva: 'Reserva', adelanto: 'Adelanto', primera_cuota: 'Primera cuota', cuota: 'Cuota' };
const BADGE: any = { pagado: ['#EAF7EE', '#257849'], pendiente: ['#FFF6E4', '#B45309'], vencido: ['#E7F0FE', '#1259C4'] };
const METHODS = [['yape', 'Yape / Plin (QR)'], ['transferencia', 'Transferencia bancaria'], ['deposito', 'Depósito en banco'], ['tarjeta', 'Tarjeta de débito/crédito'], ['efectivo', 'Efectivo / oficina'], ['otro', 'Otro']];

export default function PaymentsPage() {
  const [rows, setRows] = useState<P[]>([]);
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [cash, setCash] = useState<any>({ methods: [], byMonth: [] });
  const [lots, setLots] = useState<any[]>([]);
  const [payProjects, setPayProjects] = useState<any[]>([]);
  const [payProjectId, setPayProjectId] = useState(0);
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

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      q.set('page', String(page)); q.set('limit', String(limit));
      const back = (await api.get<any>(`/payments?${q.toString()}`)) || {};
      const arr: P[] = Array.isArray(back) ? back : (back.items || []);
      setRows(arr);
      setMeta({
        total: Number(back.total ?? arr.length),
        totalPages: Number(back.totalPages ?? Math.max(1, Math.ceil((back.total ?? arr.length) / limit))),
      });
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [status, page, limit]);

  useEffect(() => {
    load();
    api.get<{ overdue: P[] }>('/payments/alerts').then((a) => setOverdue(a?.overdue || [])).catch(() => setOverdue([]));
    api.get<any[]>('/lots?limit=200').then((d) => setLots(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
    api.get<any>('/projects').then((d) => setPayProjects(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
  }, [load]);

  useEffect(() => { setPage(1); }, [status]);

  useEffect(() => {
    api.get<any>('/payments/caja').then(setCash).catch(() => {});
  }, []);

  const availableLots = payProjectId ? lots.filter((l: any) => Number(l.projectId) === Number(payProjectId)) : lots;

  async function registrar() {
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!amount) return toast('Ingresa monto', 'err');
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      const saved: any = await api.post('/payments', { projectId: lot?.projectId || 1, lotId: Number(lotId), clientId: lot?.clientId || undefined, agentId: lot?.agentId || undefined, type: payType, amount, dueDate: dueDate || undefined, paymentMethod: payMethod, reference: reference || undefined, note: note || undefined });
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

  return (
    <Layout title="Pagos e ingresos">
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
        </div>

        {/* Caja / canales de ingreso */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="card">
            <h3 className="font-semibold mb-3">¿Por dónde entran más pagos?</h3>
            <div style={{ height: 240 }}>
              {cash?.methods?.length ? (
                <DistribucionPie data={cash.methods.map((m: any) => ({ name: String(m.method || 'otro'), value: Number(m.monto || 0) }))}
                  colorMap={(n) => ({ yape: '#7C3AED', plin: '#7C3AED', transferencia: '#2563EB', deposito: '#0EA5E9', tarjeta: '#171717', efectivo: '#1877F2', otro: '#9AA1AB' })[n] || '#9AA1AB'} />
              ) : <p className="py-10 text-center text-sm text-slate-400">Aún no hay pagos pagados para mostrar la distribución.</p>}
            </div>
          </div>
          <div className="card">
            <h3 className="font-semibold mb-3">Recaudación por mes</h3>
            <LineaTiempo data={(cash?.byMonth || []).map((r: any) => ({ mes: r.month, valor: Number(r.monto || 0) }))} xKey="mes" yKey="valor" color="#7C3AED" />
            {(cash?.byMonth || []).length === 0 && <p className="py-10 text-center text-sm text-slate-400">Sin datos de recaudación todavía.</p>}
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
            <table className="table-base">
              <thead><tr>
                <th className="th-base">Tipo</th><th className="th-base">Lote</th><th className="th-base">Monto</th>
                <th className="th-base">Estado</th><th className="th-base">Vence</th><th className="th-base">Pagado</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="td-base capitalize">{TYPE_LABEL[p.type] || p.type}</td>
                    <td className="td-base font-medium">Lote {p.lotId}</td>
                    <td className="td-base">{(p as any).paymentMethod ? <span className="badge bg-slate-100 text-slate-600 capitalize mr-1">{(p as any).paymentMethod}</span> : null}{formatMoney(p.amount)}{(p as any).voucherUrl ? <> <a href={(p as any).voucherUrl} target="_blank" rel="noreferrer" className="text-[#1877F2] hover:underline">Ver voucher</a></> : null}</td>
                    <td className="td-base">{st(p)}{p.status === 'pendiente' && (p as any).voucherUrl && payCanMark && <button className="btn-primary !h-6 !px-2 text-xs ml-2 align-middle" onClick={(e) => { e.stopPropagation(); if (!confirm(`¿Confirmar como pagado el voucher del lote ${p.lotId}?`)) return; api.post(`/payments/mark-paid/${p.id}`).then(() => { toast('Pago marcado como pagado'); load(); }).catch((err: any) => toast(err.message, 'err')); }}>Marcar pagado</button>}</td>
                    <td className="td-base">{formatDate(p.dueDate)}</td>
                    <td className="td-base">{formatDate(p.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
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
            <Field label="Proyecto">
              <select className="input" value={payProjectId} onChange={(e) => { setPayProjectId(Number(e.target.value)); setLotId(0); }}>
                <option value={0}>Selecciona el proyecto…</option>
                {payProjects.map((pr: any) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
            </Field>
            <Field label="Lote">
              <select className="input" value={lotId} onChange={(e) => setLotId(Number(e.target.value))}>
                <option value={0}>{payProjectId ? 'Selecciona el lote…' : 'Primero elige un proyecto'}</option>
                {availableLots.map((l: any) => <option key={l.id} value={l.id}>Lote {l.code} — {formatMoney(l.price)}</option>)}
              </select>
            </Field>
            <Field label="Tipo">
              <select className="input" value={payType} onChange={(e) => setPayType(e.target.value)}>
                <option value="reserva">Reserva</option><option value="adelanto">Adelanto</option>
                <option value="primera_cuota">Primera cuota</option><option value="cuota">Cuota</option>
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
                <label className="btn-neutral cursor-pointer text-xs">
                  📂 <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickVoucher(e.target.files?.[0]); e.target.value = ''; }} /> Subir imagen
                </label>
                <label className="btn-neutral cursor-pointer text-xs">
                  📷 <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickVoucher(e.target.files?.[0]); e.target.value = ''; }} /> Tomar foto
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
    </Layout>
  );
}


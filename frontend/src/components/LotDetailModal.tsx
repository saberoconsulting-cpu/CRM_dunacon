'use client';
import { useEffect, useState } from 'react';
import { Modal, toast, StatusBadge, Field } from './ui';
import { api } from '@/lib/api';
import { LOT_STATUS_COLOR, LOT_STATUS_LABEL, LotStatus, formatMoney, formatDate } from '@/lib/types';

type Row = { id: number; lotId: number; fromStatus: string; toStatus: string; createdAt: string; type?: string; amount?: string|number; paidAt?: string }

export default function LotDetailModal({ lotId, onClose, onChanged }: {
  lotId: number | null; onClose: () => void; onChanged?: () => void;
}) {
  const [lot, setLot] = useState<any>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [amount, setAmount] = useState(0);
  const [payType, setPayType] = useState('reserva');
  const [working, setWorking] = useState(false);
  const [fin, setFin] = useState<any>({ sale: null, installments: [] });

  async function load() {
    if (!lotId) return;
    try {
      const d = await api.get<any>(`/lots/${lotId}`);
      setLot(d.lot); setHistory(d.history || []); setPayments(d.payments || []);
      const fin = await api.get<any>(`/sales/by-lot/${lotId}`).catch(() => ({ sale: null, installments: [] }));
      setFin(fin);
    }
    catch (e:any){ toast(e.message,'err'); }
  }
  useEffect(() => { setLot(null); setHistory([]); setPayments([]); setFin({ sale: null, installments: [] } as any); if (lotId) load(); }, [lotId]);

  async function registerPayment() {
    if (!lot || !amount) return toast('Ingresa monto', 'err');
    setWorking(true);
    try {
      await api.post('/payments', { projectId: lot.projectId, lotId: lot.id, type: payType, amount });
      toast('Pago registrado'); await load(); onChanged?.();
    } catch (e:any){ toast(e.message,'err'); } finally { setWorking(false); }
  }
  async function changeStatus(to: string) {
    if (!lot) return;
    setWorking(true);
    try { await api.post(`/plan/lot/status/${lot.id}`, { status: to }); toast('Estado actualizado'); await load(); onChanged?.(); }
    catch (e:any){ toast(e.message,'err'); } finally { setWorking(false); }
  }

  const statusColor = lot ? ((LOT_STATUS_COLOR as any)[lot.status] || '#64748b') : '#64748b';

  const paids = (payments as any[]) || [];
  const amountPaid = paids.filter((p) => p.status === 'pagado').reduce((s: number, p) => s + Number(p.amount || 0), 0);
  const saleFn = fin?.sale;
  const schedule = (fin?.installments || []) as any[];
  const unitPrice = saleFn?.salePrice != null ? Number(saleFn.financingBase ?? saleFn.salePrice) : Number(lot?.price || saleFn?.salePrice || 0);
  const aheadPayment = Number(saleFn?.valorCuota || (schedule[0]?.amount || 0));
  const closed = schedule.filter((x) => x.status === 'pagado').length;
  const firstDue = schedule[0]?.dueDate || null;
  const remaining = Math.max(0, unitPrice - amountPaid);
  const donePct = unitPrice > 0 ? Math.min(100, Math.round((amountPaid / unitPrice) * 100)) : 0;

  if (!lotId) return null;
  return (
    <Modal open={!!lot} onClose={onClose} title={lot ? `Lote ${lot.code}` : ''} width="max-w-xl">
      {lot && (
        <div className="space-y-5">
          {/* Cabecera de estado dinÃ¡mica — se repinta cuando el lote cambia de estado */}
          <div className="rounded-2xl px-4 py-4 text-white shadow-sm" style={{ background: statusColor }}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider opacity-80">Estado actual del lote {lot.code}</div>
                <div className="text-2xl font-bold capitalize -mt-0.5">{LOT_STATUS_LABEL[lot.status as LotStatus] || lot.status}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider opacity-80">{lot.areaM2} mÂ²</div>
                <div className="text-xl font-extrabold">{formatMoney(lot.price)}</div>
              </div>
            </div>
          </div>
          {(amountPaid > 0 || schedule.length > 0 || saleFn) && (
            <div className="border rounded-2xl p-4" style={{ borderColor: '#e5e7eb' }}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm text-slate-800">Financiamiento del lote</h4>
                <span className="badge" style={{ background: donePct >= 100 ? '#D1FAE5' : '#FEF3C7', color: donePct >= 100 ? '#065F46' : '#92400E' }}>{donePct >= 100 ? 'Saldado âœ“' : donePct + '%'}</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                <div className="h-full" style={{ width: donePct + '%', background: statusColor }} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div className="bg-canvas rounded-xl p-3">
                  <div className="label">Valor del lote</div><b>{formatMoney(unitPrice)}</b>
                </div>
                <div className="bg-canvas rounded-xl p-3">
                  <div className="label">Total abonado</div><b className="text-emerald-600">{formatMoney(amountPaid)}</b>
                </div>
                <div className="bg-canvas rounded-xl p-3">
                  <div className="label">Saldo por pagar</div><b className="text-brand-700">{formatMoney(remaining)}</b>
                </div>
              </div>
              {(schedule.length > 0 || aheadPayment > 0) && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="badge bg-slate-100 text-slate-600">Cuota: {formatMoney(aheadPayment)}</span>
                  <span className="badge bg-slate-100 text-slate-600">Cuotas: {schedule.length}</span>
                  <span className="badge bg-emerald-50 text-emerald-700">Pagadas: {closed}</span>
                  <span className="badge bg-amber-50 text-amber-700">Pendientes: {Math.max(0, schedule.length - closed)}</span>
                  {firstDue && <span className="badge bg-slate-100 text-slate-600">Primera cuota: {formatDate(firstDue)}</span>}
                </div>
              )}
              {schedule.length > 0 && (
                <div className="mt-3 space-y-1 max-h-48 overflow-auto pr-1">
                  {schedule.map((q) => (
                    <div key={q.id ?? q.installmentNo} className="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                      <span className="text-slate-500">Cuota {q.installmentNo} Â· vence {formatDate(q.dueDate)}</span>
                      <b className={q.status === 'pagado' ? 'text-emerald-600' : 'text-slate-700'}>{formatMoney(q.amount)}</b>
                    </div>
                  ))}
                </div>
              )}
              {lot?.clientName && <p className="text-xs text-slate-400 mt-3">Comprador asignado: {lot.clientName}</p>}
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm text-slate-700 mb-2">Registrar pago</h4>
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-32">
                <Field label="Tipo"><select value={payType} onChange={(e) => setPayType(e.target.value)} className="input">
                  <option value="reserva">Reserva</option><option value="adelanto">Adelanto</option>
                  <option value="primera_cuota">Primera cuota</option><option value="cuota">Cuota</option>
                </select></Field>
              </div>
              <div className="flex-1 min-w-32">
                <Field label="Monto (S/)"><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" /></Field>
              </div>
              <button onClick={registerPayment} disabled={working} className="btn-primary shrink-0">{working ? 'â€¦' : 'Registrar pago'}</button>
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm text-slate-700 mb-2">Cambiar estado</h4>
            <div className="flex flex-wrap gap-2">
              {(['disponible','reservado','adelanto','primera_cuota'] as LotStatus[]).map((s) => lot.status !== s && (
                <button key={s} onClick={() => changeStatus(s)} disabled={working} className="btn-secondary">→ {LOT_STATUS_LABEL[s]}</button>
              ))}
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm text-slate-700 mb-2">Pagos</h4>
            <PagosTable rows={payments} />
          </div>
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm text-slate-700 mb-2">Historial de estados</h4>
            <ul className="space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.id as any} className="flex items-center gap-2"><StatusBadge status={h.fromStatus||''}/> → <StatusBadge status={h.toStatus}/><span className="text-slate-400 text-xs">{formatDate(h.createdAt)}</span></li>
              ))}
              {history.length===0 && <li className="text-slate-400">Sin cambios</li>}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function PagosTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-auto">
      <table className="table-base">
        <thead><tr><th className="th-base">Tipo</th><th className="th-base">Monto</th><th className="th-base">Estado</th><th className="th-base">Fecha</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((p) => (
            <tr key={p.id}><td className="td-base capitalize">{p.type||''}</td><td className="td-base">{(p as any).paymentMethod || '—'}</td><td className="td-base">{(p as any).voucherUrl ? <a href={(p as any).voucherUrl} target="_blank" rel="noreferrer" className="text-[#1877F2] hover:underline">Ver comprobante</a> : '—'}</td><td className="td-base">{formatMoney(p.amount)}</td><td className="td-base"><StatusBadge status={(p as any).status||''}/></td><td className="td-base">{formatDate((p as any).paidAt||(p as any).createdAt||'')}</td></tr>
          ))}
          {rows.length===0 && <tr><td className="td-base text-slate-400" colSpan={4}>Sin pagos</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

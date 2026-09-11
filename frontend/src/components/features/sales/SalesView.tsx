'use client';
import { useEffect, useState, useCallback } from 'react';
import { Toaster, toast, Field, EmptyState, StatCard } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/types';

type S = { id: number; projectId: number; lotId: number; clientId?: number | null; agentId?: number | null; salePrice: string; saleDate: string; commission: string; agentName?: string | null; lotCode?: string | null; conditions?: string | null; approvalStatus?: string; totalCuotas?: number };

export default function SalesView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [rows, setRows] = useState<S[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  // form
  const [projectId, setProjectId] = useState(lockedProjectId || 0);
  const [lotId, setLotId] = useState(0);
  const [clientId, setClientId] = useState(0);
  const [agentId, setAgentId] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [totalCuotas, setTotalCuotas] = useState(0);
  const [applyCommission, setApplyCommission] = useState(false);
  const [commissionRate, setCommissionRate] = useState(0);
  const [saleDate, setSaleDate] = useState('');
  const [conditions, setConditions] = useState('');

  useEffect(() => { if (lockedProjectId) setProjectId(lockedProjectId); }, [lockedProjectId]);

  const role = (() => { if (typeof window !== 'undefined') try { return JSON.parse(localStorage.getItem('crm_user') || '{}').role; } catch { return ''; } return ''; })();

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (lockedProjectId) q.set('projectId', String(lockedProjectId));
      const data = await api.get<S[]>(`/sales${q.toString() ? `?${q}` : ''}`);
      setRows(data || []);
      if (role === 'admin' || role === 'superadmin') {
        try { setPending((await api.get<any[]>('/sales/pending')) || []); } catch { setPending([]); }
      }
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [role, lockedProjectId]);

  useEffect(() => {
    setIsAdmin(role === 'admin' || role === 'superadmin');
    load();
    api.get<any[]>('/projects').then(setProjects).catch(() => {});
    api.get<any[]>('/clients').then((d) => setClients(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
    api.get<any[]>('/users/agents').then(setAgents).catch(() => {});
    api.get<any[]>('/lots').then((d) => setLots(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
  }, [load, role]);

  async function registrar() {
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!clientId) return toast('Selecciona el cliente que adquiere/lote', 'err');
    if (!agentId) return toast('Selecciona el agente', 'err');
    if (!salePrice) return toast('Ingresa el precio de venta', 'err');
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      await api.post('/sales', { projectId: lockedProjectId || projectId || lot?.projectId || 1, lotId: Number(lotId), clientId: clientId || undefined, agentId: Number(agentId), salePrice, totalCuotas: totalCuotas || undefined, appliesCommission: applyCommission || undefined, commissionRate: applyCommission && commissionRate ? Number(commissionRate) : undefined, saleDate: saleDate || undefined, conditions: conditions || undefined });
      toast('Separación registrada. Queda pendiente de validación.');
      setOpen(false); setLotId(0); setClientId(0); setConditions(''); setSalePrice(0); setTotalCuotas(0); setApplyCommission(false); setCommissionRate(0); setSaleDate(''); setAgentId(0);
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function aprobar(s: any) {
    try { await api.post(`/sales/approve/${s.id}`); toast('Separación aprobada. Lote vendido.'); load(); }
    catch (e: any) { toast(e.message, 'err'); }
  }
  async function rechazar(s: any) {
    try { await api.post(`/sales/reject/${s.id}`); toast('Separación rechazada. Lote liberado.'); load(); }
    catch (e: any) { toast(e.message, 'err'); }
  }

  const total = rows.reduce((s, r) => s + Number(r.salePrice || 0), 0);
  const comm = rows.reduce((s, r) => s + Number(r.commission || 0), 0);

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Ventas cerradas" value={rows.length} />
          <StatCard label="Monto total vendido" value={formatMoney(total)} color="#171717" />
          <StatCard label="Comisiones devengadas" value={formatMoney(comm)} color="#A90318" />
          <StatCard label="Lotes vendidos" value={rows.length} />
        </div>
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Historial de ventas</h3>
            <button className="btn-primary" onClick={() => setOpen(true)}>Registrar venta</button>
          </div>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Un lote Vendido no puede volver a venderse. El sistema lo valida.</p>{isAdmin && pending.length > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-2">Separaciones por aprobar ({pending.length})</h3>
            <div className="overflow-auto">
              <table className="table-base">
                <thead><tr><th className="th-base">Lote</th><th className="th-base">Precio</th><th className="th-base">Cuotas</th><th className="th-base">Acción</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {pending.map((s: any) => (
                    <tr key={s.id}>
                      <td className="td-base font-medium">Lote {s.lotId}</td>
                      <td className="td-base">{formatMoney(s.salePrice)}</td>
                      <td className="td-base">{s.totalCuotas || 0}</td>
                      <td className="td-base">
                        <button className="btn-primary !h-7 text-xs mr-1" onClick={() => aprobar(s)}>Aprobar</button>
                        <button className="btn-danger !h-7 text-xs" onClick={() => rechazar(s)}>Rechazar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
</div>
        <div className="card p-0 overflow-auto">
          {loading ? <p className="p-4 text-slate-400">Cargando…</p>
            : rows.length === 0 ? <EmptyState text="Aún no hay ventas registradas." /> : (
            <table className="table-base">
              <thead><tr>
                <th className="th-base">Lote</th><th className="th-base">Cliente</th><th className="th-base">Agente</th>
                <th className="th-base">Precio</th><th className="th-base">Cuotas</th><th className="th-base">Estado</th><th className="th-base">Fecha</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="td-base font-medium">{s.lotCode || `Lote ${s.lotId}`}</td>
                    <td className="td-base">{s.clientId ? `Cliente #${s.clientId}` : '—'}</td>
                    <td className="td-base">{s.agentName || '—'}</td>
                    <td className="td-base font-medium">{formatMoney(s.salePrice)}</td>
                    <td className="td-base">{s.totalCuotas || 'Contado'}</td>
                    <td className="td-base">{s.approvalStatus === 'pending' ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:'#FEF3C7', color:'#92400E' }}>Pendiente</span> : <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:'#D1FAE5', color:'#065F46' }}>Aprobada</span>}</td>
                    <td className="td-base">{formatDate(s.saleDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Registrar venta</h3>

            {/* Lote y responsable */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!lockedProjectId && (
                <Field label="Proyecto">
                  <select className="input" value={projectId} onChange={(e) => { setProjectId(Number(e.target.value)); setLotId(0); setSalePrice(0); }}>
                    <option value={0}>Auto / Todos</option>
                    {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Lote *"><select className="input" value={lotId} onChange={(e) => setLotId(Number(e.target.value))}><option value={0}>Selecciona…</option>{lots.filter((l: any) => l.status !== 'vendido' && l.sellingStage !== 'vendido' && l.sellingStage !== 'separado' && (!projectId || Number(l.projectId) === Number(projectId))).map((l: any) => <option key={l.id} value={l.id}>Lote {l.code} — {formatMoney(l.price)}</option>)}</select></Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Cliente"><select className="input" value={clientId} onChange={(e) => setClientId(Number(e.target.value))}><option value={0}>— Sin asignar —</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{(c.fullName || c.full_name || '— Sin nombre —')}</option>)}</select></Field>
              <Field label="Agente *"><select className="input" value={agentId} onChange={(e) => setAgentId(Number(e.target.value))}><option value={0}>Selecciona…</option>{agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            </div>

            {/* Monto y fecha */}
            <div className="border-t mt-4 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Precio de venta (S/)*"><input type="number" className="input" value={salePrice} onChange={(e) => setSalePrice(Number(e.target.value))} /></Field>
                <Field label="Fecha"><input type="date" className="input" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /></Field>
              </div>
            </div>

            {/* Comisión opcional (la tasa la define el admin en el agente, no se fuerza) */}
            <div className="rounded-xl bg-canvas p-4 mt-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={applyCommission} onChange={(e) => setApplyCommission(e.target.checked)} />
                <span className="text-sm">
                  <span className="font-semibold block">Agente inmobiliario</span>
                  <span className="text-xs text-slate-500">Descuenta la comisión del precio para calcular las cuotas.</span>
                </span>
              </label>
              {applyCommission && (
                <div className="mt-3 rounded-lg bg-white/70 border p-3" style={{ borderColor: '#EDEEF0' }}>
                  {(() => {
                    const ag = agents.find((a: any) => Number(a.id) === Number(agentId));
                    const adminRate = Number(ag?.commissionRate || 0);
                    const rate = commissionRate || adminRate;
                    const nett = rate ? Math.max(0, salePrice - (salePrice * rate) / 100) : salePrice;
                    return (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-slate-600">Comisión según administrador:</span>
                          <span className="font-semibold">{adminRate > 0 ? `${adminRate}%` : 'sin configurar'}</span>
                        </div>
                        <div>
                          <label className="label">Comisión para esta venta (%) — déjala vacía para usar la del admin</label>
                          <input className="input" type="number" min={0} max={100} step={0.1} placeholder="0" value={commissionRate || ''} onChange={(e) => setCommissionRate(Number(e.target.value))} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm border-t pt-3" style={{ borderColor: '#EEF0F2' }}>
                          <span className="text-slate-600">Base de cuotas (precio − comisión):</span>
                          <b>{formatMoney(nett)}</b>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Plan de pagos */}
            <div className="mt-3">
              <Field label="Nº de cuotas (0 = contado, se genera cronograma al aprobar)"><input type="number" min={0} max={120} className="input" value={totalCuotas} onChange={(e) => setTotalCuotas(Number(e.target.value))} /></Field>
            </div>

            <Field label="Condiciones"><textarea className="input mt-3" value={conditions} onChange={(e) => setConditions(e.target.value)} /></Field>

            <div className="flex justify-end gap-2 pt-4 mt-1 border-t">
              <button className="btn-neutral" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={registrar}>Registrar venta</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

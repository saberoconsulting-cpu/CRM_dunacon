'use client';
import { useEffect, useState, useCallback } from 'react';
import { Toaster, toast, Field, EmptyState, StatCard } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/types';
import ProjectDocuments from './ProjectDocuments';

type S = {
  id: number; projectId: number; lotId: number; clientId?: number | null; agentId?: number | null;
  salePrice: string; saleDate: string; commission: string; agentName?: string | null; clientName?: string | null;
  lotCode?: string | null; conditions?: string | null; approvalStatus?: string; totalCuotas?: number;
  interestType?: string; tea?: number;
};

const PAYMENT_METHODS = ['Contado', 'Al crédito'];

export default function SalesView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [rows, setRows] = useState<S[]>([]);
  const [pending, setPending] = useState<S[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showCotizaciones, setShowCotizaciones] = useState(false);
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
  const [paymentMethod, setPaymentMethod] = useState('Contado');
  const [totalCuotas, setTotalCuotas] = useState(0);
  const [cuotaInicial, setCuotaInicial] = useState(0);
  const [interestType, setInterestType] = useState<'sin_intereses' | 'tea'>('sin_intereses');
  const [tea, setTea] = useState(0);
  const [applyCommission, setApplyCommission] = useState(false);
  const [commissionRate, setCommissionRate] = useState(0);
  const [saleDate, setSaleDate] = useState('');
  const [conditions, setConditions] = useState('');
  const [preview, setPreview] = useState<any>(null);

  useEffect(() => { if (lockedProjectId) setProjectId(lockedProjectId); }, [lockedProjectId]);

  const role = (() => { if (typeof window !== 'undefined') try { return JSON.parse(localStorage.getItem('crm_user') || '{}').role; } catch { return ''; } return ''; })();

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (lockedProjectId) q.set('projectId', String(lockedProjectId));
      const data = await api.get<S[]>(`/sales${q.toString() ? `?${q}` : ''}`);
      setRows(data || []);
      if (role === 'admin' || role === 'superadmin') {
        try { setPending((await api.get<S[]>('/sales/pending')) || []); } catch { setPending([]); }
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

  // Al elegir un lote, autocompletar precio (y cliente, si ya tenía uno asignado)
  // con su "Precio Venta" de Lotización — hace de "cotización" vigente sin
  // necesidad de un módulo de cotizaciones aparte.
  function selectLot(id: number) {
    setLotId(id);
    const lot = lots.find((l: any) => l.id === id);
    if (lot) {
      setSalePrice(Number(lot.salePrice || lot.price || 0));
      if (lot.clientId) setClientId(Number(lot.clientId));
    }
  }

  // Calculadora en vivo: comisión, saldo a financiar, tramos de cuotas.
  useEffect(() => {
    if (!open || !salePrice) { setPreview(null); return; }
    const t = setTimeout(() => {
      api.post('/sales/preview', {
        projectId: projectId || 1, lotId: lotId || 1, agentId: agentId || 1,
        salePrice, appliesCommission: applyCommission, commissionRate: commissionRate || undefined,
        totalCuotas, cuotaInicial, interestType, tea: interestType === 'tea' ? tea : undefined,
        paymentMethod,
      }).then(setPreview).catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [open, salePrice, applyCommission, commissionRate, totalCuotas, cuotaInicial, interestType, tea, paymentMethod, projectId, lotId, agentId]);

  async function registrar() {
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!clientId) return toast('Selecciona el cliente que adquiere/lote', 'err');
    if (!agentId) return toast('Selecciona el agente', 'err');
    if (!salePrice) return toast('Ingresa el precio de venta', 'err');
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      await api.post('/sales', {
        projectId: lockedProjectId || projectId || lot?.projectId || 1, lotId: Number(lotId),
        clientId: clientId || undefined, agentId: Number(agentId), salePrice,
        paymentMethod,
        totalCuotas: paymentMethod === 'Contado' ? undefined : (totalCuotas || undefined),
        cuotaInicial: paymentMethod === 'Contado' ? undefined : (cuotaInicial || undefined),
        interestType: paymentMethod === 'Contado' ? undefined : interestType,
        tea: paymentMethod !== 'Contado' && interestType === 'tea' ? tea : undefined,
        appliesCommission: applyCommission || undefined,
        commissionRate: applyCommission && commissionRate ? Number(commissionRate) : undefined,
        saleDate: saleDate || undefined, conditions: conditions || undefined,
      });
      toast('Separación registrada. Queda pendiente de validación.');
      setOpen(false); setLotId(0); setClientId(0); setConditions(''); setSalePrice(0);
      setPaymentMethod('Contado'); setTotalCuotas(0); setCuotaInicial(0); setInterestType('sin_intereses'); setTea(0);
      setApplyCommission(false); setCommissionRate(0); setSaleDate(''); setAgentId(0); setPreview(null);
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
          <StatCard label="Comisiones devengadas" value={formatMoney(comm)} color="#1259C4" />
          <StatCard label="Lotes vendidos" value={rows.length} />
        </div>
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Historial de ventas</h3>
            <button className="btn-primary" onClick={() => setOpen(true)}>Registrar venta</button>
          </div>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Un lote Vendido no puede volver a venderse. El sistema lo valida.</p>
        </div>

        {isAdmin && pending.length > 0 && (
          <div className="card p-0 overflow-auto">
            <h3 className="font-semibold px-4 pt-4">Separaciones por aprobar ({pending.length})</h3>
            <table className="table-base mt-2" style={{ width: '100%', minWidth: 960 }}>
              <thead><tr>
                <th className="th-base">Id</th><th className="th-base">Lote</th><th className="th-base">Cliente</th>
                <th className="th-base">Precio</th><th className="th-base">Forma de pago</th><th className="th-base">Cuotas</th>
                <th className="th-base">Cuotas sin intereses</th><th className="th-base">Fecha</th>
                <th className="th-base">Agente</th><th className="th-base">Comisión</th><th className="th-base" style={{ textAlign: 'center' }}>Acción</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((s) => (
                  <tr key={s.id}>
                    <td className="td-base text-slate-400">V{s.id}</td>
                    <td className="td-base font-medium">{s.lotCode || `Lote ${s.lotId}`}</td>
                    <td className="td-base">{s.clientName || '—'}</td>
                    <td className="td-base">{formatMoney(s.salePrice)}</td>
                    <td className="td-base">{s.totalCuotas ? 'Al crédito' : 'Contado'}</td>
                    <td className="td-base">{s.totalCuotas || 0}</td>
                    <td className="td-base">{s.interestType !== 'tea' ? (s.totalCuotas || 0) : '—'}</td>
                    <td className="td-base">{formatDate(s.saleDate)}</td>
                    <td className="td-base">{s.agentName || '—'}</td>
                    <td className="td-base">{formatMoney(s.commission)}</td>
                    <td className="td-base whitespace-nowrap">
                      <div className="flex justify-center gap-1.5">
                        <button className="btn-primary !h-7 text-xs" onClick={() => aprobar(s)}>Aprobar</button>
                        <button className="btn-danger !h-7 text-xs" onClick={() => rechazar(s)}>Rechazar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card p-0 overflow-auto">
          {loading ? <p className="p-4 text-slate-400">Cargando…</p>
            : rows.length === 0 ? <EmptyState text="Aún no hay ventas registradas." /> : (
            <table className="table-base" style={{ width: '100%', minWidth: 960 }}>
              <thead><tr>
                <th className="th-base">Id</th><th className="th-base">Lote</th><th className="th-base">Cliente</th>
                <th className="th-base">Precio</th><th className="th-base">Forma de pago</th><th className="th-base">Cuotas</th>
                <th className="th-base">Cuotas sin intereses</th><th className="th-base">Estado</th>
                <th className="th-base">Fecha</th><th className="th-base">Agente</th><th className="th-base">Comisión</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="td-base text-slate-400">V{s.id}</td>
                    <td className="td-base font-medium">{s.lotCode || `Lote ${s.lotId}`}</td>
                    <td className="td-base">{s.clientName || '—'}</td>
                    <td className="td-base font-medium">{formatMoney(s.salePrice)}</td>
                    <td className="td-base">{s.totalCuotas ? 'Al crédito' : 'Contado'}</td>
                    <td className="td-base">{s.totalCuotas || 'Contado'}</td>
                    <td className="td-base">{s.interestType !== 'tea' ? (s.totalCuotas || 0) : '—'}</td>
                    <td className="td-base">{s.approvalStatus === 'pendiente' ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:'#FEF3C7', color:'#92400E' }}>Pendiente</span> : <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:'#D1FAE5', color:'#065F46' }}>Aprobada</span>}</td>
                    <td className="td-base">{formatDate(s.saleDate)}</td>
                    <td className="td-base">{s.agentName || '—'}</td>
                    <td className="td-base">{formatMoney(s.commission)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0B2F6E' }}>
                  <td className="td-base font-bold text-white" colSpan={3}>Totales ({rows.length})</td>
                  <td className="td-base font-bold text-white">{formatMoney(total)}</td>
                  <td className="td-base" colSpan={6}></td>
                  <td className="td-base font-bold text-white">{formatMoney(comm)}</td>
                </tr>
              </tfoot>
            </table>
            )}
        </div>

        {lockedProjectId && <ProjectDocuments projectId={lockedProjectId} />}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
              <h3 className="font-semibold" style={{ fontSize: 17 }}>Registrar venta</h3>
              <button
                className="rounded-lg px-3 text-xs font-semibold text-white"
                style={{ height: 32, background: '#1877F2' }}
                onClick={() => setShowCotizaciones((v) => !v)}
              >
                Selecciona Cotización
              </button>
            </div>

            {showCotizaciones && (
              <div className="rounded-xl border mb-4 overflow-hidden" style={{ borderColor: '#A9C9FB' }}>
                <div className="px-3 py-2 text-xs font-semibold" style={{ background: '#E7F0FE', color: '#1259C4' }}>
                  Lotes ya cotizados en este proyecto (con Precio Venta en Lotización)
                </div>
                <div className="max-h-52 overflow-y-auto divide-y" style={{ borderColor: '#F0F1F3' }}>
                  {lots.filter((l: any) => l.salePrice && l.status !== 'vendido' && l.sellingStage !== 'vendido' && l.sellingStage !== 'separado' && (!projectId || Number(l.projectId) === Number(projectId))).map((l: any) => (
                    <button key={l.id} className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 text-left"
                      onClick={() => { selectLot(l.id); setShowCotizaciones(false); }}>
                      <span>Lote {l.code}{l.blockAddress ? ` — ${l.blockAddress}` : ''}</span>
                      <b>{formatMoney(l.salePrice)}</b>
                    </button>
                  ))}
                  {lots.filter((l: any) => l.salePrice && (!projectId || Number(l.projectId) === Number(projectId))).length === 0 && (
                    <p className="px-3 py-4 text-xs text-slate-400 text-center">Ningún lote de este proyecto tiene todavía un Precio Venta cargado en Lotización.</p>
                  )}
                </div>
              </div>
            )}

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
              <Field label="Lote *">
                <select className="input" value={lotId} onChange={(e) => selectLot(Number(e.target.value))}>
                  <option value={0}>Selecciona…</option>
                  {lots.filter((l: any) => l.status !== 'vendido' && l.sellingStage !== 'vendido' && l.sellingStage !== 'separado' && (!projectId || Number(l.projectId) === Number(projectId))).map((l: any) => (
                    <option key={l.id} value={l.id}>Lote {l.code} — {formatMoney(l.salePrice || l.price)}</option>
                  ))}
                </select>
              </Field>
            </div>
            {lotId > 0 && salePrice > 0 && (
              <p className="text-xs mt-1" style={{ color: '#1259C4' }}>Precio autocompletado desde el Precio Venta de Lotización de este lote.</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
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
                        {preview && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm border-t pt-3" style={{ borderColor: '#EEF0F2' }}>
                            <span className="text-slate-600">Comisión:</span>
                            <b>{formatMoney(preview.commissionAmount)}</b>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Forma de pago */}
            <div className="border-t mt-4 pt-3">
              <Field label="Forma de pago">
                <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>

            {paymentMethod !== 'Contado' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Field label="Cuota inicial (S/)"><input type="number" className="input" value={cuotaInicial || ''} onChange={(e) => setCuotaInicial(Number(e.target.value))} /></Field>
                  <Field label="Nº de cuotas"><input type="number" min={0} max={120} className="input" value={totalCuotas} onChange={(e) => setTotalCuotas(Number(e.target.value))} /></Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Field label="Interés">
                    <select className="input" value={interestType} onChange={(e) => setInterestType(e.target.value as any)}>
                      <option value="sin_intereses">Sin intereses</option>
                      <option value="tea">Con TEA</option>
                    </select>
                  </Field>
                  {interestType === 'tea' && (
                    <Field label="TEA (%)"><input type="number" className="input" value={tea || ''} onChange={(e) => setTea(Number(e.target.value))} /></Field>
                  )}
                </div>

                {preview && preview.totalCuotas > 0 && (
                  <div className="rounded-xl bg-canvas p-4 mt-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-600">Saldo a financiar:</span><b>{formatMoney(preview.saldoFinanciar)}</b></div>
                    {preview.installments?.filter((t: any) => t.count > 0).map((t: any, i: number) => (
                      <div key={i} className="flex justify-between"><span className="text-slate-600">{t.count} cuotas de:</span><b>{formatMoney(t.amount)}</b></div>
                    ))}
                  </div>
                )}
              </>
            )}

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

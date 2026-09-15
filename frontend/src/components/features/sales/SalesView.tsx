'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Toaster, toast, Field, EmptyState, StatCard } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/types';
import { printHtml } from '@/lib/print';
import { FiDownload } from 'react-icons/fi';

type S = {
  id: number; projectId: number; lotId: number; clientId?: number | null; agentId?: number | null;
  salePrice: string; saleDate: string; commission: string; agentName?: string | null; clientName?: string | null;
  lotCode?: string | null; conditions?: string | null; approvalStatus?: string; totalCuotas?: number;
  interestType?: string; tea?: number; financingBase?: number; valorCuota?: number; planStatus?: string; lotAreaM2?: number;
};

const PAYMENT_METHODS = ['Contado', 'Al crédito'];

function todayInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function initialPaymentOf(sale: S) {
  const match = String(sale.conditions || '').match(/Cuota inicial:\s*([0-9]+(?:\.[0-9]+)?)/i);
  return match ? Number(match[1] || 0) : 0;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function SalesView({ lockedProjectId }: { lockedProjectId?: number }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<S[]>([]);
  const [pending, setPending] = useState<S[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showCotizaciones, setShowCotizaciones] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState(0);
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  // form
  const [projectId, setProjectId] = useState(lockedProjectId || 0);
  const [lotId, setLotId] = useState(0);
  const [clientId, setClientId] = useState(0);
  const [clientName, setClientName] = useState('');
  const [agentId, setAgentId] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Contado');
  const [totalCuotas, setTotalCuotas] = useState(0);
  const [cuotaInicial, setCuotaInicial] = useState(0);
  const [interestType, setInterestType] = useState<'sin_intereses' | 'tea'>('sin_intereses');
  const [tea, setTea] = useState(0);
  const [applyCommission, setApplyCommission] = useState(false);
  const [commissionRate, setCommissionRate] = useState(0);
  const [saleDate, setSaleDate] = useState(todayInput());
  const [conditions, setConditions] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const queryLotId = Number(searchParams?.get('lotId') || 0);
  const shouldOpenSale = searchParams?.get('openSale') === '1';

  useEffect(() => { if (lockedProjectId) setProjectId(lockedProjectId); }, [lockedProjectId]);

  const role = (() => { if (typeof window !== 'undefined') try { return JSON.parse(localStorage.getItem('crm_user') || '{}').role; } catch { return ''; } return ''; })();

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (lockedProjectId) q.set('projectId', String(lockedProjectId));
      const data = await api.get<S[]>(`/sales${q.toString() ? `?${q}` : ''}`);
      setRows(data || []);
      if (role === 'admin' || role === 'superadmin') {
        const pendingQuery = lockedProjectId ? `?projectId=${lockedProjectId}` : '';
        try { setPending((await api.get<S[]>(`/sales/pending${pendingQuery}`)) || []); } catch { setPending([]); }
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
    const q = lockedProjectId ? `?projectId=${lockedProjectId}` : '';
    api.get<any[]>(`/quotes${q}`).then((d) => setQuotes(Array.isArray(d) ? d : [])).catch(() => {});
  }, [load, role, lockedProjectId]);

  useEffect(() => {
    if (!shouldOpenSale) return;
    setOpen(true);
    if (queryLotId > 0 && lots.length) selectLot(queryLotId);
  }, [shouldOpenSale, queryLotId, lots]);

  const availableQuotes = quotes.filter((q: any) => (
    (!projectId || Number(q.projectId) === Number(projectId)) &&
    (!lotId || Number(q.lotId) === Number(lotId))
  ));

  const selectedLot = lots.find((l: any) => Number(l.id) === Number(lotId));
  const selectedQuote = quotes.find((q: any) => Number(q.id) === Number(selectedQuoteId));
  const quoteProjectId = lockedProjectId || projectId || Number(selectedLot?.projectId || 0);

  // Al elegir un lote, autocompletar el precio con su "Precio Venta" de
  // Lotización (si no viene de una cotización real seleccionada abajo).
  function selectLot(id: number) {
    setLotId(id);
    setSelectedQuoteId(0);
    const lot = lots.find((l: any) => l.id === id);
    if (lot) {
      setSalePrice(Number(lot.salePrice || lot.price || 0));
      if (lot.clientId) {
        setClientId(Number(lot.clientId));
        const client = clients.find((c: any) => Number(c.id) === Number(lot.clientId));
        setClientName(client?.fullName || client?.full_name || lot.clientName || '');
      }
    }
  }

  // Cotización real del módulo Cotizaciones Lotes: precarga el lote y el
  // precio (convertido a soles con el tipo de cambio de esa cotización).
  function selectQuote(q: any) {
    const exchangeRate = Number(q.exchangeRate || 1);
    const isCredit = q.paymentMethod === 'credito';
    setSelectedQuoteId(Number(q.id));
    setProjectId(Number(q.projectId || lockedProjectId || projectId || 0));
    setLotId(Number(q.lotId));
    setClientId(0);
    setClientName(q.clientName || '');
    setSalePrice(Math.round(Number(q.finalPriceUsd || 0) * exchangeRate));
    setPaymentMethod(isCredit ? 'Al crédito' : 'Contado');
    setCuotaInicial(isCredit ? Math.round(Number(q.cuotaInicialUsd || 0) * exchangeRate) : 0);
    setTotalCuotas(isCredit ? Number(q.totalCuotas || 0) : 0);
    setInterestType(q.interestType === 'tea' ? 'tea' : 'sin_intereses');
    setTea(q.interestType === 'tea' ? Number(q.tea || 0) : 0);
    setSaleDate(todayInput());
    setConditions((current) => current || `Cotizacion Q${q.id}`);
    setShowCotizaciones(false);
    toast('Datos de la cotizacion cargados');
  }

  async function assignClientByName(showToast = true) {
    const name = clientName.trim();
    if (!name) {
      toast('Ingresa el nombre del cliente real.', 'err');
      return 0;
    }

    const existing = clients.find((c: any) => {
      const fullName = String(c.fullName || c.full_name || '').trim().toLowerCase();
      return fullName === name.toLowerCase();
    });
    if (existing) {
      setClientId(Number(existing.id));
      if (showToast) toast('Cliente asignado');
      return Number(existing.id);
    }

    const created = await api.post<any>('/clients', {
      fullName: name,
      projectInterestId: lockedProjectId || projectId || undefined,
      agentId: agentId || undefined,
      pipelineStatus: 'ganado',
      source: 'venta_directa',
    });
    setClients((current) => [created, ...current]);
    setClientId(Number(created.id));
    if (showToast) toast('Cliente creado y asignado');
    return Number(created.id);
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
    if (!selectedQuoteId) return toast('Selecciona una cotizacion antes de registrar la venta. Si no existe, genera una primero.', 'err');
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!clientName.trim() && !clientId) return toast('Ingresa el nombre del cliente real.', 'err');
    if (!agentId) return toast('Selecciona el agente', 'err');
    if (!salePrice) return toast('Ingresa el precio de venta', 'err');
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      const resolvedClientId = clientId || await assignClientByName(false);
      if (!resolvedClientId) return;
      await api.post('/sales', {
        projectId: lockedProjectId || projectId || lot?.projectId || 1, lotId: Number(lotId),
        clientId: resolvedClientId, agentId: Number(agentId), salePrice,
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
      setOpen(false); setLotId(0); setSelectedQuoteId(0); setClientId(0); setClientName(''); setConditions(''); setSalePrice(0);
      setPaymentMethod('Contado'); setTotalCuotas(0); setCuotaInicial(0); setInterestType('sin_intereses'); setTea(0);
      setApplyCommission(false); setCommissionRate(0); setSaleDate(todayInput()); setAgentId(0); setPreview(null);
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

  async function exportSalePdf(s: S) {
    const schedule: any[] = await api.get<any[]>(`/sales/${s.id}/schedule`).catch(() => []);
    const project = projects.find((p: any) => Number(p.id) === Number(s.projectId));
    const adminLogoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
    const projectLogoUrl = project?.logoImageUrl || '';
    const formaPago = Number(s.totalCuotas || 0) > 0 ? 'Al credito' : 'Contado';
    const salePriceValue = Number(s.salePrice || 0);
    const commission = Number(s.commission || 0);
    const financingBase = Number(s.financingBase || salePriceValue);
    const valorCuota = Number(s.valorCuota || schedule[0]?.amount || 0);
    const paidInstallments = schedule.filter((row) => row.status === 'pagado').length;
    const detailRows = [
      ['Proyecto', project?.name || `Proyecto ${s.projectId}`],
      ['Lote', s.lotCode || `Lote ${s.lotId}`],
      ['Cliente', s.clientName || '-'],
      ['Agente', s.agentName || '-'],
      ['Precio Venta', formatMoney(s.salePrice)],
      ['Fecha', formatDate(s.saleDate)],
      ['Forma de Pago', formaPago],
      ['Nro de Cuotas', s.totalCuotas || 0],
      ['Comision', formatMoney(commission)],
      ['Saldo a Financiar', formatMoney(financingBase)],
      ['Interes', s.interestType === 'tea' ? `Con TEA = ${Number(s.tea || 0)}%` : 'Sin intereses'],
      ['Estado', s.approvalStatus === 'pendiente' ? 'Pendiente' : 'Aprobada'],
    ];
    const scheduleRows = schedule.map((row) => `
      <tr><td>Cuota ${escapeHtml(row.installmentNo || '-')}</td><td>${escapeHtml(formatDate(row.dueDate))}</td><td class="num">${escapeHtml(formatMoney(row.amount))}</td><td>${escapeHtml(row.status || '-')}</td></tr>
    `).join('');
    printHtml(`
      <html><head><title>Ficha de venta V${s.id}</title><style>
        body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#171717;background:white}.brand{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;border-bottom:3px solid #1877F2;padding-bottom:14px;margin-bottom:16px}.logos{display:flex;align-items:center;gap:12px}.logos img{height:42px;max-width:150px;object-fit:contain}.eyebrow{margin:0 0 5px;color:#1877F2;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}h1{margin:0;font-size:24px;line-height:1.15;color:#111827}h2{font-size:13px;margin:18px 0 8px;color:#1259C4;text-transform:uppercase;letter-spacing:.04em}p{margin:4px 0 0;color:#6B7280;font-size:12px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:14px 0 18px}.summary div{border:1px solid #E5E7EB;background:#F8FAFC;padding:9px 10px;border-radius:6px}.summary span{display:block;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.summary strong{display:block;margin-top:4px;color:#111827;font-size:12px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px;background:white}th{background:#1877F2;color:white;border:1px solid #1877F2;padding:8px 7px;font-size:10px;text-align:left;text-transform:uppercase}td{border:1px solid #E5E7EB;padding:8px 7px;font-size:11px;vertical-align:top}tbody tr:nth-child(even){background:#F8FAFC}.label{background:#D8E8FF;font-weight:700;color:#111827;width:34%}.num{text-align:right;white-space:nowrap;font-weight:700;color:#1259C4}.watermark{position:fixed;left:50%;top:54%;transform:translate(-50%,-50%) rotate(-28deg);opacity:.06;z-index:-1}.watermark img{width:560px;max-width:72vw}.footer{margin-top:18px;border-top:1px solid #E5E7EB;padding-top:8px;color:#6B7280;font-size:10px;text-align:right}@media print{body{margin:18px}thead{display:table-header-group}.brand,.summary{break-inside:avoid}.watermark{position:fixed}}
      </style></head><body>
        <div class="watermark"><img src="${escapeHtml(adminLogoUrl)}" alt="" /></div>
        <div class="brand"><div><p class="eyebrow">Ficha de venta</p><h1>Venta V${s.id} - ${escapeHtml(s.lotCode || `Lote ${s.lotId}`)}</h1><p>${escapeHtml(project?.name || `Proyecto ${s.projectId}`)} - generado ${new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</p></div><div class="logos">${projectLogoUrl ? `<img src="${escapeHtml(projectLogoUrl)}" alt="Proyecto" />` : ''}<img src="${escapeHtml(adminLogoUrl)}" alt="Dunacon" /></div></div>
        <div class="summary"><div><span>Precio venta</span><strong>${escapeHtml(formatMoney(s.salePrice))}</strong></div><div><span>Comision</span><strong>${escapeHtml(formatMoney(commission))}</strong></div><div><span>Forma de pago</span><strong>${escapeHtml(formaPago)}</strong></div><div><span>Cuota</span><strong>${escapeHtml(valorCuota ? formatMoney(valorCuota) : '-')}</strong></div></div>
        <h2>Datos de la venta</h2><table><tbody>${detailRows.map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table>
        <h2>Financiamiento</h2><table><thead><tr><th>Cuota</th><th>Vencimiento</th><th>Monto</th><th>Estado</th></tr></thead><tbody>${scheduleRows || '<tr><td colspan="4">Sin cronograma registrado.</td></tr>'}</tbody></table>
        <div class="summary"><div><span>Cuotas</span><strong>${Number(s.totalCuotas || 0)}</strong></div><div><span>Pagadas</span><strong>${paidInstallments}</strong></div><div><span>Pendientes</span><strong>${Math.max(0, schedule.length - paidInstallments)}</strong></div><div><span>Plan</span><strong>${escapeHtml(s.planStatus || 'pendiente')}</strong></div></div><div class="footer">Dunacon - CRM Inmobiliario</div>
      </body></html>
    `);
  }

  const total = rows.reduce((s, r) => s + Number(r.salePrice || 0), 0);
  const comm = rows.reduce((s, r) => s + Number(r.commission || 0), 0);
  const soldArea = rows.reduce((sum, row) => sum + Number(row.lotAreaM2 || 0), 0);
  const financingTotal = [...rows, ...pending].reduce((sum, row) => sum + Number(row.financingBase || 0), 0);
  const initialPaymentTotal = [...rows, ...pending].reduce((sum, row) => sum + initialPaymentOf(row), 0);

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
          <StatCard label="Area Vendida m2" value={soldArea.toLocaleString('es-PE', { maximumFractionDigits: 2 })} color="#1259C4" />
          <StatCard label="Lotes vendidos" value={rows.length} />
          <StatCard label="Monto total vendido" value={formatMoney(total)} color="#171717" />
          <StatCard label="Financiamiento D." value={formatMoney(financingTotal)} color="#1259C4" />
          <StatCard label="Comisiones devengadas" value={formatMoney(comm)} color="#1259C4" />
          <StatCard label="Separaciones" value={pending.length} color="#1259C4" />
          <StatCard label="Pago Inicial" value={formatMoney(initialPaymentTotal)} color="#1259C4" />
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
                <th className="th-base" style={{ textAlign: 'center' }}>Ficha</th>
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
                    <td className="td-base" style={{ textAlign: 'center' }}>
                      <button type="button" className="inline-grid h-8 w-8 place-items-center rounded-md border text-[#1877F2] hover:bg-slate-50" style={{ borderColor: '#E5E7EB' }} onClick={() => exportSalePdf(s)} title="Descargar ficha">
                        <FiDownload />
                      </button>
                    </td>
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
                <th className="th-base" style={{ textAlign: 'center' }}>Ficha</th>
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
                    <td className="td-base" style={{ textAlign: 'center' }}>
                      <button type="button" className="inline-grid h-8 w-8 place-items-center rounded-md border text-[#1877F2] hover:bg-slate-50" style={{ borderColor: '#E5E7EB' }} onClick={() => exportSalePdf(s)} title="Descargar ficha">
                        <FiDownload />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0B2F6E' }}>
                  <td className="td-base font-bold text-white" colSpan={3}>Totales ({rows.length})</td>
                  <td className="td-base font-bold text-white">{formatMoney(total)}</td>
                  <td className="td-base" colSpan={6}></td>
                  <td className="td-base font-bold text-white">{formatMoney(comm)}</td>
                  <td className="td-base"></td>
                </tr>
              </tfoot>
            </table>
            )}
        </div>
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
                  Cotizaciones generadas en este proyecto (módulo Cotizaciones Lotes)
                </div>
                <div className="max-h-52 overflow-y-auto divide-y" style={{ borderColor: '#F0F1F3' }}>
                  {availableQuotes.map((q: any) => (
                    <button key={q.id} className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 text-left"
                      onClick={() => selectQuote(q)}>
                      <span>
                        <span className="font-semibold">Q{q.id}</span> · Lote {q.lotCode || q.lotId} · {q.clientName || 'Sin cliente'}
                        <span className="block text-xs text-slate-500">
                          {q.paymentMethod === 'credito' ? `Al crédito · ${Number(q.totalCuotas || 0)} cuotas` : 'Contado'}
                        </span>
                      </span>
                      <b>{formatMoney(Math.round(Number(q.finalPriceUsd || 0) * Number(q.exchangeRate || 1)))}</b>
                    </button>
                  ))}
                  {availableQuotes.length === 0 && (
                    <p className="px-3 py-4 text-xs text-slate-400 text-center">Aún no hay cotizaciones para este proyecto o lote.</p>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-lg border p-3 mb-4 text-sm" style={{ borderColor: selectedQuote ? '#BBF7D0' : '#BFDBFE', background: selectedQuote ? '#F0FDF4' : '#EFF6FF' }}>
              {selectedQuote ? (
                <p className="font-semibold" style={{ color: '#166534' }}>
                  Cotización Q{selectedQuote.id} cargada: precio final, cliente y forma de pago vienen de la cotización.
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p style={{ color: '#1259C4' }}>Para registrar una venta primero selecciona una cotización. Si no existe, genera una y vuelve a cargarla aquí.</p>
                  <a
                    className="btn-primary"
                    href={quoteProjectId ? `/projects/${quoteProjectId}/quotes${lotId ? `?lotId=${lotId}` : ''}` : '/projects'}
                  >
                    Generar cotización
                  </a>
                </div>
              )}
            </div>

            {/* Lote y responsable */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!lockedProjectId && (
                <Field label="Proyecto">
                  <select className="input" value={projectId} onChange={(e) => { setProjectId(Number(e.target.value)); setLotId(0); setSelectedQuoteId(0); setSalePrice(0); }}>
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
              <p className="text-xs mt-1" style={{ color: '#1259C4' }}>
                {selectedQuote ? 'Precio final cargado desde la cotizacion seleccionada.' : 'Precio referencial autocompletado desde el Precio Venta de Lotizacion de este lote.'}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div className="hidden"><Field label="Cliente"><select className="input" value={clientId} onChange={(e) => setClientId(Number(e.target.value))}><option value={0}>— Sin asignar —</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{(c.fullName || c.full_name || '— Sin nombre —')}</option>)}</select></Field></div>
              <Field label="Agente *"><select className="input" value={agentId} onChange={(e) => setAgentId(Number(e.target.value))}><option value={0}>Selecciona…</option>{agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            </div>

            <div className="mt-3 rounded-md border bg-white p-3" style={{ borderColor: '#E5E7EB' }}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Nombre del cliente *">
                  <input
                    className="input"
                    value={clientName}
                    onChange={(e) => { setClientName(e.target.value); setClientId(0); }}
                    placeholder="Escribe el cliente real"
                  />
                </Field>
                <button type="button" className="btn-neutral" onClick={() => assignClientByName(true)}>Asignar</button>
              </div>
              {clientId > 0 && <p className="mt-2 text-xs text-emerald-600">Cliente asignado a la venta.</p>}
              <div className="mt-3">
                <Field label="Buscar cliente existente (opcional)">
                  <select
                    className="input"
                    value={clientId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setClientId(id);
                      const client = clients.find((c: any) => Number(c.id) === id);
                      setClientName(client ? (client.fullName || client.full_name || '') : '');
                    }}
                  >
                    <option value={0}>Nuevo cliente o sin seleccionar</option>
                    {clients.map((c: any) => <option key={c.id} value={c.id}>{(c.fullName || c.full_name || 'Sin nombre')}</option>)}
                  </select>
                </Field>
              </div>
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
                  <span className="text-xs text-slate-500">Calcula la comisión de esta venta sin descontarla del financiamiento.</span>
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

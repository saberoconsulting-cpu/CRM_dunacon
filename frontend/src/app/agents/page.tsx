'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { Modal, StatCard, Toaster, toast } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/types';
import { printHtml } from '@/lib/print';
import { FiDownload, FiFileText, FiSettings } from 'react-icons/fi';

type Agent = { id: number; name: string; email: string; status: string; commissionRate?: string; monthlyGoalLots?: number; monthlyGoalAmount?: string };
type Period = 'all' | 'week' | 'month' | 'year';

const PERIOD_LABEL: Record<Period, string> = {
  all: 'Todo',
  week: 'Semana',
  month: 'Mes',
  year: 'Ano',
};

function saleAgentId(sale: any) {
  return Number(sale.agentId ?? sale.agent_id ?? 0);
}

function saleAmount(sale: any) {
  return Number(sale.salePrice ?? sale.sale_price ?? 0);
}

function saleCommission(sale: any) {
  return Number(sale.commission || 0);
}

function saleProjectId(sale: any) {
  return Number(sale.projectId ?? sale.project_id ?? 0);
}

function saleDateValue(sale: any) {
  const raw = sale.saleDate || sale.sale_date || sale.createdAt || sale.created_at;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDate(value: any) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function periodRange(period: Period) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === 'week') {
    const day = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (period === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  }
  if (period === 'year') {
    return { start: new Date(now.getFullYear(), 0, 1), end };
  }
  return { start: null, end: null };
}

function inPeriod(sale: any, period: Period) {
  if (period === 'all') return true;
  const date = saleDateValue(sale);
  const range = periodRange(period);
  if (!date || !range.start || !range.end) return false;
  return date >= range.start && date <= range.end;
}

function isRealSale(sale: any) {
  return String(sale.approvalStatus || sale.approval_status || '').toLowerCase() !== 'rechazada';
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [modalPeriod, setModalPeriod] = useState<Period>('month');

  const load = useCallback(async () => {
    try {
      const [ag, sv, lt, pr] = await Promise.all([
        api.get<any>('/users/agents'),
        api.get<any>('/sales'),
        api.get<any>('/lots?limit=100000'),
        api.get<any>('/projects'),
      ]);
      setAgents(Array.isArray(ag) ? ag : (ag?.items || []));
      setSales((Array.isArray(sv) ? sv : (sv?.items || [])).filter(isRealSale));
      setLots(Array.isArray(lt) ? lt : (lt?.items || []));
      setProjects(Array.isArray(pr) ? pr : (pr?.items || []));
    } catch (e: any) {
      toast(e.message as string, 'err');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const scopedSales = useMemo(() => (
    projectId ? sales.filter((sale) => String(saleProjectId(sale)) === String(projectId)) : sales
  ), [sales, projectId]);

  const scopedLots = useMemo(() => (
    projectId ? lots.filter((lot) => String(lot.projectId ?? lot.project_id) === String(projectId)) : lots
  ), [lots, projectId]);

  const metricOf = useCallback((agentId: number, source = scopedSales) => {
    const rows = source.filter((sale) => saleAgentId(sale) === Number(agentId));
    return {
      count: rows.length,
      amount: rows.reduce((sum, sale) => sum + saleAmount(sale), 0),
      commission: rows.reduce((sum, sale) => sum + saleCommission(sale), 0),
      rows,
    };
  }, [scopedSales]);

  const ranking = useMemo(() => agents
    .map((agent) => ({ agent, ...metricOf(agent.id) }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count), [agents, metricOf]);

  const totalSold = scopedSales.reduce((sum, sale) => sum + saleAmount(sale), 0);
  const totalCommission = scopedSales.reduce((sum, sale) => sum + saleCommission(sale), 0);
  const soldLots = scopedSales.length;
  const activeAgents = agents.filter((agent) => agent.status === 'active').length;

  async function toggle(agent: Agent) {
    try {
      await api.post(`/users/status/${agent.id}/${agent.status === 'active' ? 'inactive' : 'active'}`);
      toast('Estado actualizado');
      load();
    } catch (e: any) {
      toast(e.message as string, 'err');
    }
  }

  async function changeCommission(agent: Agent) {
    const val = prompt(`Comision % para ${agent.name}:`, String(Number(agent.commissionRate || 0)));
    const n = Number(val);
    if (val == null || isNaN(n) || n < 0 || n > 100) return toast('Ingresa un % entre 0 y 100', 'err');
    try {
      await api.post(`/users/update/${agent.id}`, { commissionRate: n });
      toast('Comision actualizada');
      load();
    } catch (e: any) {
      toast(e.message as string, 'err');
    }
  }

  const openFicha = (agent: Agent) => {
    setSelectedAgent(agent);
    setModalPeriod('month');
  };

  const fichaSales = selectedAgent
    ? sales.filter((sale) => saleAgentId(sale) === selectedAgent.id && inPeriod(sale, modalPeriod))
    : [];
  const fichaAmount = fichaSales.reduce((sum, sale) => sum + saleAmount(sale), 0);
  const fichaCommission = fichaSales.reduce((sum, sale) => sum + saleCommission(sale), 0);

  function printFicha() {
    if (!selectedAgent) return;
    const rowsHtml = fichaSales.map((sale) => `
      <tr>
        <td>${sale.id ? `V${sale.id}` : '-'}</td>
        <td>${sale.lotCode || sale.lot_code || sale.lotId || sale.lot_id || '-'}</td>
        <td>${sale.clientName || sale.client_name || '-'}</td>
        <td>${sale.agentName || selectedAgent.name}</td>
        <td class="num">${formatMoney(saleAmount(sale))}</td>
        <td class="num">${formatMoney(saleCommission(sale))}</td>
        <td>${formatDate(sale.saleDate || sale.sale_date || sale.createdAt)}</td>
      </tr>
    `).join('');
    const generatedAt = new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
    printHtml(`
      <html><head><title>Ficha ventas - ${selectedAgent.name}</title><style>
        body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#171717}
        h1{font-size:22px;margin:0 0 4px} p{margin:0 0 16px;color:#6B7280;font-size:12px}
        table{width:100%;border-collapse:collapse;table-layout:fixed} th{background:#1877F2;color:#fff;text-align:left;font-size:10px;padding:8px;text-transform:uppercase}
        td{border:1px solid #E5E7EB;padding:8px;font-size:11px}.num{text-align:right;font-weight:700;color:#1259C4}
        .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.summary div{border:1px solid #E5E7EB;background:#F8FAFC;padding:10px}
        .summary span{display:block;color:#6B7280;font-size:10px;text-transform:uppercase}.summary b{display:block;margin-top:3px}
      </style></head><body>
        <h1>Ficha de ventas - ${selectedAgent.name}</h1><p>Periodo: ${PERIOD_LABEL[modalPeriod]} - Generado: ${generatedAt}</p>
        <div class="summary"><div><span>Ventas</span><b>${fichaSales.length}</b></div><div><span>Monto vendido</span><b>${formatMoney(fichaAmount)}</b></div><div><span>Comision acumulada</span><b>${formatMoney(fichaCommission)}</b></div><div><span>Comision %</span><b>${Number(selectedAgent.commissionRate || 0)}%</b></div></div>
        <table><thead><tr><th>ID</th><th>Lote</th><th>Cliente</th><th>Agente</th><th>Monto</th><th>Comision</th><th>Fecha</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="7">Sin ventas registradas.</td></tr>'}</tbody></table>
      </body></html>
    `);
  }

  return (
    <Layout title="Agentes y rendimiento">
      <Toaster />
      <div className="space-y-5">
        <div className="flex justify-end">
          <select className="input max-w-xs" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <StatCard label="Agentes activos" value={activeAgents} />
          <StatCard label="Lotes Totales" value={scopedLots.length} color="#1259C4" />
          <StatCard label="Lotes Vendidos" value={soldLots} color="#1259C4" />
          <StatCard label="Monto Vendido US$" value={formatMoney(totalSold)} color="#1259C4" />
          <StatCard label="Monto vendido (agentes)" value={formatMoney(totalSold)} color="#125A3B" />
          <StatCard label="Comision Total US$" value={formatMoney(totalCommission)} color="#1259C4" />
        </div>

        <div className="card overflow-auto p-0">
          {loading ? <p className="p-4 text-slate-400">Cargando...</p>
            : agents.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">No hay agentes.</p>
            : (
              <table className="table-base">
                <thead><tr>
                  <th className="th-base">Agente</th><th className="th-base">Comision</th><th className="th-base">Lotes vendidos</th>
                  <th className="th-base">Monto vendido</th><th className="th-base">Comision acumulada</th><th className="th-base">Meta (lotes/mes)</th><th className="th-base">Estado</th><th className="th-base"></th><th className="th-base">Ficha ventas</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.map((agent) => {
                    const metric = metricOf(agent.id);
                    return (
                      <tr key={agent.id}>
                        <td className="td-base font-medium">{agent.name}</td>
                        <td className="td-base"><button onClick={() => changeCommission(agent)} className="inline-flex items-center gap-1 text-xs font-medium text-[#1877F2] hover:underline"><FiSettings /> {Number(agent.commissionRate || 0)}% editar</button></td>
                        <td className="td-base">{metric.count}</td>
                        <td className="td-base">{formatMoney(metric.amount)}</td>
                        <td className="td-base font-medium" style={{ color: '#1259C4' }}>{formatMoney(metric.commission)}</td>
                        <td className="td-base">{agent.monthlyGoalLots || 0}</td>
                        <td className="td-base"><span className="badge" style={{ background: agent.status === 'active' ? '#EAF7EE' : '#F1F5F9', color: agent.status === 'active' ? '#125A3B' : '#64748B' }}>{agent.status}</span></td>
                        <td className="td-base"><button className="btn-neutral !h-7 text-xs" onClick={() => toggle(agent)}>{agent.status === 'active' ? 'Desactivar' : 'Activar'}</button></td>
                        <td className="td-base"><button className="btn-secondary !h-7 !px-2 text-xs" onClick={() => openFicha(agent)}><FiFileText /> Ficha Ventas</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>

        <section className="border bg-white p-4" style={{ borderColor: '#E5E7EB', borderRadius: 6, boxShadow: '0 1px 2px rgba(16,24,40,.035)' }}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: '#171717' }}>Ranking de agentes</h3>
              <p className="mt-1 text-xs text-slate-500">Ventas, monto y comision</p>
            </div>
            <span className="mt-1 h-5 w-1" style={{ background: '#1877F2' }} />
          </div>
          <div className="overflow-x-auto">
            <table className="table-base" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 52 }} /><col /><col style={{ width: 110 }} /><col style={{ width: 150 }} /><col style={{ width: 150 }} />
              </colgroup>
              <thead><tr><th className="th-base">#</th><th className="th-base">Agente</th><th className="th-base text-right">Ventas</th><th className="th-base text-right">Monto</th><th className="th-base text-right">Comision</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {ranking.map((row, index) => (
                  <tr key={row.agent.id} className={index === 0 ? 'bg-softblue' : undefined}>
                    <td className="td-base font-semibold" style={{ color: '#1877F2' }}>{index + 1}</td>
                    <td className="td-base truncate font-medium">{row.agent.name}</td>
                    <td className="td-base text-right tabular-nums">{row.count}</td>
                    <td className="td-base text-right font-semibold tabular-nums">{formatMoney(row.amount)}</td>
                    <td className="td-base text-right tabular-nums">{formatMoney(row.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal open={!!selectedAgent} onClose={() => setSelectedAgent(null)} title={`Ficha ventas - ${selectedAgent?.name || ''}`} width="max-w-5xl">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {(['week', 'month', 'year', 'all'] as Period[]).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setModalPeriod(period)}
                  className="h-8 border px-3 text-xs font-semibold"
                  style={{ borderColor: modalPeriod === period ? '#1877F2' : '#E5E7EB', background: modalPeriod === period ? '#1877F2' : 'white', color: modalPeriod === period ? 'white' : '#171717', borderRadius: 4 }}
                >
                  {PERIOD_LABEL[period]}
                </button>
              ))}
            </div>
            <button type="button" className="btn-secondary h-9 text-sm" onClick={printFicha}><FiDownload /> Imprimir ficha</button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Ventas" value={fichaSales.length} />
            <StatCard label="Monto vendido" value={formatMoney(fichaAmount)} color="#1259C4" />
            <StatCard label="Comision" value={formatMoney(fichaCommission)} color="#1259C4" />
          </div>

          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th className="th-base">ID</th><th className="th-base">Lote</th><th className="th-base">Cliente</th><th className="th-base text-right">Monto</th><th className="th-base text-right">Comision</th><th className="th-base">Fecha</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {fichaSales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="td-base">V{sale.id}</td>
                    <td className="td-base">{sale.lotCode || sale.lotId || '-'}</td>
                    <td className="td-base">{sale.clientName || '-'}</td>
                    <td className="td-base text-right font-semibold">{formatMoney(saleAmount(sale))}</td>
                    <td className="td-base text-right">{formatMoney(saleCommission(sale))}</td>
                    <td className="td-base">{formatDate(sale.saleDate || sale.sale_date || sale.createdAt)}</td>
                  </tr>
                ))}
                {!fichaSales.length && <tr><td className="td-base text-center text-slate-400" colSpan={6}>Sin ventas en este periodo.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

'use client';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FiCamera, FiUsers, FiTag, FiDollarSign, FiArrowDownCircle, FiTrendingUp, FiPieChart } from 'react-icons/fi';
import { IoLocationSharp } from 'react-icons/io5';
import Layout from '@/components/layout/Layout';
import { Toaster, toast } from '@/components/ui/ui';
import { MetricTile, KPI_GRID_8 } from '@/components/ui/Metrics';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import LotDetailModal from '@/components/features/lots/LotDetailModal';
import { useConstructionBudgetCalculations, isCleanDynamicCashflow } from '@/components/features/construction-budget/ConstructionBudgetView';
import { useIncomeStatementReal } from '@/components/features/income-statement/IncomeStatementView';
import ProjectReports from '@/components/features/projects/ProjectReports';
import { api, getToken, uploadFile } from '@/lib/api';
import { financingPending, clientDelinquencyRate } from '@/lib/financing-pending';
import { lotListValue } from '@/lib/lot-summary';
import { salesMonthlyAmounts } from '@/lib/sales-monthly';
import { getSocket } from '@/lib/socket';
import { Lot, LOT_STATUS_LABEL } from '@/lib/types';
import { useDisplayCurrency } from '@/lib/currency';

type AgentRanking = { agentId?: number | null; agentName: string; salesCount: number; salesAmount: number; commission: number };

const LOT_STATUSES = ['disponible', 'reservado', 'adelanto', 'primera_cuota', 'vendido'] as const;
const DASHBOARD_LOT_COLORS: Record<(typeof LOT_STATUSES)[number], string> = {
  disponible: '#86CFA5',
  reservado: '#F59E0B',
  adelanto: '#7C3AED',
  primera_cuota: '#0284C7',
  vendido: '#DC2626',
};
const LEAD_CHANNEL_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  web: 'Web',
  referidos: 'Referidos',
  otro: 'Otro',
};
const LEAD_CHANNEL_COLOR: Record<string, string> = {
  Facebook: '#60A5FA',
  TikTok: '#FDBA74',
  Instagram: '#93C5FD',
  Web: '#FB923C',
  Referidos: '#BFDBFE',
  Otro: '#FED7AA',
};

function asNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function sumBy<T>(items: T[], selector: (item: T) => unknown): number {
  return items.reduce((total, item) => total + asNumber(selector(item)), 0);
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const [project, setProject] = useState<any>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [kpis, setKpis] = useState<any>(null);
  const [budgetSummary, setBudgetSummary] = useState<any>({ categories: {}, grandTotal: 0 });
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [budgetCashflow, setBudgetCashflow] = useState<any>(null);
  const [budgetDynamicCashflow, setBudgetDynamicCashflow] = useState<any>(null);
  const { budgetTotals } = useConstructionBudgetCalculations(budgetItems, budgetCashflow, budgetDynamicCashflow);
  const [statementItems, setStatementItems] = useState<any[]>([]);
  const { rowReal: statementReal } = useIncomeStatementReal(projectId, statementItems, budgetCashflow, budgetDynamicCashflow);
  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [agentPage, setAgentPage] = useState(0);
  const [leadsByChannel, setLeadsByChannel] = useState<{ channel: string; total: number }[]>([]);
  const [chartSales, setChartSales] = useState<any[]>([]);
  const [financingTotal, setFinancingTotal] = useState({ amount: 0, count: 0, overdueAmount: 0, overdueCount: 0, initialAmount: 0, paidInstallmentAmount: 0 });
  const [cash, setCash] = useState<any>({ methods: [], byMonth: [], overdueByMonth: [], salesByMonth: [], metrics: {} });
  // Moneda unica de la pantalla: el toggle S/ <-> US$ la controla y `fmt` convierte
  // todos los montos (que vienen en soles de la base de datos) antes de pintarlos.
  const { currency, setCurrency, exchangeRate, setExchangeRate, format: fmt } = useDisplayCurrency();

  async function loadAll() {
    try {
      const [prj, pl] = await Promise.all([
        api.get<any>(`/projects/${projectId}`),
        api.get<any>(`/plan/project/${projectId}`).catch(() => ({ plan: null, streets: [], blocks: [], lots: [] })),
      ]);
      setProject(prj);
      setLots(pl.lots || []);
    } catch (e: any) {
      toast(e.message, 'err');
    }
  }

  async function reemplazarPortada(file?: File) {
    if (!file) return;
    try {
      const updated = await uploadFile(`/projects/cover/${projectId}`, file);
      setProject((current: any | null) => ({ ...(current || {}), coverImageUrl: updated?.coverImageUrl || current?.coverImageUrl }));
      toast('Imagen de portada actualizada');
    } catch (e: any) {
      toast(e.message, 'err');
    }
  }

  async function reemplazarLogo(file?: File) {
    if (!file) return;
    try {
      const updated = await uploadFile(`/projects/logo/${projectId}`, file);
      setProject((current: any | null) => ({ ...(current || {}), logoImageUrl: updated?.logoImageUrl || current?.logoImageUrl }));
      // Avisa al Layout para que el sidebar y el header refresquen el logo.
      window.dispatchEvent(new CustomEvent('project-logo-updated'));
      toast('Logo del proyecto actualizado');
    } catch (e: any) {
      toast(e.message, 'err');
    }
  }

  useEffect(() => {
    let role = 'agent';
    try {
      const meta = typeof window !== 'undefined' ? localStorage.getItem('crm_user') : '';
      role = meta ? (JSON.parse(meta).role || 'agent') : 'agent';
    } catch {}
    setCanEdit(role === 'superadmin' || role === 'admin');
  }, []);

  useEffect(() => {
    if (!projectId) return;
    loadAll();
    const token = getToken();
    if (!token) return undefined;
    const socket = getSocket(token);
    socket.on('lot.updated', loadAll);
    return () => { socket.off('lot.updated', loadAll); };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    api.get<any>(`/dashboards/project/${projectId}/kpis`).then(setKpis).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    api.get<any>(`/dashboards/project/${projectId}`).then(setStats).catch(() => {});
    api.get<any[]>(`/clients/metrics/channels?projectId=${projectId}`).then((data) => setLeadsByChannel(data || [])).catch(() => {});
    api.get<any>(`/payments/caja?projectId=${projectId}`).then(setCash).catch(() => {});
    let cancelled = false;
    async function loadPages(path: string) {
      const items: any[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const result = await api.get<any>(`${path}?projectId=${projectId}&page=${page}&limit=100`);
        items.push(...(Array.isArray(result) ? result : result?.items || []));
        totalPages = Number(result?.totalPages || 1);
        page += 1;
      } while (page <= totalPages && !cancelled);
      return items;
    }
    async function loadPaymentOperations() {
      const [operations, sales] = await Promise.all([loadPages('/payments'), loadPages('/sales')]);
      if (cancelled) return;
      setChartSales(sales);
      const ids = Array.from(new Set([...sales, ...operations].map(row => Number(row.lotId || 0)).filter(Boolean)));
      const histories = await Promise.all(ids.map(id => api.get<any>(`/sales/lot/${id}/history`)));
      if (!cancelled) setFinancingTotal(financingPending(histories, operations));
    }
    loadPaymentOperations().catch(() => {
      if (!cancelled) toast('No se pudo actualizar el saldo de cuotas en mora. Recarga la pagina.', 'err');
    });

    Promise.all([
      api.get<any>(`/construction-budget?projectId=${projectId}`),
      api.get<any>(`/cashflow/model?projectId=${projectId}&mode=estatico`).catch(() => null),
      api.get<any>(`/cashflow/model?projectId=${projectId}&mode=dinamico`).catch(() => null),
      api.get<any>(`/income-statement?projectId=${projectId}`).catch(() => ({ items: [] })),
    ]).then(([budget, projected, real, statement]) => {
      setStatementItems(Array.isArray(statement?.items) ? statement.items : []);
      setBudgetSummary(budget?.summary || { categories: {}, grandTotal: 0 });
      setBudgetItems(budget?.items || []);
      setBudgetCashflow(Array.isArray(projected?.rows) ? projected : null);
      setBudgetDynamicCashflow(isCleanDynamicCashflow(real) ? real : null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const countByStatus = (status: Lot['status']) => lots.filter((lot) => lot.status === status).length;
  const amountByStatus = (status: Lot['status']) => sumBy(lots.filter((lot) => lot.status === status), lotListValue);
  const lotCountData = LOT_STATUSES.map((status) => ({ name: LOT_STATUS_LABEL[status], value: countByStatus(status) }));
  const lotAmountData = LOT_STATUSES.map((status) => ({ name: LOT_STATUS_LABEL[status], value: amountByStatus(status) }));
  const lotColorByLabel = (label: string) => {
    const status = LOT_STATUSES.find((item) => LOT_STATUS_LABEL[item] === label);
    return status ? DASHBOARD_LOT_COLORS[status] : '#9AA1AB';
  };
  const leadsChartData = leadsByChannel.map((item) => ({
    name: LEAD_CHANNEL_LABEL[item.channel] || item.channel || 'Otro',
    value: asNumber(item.total),
  }));
  const totalLeads = sumBy(leadsByChannel, (item) => item.total);
  const salesCount = sumBy(stats?.salesByPeriod || [], (item: any) => item.total);
  const income = asNumber(statementReal['line-ingreso']);
  const expense = asNumber(statementReal['line-costo']) + asNumber(statementReal['line-ventas_admin']) + asNumber(statementReal['line-financiero']);
  const profit = asNumber(statementReal.net);
  const soldLots = countByStatus('vendido');
  const constructionBudget = budgetTotals.projected || asNumber(budgetSummary?.grandTotal);
  const obraReal = budgetTotals.real;
  const obraExecutionPct = budgetTotals.projected ? (obraReal / budgetTotals.projected) * 100 : obraReal ? 100 : 0;
  const inventoryValue = sumBy(lots, lotListValue);
  const agentRanking = (stats?.agentRanking || []) as AgentRanking[];

  // --- Series para las 4 graficas del proyecto (columna 60%) ---
  const collectedByMonth = (cash?.byMonth || []) as { month: string; monto: number }[];
  const salesByMonth = salesMonthlyAmounts(cash?.salesByMonth || [], chartSales);
  const overdueByMonth = (cash?.overdueByMonth || []) as { month: string; monto: number }[];
  const methods = (cash?.methods || []) as { method: string; total: number; monto: number }[];
  const cashMetrics = cash?.metrics || {};

  // Totales base.
  const totalLots = lots.length || asNumber(stats?.cards?.total);
  const totalLotValue = inventoryValue;
  const soldLotsCount = soldLots;
  // Mismo resumen de ventas y cobranzas que usa Finanzas/Pagos, en USD.
  const soldAmount = asNumber(cashMetrics.totalSaleAmount);
  const paidAmount = financingTotal.initialAmount + financingTotal.paidInstallmentAmount;
  const pendingAmount = financingTotal.amount;
  const overdueAmount = Number(cashMetrics.overdueAmount ?? sumBy(overdueByMonth, (r) => r.monto));

  // Ventas por año (para el menu de la grafica de ventas).
  const salesYears = Array.from(new Set(salesByMonth.map((r) => String(r.month || '').slice(0, 4)).filter(Boolean))).sort();
  const salesByYear = salesYears.map((year) => ({
    year,
    vendido: salesByMonth.filter((r) => String(r.month || '').slice(0, 4) === year).reduce((sum, r) => sum + asNumber(r.monto), 0),
    recaudado: collectedByMonth.filter((r) => String(r.month || '').slice(0, 4) === year).reduce((sum, r) => sum + asNumber(r.monto), 0),
    moroso: overdueByMonth.filter((r) => String(r.month || '').slice(0, 4) === year).reduce((sum, r) => sum + asNumber(r.monto), 0),
  }));

  // Mismas filas y subtotales de la columna Real del Estado de Resultados.
  const realStatement = {
    revenue: income,
    costOfSales: asNumber(statementReal['line-costo']),
    salesAdminCost: asNumber(statementReal['line-ventas_admin']),
    financeCost: asNumber(statementReal['line-financiero']),
    grossProfit: asNumber(statementReal.gross),
    operatingProfit: asNumber(statementReal.operating),
    profitBeforeTax: asNumber(statementReal['pre-tax']),
    incomeTax: asNumber(statementReal['line-impuestos']),
    netProfit: profit,
  };
  const delinquencyRate = clientDelinquencyRate(financingTotal.amount, financingTotal.overdueAmount);

  if (!project) {
    return (
      <Layout title="Cargando">
        <Toaster />
        <p className="text-slate-400">Cargando proyecto...</p>
      </Layout>
    );
  }

  return (
    <Layout title={project.name} titleLogoUrl={project.logoImageUrl}>
      <Toaster />
      <LotDetailModal lotId={selectedLot} onClose={() => setSelectedLot(null)} onChanged={loadAll} compact />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="card flex flex-wrap items-center gap-4 xl:col-span-3">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-4">
            {project.coverImageUrl && (
              <div className="w-32 shrink-0 sm:w-36">
                <img src={project.coverImageUrl} className="aspect-[4/3] w-full rounded-lg object-cover" alt="" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {project.logoImageUrl && <img src={project.logoImageUrl} className="h-12 w-auto max-w-40 object-contain" alt={`Logo ${project.name}`} />}
              <p className="flex items-center gap-1 text-sm text-slate-500"><IoLocationSharp /> {project.location}</p>
              {project.description && <p className="mt-1 text-xs text-slate-400">{project.description}</p>}
              <span className="mt-2 hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold sm:inline-flex" style={{ background: '#EAF7EE', color: '#125A3B' }}>
                Ingreso registrado: {fmt(income)}
              </span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <CurrencyToggle
              currency={currency}
              setCurrency={setCurrency}
              exchangeRate={exchangeRate}
              setExchangeRate={setExchangeRate}
            />
            {canEdit && (
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-48 sm:flex-col">
                <label className="btn-neutral !h-8 cursor-pointer justify-center text-xs">
                  <FiCamera />
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; reemplazarLogo(file); }} />
                  Cambiar logo
                </label>
                <label className="btn-neutral !h-8 cursor-pointer justify-center text-xs">
                  <FiCamera />
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; reemplazarPortada(file); }} />
                  Actualizar imagen
                </label>
              </div>
            )}
          </div>
        </div>

        <div className={`project-dashboard-kpis xl:col-span-3 ${KPI_GRID_8}`}>
          <MetricTile label="Ventas registradas" value={salesCount} icon={<FiTag />} tone="#111827" />
          <MetricTile label="Ingresos" value={fmt(income)} icon={<FiDollarSign />} tone="#0F8B5F" />
          <MetricTile label="Egresos" value={fmt(expense)} icon={<FiArrowDownCircle />} tone="#E11D48" />
          <MetricTile label="Utilidad neta real" value={fmt(profit)} icon={<FiTrendingUp />} tone="#1259C4" />
          <MetricTile label="Presupuesto de Obra" value={fmt(constructionBudget)} icon={<FiPieChart />} tone="#6B7280" />
          <MetricTile label={`Avance Ppto. de Obra ${currency === 'PEN' ? 'S/' : 'US$'}`} value={fmt(obraReal)} icon={<FiArrowDownCircle />} tone="#16A36A" />
          <MetricTile label="Ejecucion de Obra %" value={`${obraExecutionPct.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} icon={<FiTrendingUp />} tone="#1877F2" />
          <MetricTile label="Leads del proyecto" value={totalLeads} icon={<FiUsers />} />
        </div>

        <div className="min-w-0 xl:col-span-3">
          {/* Reportes del proyecto */}
          <ProjectReports
            formatter={fmt}
            data={{
              constructionBudget,
              constructionReal: obraReal,
              constructionExecutionPct: obraExecutionPct,
              paidAmount,
              soldAmount,
              overdueAmount,
              delinquencyRate,
              collectedByMonth,
              salesByMonth,
              overdueByMonth,
              totalLots,
              inventoryValue,
              soldLotsCount,
              pendingAmount,
              pendingInstallmentCount: financingTotal.count,
              overdueInstallmentAmount: financingTotal.overdueAmount,
              overdueInstallmentCount: financingTotal.overdueCount,
              statement: realStatement,
              lotCountData,
              lotAmountData,
              lotColorByLabel,
              leadsChartData,
              leadColorByLabel: (name: string) => LEAD_CHANNEL_COLOR[name] || '#FED7AA',
              totalLeads,
              kpis,
            }}
          />
        </div>
      </div>
    </Layout>
  );
}

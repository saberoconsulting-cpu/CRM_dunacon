'use client';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FiCamera, FiUsers, FiTag, FiDollarSign, FiArrowDownCircle, FiTrendingUp, FiPieChart } from 'react-icons/fi';
import { IoLocationSharp } from 'react-icons/io5';
import Layout from '@/components/layout/Layout';
import { Toaster, toast } from '@/components/ui/ui';
import { MetricTile, KPI_GRID_6 } from '@/components/ui/Metrics';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import LotDetailModal from '@/components/features/lots/LotDetailModal';
import ProjectReports from '@/components/features/projects/ProjectReports';
import { api, getToken, uploadFile } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Lot, LOT_STATUS_COLOR, LOT_STATUS_LABEL } from '@/lib/types';
import { useDisplayCurrency } from '@/lib/currency';

type AgentRanking = { agentId?: number | null; agentName: string; salesCount: number; salesAmount: number; commission: number };

const LOT_STATUSES = ['disponible', 'reservado', 'adelanto', 'primera_cuota', 'vendido'] as const;
const LEAD_CHANNEL_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  web: 'Web',
  referidos: 'Referidos',
  otro: 'Otro',
};
const LEAD_CHANNEL_COLOR: Record<string, string> = {
  Facebook: '#1877F2',
  TikTok: '#171717',
  Instagram: '#1259C4',
  Web: '#6B7280',
  Referidos: '#A9C9FB',
  Otro: '#9AA1AB',
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
  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [agentPage, setAgentPage] = useState(0);
  const [leadsByChannel, setLeadsByChannel] = useState<{ channel: string; total: number }[]>([]);
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
  }, [projectId]);

  const countByStatus = (status: Lot['status']) => lots.filter((lot) => lot.status === status).length;
  const amountByStatus = (status: Lot['status']) => lots.filter((lot) => lot.status === status).reduce((sum, lot) => sum + asNumber(lot.price), 0);
  const lotCountData = LOT_STATUSES.map((status) => ({ name: LOT_STATUS_LABEL[status], value: countByStatus(status) }));
  const lotAmountData = LOT_STATUSES.map((status) => ({ name: LOT_STATUS_LABEL[status], value: amountByStatus(status) }));
  const lotColorByLabel = (label: string) => {
    const status = LOT_STATUSES.find((item) => LOT_STATUS_LABEL[item] === label);
    return status ? LOT_STATUS_COLOR[status] : '#9AA1AB';
  };
  const leadsChartData = leadsByChannel.map((item) => ({
    name: LEAD_CHANNEL_LABEL[item.channel] || item.channel || 'Otro',
    value: asNumber(item.total),
  }));
  const totalLeads = sumBy(leadsByChannel, (item) => item.total);
  const salesCount = sumBy(stats?.salesByPeriod || [], (item: any) => item.total);
  const income = asNumber(stats?.cards?.income);
  const expense = asNumber(stats?.cards?.expense);
  const profit = asNumber(stats?.cards?.profit);
  const soldLots = countByStatus('vendido');
  const inventoryValue = stats?.cards?.inventoryValue != null ? asNumber(stats.cards.inventoryValue) : sumBy(lots, (lot) => lot.finalPrice ?? lot.salePrice ?? lot.price);
  const soldListValue = stats?.cards?.soldListValue != null ? asNumber(stats.cards.soldListValue) : sumBy(lots.filter((lot) => lot.status === 'vendido'), (lot) => lot.finalPrice ?? lot.salePrice ?? lot.price);
  const agentRanking = (stats?.agentRanking || []) as AgentRanking[];

  // --- Series para las 4 graficas del proyecto (columna 60%) ---
  const collectedByMonth = (cash?.byMonth || []) as { month: string; monto: number }[];
  const salesByMonth = (cash?.salesByMonth || []) as { month: string; monto: number }[];
  const overdueByMonth = (cash?.overdueByMonth || []) as { month: string; monto: number }[];
  const methods = (cash?.methods || []) as { method: string; total: number; monto: number }[];
  const cashMetrics = cash?.metrics || {};

  // Totales base.
  const totalLots = lots.length || asNumber(stats?.cards?.total);
  const totalLotValue = inventoryValue;
  const soldLotsCount = soldLots;
  const soldAmount = soldListValue;
  const paidAmount = Number(cashMetrics.paidCuotasAmount ?? sumBy(collectedByMonth, (r) => r.monto));
  const pendingAmount = Number(cashMetrics.pendingAmount ?? 0);
  const overdueAmount = Number(cashMetrics.overdueAmount ?? sumBy(overdueByMonth, (r) => r.monto));

  // Ventas por año (para el menu de la grafica de ventas).
  const salesYears = Array.from(new Set(salesByMonth.map((r) => String(r.month || '').slice(0, 4)).filter(Boolean))).sort();
  const salesByYear = salesYears.map((year) => ({
    year,
    vendido: salesByMonth.filter((r) => String(r.month || '').slice(0, 4) === year).reduce((sum, r) => sum + asNumber(r.monto), 0),
    recaudado: collectedByMonth.filter((r) => String(r.month || '').slice(0, 4) === year).reduce((sum, r) => sum + asNumber(r.monto), 0),
    moroso: overdueByMonth.filter((r) => String(r.month || '').slice(0, 4) === year).reduce((sum, r) => sum + asNumber(r.monto), 0),
  }));

  // Estado de resultados del proyecto (para los cajones y la TIR).
  const costoVentas = soldAmount;
  const gastosProyecto = expense;
  const utilidadAntes = soldAmount - costoVentas - gastosProyecto;
  const igv = Math.max(0, soldAmount - costoVentas) * 0.18;
  const utilidadNeta = utilidadAntes - igv;
  const tir = soldAmount > 0 && gastosProyecto > 0 ? (utilidadAntes / gastosProyecto) * 100 : 0;
  const collectionRate = soldAmount > 0 ? (paidAmount / soldAmount) * 100 : 0;
  const delinquencyRate = Number(cashMetrics.delinquencyRate ?? ((paidAmount + overdueAmount) > 0 ? (overdueAmount / (paidAmount + overdueAmount)) * 100 : 0));

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
          {project.coverImageUrl && <img src={project.coverImageUrl} className="h-16 w-16 rounded-lg object-cover" alt="" />}
          <div className="min-w-40 flex-1">
            <h2 className="text-xl font-bold">{project.name}</h2>
            <p className="flex items-center gap-1 text-sm text-slate-500"><IoLocationSharp /> {project.location}</p>
            {project.description && <p className="mt-1 text-xs text-slate-400">{project.description}</p>}
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#EAF7EE', color: '#125A3B' }}>
              Ingreso registrado: {fmt(income)}
            </span>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <CurrencyToggle
              currency={currency}
              setCurrency={setCurrency}
              exchangeRate={exchangeRate}
              setExchangeRate={setExchangeRate}
            />
            {canEdit && (
              <div className="flex w-full flex-col gap-2 sm:w-48">
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

        <div className={`xl:col-span-3 ${KPI_GRID_6}`}>
          <MetricTile label="Leads del proyecto" value={totalLeads} icon={<FiUsers />} />
          <MetricTile label="Ventas registradas" value={salesCount} icon={<FiTag />} tone="#111827" />
          <MetricTile label="Ingresos" value={fmt(income)} icon={<FiDollarSign />} tone="#0F8B5F" />
          <MetricTile label="Egresos" value={fmt(expense)} icon={<FiArrowDownCircle />} tone="#E11D48" />
          <MetricTile label="Utilidad" value={fmt(profit)} icon={<FiTrendingUp />} tone="#1259C4" />
          <MetricTile label="Lotes vendidos" value={soldLots} icon={<FiPieChart />} tone="#6B7280" />
        </div>

        <div className="min-w-0 xl:col-span-3">
          {/* Reportes del proyecto */}
          <ProjectReports
            formatter={fmt}
            data={{
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
              costOfSales: costoVentas,
              expenses: gastosProyecto,
              tax: igv,
              netProfit: utilidadNeta,
              lotCountData,
              lotAmountData,
              lotColorByLabel,
              leadsChartData,
              leadColorByLabel: (name: string) => LEAD_CHANNEL_COLOR[name] || '#9AA1AB',
              totalLeads,
              kpis,
            }}
          />
        </div>
      </div>
    </Layout>
  );
}

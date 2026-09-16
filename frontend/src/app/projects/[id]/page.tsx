'use client';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { FiArrowDownCircle, FiCamera, FiDollarSign, FiPieChart, FiTag, FiTrendingUp, FiUsers, FiActivity, FiCreditCard, FiMoreVertical, FiAlertTriangle } from 'react-icons/fi';
import { IoLocationSharp } from 'react-icons/io5';
import Layout from '@/components/layout/Layout';
import { Toaster, toast } from '@/components/ui/ui';
import LotDetailModal from '@/components/features/lots/LotDetailModal';
import { api, getToken, uploadFile } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Lot, formatMoney, LOT_STATUS_COLOR, LOT_STATUS_LABEL, BRAND } from '@/lib/types';

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

type ChartDatum = { name: string; value: number };
type AgentRanking = { agentId?: number | null; agentName: string; salesCount: number; salesAmount: number; commission: number };

function usdMoney(value: unknown): string {
  return `US$ ${Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(value: unknown): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.0%';
  return `${n.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function asNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown): string {
  return formatMoney(asNumber(value));
}

function sumBy<T>(items: T[], selector: (item: T) => unknown): number {
  return items.reduce((total, item) => total + asNumber(selector(item)), 0);
}

function MetricTile({ label, value, icon, tone = '#1877F2' }: { label: string; value: ReactNode; icon: ReactNode; tone?: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border bg-white px-4 py-3" style={{ borderColor: '#E5E7EB', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: tone }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium" style={{ color: '#6B7280' }}>{label}</p>
          <p className="mt-1 truncate text-xl font-semibold tabular-nums" style={{ color: '#111827' }}>{value}</p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ background: `${tone}12`, color: tone }}>{icon}</span>
      </div>
    </div>
  );
}

function ReportCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="w-[calc(100vw-56px)] min-w-[300px] snap-start rounded-lg border bg-white p-4 sm:w-[390px] sm:min-w-[390px] xl:w-full xl:min-w-0" style={{ borderColor: '#E5E7EB', boxShadow: '0 10px 24px rgba(15,23,42,.06)' }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase" style={{ color: '#111827' }}>{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px]" style={{ color: '#6B7280' }}>{subtitle}</p>}
        </div>
        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#1877F2]" />
      </div>
      {children}
    </section>
  );
}

function EmptyReport({ text }: { text: string }) {
  return <div className="grid h-[230px] place-items-center text-center text-sm text-slate-400">{text}</div>;
}

// Menu de opciones de una tarjeta de grafica (mismo patron del dashboard).
function ChartMenu({ rows }: { rows: Array<[string, string]> }) {
  return (
    <details className="relative">
      <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-md border bg-white text-slate-500 hover:bg-slate-50" style={{ borderColor: '#E5E7EB' }}>
        <FiMoreVertical />
      </summary>
      <div className="absolute right-0 top-9 z-20 w-56 rounded-md border bg-white p-2 shadow-xl" style={{ borderColor: '#E5E7EB' }}>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-xs">
            <span style={{ color: '#6B7280' }}>{label}</span>
            <b className="tabular-nums" style={{ color: '#111827' }}>{value}</b>
          </div>
        ))}
      </div>
    </details>
  );
}

// Cabecera de una tarjeta de grafica, igual a la del dashboard principal.
function ChartHeader({ title, subtitle, menuRows }: { title: string; subtitle: string; menuRows: Array<[string, string]> }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: '#E5E7EB' }}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold" style={{ color: '#111827' }}>{title}</h3>
        <p className="mt-0.5 text-xs" style={{ color: '#6B7280' }}>{subtitle}</p>
      </div>
      <ChartMenu rows={menuRows} />
    </div>
  );
}

// Cajon pequeno de indicador (mismo patron del dashboard).
function KpiTile({ label, value, helper, icon, accent }: { label: string; value: string; helper: string; icon: ReactNode; accent: string }) {
  return (
    <div className="rounded-md border bg-white px-4 py-3 shadow-sm" style={{ borderColor: '#E5E7EB' }}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase" style={{ color: '#6B7280' }}>{label}</p>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: `${accent}12`, color: accent }}>{icon}</span>
      </div>
      <p className="mt-2 truncate text-xl font-bold tabular-nums" style={{ color: '#111827' }}>{value}</p>
      <p className="mt-0.5 truncate text-[11px]" style={{ color: '#6B7280' }}>{helper}</p>
    </div>
  );
}

function DonutReport({ data, colorMap }: { data: ChartDatum[]; colorMap: (name: string) => string }) {
  const visible = data.filter((item) => item.value > 0);
  if (!visible.length) return <EmptyReport text="Sin datos para graficar." />;

  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={visible} dataKey="value" nameKey="name" innerRadius={56} outerRadius={84} paddingAngle={2}>
          {visible.map((item) => <Cell key={item.name} fill={colorMap(item.name)} />)}
        </Pie>
        <Tooltip formatter={(value: unknown) => asNumber(value).toLocaleString('es-PE')} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function BarReport({ data, colorMap, valuePrefix = '' }: { data: ChartDatum[]; colorMap: (name: string) => string; valuePrefix?: string }) {
  const visible = data.filter((item) => item.value > 0);
  if (!visible.length) return <EmptyReport text="Sin datos para graficar." />;

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={visible} layout="vertical" margin={{ left: 8, right: 28, top: 8, bottom: 4 }}>
        <CartesianGrid stroke="#EEF0F2" horizontal={false} />
        <XAxis type="number" fontSize={10} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} />
        <YAxis type="category" dataKey="name" width={92} fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value: unknown) => `${valuePrefix}${asNumber(value).toLocaleString('es-PE')}`} />
        <Bar dataKey="value" radius={[0, 5, 5, 0]}>
          {visible.map((item) => <Cell key={item.name} fill={colorMap(item.name)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(params.id);
  const [project, setProject] = useState<any>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [agentPage, setAgentPage] = useState(0);
  const [leadsByChannel, setLeadsByChannel] = useState<{ channel: string; total: number }[]>([]);
  const [cash, setCash] = useState<any>({ methods: [], byMonth: [], overdueByMonth: [], salesByMonth: [], metrics: {} });

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
      toast('Logo del proyecto actualizado');
    } catch (e: any) {
      toast(e.message, 'err');
    }
  }

  async function borrarProyecto() {
    if (!confirm(`Eliminar "${project?.name || 'este proyecto'}"?\nSe quitaran plano, calles, lotes, ventas y pagos asociados. Esta accion es irreversible.`)) return;
    try {
      await api.post(`/projects/delete/${projectId}`);
      toast('Proyecto eliminado');
      router.replace('/projects');
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
    api.get<any>(`/dashboards/project/${projectId}`).then(setStats).catch(() => {});
    api.get<any[]>(`/clients/metrics/channels?projectId=${projectId}`).then((data) => setLeadsByChannel(data || [])).catch(() => {});
    api.get<any>(`/payments/caja?projectId=${projectId}`).then(setCash).catch(() => {});
  }, [projectId]);

  const countByStatus = (status: Lot['status']) => lots.filter((lot) => lot.status === status).length;
  const amountByStatus = (status: Lot['status']) => sumBy(lots.filter((lot) => lot.status === status), (lot) => lot.price);
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
  const agentPageSize = 10;
  const agentPages = Math.max(1, Math.ceil(agentRanking.length / agentPageSize));
  const safeAgentPage = Math.min(agentPage, agentPages - 1);
  const agentFrame = agentRanking.slice(safeAgentPage * agentPageSize, safeAgentPage * agentPageSize + agentPageSize);
  const financialRows = [
    ['Ingresos registrados', money(income)],
    ['Egresos registrados', money(expense)],
    ['Utilidad registrada', money(profit)],
    ['Valor lista del inventario', money(inventoryValue)],
    ['Valor lista vendido', money(soldListValue)],
  ];

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
              Ingreso registrado: {money(income)}
            </span>
          </div>
          {canEdit && (
            <div className="flex w-48 flex-col gap-2">
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
              <button className="btn-danger !h-8 text-xs" onClick={borrarProyecto}>Eliminar proyecto</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:col-span-3 xl:grid-cols-6">
          <MetricTile label="Leads del proyecto" value={totalLeads} icon={<FiUsers />} />
          <MetricTile label="Ventas registradas" value={salesCount} icon={<FiTag />} tone="#111827" />
          <MetricTile label="Ingresos" value={money(income)} icon={<FiDollarSign />} tone="#0F8B5F" />
          <MetricTile label="Egresos" value={money(expense)} icon={<FiArrowDownCircle />} tone="#E11D48" />
          <MetricTile label="Utilidad" value={money(profit)} icon={<FiTrendingUp />} tone="#1259C4" />
          <MetricTile label="Lotes vendidos" value={soldLots} icon={<FiPieChart />} tone="#6B7280" />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:col-span-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-5">
            {/* Cajones de indicadores del proyecto. */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile label="Lotes del proyecto" value={String(totalLots)} helper="Unidades registradas" icon={<FiPieChart />} accent="#1259C4" />
              <KpiTile label="Valor total" value={usdMoney(totalLotValue)} helper="Valor lista del inventario" icon={<FiDollarSign />} accent="#0F8B5F" />
              <KpiTile label="Lotes vendidos" value={String(soldLotsCount)} helper="Unidades vendidas" icon={<FiTag />} accent="#111827" />
              <KpiTile label="Venta lotes" value={usdMoney(soldAmount)} helper="Valor lista vendido" icon={<FiTrendingUp />} accent="#1259C4" />
              <KpiTile label="Pago lotes" value={usdMoney(paidAmount)} helper="Cuotas cobradas" icon={<FiCreditCard />} accent="#0F8B5F" />
              <KpiTile label="Pago pendiente" value={usdMoney(pendingAmount)} helper="Saldo por cobrar" icon={<FiAlertTriangle />} accent="#B45309" />
              <KpiTile label="Morosidad" value={pct(delinquencyRate)} helper="Mora sobre pendientes" icon={<FiActivity />} accent="#E11D48" />
              <KpiTile label="TIR" value={pct(tir)} helper="Utilidad sobre gastos" icon={<FiActivity />} accent="#7C3AED" />
            </div>

            {/* Estado de resultados del proyecto. */}
            <div className="card overflow-hidden p-0">
              <ChartHeader
                title="Estado de resultados"
                subtitle="Resumen economico del proyecto"
                menuRows={[
                  ['Ingresos', usdMoney(soldAmount)],
                  ['Costo de ventas', usdMoney(costoVentas)],
                  ['Gastos', usdMoney(gastosProyecto)],
                  ['IGV', usdMoney(igv)],
                  ['Utilidad neta', usdMoney(utilidadNeta)],
                ]}
              />
              <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-3">
                <KpiTile label="Ingresos" value={usdMoney(soldAmount)} helper="Ventas del proyecto" icon={<FiDollarSign />} accent="#1259C4" />
                <KpiTile label="Costo de ventas" value={usdMoney(costoVentas)} helper="Costo de lo vendido" icon={<FiArrowDownCircle />} accent="#6B7280" />
                <KpiTile label="Gastos" value={usdMoney(gastosProyecto)} helper="Egresos registrados" icon={<FiArrowDownCircle />} accent="#E11D48" />
                <KpiTile label="Utilidad antes de impuestos" value={usdMoney(utilidadAntes)} helper="Resultado operativo" icon={<FiTrendingUp />} accent="#1259C4" />
                <KpiTile label="IGV" value={usdMoney(igv)} helper="18% sobre el margen" icon={<FiActivity />} accent="#B45309" />
                <KpiTile label="Utilidad neta" value={usdMoney(utilidadNeta)} helper="Resultado despues de IGV" icon={<FiTrendingUp />} accent="#0F8B5F" />
              </div>
            </div>
          </div>

          <aside className="min-w-0 rounded-lg border bg-[#F8FAFC] p-3 xl:sticky xl:top-4 xl:h-[calc(100vh-120px)]" style={{ borderColor: '#E5E7EB' }}>
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#111827' }}>Reportes del proyecto</p>
                <p className="text-[11px]" style={{ color: '#6B7280' }}>Desliza a la derecha para revisar cada vista</p>
              </div>
              <span className="rounded-full border bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">Data real</span>
            </div>

            <div className="flex snap-x gap-3 overflow-x-auto pb-2 xl:h-[calc(100%-48px)] xl:flex-col xl:snap-y xl:overflow-y-auto xl:overflow-x-hidden">
              <ReportCard title="Lotes por estado" subtitle="Conteo real de unidades">
                <DonutReport data={lotCountData} colorMap={lotColorByLabel} />
              </ReportCard>

              <ReportCard title="Valor por estado" subtitle="Suma real del precio lista">
                <BarReport data={lotAmountData} colorMap={lotColorByLabel} valuePrefix="S/ " />
              </ReportCard>

              {totalLeads > 0 && (
                <ReportCard title="Origen de leads" subtitle="Clientes/leads asociados al proyecto">
                  <DonutReport data={leadsChartData} colorMap={(name) => LEAD_CHANNEL_COLOR[name] || '#9AA1AB'} />
                </ReportCard>
              )}

              <ReportCard title="Resumen financiero" subtitle="Solo datos de este proyecto">
                <div className="space-y-2">
                  {financialRows.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 rounded-md border bg-white px-3 py-2" style={{ borderColor: '#E5E7EB' }}>
                      <span className="min-w-0 text-xs font-semibold leading-4" style={{ color: '#111827' }}>{label}</span>
                      <span className="shrink-0 text-right text-sm font-bold tabular-nums" style={{ color: '#1259C4' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </ReportCard>

              <ReportCard title="Ranking de agentes" subtitle="Ventas registradas en este proyecto">
                <div className="overflow-hidden rounded-md border bg-white" style={{ borderColor: '#E5E7EB' }}>
                  <table className="w-full table-fixed">
                    <thead>
                      <tr>
                        <th className="th-base !w-10">#</th>
                        <th className="th-base">Agente</th>
                        <th className="th-base !w-16 text-right">Ventas</th>
                        <th className="th-base !w-24 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentFrame.map((agent, index) => (
                        <tr key={`${agent.agentId || 'none'}-${index}`} className="border-t" style={{ borderColor: '#EEF0F2' }}>
                          <td className="td-base">{safeAgentPage * agentPageSize + index + 1}</td>
                          <td className="td-base truncate font-medium">{agent.agentName || 'Sin agente'}</td>
                          <td className="td-base text-right tabular-nums">{agent.salesCount}</td>
                          <td className="td-base text-right text-xs font-semibold tabular-nums">{money(agent.salesAmount)}</td>
                        </tr>
                      ))}
                      {agentRanking.length === 0 && (
                        <tr><td className="td-base text-center text-slate-400" colSpan={4}>Sin ventas registradas.</td></tr>
                      )}
                    </tbody>
                  </table>
                  {agentRanking.length > agentPageSize && (
                    <div className="flex items-center justify-between gap-2 border-t px-3 py-2" style={{ borderColor: '#EEF0F2' }}>
                      <span className="text-xs text-slate-500">
                        Mostrando {safeAgentPage * agentPageSize + 1}-{Math.min(agentRanking.length, (safeAgentPage + 1) * agentPageSize)} de {agentRanking.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button className="btn-neutral !h-7 !px-2 text-xs" disabled={safeAgentPage <= 0} onClick={() => setAgentPage((v) => Math.max(0, v - 1))}>Anterior</button>
                        <span className="px-2 text-xs font-semibold text-slate-500">{safeAgentPage + 1}/{agentPages}</span>
                        <button className="btn-neutral !h-7 !px-2 text-xs" disabled={safeAgentPage >= agentPages - 1} onClick={() => setAgentPage((v) => Math.min(agentPages - 1, v + 1))}>Siguiente</button>
                      </div>
                    </div>
                  )}
                </div>
              </ReportCard>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
}

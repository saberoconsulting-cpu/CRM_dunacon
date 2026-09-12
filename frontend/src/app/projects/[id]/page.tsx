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
import { FiArrowDownCircle, FiCamera, FiDollarSign, FiPieChart, FiTag, FiTrendingUp, FiUsers } from 'react-icons/fi';
import { IoLocationSharp } from 'react-icons/io5';
import Layout from '@/components/layout/Layout';
import { LegendChips, Toaster, toast } from '@/components/ui/ui';
import InteractivePlan from '@/components/features/plan/InteractivePlan';
import LotDetailModal from '@/components/features/lots/LotDetailModal';
import { api, getToken, uploadFile } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Block, Lot, formatMoney, LOT_STATUS_COLOR, LOT_STATUS_LABEL } from '@/lib/types';

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
    <section className="min-w-[360px] snap-start rounded-lg border bg-white p-4 sm:min-w-[390px]" style={{ borderColor: '#E5E7EB', boxShadow: '0 10px 24px rgba(15,23,42,.06)' }}>
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
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [blockFilter, setBlockFilter] = useState<number | null>(null);
  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [search, setSearch] = useState('');
  const [perPage, setPerPage] = useState(10);
  const [lotPage, setLotPage] = useState(0);
  const [agentPage, setAgentPage] = useState(0);
  const [leadsByChannel, setLeadsByChannel] = useState<{ channel: string; total: number }[]>([]);

  async function loadAll() {
    try {
      const [prj, pl] = await Promise.all([
        api.get<any>(`/projects/${projectId}`),
        api.get<any>(`/plan/project/${projectId}`).catch(() => ({ plan: null, blocks: [], lots: [] })),
      ]);
      setProject(prj);
      setPlan(pl.plan);
      setBlocks(pl.blocks || []);
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
    if (!confirm(`Eliminar "${project?.name || 'este proyecto'}"?\nSe quitaran plano, manzanas, lotes, ventas y pagos asociados. Esta accion es irreversible.`)) return;
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
  }, [projectId]);

  const visibleLots = blockFilter ? lots.filter((lot) => lot.blockId === blockFilter) : lots;
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
      <LotDetailModal lotId={selectedLot} onClose={() => setSelectedLot(null)} onChanged={loadAll} />

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

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6 xl:col-span-3">
          <MetricTile label="Leads del proyecto" value={totalLeads} icon={<FiUsers />} />
          <MetricTile label="Ventas registradas" value={salesCount} icon={<FiTag />} tone="#111827" />
          <MetricTile label="Ingresos" value={money(income)} icon={<FiDollarSign />} tone="#0F8B5F" />
          <MetricTile label="Egresos" value={money(expense)} icon={<FiArrowDownCircle />} tone="#E11D48" />
          <MetricTile label="Utilidad" value={money(profit)} icon={<FiTrendingUp />} tone="#1259C4" />
          <MetricTile label="Lotes vendidos" value={soldLots} icon={<FiPieChart />} tone="#6B7280" />
        </div>

        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px] xl:col-span-3">
          <div className="min-w-0 space-y-5">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Plano interactivo</h3>
                <LegendChips />
                <div className="flex gap-2">
                  <a href={`/projects/${projectId}/plan-editor`} className="btn-primary !h-8 text-xs">Editar plano</a>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border bg-white" style={{ height: '560px', borderColor: '#E5E7EB' }}>
                <InteractivePlan
                  imageUrl={plan?.imageUrl}
                  blocks={blocks}
                  lots={lots}
                  imageW={plan?.imageWidth || 1000}
                  imageH={plan?.imageHeight || 800}
                  highlightBlockId={blockFilter}
                  onBlockClick={(block) => setBlockFilter(blockFilter === block.id ? null : block.id)}
                  onLotClick={(lot) => setSelectedLot(lot.id)}
                  selectedLotId={selectedLot}
                />
              </div>
            </div>

            <div className="card">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-semibold">Lotes {blockFilter ? '(filtrado manzana)' : ''}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="input !h-8 !w-48 text-sm"
                    placeholder="Buscar lote (ej. A-02)..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setLotPage(0); }}
                  />
                  <select
                    className="input !h-8 !w-auto text-sm"
                    value={perPage}
                    onChange={(e) => { setPerPage(Number(e.target.value)); setLotPage(0); }}
                  >
                    {[10, 20, 50].map((n) => <option key={n} value={n}>Mostrar {n}</option>)}
                  </select>
                </div>
              </div>

              <table className="table-base" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '30%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="th-base" style={{ textAlign: 'left' }}>Codigo</th>
                    <th className="th-base" style={{ textAlign: 'left' }}>Area</th>
                    <th className="th-base" style={{ textAlign: 'left' }}>Precio</th>
                    <th className="th-base" style={{ textAlign: 'left' }}>Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const query = search.trim().toLowerCase();
                    const filtered = query ? visibleLots.filter((lot) => String(lot.code || '').toLowerCase().includes(query)) : visibleLots;
                    const pages = Math.max(1, Math.ceil(filtered.length / perPage));
                    const page = Math.min(lotPage, pages - 1);
                    const frame = filtered.slice(page * perPage, page * perPage + perPage);
                    const nav: ReactNode[] = [];
                    const shownPages: number[] = [];

                    for (let i = 1; i <= pages; i++) {
                      if (i === 1 || i === pages || Math.abs(i - (page + 1)) <= 1) shownPages.push(i);
                    }

                    shownPages.forEach((n, index) => {
                      if (index > 0 && n > shownPages[index - 1] + 1) {
                        nav.push(<span key={`ell-${n}`} className="px-1 text-slate-400">...</span>);
                      }
                      nav.push(
                        <button
                          key={n}
                          onClick={() => setLotPage(n - 1)}
                          className={`${n === page + 1 ? 'btn-primary' : 'btn-neutral'} !h-7 !min-w-7 !px-2 text-xs`}
                        >
                          {n}
                        </button>,
                      );
                    });

                    return (
                      <>
                        {frame.map((lot) => (
                          <tr key={lot.id} onClick={() => setSelectedLot(lot.id)} className="cursor-pointer hover:bg-slate-50">
                            <td className="td-base font-medium" style={{ textAlign: 'left' }}>{lot.code}</td>
                            <td className="td-base" style={{ textAlign: 'left' }}>{lot.areaM2} m2</td>
                            <td className="td-base" style={{ textAlign: 'left' }}>{money(lot.price)}</td>
                            <td className="td-base" style={{ textAlign: 'left' }}>
                              <span className="badge" style={{ backgroundColor: LOT_STATUS_COLOR[lot.status] + '22', color: LOT_STATUS_COLOR[lot.status] }}>{LOT_STATUS_LABEL[lot.status]}</span>
                            </td>
                          </tr>
                        ))}
                        {filtered.length === 0 && (
                          <tr><td colSpan={4} className="td-base text-center text-slate-400">Sin resultados para mostrar</td></tr>
                        )}
                        {filtered.length > 0 && (
                          <tr>
                            <td colSpan={4} className="td-base !p-0">
                              <div className="mt-1 flex flex-col gap-2 border-t pt-2 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#EEF0F2' }}>
                                <span className="text-xs text-slate-500">
                                  Mostrando {page * perPage + 1}-{Math.min(filtered.length, (page + 1) * perPage)} de {filtered.length} lotes
                                </span>
                                <div className="flex items-center gap-1">
                                  <button className="btn-neutral !h-7 !px-2 text-xs" disabled={page <= 0} onClick={() => setLotPage((v) => Math.max(0, v - 1))}>Anterior</button>
                                  {nav}
                                  <button className="btn-neutral !h-7 !px-2 text-xs" disabled={page >= pages - 1} onClick={() => setLotPage((v) => Math.min(pages - 1, v + 1))}>Siguiente</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="min-w-0 rounded-lg border bg-[#F8FAFC] p-3 2xl:sticky 2xl:top-4 2xl:h-[calc(100vh-120px)]" style={{ borderColor: '#E5E7EB' }}>
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#111827' }}>Reportes del proyecto</p>
                <p className="text-[11px]" style={{ color: '#6B7280' }}>Desliza a la derecha para revisar cada vista</p>
              </div>
              <span className="rounded-full border bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">Data real</span>
            </div>

            <div className="flex snap-x gap-3 overflow-x-auto pb-2 2xl:h-[calc(100%-48px)] 2xl:flex-col 2xl:snap-y 2xl:overflow-y-auto 2xl:overflow-x-hidden">
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

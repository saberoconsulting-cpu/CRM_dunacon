'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { Toaster, toast, StatCard, LegendChips } from '@/components/ui/ui';
import { api, getToken, uploadFile } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';
import InteractivePlan from '@/components/features/plan/InteractivePlan';
import LotDetailModal from '@/components/features/lots/LotDetailModal';
import { DistribucionPie, DistribucionBarras } from '@/components/ui/charts/Charts';
import { Block, Lot, formatMoney, LOT_STATUS_LABEL, LOT_STATUS_COLOR } from '@/lib/types';
import { IoLocationSharp } from 'react-icons/io5';
import { FiCamera } from 'react-icons/fi';

const LEAD_CHANNEL_LABEL: Record<string, string> = { facebook: 'Facebook', tiktok: 'TikTok', instagram: 'Instagram', web: 'Web', referidos: 'Referidos', otro: 'Otro' };
const LEAD_CHANNEL_COLOR: Record<string, string> = { Facebook: '#1877F2', TikTok: '#171717', Instagram: '#1259C4', Web: '#6B7280', Referidos: '#A9C9FB', Otro: '#9AA1AB' };

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
  const [leadsByChannel, setLeadsByChannel] = useState<{ channel: string; total: number }[]>([]);

  useEffect(() => {
    let role = 'agent';
    try {
      const meta = typeof window !== 'undefined' ? localStorage.getItem('crm_user') : '';
      role = meta ? (JSON.parse(meta).role || 'agent') : 'agent';
    } catch { /* sin sesión */ }
    setCanEdit(role === 'superadmin' || role === 'admin');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reemplazarPortada(f?: File) {
    if (!f) return;
    try {
      const p = await uploadFile(`/projects/cover/${projectId}`, f);
      setProject((pr: any | null) => ({ ...(pr || {}), coverImageUrl: p?.coverImageUrl || pr?.coverImageUrl }));
      toast('Imagen de portada actualizada');
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function borrarProyecto() {
    if (!confirm(`¿Eliminar "${project?.name || 'este proyecto'}"?\nSe quitarán plano, manzanas, lotes, ventas y pagos asociados. Esta acción es irreversible.`)) return;
    try {
      await api.post(`/projects/delete/${projectId}`);
      toast('Proyecto eliminado');
      router.replace('/projects');
    } catch (e: any) { toast(e.message, 'err'); }
  }

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
    } catch (e: any) { toast(e.message, 'err'); }
  }

  useEffect(() => {
    if (!projectId) return;
    loadAll();
    const t = getToken();
    if (t) {
      const s = getSocket(t);
      s.on('lot.updated', () => loadAll());
    }
    return () => { const t = getToken(); if (t) getSocket(t).off('lot.updated'); };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    api.get<any>(`/dashboards/project/${projectId}`).then(setStats).catch(() => {});
    api.get<any[]>(`/clients/metrics/channels?projectId=${projectId}`).then((d) => setLeadsByChannel(d || [])).catch(() => {});
  }, [projectId]);

  const visibleLots = blockFilter ? lots.filter((l) => l.blockId === blockFilter) : lots;

  const count = (s: string) => lots.filter((l) => l.status === s).length;
  const amountByStatus = (s: string) => lots.filter((l) => l.status === s).reduce((sum, l) => sum + Number(l.price || 0), 0);
  const LOT_STATUSES = ['disponible', 'reservado', 'adelanto', 'primera_cuota', 'vendido'] as const;
  const lotCountData = LOT_STATUSES.map((s) => ({ name: LOT_STATUS_LABEL[s], value: count(s) }));
  const lotAmountData = LOT_STATUSES.map((s) => ({ name: LOT_STATUS_LABEL[s], value: amountByStatus(s) }));
  const lotColorByLabel = (label: string) => {
    const status = LOT_STATUSES.find((s) => LOT_STATUS_LABEL[s] === label);
    return status ? LOT_STATUS_COLOR[status] : '#9AA1AB';
  };
  const leadsChartData = leadsByChannel.map((c) => ({ name: LEAD_CHANNEL_LABEL[c.channel] || c.channel || 'Otro', value: c.total }));

  if (!project) return <Layout title="Cargando…"><Toaster/><p className="text-slate-400">Cargando proyecto…</p></Layout>;

  return (
    <Layout title={project.name}>
      <Toaster />
      <LotDetailModal lotId={selectedLot} onClose={() => setSelectedLot(null)} onChanged={loadAll} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-3 card flex flex-wrap items-center gap-4">
          {project.coverImageUrl && <img src={project.coverImageUrl} className="w-16 h-16 rounded-lg object-cover" alt="" />}
          <div className="flex-1 min-w-40">
            <h2 className="text-xl font-bold">{project.name}</h2>
            <p className="text-slate-500 text-sm flex items-center gap-1"><IoLocationSharp /> {project.location}</p>
            {project.description && <p className="text-xs text-slate-400 mt-1">{project.description}</p>}
            {stats?.cards?.income != null && (
              <span className="inline-flex items-center gap-1.5 mt-2 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#EAF7EE', color: '#125A3B' }}>
                Ingreso acumulado: {formatMoney(stats.cards.income)}
              </span>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-col gap-2">
              <label className="btn-neutral !h-8 text-xs cursor-pointer inline-flex items-center gap-1">
                <FiCamera /> <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; reemplazarPortada(f); }} />Actualizar imagen
              </label>
              <button className="btn-danger !h-8 text-xs" onClick={borrarProyecto}>Eliminar proyecto</button>
            </div>
          )}
        </div>

        <StatCard label="Lotes totales" value={lots.length} />
        {(['disponible','reservado','adelanto','primera_cuota','vendido'] as const).map((s) => (
          <StatCard key={s} label={LOT_STATUS_LABEL[s] as any} value={count(s)}
            color={LOT_STATUS_COLOR[s] as any} />
        ))}

        {/* Reportes del proyecto */}
        <div className="xl:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="card">
            <h3 className="font-semibold mb-3">Venta de lotes — Nro. de lotes</h3>
            {lots.length ? (
              <DistribucionPie data={lotCountData} colorMap={lotColorByLabel} />
            ) : <p className="py-10 text-center text-sm text-slate-400">Aún no hay lotes registrados.</p>}
          </div>
          <div className="card">
            <h3 className="font-semibold mb-3">Venta de lotes (S/)</h3>
            {lots.length ? (
              <DistribucionBarras data={lotAmountData} colorMap={lotColorByLabel} valuePrefix="S/ " />
            ) : <p className="py-10 text-center text-sm text-slate-400">Aún no hay lotes registrados.</p>}
          </div>
          <div className="card">
            <h3 className="font-semibold mb-3">Origen de leads</h3>
            {leadsChartData.length ? (
              <DistribucionPie data={leadsChartData} colorMap={(n) => LEAD_CHANNEL_COLOR[n] || '#9AA1AB'} />
            ) : <p className="py-10 text-center text-sm text-slate-400">Aún no hay leads para este proyecto.</p>}
          </div>
        </div>

        {/* Plano interactivo */}
        <div className="xl:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-semibold">Plano interactivo</h3>
            <LegendChips />
            <div className="flex gap-2">
              <a href={`/projects/${projectId}/plan-editor`} className="btn-primary !h-8 text-xs">Editar plano</a>
              <button className="btn-neutral text-xs" onClick={() => setBlockFilter(null)}>Ver todos</button>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height: '560px' }}>
            <InteractivePlan
              imageUrl={plan?.imageUrl}
              blocks={blocks}
              lots={lots}
              imageW={plan?.imageWidth || 1000}
              imageH={plan?.imageHeight || 800}
              highlightBlockId={blockFilter}
              onBlockClick={(b) => setBlockFilter(blockFilter === b.id ? null : b.id)}
              onLotClick={(l) => setSelectedLot(l.id)}
              selectedLotId={selectedLot}
            />
          </div>
        </div>

        {/* Tabla de lotes: debajo del plano, a todo el ancho */}
        <div className="xl:col-span-3 flex flex-col gap-4">
          <div className="card flex-1">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-semibold">Lotes {blockFilter ? '(filtrado manzana)' : ''}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input !w-48 !h-8 text-sm"
                  placeholder="Buscar lote (ej. A-02)…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setLotPage(0); }}
                />
                <select
                  className="input !h-8 text-sm !w-auto"
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
              <thead><tr>
                <th className="th-base" style={{ textAlign: 'left' }}>Código</th>
                <th className="th-base" style={{ textAlign: 'left' }}>Área</th>
                <th className="th-base" style={{ textAlign: 'left' }}>Precio</th>
                <th className="th-base" style={{ textAlign: 'left' }}>Estado</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  const q = search.trim().toLowerCase();
                  const filtered = q ? visibleLots.filter((l) => String(l.code || '').toLowerCase().includes(q)) : visibleLots;
                  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
                  const page = Math.min(lotPage, pages - 1);
                  const frame = filtered.slice(page * perPage, page * perPage + perPage);

                  const nav: any[] = [];
                  const show: number[] = [];
                  for (let i = 1; i <= pages; i++) {
                    if (i === 1 || i === pages || Math.abs(i - (page + 1)) <= 1) show.push(i);
                  }
                  show.forEach((n, idx) => {
                    if (idx > 0 && n > show[idx - 1] + 1) {
                      nav.push(<span key={`ell-${n}`} className="px-1 text-slate-400">…</span>);
                    }
                    nav.push(
                      <button
                        key={String(n)}
                        onClick={() => setLotPage(n - 1)}
                        className={`${n === page + 1 ? 'btn-primary' : 'btn-neutral'} !h-7 !min-w-7 !px-2 text-xs`}
                      >{n}</button>
                    );
                  });

                  return (
                    <>
                      {frame.map((l) => (
                        <tr key={l.id} onClick={() => setSelectedLot(l.id)} className="cursor-pointer hover:bg-slate-50">
                          <td className="td-base font-medium" style={{ textAlign: 'left' }}>{l.code}</td>
                          <td className="td-base" style={{ textAlign: 'left' }}>{l.areaM2} m²</td>
                          <td className="td-base" style={{ textAlign: 'left' }}>{formatMoney(l.price)}</td>
                          <td className="td-base" style={{ textAlign: 'left' }}>
                            <span className="badge" style={{ backgroundColor: LOT_STATUS_COLOR[l.status] + '22', color: LOT_STATUS_COLOR[l.status] }}>{LOT_STATUS_LABEL[l.status]}</span>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={4} className="td-base text-slate-400 text-center">Sin resultados para mostrar</td></tr>
                      )}
                      {filtered.length > 0 && (
                        <tr>
                          <td colSpan={4} className="td-base !p-0">
                            <div className="mt-1 flex flex-col gap-2 border-t pt-2 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#EEF0F2' }}>
                              <span className="text-xs text-slate-500">Mostrando {filtered.length === 0 ? 0 : page * perPage + 1}–{Math.min(filtered.length, (page + 1) * perPage)} de {filtered.length} lotes</span>
                              <div className="flex items-center gap-1">
                                <button
                                  className="btn-neutral !h-7 !px-2 text-xs"
                                  disabled={page <= 0}
                                  onClick={() => setLotPage((v) => Math.max(0, v - 1))}
                                >‹ Anterior</button>
                                {nav}
                                <button
                                  className="btn-neutral !h-7 !px-2 text-xs"
                                  disabled={page >= pages - 1}
                                  onClick={() => setLotPage((v) => Math.min(pages - 1, v + 1))}
                                >Siguiente ›</button>
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
      </div>
    </Layout>
  );
}

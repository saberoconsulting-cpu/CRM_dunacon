'use client';
import { useEffect, useState } from 'react';
import { Toaster, toast, EmptyState } from '@/components/ui/ui';
import { api } from '@/lib/api';
import LotDetailModal from '@/components/features/lots/LotDetailModal';
import { Lot, formatMoney, LOT_STATUS_LABEL, LOT_STATUS_COLOR } from '@/lib/types';

export default function LotsView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [lots, setLots] = useState<Lot[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [project, setProject] = useState(lockedProjectId ? String(lockedProjectId) : '');
  const [selected, setSelected] = useState<number | null>(null);
  const [buscar, setBuscar] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });

  useEffect(() => { if (lockedProjectId) setProject(String(lockedProjectId)); }, [lockedProjectId]);

  async function load() {
    const q = new URLSearchParams();
    if (statusFilter) q.set('status', statusFilter);
    if (search) q.set('search', search);
    if (project) q.set('projectId', project);
    q.set('limit', '500');
    try {
      const d = await api.get<any>(`/lots?${q.toString()}`);
      const rows: Lot[] = Array.isArray(d) ? d : (d?.items || []);
      setLots(rows);
      setMeta({ total: Number(d?.total ?? rows.length), totalPages: Number(d?.totalPages ?? Math.max(1, Math.ceil((d?.total ?? rows.length) / limit))) });
    } catch (e: any) { toast(e.message, 'err'); }
  }
  useEffect(() => { load(); }, [statusFilter, search, project, page, limit]);
  useEffect(() => { api.get<any>('/projects').then((d) => setProyectos(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [statusFilter, search, project]);

  return (
    <>
      <Toaster />
      <LotDetailModal lotId={selected} onClose={() => setSelected(null)} onChanged={load} />

      <div className="card mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48"><label className="label">Buscar por código</label>
          <input className="input" value={buscar} onChange={(e)=>setBuscar(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') setSearch(buscar); }} placeholder="Ej: A-01" />
        </div>
        {!lockedProjectId && (
          <div className="min-w-40"><label className="label">Proyecto</label>
            <select className="input" value={project} onChange={(e)=>setProject(e.target.value)}>
              <option value="">Todos</option>
              {proyectos.map((p:any)=>(<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
        )}
        <div className="min-w-44"><label className="label">Estado</label>
          <select className="input" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(LOT_STATUS_LABEL).map(([k,v])=>(<option key={k} value={k}>{v}</option>))}
          </select>
        </div>
        <button className="btn-secondary" onClick={()=>{setBuscar('');setSearch('');setStatusFilter('');if(!lockedProjectId) setProject('');}}>Limpiar</button>
      </div>

      <div className="space-y-5">
        {(() => {
          if (!lots.length) return <EmptyState text="No se encontraron lotes con los filtros" />;
          const coll = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

          // Agrupar por manzana real (block_id), no por prefijo del código.
          type Group = { key: string; blockName: string; blockAddress: string | null; items: Lot[] };
          const groups: Group[] = [];
          for (const l of lots) {
            const key = l.blockId != null ? String(l.blockId) : 'sin-manzana';
            let g = groups.find((x) => x.key === key);
            if (!g) {
              g = { key, blockName: l.blockName || '—', blockAddress: l.blockAddress || null, items: [] };
              groups.push(g);
            }
            g.items.push(l);
          }
          groups.sort((a, b) => coll.compare(a.blockName, b.blockName));
          groups.forEach((g) => g.items.sort((a, b) => coll.compare(a.code, b.code)));

          return groups.map((g) => {
            const totalArea = g.items.reduce((s, l) => s + Number(l.areaM2 || 0), 0);
            const totalPrice = g.items.reduce((s, l) => s + Number(l.price || 0), 0);
            const totalVenta = g.items.reduce((s, l) => s + Number(l.salePrice || 0), 0);
            const totalFinal = g.items.reduce((s, l) => s + Number(l.finalPrice || 0), 0);
            const pricePerM2 = totalArea ? totalPrice / totalArea : 0;
            return (
              <div key={g.key} className="card overflow-hidden p-0">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 bg-slate-50/60" style={{ borderColor: '#E9EBEE' }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base font-extrabold text-white" style={{ background: '#171717' }}>{g.blockName}</span>
                    <div className="min-w-0">
                      {g.blockAddress ? (
                        <span className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold truncate" style={{ background: '#E7F0FE', color: '#1259C4' }}>{g.blockAddress}</span>
                      ) : (
                        <p className="font-bold leading-tight">Manzana {g.blockName}</p>
                      )}
                      <p className="text-xs text-slate-500 mt-0.5">{g.items.length} lotes · {formatMoney(totalArea)} m²</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="table-base" style={{ width: '100%', minWidth: 900 }}>
                    <thead><tr>
                      <th className="th-base" style={{ textAlign: 'left' }}>Nro. Lote</th>
                      <th className="th-base" style={{ textAlign: 'left' }}>Dirección</th>
                      <th className="th-base" style={{ textAlign: 'left' }}>Tipo</th>
                      <th className="th-base" style={{ textAlign: 'left' }}>Dimensión</th>
                      <th className="th-base" style={{ textAlign: 'right' }}>Precio</th>
                      <th className="th-base" style={{ textAlign: 'right' }}>Precio Venta</th>
                      <th className="th-base" style={{ textAlign: 'right' }}>Precio Final</th>
                      <th className="th-base" style={{ textAlign: 'center' }}>Estado</th>
                      <th className="th-base" style={{ textAlign: 'left' }}>Cliente</th>
                      <th className="th-base"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {g.items.map((l) => (
                        <tr key={l.id} onClick={() => setSelected(l.id)} className="cursor-pointer hover:bg-slate-50">
                          <td className="td-base font-semibold" style={{ textAlign: 'left' }}>{l.code}</td>
                          <td className="td-base text-slate-500" style={{ textAlign: 'left' }}>{g.blockAddress || '—'}</td>
                          <td className="td-base text-slate-500" style={{ textAlign: 'left' }}>{l.type || '—'}</td>
                          <td className="td-base" style={{ textAlign: 'left' }}>{l.areaM2} m²</td>
                          <td className="td-base tabular-nums" style={{ textAlign: 'right' }}>{l.price ? formatMoney(l.price) : '—'}</td>
                          <td className="td-base tabular-nums" style={{ textAlign: 'right' }}>{l.salePrice ? formatMoney(l.salePrice) : '—'}</td>
                          <td className="td-base tabular-nums" style={{ textAlign: 'right' }}>{l.finalPrice ? formatMoney(l.finalPrice) : '—'}</td>
                          <td className="td-base" style={{ textAlign: 'center' }}>
                            <span className="badge whitespace-nowrap" style={{ backgroundColor: LOT_STATUS_COLOR[l.status] + '22', color: LOT_STATUS_COLOR[l.status] }}>{LOT_STATUS_LABEL[l.status]}</span>
                          </td>
                          <td className="td-base text-slate-500" style={{ textAlign: 'left' }}>{l.clientName || '—'}</td>
                          <td className="td-base" style={{ textAlign: 'right' }}>
                            <button className="btn-secondary !h-8 !px-3 text-xs whitespace-nowrap" onClick={(e) => { e.stopPropagation(); setSelected(l.id); }}>Ver ficha</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#0B2F6E' }}>
                        <td className="td-base font-bold text-white" style={{ textAlign: 'left' }}>{g.items.length}</td>
                        <td className="td-base font-bold text-white" colSpan={2} style={{ textAlign: 'left' }}>Totales</td>
                        <td className="td-base font-bold text-white tabular-nums">{pricePerM2 ? `${formatMoney(pricePerM2)}/m²` : '—'}</td>
                        <td className="td-base font-bold text-white tabular-nums" style={{ textAlign: 'right' }}>{formatMoney(totalPrice)}</td>
                        <td className="td-base font-bold text-white tabular-nums" style={{ textAlign: 'right' }}>{formatMoney(totalVenta)}</td>
                        <td className="td-base font-bold text-white tabular-nums" style={{ textAlign: 'right' }}>{formatMoney(totalFinal)}</td>
                        <td className="td-base" colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </>
  );
}

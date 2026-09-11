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
          const blockOf = (c: string) => String(c || '').split(/[-_\s.]/)[0] || c;
          const baseAbc = (b: string) => /^[a-zA-Z]/.test(b);
          const numsFirst = false; // letras primero (A, B, C…), luego numéricas
          const ordered = [...lots].sort((a, b) => {
            const ba = blockOf(a.code), bb = blockOf(b.code);
            if (ba === bb) return coll.compare(a.code, b.code);
            const aL = baseAbc(ba), bL = baseAbc(bb);
            if (aL !== bL) return aL && !bL ? -1 : 1;
            return coll.compare(ba, bb);
          });
          const groups: { k: string; items: Lot[] }[] = [];
          for (const l of ordered) {
            const k = blockOf(l.code) || '?';
            const g = groups.find((x) => x.k === k);
            if (g) g.items.push(l); else groups.push({ k, items: [l] });
          }
          return groups.map((g) => {
            const totalArea = g.items.reduce((s, l) => s + Number(l.areaM2 || 0), 0);
            const venta = g.items.filter((l) => l.status === 'vendido').length;
            return (
              <div key={g.k} className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 bg-slate-50/60" style={{ borderColor: '#E9EBEE' }}>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-lg text-base font-extrabold text-white" style={{ background: '#171717' }}>{g.k}</span>
                    <div>
                      <p className="font-bold leading-tight">Manzana {g.k}</p>
                      <p className="text-xs text-slate-500">{g.items.length} lotes · {formatMoney(totalArea)} m² {venta ? `· ${venta} vendidos` : ''}</p>
                    </div>
                  </div>
                  <span className="text-xs" style={{ color: '#94a3b8' }}>{blockOf(g.k)} · {g.items.length}</span>
                </div>

                <div>
                  {g.items.map((l) => (
                    <div key={l.id} className="grid items-center gap-x-4 gap-y-2 border-b px-4 py-2.5 hover:bg-slate-50 last:border-0 sm:grid-cols-[minmax(0,1fr)_64px_150px_130px_auto]" onClick={() => setSelected(l.id)} style={{ borderColor: '#F0F1F3', minHeight: 44 }}>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-semibold text-[15px] leading-tight text-[#171717]">{l.code}</span>
                        {!lockedProjectId && (
                          <span className="truncate text-[11px] leading-tight" style={{ color: '#9AA1AB' }}>{(proyectos.find((p: any) => Number(p.id) === Number(l.projectId)) as any)?.name || `Proyecto ${l.projectId}`}</span>
                        )}
                      </span>
                      <span className="text-xs tabular-nums" style={{ color: '#6B7280' }}>{l.areaM2} m²</span>
                      <span className="truncate text-right font-semibold tabular-nums text-[#171717]">{formatMoney(l.price)}</span>
                      <span className="justify-self-start sm:justify-self-center"><span className="badge whitespace-nowrap text-center" style={{ backgroundColor: LOT_STATUS_COLOR[l.status] + '22', color: LOT_STATUS_COLOR[l.status] }}>{LOT_STATUS_LABEL[l.status]}</span></span>
                      <button className="btn-secondary !h-8 !px-3 text-xs whitespace-nowrap justify-self-end" onClick={(e) => { e.stopPropagation(); setSelected(l.id); }}>Ver ficha</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          });
        })()}
      </div>
    </>
  );
}

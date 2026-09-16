'use client';
import { useEffect, useState } from 'react';
import { Toaster, toast, EmptyState } from '@/components/ui/ui';
import { api, uploadFile } from '@/lib/api';
import LotDetailModal from '@/components/features/lots/LotDetailModal';
import { Lot, formatMoney, LOT_STATUS_LABEL, LOT_STATUS_COLOR } from '@/lib/types';
import { printHtml } from '@/lib/print';
import { FiDownload, FiLayers, FiCheckCircle, FiBookmark, FiTrendingUp, FiTag, FiFlag } from 'react-icons/fi';

const PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [15, 30, 50, 100] as const;

export default function LotsView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [lots, setLots] = useState<Lot[]>([]);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [project, setProject] = useState(lockedProjectId ? String(lockedProjectId) : '');
  const [selected, setSelected] = useState<{ id: number; focus?: 'plan' | 'edit' } | null>(null);
  const [buscar, setBuscar] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [stats, setStats] = useState({ total: 0, vendidos: 0, separados: 0, disponibles: 0, promocion: 0, segundaEtapa: 0 });
  const [viewMode, setViewMode] = useState<'general' | 'blocks'>('general');

  useEffect(() => {
    const q = new URLSearchParams();
    if (lockedProjectId || project) q.set('projectId', lockedProjectId ? String(lockedProjectId) : project);
    api.get<any>(`/lots/stats?${q.toString()}`)
      .then((d) => setStats({
        total: Number(d?.total || 0), vendidos: Number(d?.vendidos || 0), separados: Number(d?.separados || 0),
        disponibles: Number(d?.disponibles || 0), promocion: Number(d?.promocion || 0), segundaEtapa: Number(d?.segundaEtapa || 0),
      }))
      .catch(() => {});
  }, [lockedProjectId, project, lots.length]);

  useEffect(() => { if (lockedProjectId) setProject(String(lockedProjectId)); }, [lockedProjectId]);

  async function load() {
    const q = new URLSearchParams();
    if (statusFilter) q.set('status', statusFilter);
    if (search) q.set('search', search);
    if (project) q.set('projectId', project);
    q.set('page', String(page));
    q.set('limit', String(pageSize));
    try {
      const d = await api.get<any>(`/lots?${q.toString()}`);
      const rows: Lot[] = Array.isArray(d) ? d : (d?.items || []);
      const total = Array.isArray(d) ? rows.length : Number(d?.total ?? rows.length);
      setLots(rows);
      setMeta({
        total,
        totalPages: Array.isArray(d) ? 1 : Number(d?.totalPages ?? Math.max(1, Math.ceil(total / pageSize))),
      });
    } catch (e: any) { toast(e.message, 'err'); }
  }
  useEffect(() => { load(); }, [statusFilter, search, project, page, pageSize]);
  useEffect(() => { api.get<any>('/projects').then((d) => setProyectos(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [statusFilter, search, project, pageSize]);

  const coll = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  const sortedLots = lots.slice().sort((a, b) => coll.compare(a.code, b.code));

  function totals(items: Lot[]) {
    const totalArea = items.reduce((s, l) => s + Number(l.areaM2 || 0), 0);
    const totalPrice = items.reduce((s, l) => s + Number(l.price || 0), 0);
    const totalVenta = items.reduce((s, l) => s + Number(l.salePrice || 0), 0);
    const totalFinal = items.reduce((s, l) => s + Number(l.finalPrice || 0), 0);
    return { totalArea, totalPrice, totalVenta, totalFinal, pricePerM2: totalArea ? totalPrice / totalArea : 0 };
  }

  type Group = { key: string; blockName: string; blockAddress: string | null; items: Lot[] };

  function lotGroups() {
    const groups: Group[] = [];
    for (const l of lots) {
      const key = (l.streetId ?? l.blockId) != null ? String(l.streetId ?? l.blockId) : 'sin-calle';
      let g = groups.find((x) => x.key === key);
      if (!g) {
        g = { key, blockName: l.streetName || l.blockName || '—', blockAddress: l.streetAddress || l.blockAddress || null, items: [] };
        groups.push(g);
      }
      g.items.push(l);
    }
    groups.sort((a, b) => coll.compare(a.blockName, b.blockName));
    groups.forEach((g) => g.items.sort((a, b) => coll.compare(a.code, b.code)));
    return groups;
  }

  function escapeHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function printRows(items: Lot[]) {
    return items.map((l) => `
      <tr>
        <td>${escapeHtml(l.code)}</td>
        <td>${escapeHtml(l.streetAddress || l.blockAddress || '—')}</td>
        <td>${escapeHtml(l.type || '—')}</td>
        <td class="num">${escapeHtml(`${l.areaM2 || 0} m²`)}</td>
        <td class="num">${escapeHtml(l.price ? formatMoney(l.price) : '—')}</td>
        <td class="num">${escapeHtml(l.salePrice ? formatMoney(l.salePrice) : '—')}</td>
        <td class="num">${escapeHtml(l.finalPrice ? formatMoney(l.finalPrice) : '—')}</td>
        <td>${escapeHtml(LOT_STATUS_LABEL[l.status])}</td>
        <td>${escapeHtml(l.clientName || '—')}</td>
      </tr>
    `).join('');
  }

  function printTotalRow(items: Lot[]) {
    const t = totals(items);
    return `
      <tr class="total">
        <td>${items.length}</td>
        <td colspan="2">Totales</td>
        <td class="num">${t.pricePerM2 ? `${formatMoney(t.pricePerM2)}/m²` : '—'}</td>
        <td class="num">${formatMoney(t.totalPrice)}</td>
        <td class="num">${formatMoney(t.totalVenta)}</td>
        <td class="num">${formatMoney(t.totalFinal)}</td>
        <td colspan="2"></td>
      </tr>
    `;
  }

  function pdfTable(title: string, items: Lot[]) {
    return `
      <section>
        <h2>${escapeHtml(title)}</h2>
        <table>
          <thead>
            <tr>
              <th>Nro. Lote</th><th>Dirección</th><th>Tipo</th><th>Dimensión</th>
              <th>Precio US$/m2</th><th>Precio Venta US$</th><th>Precio Final US$</th><th>Estado</th><th>Cliente</th>
            </tr>
          </thead>
          <tbody>${printRows(items)}${printTotalRow(items)}</tbody>
        </table>
      </section>
    `;
  }

  function exportPdf() {
    const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
    const projectName = lockedProjectId
      ? (proyectos.find((p: any) => Number(p.id) === Number(lockedProjectId))?.name || 'Proyecto')
      : (project ? proyectos.find((p: any) => String(p.id) === String(project))?.name || 'Proyecto filtrado' : 'Todos los proyectos');
    const content = viewMode === 'blocks'
      ? lotGroups().map((g) => pdfTable(`Calle ${g.blockName}${g.blockAddress ? ` - ${g.blockAddress}` : ''}`, g.items)).join('')
      : pdfTable('Listado general de lotes', sortedLots);
    const t = totals(viewMode === 'blocks' ? lots : sortedLots);
    printHtml(`
      <html>
        <head>
          <title>Lotes - ${escapeHtml(projectName)}</title>
          <style>
            body{font-family:Arial,Helvetica,sans-serif;margin:26px;color:#171717;background:white}
            .brand{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:3px solid #1877F2;padding-bottom:14px;margin-bottom:14px}
            .brand img{height:42px;max-width:180px;object-fit:contain}
            .eyebrow{margin:0 0 5px;color:#1877F2;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
            h1{margin:0;font-size:24px;line-height:1.15;color:#111827}
            h2{font-size:13px;margin:18px 0 8px;color:#1259C4;text-transform:uppercase;letter-spacing:.04em}
            p{margin:4px 0 0;color:#6B7280;font-size:12px}
            .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:14px 0 18px}
            .summary div{border:1px solid #E5E7EB;background:#F8FAFC;padding:9px 10px;border-radius:6px}
            .summary span{display:block;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
            .summary strong{display:block;margin-top:4px;color:#111827;font-size:12px}
            table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:18px;background:white;box-shadow:0 1px 2px rgba(16,24,40,.05)}
            th{background:#1877F2;color:white;border:1px solid #1877F2;padding:8px 6px;font-size:9px;text-align:left;text-transform:uppercase;letter-spacing:.03em}
            td{border:1px solid #E5E7EB;padding:7px 6px;font-size:10px;vertical-align:top}
            tbody tr:nth-child(even):not(.total){background:#F8FAFC}
            .num{text-align:right;white-space:nowrap}
            .total{background:#0B2F6E;color:white;font-weight:700}
            .watermark{position:fixed;left:50%;top:54%;transform:translate(-50%,-50%) rotate(-28deg);opacity:.06;z-index:-1}
            .watermark img{width:560px;max-width:72vw}
            .footer{margin-top:18px;border-top:1px solid #E5E7EB;padding-top:8px;color:#6B7280;font-size:10px;text-align:right}
            @media print{body{margin:18px}thead{display:table-header-group}section{break-inside:auto}.brand{break-inside:avoid}.watermark{position:fixed}}
          </style>
        </head>
        <body>
          <div class="watermark"><img src="${escapeHtml(logoUrl)}" alt="" /></div>
          <div class="brand">
            <div>
              <p class="eyebrow">Reporte de lotes</p>
              <h1>${escapeHtml(projectName)}</h1>
              <p>${viewMode === 'blocks' ? 'Vista por calles' : 'Vista general'} · ${lots.length} lotes · ${new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
            <img src="${escapeHtml(logoUrl)}" alt="Dunacon" />
          </div>
          <div class="summary">
            <div><span>Lotes</span><strong>${lots.length}</strong></div>
            <div><span>Area total</span><strong>${escapeHtml(`${t.totalArea.toLocaleString('es-PE')} m2`)}</strong></div>
            <div><span>Precio lista</span><strong>${escapeHtml(formatMoney(t.totalPrice))}</strong></div>
            <div><span>Precio final</span><strong>${escapeHtml(formatMoney(t.totalFinal))}</strong></div>
          </div>
          ${content}
          <div class="footer">Dunacon - CRM Inmobiliario</div>
        </body>
      </html>
    `);
  }

  async function uploadLotPlan(lot: Lot, file?: File) {
    if (!file) return;
    try {
      await uploadFile(`/plan/lot/plan-voucher/${lot.id}`, file);
      toast('Plano del lote actualizado');
      await load();
    } catch (e: any) {
      toast(e.message || 'No se pudo subir el plano', 'err');
    }
  }

  function renderTable(items: Lot[], key: string, header?: { blockName: string; blockAddress: string | null }) {
    const t = totals(items);
    return (
      <div key={key} className="card overflow-hidden p-0">
        {header && (
          <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 bg-slate-50/60" style={{ borderColor: '#E9EBEE' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base font-extrabold text-white" style={{ background: '#171717' }}>{header.blockName}</span>
              <div className="min-w-0">
                {header.blockAddress ? (
                  <span className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold truncate" style={{ background: '#E7F0FE', color: '#1259C4' }}>{header.blockAddress}</span>
                ) : (
                  <p className="font-bold leading-tight">Calle {header.blockName}</p>
                )}
                <p className="text-xs text-slate-500 mt-0.5">{items.length} lotes · {formatMoney(t.totalArea)} m²</p>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="table-base" style={{ width: '100%', minWidth: 1260, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '100px' }} />
              <col style={{ width: '190px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '220px' }} />
            </colgroup>
            <thead><tr>
              <th className="th-base" style={{ textAlign: 'left' }}>Nro. Lote</th>
              <th className="th-base" style={{ textAlign: 'left' }}>Dirección</th>
              <th className="th-base" style={{ textAlign: 'left' }}>Tipo</th>
              <th className="th-base" style={{ textAlign: 'left' }}>Dimensión</th>
              <th className="th-base" style={{ textAlign: 'right' }}>Precio US$/m2</th>
              <th className="th-base" style={{ textAlign: 'right' }}>Precio Venta US$</th>
              <th className="th-base" style={{ textAlign: 'right' }}>Precio Final US$</th>
              <th className="th-base" style={{ textAlign: 'center' }}>Estado</th>
              <th className="th-base" style={{ textAlign: 'left' }}>Cliente</th>
              <th className="th-base" style={{ textAlign: 'right' }}></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((l) => (
                <tr key={l.id} onClick={() => setSelected({ id: l.id })} className="cursor-pointer hover:bg-slate-50">
                  <td className="td-base font-semibold" style={{ textAlign: 'left' }}>{l.code}</td>
                  <td className="td-base truncate text-slate-500" style={{ textAlign: 'left' }} title={l.streetAddress || l.blockAddress || '—'}>{l.streetAddress || l.blockAddress || '—'}</td>
                  <td className="td-base truncate text-slate-500" style={{ textAlign: 'left' }} title={l.type || '—'}>{l.type || '—'}</td>
                  <td className="td-base" style={{ textAlign: 'left' }}>{l.areaM2} m²</td>
                  <td className="td-base tabular-nums" style={{ textAlign: 'right' }}>{l.price ? formatMoney(l.price) : '—'}</td>
                  <td className="td-base tabular-nums" style={{ textAlign: 'right' }}>{l.salePrice ? formatMoney(l.salePrice) : '—'}</td>
                  <td className="td-base tabular-nums" style={{ textAlign: 'right' }}>{l.finalPrice ? formatMoney(l.finalPrice) : '—'}</td>
                  <td className="td-base" style={{ textAlign: 'center' }}>
                    <span className="badge whitespace-nowrap" style={{ backgroundColor: LOT_STATUS_COLOR[l.status] + '22', color: LOT_STATUS_COLOR[l.status] }}>{LOT_STATUS_LABEL[l.status]}</span>
                  </td>
                  <td className="td-base truncate text-slate-500" style={{ textAlign: 'left' }} title={l.clientName || '—'}>{l.clientName || '—'}</td>
                  <td className="td-base" style={{ textAlign: 'right' }}>
                    <div className="flex justify-end gap-1">
                      <button className="btn-secondary !h-8 !px-2 text-xs whitespace-nowrap" onClick={(e) => { e.stopPropagation(); setSelected({ id: l.id }); }}>Ver ficha</button>
                      {l.planVoucherUrl && (
                        <a className="btn-secondary !h-8 !px-2 text-xs whitespace-nowrap" href={l.planVoucherUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Ver</a>
                      )}
                      <label className="btn-primary !h-8 !px-2 text-xs whitespace-nowrap cursor-pointer" onClick={(e) => e.stopPropagation()} title={l.planVoucherUrl ? 'Reemplazar plano/voucher' : 'Subir plano/voucher'}>
                        Plano
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            uploadLotPlan(l, file);
                          }}
                        />
                      </label>
                      <button className="btn-danger !h-8 !px-2 text-xs whitespace-nowrap" onClick={(e) => { e.stopPropagation(); setSelected({ id: l.id, focus: 'edit' }); }}>Editar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#0B2F6E' }}>
                <td className="td-base font-bold text-white" style={{ textAlign: 'left' }}>{items.length}</td>
                <td className="td-base font-bold text-white" colSpan={2} style={{ textAlign: 'left' }}>Totales</td>
                <td className="td-base font-bold text-white tabular-nums">{t.pricePerM2 ? `${formatMoney(t.pricePerM2)}/m²` : '—'}</td>
                <td className="td-base font-bold text-white tabular-nums" style={{ textAlign: 'right' }}>{formatMoney(t.totalPrice)}</td>
                <td className="td-base font-bold text-white tabular-nums" style={{ textAlign: 'right' }}>{formatMoney(t.totalVenta)}</td>
                <td className="td-base font-bold text-white tabular-nums" style={{ textAlign: 'right' }}>{formatMoney(t.totalFinal)}</td>
                <td className="td-base" colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster />
      <LotDetailModal lotId={selected?.id || null} initialFocus={selected?.focus} onClose={() => setSelected(null)} onChanged={load} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {([
          { label: 'Lotes Totales', value: stats.total, color: '#1259C4', ring: '#E7F0FE', icon: <FiLayers /> },
          { label: 'Lotes Vendidos', value: stats.vendidos, color: '#B91C1C', ring: '#FEE2E2', icon: <FiCheckCircle /> },
          { label: 'Lotes Separados', value: stats.separados, color: '#B45309', ring: '#FEF3C7', icon: <FiBookmark /> },
          { label: 'Lotes Disponibles', value: stats.disponibles, color: '#047857', ring: '#D1FAE5', icon: <FiTrendingUp /> },
          { label: 'Lotes Promoción', value: stats.promocion, color: '#7C3AED', ring: '#EDE9FE', icon: <FiTag /> },
          { label: 'Lotes 2da Etapa', value: stats.segundaEtapa, color: '#0E7490', ring: '#CFFAFE', icon: <FiFlag /> },
        ] as const).map((k: any) => (
          <div
            key={k.label}
            className="card card-kpi relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ borderTop: `3px solid ${k.color}` }}
          >
            <div
              className="absolute -right-4 -top-4 w-16 h-16 rounded-full opacity-30"
              style={{ background: k.ring }}
            />
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: k.ring, color: k.color }}>
                {k.icon}
              </span>
              <span className="font-semibold text-[11px] uppercase tracking-wide" style={{ color: '#6B7280' }}>{k.label}</span>
            </div>
            <div className="mt-2 font-extrabold tabular-nums" style={{ fontSize: 30, color: k.color, lineHeight: 1 }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

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
        <button
          className={viewMode === 'blocks' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setViewMode((current) => current === 'general' ? 'blocks' : 'general')}
        >
          <FiLayers /> {viewMode === 'blocks' ? 'General' : 'Por calles'}
        </button>
        <button className="btn-secondary" onClick={exportPdf} disabled={!lots.length}>
          <FiDownload /> Exportar PDF
        </button>
        <button className="btn-secondary" onClick={()=>{setBuscar('');setSearch('');setStatusFilter('');if(!lockedProjectId) setProject('');}}>Limpiar</button>
      </div>

      <div className="space-y-5">
        {(() => {
          if (!lots.length) return <EmptyState text="No se encontraron lotes con los filtros" />;
          if (viewMode === 'general') return renderTable(sortedLots, 'general');
          return lotGroups().map((g) => renderTable(g.items, g.key, { blockName: g.blockName, blockAddress: g.blockAddress }));
          const coll = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

          // Agrupar por calle real (street_id), no por prefijo del codigo.
          type Group = { key: string; blockName: string; blockAddress: string | null; items: Lot[] };
          const groups: Group[] = [];
          for (const l of lots) {
            const key = (l.streetId ?? l.blockId) != null ? String(l.streetId ?? l.blockId) : 'sin-calle';
            let g = groups.find((x) => x.key === key);
            if (!g) {
              g = { key, blockName: l.streetName || l.blockName || '—', blockAddress: l.streetAddress || l.blockAddress || null, items: [] };
              groups.push(g as Group);
            }
            (g as Group).items.push(l);
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
                        <p className="font-bold leading-tight">Calle {g.blockName}</p>
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
                      <th className="th-base" style={{ textAlign: 'right' }}>Precio US$/m2</th>
                      <th className="th-base" style={{ textAlign: 'right' }}>Precio Venta US$</th>
                      <th className="th-base" style={{ textAlign: 'right' }}>Precio Final US$</th>
                      <th className="th-base" style={{ textAlign: 'center' }}>Estado</th>
                      <th className="th-base" style={{ textAlign: 'left' }}>Cliente</th>
                      <th className="th-base"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {g.items.map((l) => (
                        <tr key={l.id} onClick={() => setSelected({ id: l.id })} className="cursor-pointer hover:bg-slate-50">
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
                            <button className="btn-secondary !h-8 !px-3 text-xs whitespace-nowrap" onClick={(e) => { e.stopPropagation(); setSelected({ id: l.id }); }}>Ver ficha</button>
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

      <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#E5E7EB' }}>
        <span className="text-xs text-slate-500">
          {meta.total
            ? `Mostrando ${(page - 1) * pageSize + 1}-${Math.min(meta.total, (page - 1) * pageSize + lots.length)} de ${meta.total} lotes`
            : 'Sin lotes'}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Por pagina
            <select
              className="input-base !h-8 !w-20 !px-2 text-xs"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <button className="btn-neutral !h-8 !px-3 text-xs" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
          <span className="px-2 text-xs font-semibold text-slate-600">Pagina {page} de {meta.totalPages}</span>
          <button className="btn-neutral !h-8 !px-3 text-xs" disabled={page >= meta.totalPages} onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}>Siguiente</button>
        </div>
      </div>
    </>
  );
}

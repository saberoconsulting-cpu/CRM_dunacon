'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { api, uploadFile } from '@/lib/api';
import { Block, Lot, Point } from '@/lib/types';
import { toast, Field } from '@/components/ui/ui';
import { optimizedPlanImageUrl } from '@/lib/planImage';
import { FiLock, FiUnlock, FiRotateCcw } from 'react-icons/fi';

const SVG_W = 1000;
const SVG_H = 800;
const LIST_PAGE_SIZE = 10;
const STREET_COLORS = [
  { fill: 'rgba(20,184,166,0.18)', stroke: '#0F766E', label: '#115E59' },
  { fill: 'rgba(244,114,182,0.18)', stroke: '#BE185D', label: '#9D174D' },
  { fill: 'rgba(132,204,22,0.18)', stroke: '#4D7C0F', label: '#3F6212' },
  { fill: 'rgba(6,182,212,0.18)', stroke: '#0E7490', label: '#155E75' },
  { fill: 'rgba(249,115,22,0.16)', stroke: '#C2410C', label: '#9A3412' },
  { fill: 'rgba(100,116,139,0.14)', stroke: '#475569', label: '#334155' },
];

type LotCatalogRow = {
  id?: number;
  code: string;
  address?: string;
  type?: string;
  areaM2: number;
  dimensions?: string;
  priceM2: number;
  salePrice: number;
  discount: number;
  finalPrice: number;
  status?: string;
  client?: string;
};

const emptyCatalogRow = (): LotCatalogRow => ({
  code: '',
  address: '',
  type: '',
  areaM2: 0,
  dimensions: '',
  priceM2: 0,
  salePrice: 0,
  discount: 0,
  finalPrice: 0,
  status: 'Disponible',
  client: '',
});

function streetTone(index: number, highlighted: boolean) {
  if (highlighted) return { fill: 'rgba(24,119,242,0.25)', stroke: '#1877F2', label: '#1259C4' };
  return STREET_COLORS[index % STREET_COLORS.length];
}

function centroid(pts: Point[]) {
  if (!pts.length) return { x: 0, y: 0 };
  return pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
}

function insidePolygon(x: number, y: number, pts: Point[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function formatUsd(value: unknown) {
  const n = Number(value || 0);
  return `US$ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function PlanEditor({ projectId }: { projectId: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lotCatalogFileRef = useRef<HTMLInputElement>(null);
  const [imgUrl, setImgUrl] = useState('');
  const [streets, setStreets] = useState<Block[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [status, setStatus] = useState('draft');
  const [mode, setMode] = useState<'none' | 'street' | 'lot'>('none');
  const [draft, setDraft] = useState<Point[]>([]);
  const [selectedStreet, setSelectedStreet] = useState<number | null>(null);
  const [streetsOpen, setStreetsOpen] = useState(true);
  const [lotInfo, setLotInfo] = useState({ code: '', address: '', area: 0, dimensions: '', price: 0, type: '', salePrice: 0, discount: 0, finalPrice: 0, catalogStatus: '', client: '' });
  const [lotCatalog, setLotCatalog] = useState<LotCatalogRow[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState<LotCatalogRow>(emptyCatalogRow());
  const [editingCatalogId, setEditingCatalogId] = useState<number | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [streetPage, setStreetPage] = useState(0);
  const [lotPage, setLotPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [lotSearch, setLotSearch] = useState('');
  const [lotStreetFilter, setLotStreetFilter] = useState('');
  const [lotTypeFilter, setLotTypeFilter] = useState('');
  const [editingLot, setEditingLot] = useState<null | {
    id: number;
    code: string;
    streetId: number;
    areaM2: number;
    price: number;
    type: string;
    salePrice: number;
    finalPrice: number;
  }>(null);
  const dim = useRef({ w: SVG_W, h: SVG_H });

  // Zoom / encuadre del lienzo, igual que la vista publica (InteractivePlan):
  // botones + / - , rueda (solo desbloqueado) y una llave para fijar la vista y
  // poder dibujar con precision sin que el plano se mueva.
  const [viewState, setViewState] = useState({ scale: 1, x: 0, y: 0 });
  const [viewLocked, setViewLocked] = useState(true);
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {});

  const normalizeCode = (value: string) => String(value || '').trim().toUpperCase().replace(/^L-0+(\d+)$/, 'L-$1');
  const catalogByCode = new Map(lotCatalog.map((item) => [normalizeCode(item.code), item]));

  const load = useCallback(async () => {
    try {
      const pl = await api.get<any>(`/plan/project/${projectId}`).catch(() => ({ plan: { status: 'draft' }, streets: [], blocks: [], lots: [] }));
      const catalog = await api.get<any[]>(`/plan/lot-catalog/${projectId}`).catch(() => []);
      setImgUrl(pl.plan?.imageUrl || '');
      setStatus(pl.plan?.status || 'draft');
      setStreets(pl.streets || pl.blocks || []);
      setLots(pl.lots || []);
      setLotCatalog((Array.isArray(catalog) ? catalog : []).map((item: any) => ({
        id: item.id,
        code: item.code || '',
        address: item.address || '',
        type: item.type || '',
        areaM2: Number(item.areaM2 || 0),
        dimensions: item.dimensions || '',
        priceM2: Number(item.priceM2 || 0),
        salePrice: Number(item.salePrice || 0),
        discount: Number(item.discount || 0),
        finalPrice: Number(item.finalPrice || 0),
        status: item.status || 'Disponible',
        client: item.client || '',
      })));
      dim.current = { w: Number(pl.plan?.imageWidth || SVG_W), h: Number(pl.plan?.imageHeight || SVG_H) };
    } catch (e: any) { toast(e.message, 'err'); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setLotPage(0);
  }, [lotSearch, lotStreetFilter, lotTypeFilter]);

  const imgScale = Math.min(SVG_W / dim.current.w, SVG_H / dim.current.h);
  const imgW = dim.current.w * imgScale;
  const imgH = dim.current.h * imgScale;
  const imgX = (SVG_W - imgW) / 2;
  const imgY = (SVG_H - imgH) / 2;
  const displayImgUrl = optimizedPlanImageUrl(imgUrl);

  // ---- Zoom / encuadre (mismo comportamiento que InteractivePlan) ----
  function applyViewBox(vx: number, vy: number, vw: number) {
    const next = SVG_W / vw;
    setViewState({ scale: next, x: -vx * next, y: -vy * next });
  }

  function resetView() {
    const w = Number(dim.current.w || SVG_W);
    const h = Number(dim.current.h || SVG_H);
    const iScale = Math.min(SVG_W / w, SVG_H / h);
    const iw = w * iScale;
    const ih = h * iScale;
    const ix = (SVG_W - iw) / 2;
    const iy = (SVG_H - ih) / 2;
    const padding = 18;
    let x = ix - padding;
    let y = iy - padding;
    let vw = iw + padding * 2;
    let vh = ih + padding * 2;
    const target = SVG_W / SVG_H;
    if (vw / vh > target) { vh = vw / target; y = iy + ih / 2 - vh / 2; }
    else { vw = vh * target; x = ix + iw / 2 - vw / 2; }
    x = Math.max(0, x);
    y = Math.max(0, y);
    vw = Math.min(SVG_W, vw);
    applyViewBox(x, y, vw);
  }

  useEffect(() => {
    resetView();
    window.addEventListener('resize', resetView);
    return () => window.removeEventListener('resize', resetView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgUrl]);

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    setViewState((v) => {
      const next = Math.min(6, Math.max(0.4, v.scale * factor));
      const nx = px - ((px - v.x) / v.scale) * next;
      const ny = py - ((py - v.y) / v.scale) * next;
      return { scale: next, x: nx, y: ny };
    });
  }

  function zoomCentered(factor: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = rect.width / 2;
    const py = rect.height / 2;
    setViewState((v) => {
      const next = Math.min(6, Math.max(0.4, v.scale * factor));
      const nx = px - ((px - v.x) / v.scale) * next;
      const ny = py - ((py - v.y) / v.scale) * next;
      return { scale: next, x: nx, y: ny };
    });
  }

  wheelHandlerRef.current = (e: WheelEvent) => {
    if (viewLocked) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1 / 1.15 : 1.15);
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => wheelHandlerRef.current(e);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  function toSvg(e: any): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = -viewState.x / viewState.scale;
    const vy = -viewState.y / viewState.scale;
    const vw = SVG_W / viewState.scale;
    const vh = SVG_H / viewState.scale;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return { x: vx + (px / rect.width) * vw, y: vy + (py / rect.height) * vh };
  }

  function addNode(e: any) {
    if (mode !== 'none') setDraft((points) => [...points, toSvg(e)]);
  }

  function closeShape() {
    if (draft.length < 3) return toast('Dibuja al menos 3 puntos', 'err');
    setMode('none');
  }

  async function uploadImage(file: File) {
    try {
      const r = await uploadFile(`/plan/image/${projectId}`, file);
      toast('Imagen del plano subida');
      setImgUrl(r?.imageUrl || URL.createObjectURL(file));
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function saveStreet() {
    if (draft.length < 3) return toast('Dibuja una calle o tramo (3+ puntos)', 'err');
    const name = prompt('Nombre de la calle o tramo:', `Calle ${streets.length + 1}`) || `Calle ${streets.length + 1}`;
    const address = prompt('Referencia de la calle (opcional):', '') || undefined;
    try {
      await api.post(`/plan/street/${projectId}`, { name, points: draft, address });
      toast('Calle guardada');
      setDraft([]);
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function saveLot(street: Block | null) {
    if (draft.length < 3) return toast('Dibuja el lote (3+ puntos)', 'err');
    if (!street) return toast('Primero crea/elige la calle contenedora', 'err');
    if (!lotInfo.code) return toast('Indica el codigo del lote', 'err');
    try {
      await api.post(`/plan/lot/${projectId}`, {
        code: lotInfo.code,
        streetId: street.id,
        blockId: street.id,
        points: draft,
        areaM2: Number(lotInfo.area) || 0,
        price: Number(lotInfo.price) || 0,
        status: lotInfo.catalogStatus?.toLowerCase() === 'vendido' ? 'vendido' : 'disponible',
        type: lotInfo.type || undefined,
        dimensions: lotInfo.dimensions || undefined,
        salePrice: lotInfo.salePrice || undefined,
        finalPrice: lotInfo.finalPrice || undefined,
      });
      toast('Lote guardado');
      setDraft([]);
      setLotInfo({ code: '', address: '', area: 0, dimensions: '', price: 0, type: '', salePrice: 0, discount: 0, finalPrice: 0, catalogStatus: '', client: '' });
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  function applyCatalogToLot(code: string) {
    const row = catalogByCode.get(normalizeCode(code));
    if (!row) {
      setLotInfo((current) => ({ ...current, code }));
      return;
    }
    setLotInfo({
      code: row.code,
      address: row.address || '',
      area: Number(row.areaM2 || 0),
      dimensions: row.dimensions || '',
      price: Number(row.priceM2 || 0),
      type: row.type || '',
      salePrice: Number(row.salePrice || 0),
      discount: Number(row.discount || 0),
      finalPrice: Number(row.finalPrice || 0),
      catalogStatus: row.status || '',
      client: row.client || '',
    });
  }

  function startCatalogEdit(row?: LotCatalogRow) {
    setEditingCatalogId(row?.id || null);
    setCatalogDraft(row ? { ...row } : emptyCatalogRow());
    setCatalogEditorOpen(true);
  }

  async function saveCatalogRow() {
    if (!catalogDraft.code.trim()) return toast('Indica el numero de lote', 'err');
    const payload = {
      ...catalogDraft,
      code: catalogDraft.code.trim(),
      areaM2: Number(catalogDraft.areaM2) || 0,
      priceM2: Number(catalogDraft.priceM2) || 0,
      salePrice: Number(catalogDraft.salePrice) || 0,
      discount: Number(catalogDraft.discount) || 0,
      finalPrice: Number(catalogDraft.finalPrice) || 0,
    };
    try {
      if (editingCatalogId) await api.post(`/plan/lot-catalog/update/${projectId}/${editingCatalogId}`, payload);
      else await api.post(`/plan/lot-catalog/${projectId}`, payload);
      toast('Lote base guardado');
      setEditingCatalogId(null);
      setCatalogEditorOpen(false);
      setCatalogDraft(emptyCatalogRow());
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function importLotCatalog(file?: File) {
    if (!file) return;
    try {
      const result = await uploadFile(`/plan/lot-catalog/import/${projectId}`, file);
      toast(`Excel cargado: ${result?.created || 0} nuevos, ${result?.updated || 0} actualizados`);
      setCatalogOpen(true);
      load();
    } catch (e: any) {
      toast(e?.message || 'No se pudo cargar el Excel de lotes', 'err');
    } finally {
      if (lotCatalogFileRef.current) lotCatalogFileRef.current.value = '';
    }
  }

  async function deleteCatalogRow(row: LotCatalogRow) {
    if (!row.id || !confirm(`Eliminar ${row.code} de la lista base?`)) return;
    try {
      await api.post(`/plan/lot-catalog/delete/${projectId}/${row.id}`, {});
      toast('Lote base eliminado');
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function renameStreet(street: Block) {
    const name = prompt('Nuevo nombre de la calle:', street.name);
    if (name == null) return;
    const address = prompt('Referencia de la calle (opcional):', street.address || '');
    if (address == null) return;
    try {
      await api.post(`/plan/street/update/${street.id}`, { name: name || street.name, address });
      toast('Calle actualizada');
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function deleteStreet(street: Block) {
    if (!confirm(`Eliminar calle ${street.name}? Sus lotes no se borran, quedan sin calle.`)) return;
    try { await api.post(`/plan/street/delete/${street.id}`); toast('Calle eliminada'); load(); } catch (e: any) { toast(e.message, 'err'); }
  }

  async function deleteLot(lot: Lot) {
    if (!confirm(`Eliminar lote ${lot.code}?`)) return;
    try { await api.post(`/plan/lot/delete/${lot.id}`); toast('Lote eliminado'); load(); } catch (e: any) { toast(e.message, 'err'); }
  }

  function startEditLot(lot: Lot) {
    setEditingLot({
      id: lot.id,
      code: lot.code || '',
      streetId: Number(lot.streetId ?? lot.blockId ?? 0),
      areaM2: Number(lot.areaM2 || 0),
      price: Number(lot.price || 0),
      type: String(lot.type || ''),
      salePrice: Number(lot.salePrice || 0),
      finalPrice: Number(lot.finalPrice || 0),
    });
  }

  async function saveEditedLot() {
    if (!editingLot) return;
    if (!editingLot.code.trim()) return toast('Indica el codigo del lote', 'err');
    if (!editingLot.streetId) return toast('Selecciona la calle del lote', 'err');
    try {
      await api.post(`/plan/lot/update/${editingLot.id}`, {
        code: editingLot.code.trim(),
        streetId: editingLot.streetId,
        blockId: editingLot.streetId,
        areaM2: Number(editingLot.areaM2) || 0,
        price: Number(editingLot.price) || 0,
        type: editingLot.type || undefined,
        salePrice: editingLot.salePrice || undefined,
        finalPrice: editingLot.finalPrice || undefined,
      });
      toast('Lote actualizado');
      setEditingLot(null);
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  function clearLotFilters() {
    setLotSearch('');
    setLotStreetFilter('');
    setLotTypeFilter('');
  }

  async function setStatusP(next: string) {
    try {
      await api.post(`/plan/update/${projectId}`, { status: next });
      setStatus(next);
      toast(next === 'published' ? 'Plano publicado' : 'Guardado como borrador');
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  function streetForLot(lot: Lot) {
    const streetId = lot.streetId ?? lot.blockId;
    if (streetId != null) return streets.find((street) => Number(street.id) === Number(streetId));
    const codeGroup = String(lot.code || '').trim().split(/[-_\s.]/)[0].trim().toUpperCase();
    if (codeGroup) {
      const byName = streets.find((street) => String(street.name || '').trim().toUpperCase() === codeGroup);
      if (byName) return byName;
    }
    const c = centroid(lot.points || []);
    return Number.isFinite(c.x) && Number.isFinite(c.y)
      ? streets.find((street) => street.points.length > 2 && insidePolygon(c.x, c.y, street.points))
      : undefined;
  }

  function countLotsIn(street: Block) {
    return lots.filter((lot) => Number(lot.streetId ?? lot.blockId) === Number(street.id) || streetForLot(lot)?.id === street.id).length;
  }

  const lotTypes = Array.from(new Set(lots.map((lot: any) => String(lot.type || '').trim()).filter(Boolean))).sort();
  const filteredCatalog = lotCatalog.filter((row) => {
    const query = catalogSearch.trim().toLowerCase();
    return !query || [row.code, row.address, row.type, row.status, row.client].some((value) => String(value || '').toLowerCase().includes(query));
  });
  const filteredLots = lots.filter((lot: any) => {
    const query = lotSearch.trim().toLowerCase();
    const street = streetForLot(lot);
    const matchesSearch = !query || [lot.code, street?.name, street?.address, lot.type].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStreet = !lotStreetFilter || Number(street?.id) === Number(lotStreetFilter);
    const matchesType = !lotTypeFilter || String(lot.type || '') === lotTypeFilter;
    return matchesSearch && matchesType && matchesStreet;
  });

  return (
    <div className="space-y-4 overflow-x-hidden">
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold mr-2">Editor de plano</h3>
            {status === 'published' ? <span className="badge" style={{ background: '#EAF7EE', color: '#125A3B' }}>Publicado</span> : <span className="badge" style={{ background: '#FFF6E4', color: '#B45309' }}>Borrador</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="btn-neutral cursor-pointer"><input type="file" accept="image/*,.jpg,.jpeg,.jpe,.png,.webp,.bmp,.gif,.jpng" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />Subir imagen</label>
            {status === 'published'
              ? <button className="btn-neutral" onClick={() => setStatusP('draft')}>Borrador</button>
              : <button className="btn-primary" onClick={() => setStatusP('published')}>Publicar</button>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={mode === 'street' ? 'btn-primary' : 'btn-outline'} onClick={() => setMode(mode === 'street' ? 'none' : 'street')}>Calle</button>
          <button className={mode === 'lot' ? 'btn-primary' : 'btn-outline'} onClick={() => setMode(mode === 'lot' ? 'none' : 'lot')}>Lote</button>
          <button className="btn-neutral" onClick={() => { setDraft([]); setMode('none'); }}>Limpiar</button>
          <span className="text-xs self-center" style={{ color: '#6B7280' }}>{mode !== 'none' ? `Clic sobre el plano para anadir ${draft.length} puntos y luego guarda.` : 'Elige herramienta y haz clic en el plano.'}</span>
        </div>
      </div>

      <div className={`grid grid-cols-1 items-stretch gap-4 min-w-0 ${mode === 'none' ? 'lg:grid-cols-3' : 'lg:grid-cols-[7fr_3fr] lg:h-[calc(100vh-260px)]'}`}>
        <div className={`${mode === 'none' ? 'lg:col-span-2' : 'lg:h-full w-full'} card overflow-hidden !p-0 relative bg-slate-100 min-w-0`} style={mode === 'none' ? { aspectRatio: '1000 / 800' } : undefined}>
          <svg ref={svgRef} viewBox={`${-viewState.x / viewState.scale} ${-viewState.y / viewState.scale} ${SVG_W / viewState.scale} ${SVG_H / viewState.scale}`} className={`w-full h-full ${viewLocked ? 'cursor-crosshair' : 'cursor-zoom-in'}`} onClick={addNode}>
            {displayImgUrl && <image href={displayImgUrl} x={imgX} y={imgY} width={imgW} height={imgH} preserveAspectRatio="xMidYMid meet" />}
            {streets.map((street, index) => {
              const tone = streetTone(index, selectedStreet === street.id && mode === 'none');
              return (
                <g key={street.id} onClick={(e) => { if (mode === 'none') { e.stopPropagation(); setSelectedStreet(selectedStreet === street.id ? null : street.id); } }} style={{ pointerEvents: mode === 'lot' ? 'none' : 'auto' }}>
                  <polygon points={street.points.map((p) => `${p.x},${p.y}`).join(' ')} fill={tone.fill} stroke={tone.stroke} strokeWidth={selectedStreet === street.id ? 2.5 : 1.2} />
                </g>
              );
            })}
            {lots.map((lot) => {
              const c = centroid(lot.points);
              return (
                <g key={lot.id} onClick={(e) => e.stopPropagation()} style={{ pointerEvents: 'all' }}>
                  <polygon points={lot.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="#cbd5e1" fillOpacity={0.55} stroke="#94a3b8" strokeWidth={1} />
                  <text x={c.x} y={c.y + 3} fontSize={9} textAnchor="middle" fontWeight={600}>{lot.code}</text>
                </g>
              );
            })}
            {draft.length > 0 && <polygon points={draft.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(24,119,242,0.25)" stroke="#1877F2" strokeWidth={2} />}
            {draft.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={5} fill="#1877F2" stroke="#fff" strokeWidth={1.5} />)}
          </svg>
          {!imgUrl && <div className="absolute inset-0 grid place-items-center text-sm" style={{ color: '#6B7280' }}>Sube la imagen del plano para dibujar sobre ella.</div>}

          {/* Controles de zoom / llave (igual que la vista publica) */}
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
            <button type="button" onClick={() => zoomCentered(1.25)} className="grid h-9 w-9 place-items-center rounded-lg bg-white/90 text-lg font-bold text-slate-700 shadow hover:bg-white" title="Acercar (+)">+</button>
            <button type="button" onClick={() => zoomCentered(0.8)} className="grid h-9 w-9 place-items-center rounded-lg bg-white/90 text-lg font-bold text-slate-700 shadow hover:bg-white" title="Alejar (-)">−</button>
            <button
              type="button"
              onClick={() => setViewLocked((value) => !value)}
              className={`grid h-9 w-9 place-items-center rounded-lg shadow transition-colors ${viewLocked ? 'bg-[#1877F2] text-white' : 'bg-white/90 text-slate-700 hover:bg-white'}`}
              title={viewLocked ? 'Vista fija activada (bloquea la rueda)' : 'Liberar zoom con la rueda'}
            >
              {viewLocked ? <FiLock /> : <FiUnlock />}
            </button>
            <button type="button" onClick={resetView} className="grid h-9 w-9 place-items-center rounded-lg bg-white/90 text-slate-700 shadow hover:bg-white" title="Restablecer vista"><FiRotateCcw /></button>
          </div>
        </div>

        <div className="min-w-0 space-y-4 lg:self-stretch">
          {mode === 'none' && (
            <>
              <div className="card">
                <p className="text-xs" style={{ color: '#6B7280' }}>Usa Calle / Lote para dibujar sobre el plano.</p>
                <button className="btn-neutral mt-3 w-full justify-center" onClick={() => setStreetsOpen((value) => !value)}>
                  Calles ({streets.length})
                </button>
              </div>
              {streetsOpen && (
                <div className="card">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="font-semibold">Calles ({streets.length})</h4>
                    <button className="btn-neutral !h-7 !px-2 text-xs" onClick={() => setStreetsOpen(false)}>Cerrar</button>
                  </div>
                  <ul className="max-h-[460px] space-y-2 overflow-y-auto pr-1 text-sm">
                    {streets.map((street, index) => {
                      const tone = streetTone(index, selectedStreet === street.id);
                      const lotsCount = countLotsIn(street);
                      return (
                        <li key={street.id} className="rounded-lg border p-2" style={{ borderColor: tone.stroke, background: selectedStreet === street.id ? '#E7F0FE' : '#fff' }}>
                          <div className="flex items-center justify-between gap-2">
                            <button onClick={() => setSelectedStreet(selectedStreet === street.id ? null : street.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left font-bold" style={{ color: '#171717' }}>
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white" style={{ background: tone.stroke }}>{index + 1}</span>
                              <span className="min-w-0">
                                <span className="block truncate">{street.name}</span>
                                <span className="block text-xs font-medium" style={{ color: lotsCount ? '#067a46' : '#94a3b8' }}>{lotsCount} {lotsCount === 1 ? 'lote' : 'lotes'}</span>
                              </span>
                            </button>
                            <span className="flex shrink-0 flex-wrap items-center gap-1">
                              <button className="btn-neutral !h-6 !px-2 text-xs" onClick={() => renameStreet(street)}>Nombrar</button>
                              <button className="btn-danger !h-6 !px-2 text-xs" onClick={() => deleteStreet(street)}>Eliminar</button>
                            </span>
                          </div>
                        </li>
                      );
                    })}
                    {streets.length === 0 && <li className="text-xs" style={{ color: '#94a3b8' }}>Aun no hay calles dibujadas.</li>}
                  </ul>
                </div>
              )}
            </>
          )}
          {mode !== 'none' && (
            <div className="card lg:h-full lg:overflow-y-auto">
              <h4 className="mb-2 text-sm font-semibold">Guardar {mode === 'street' ? 'calle' : 'lote'}</h4>
              {mode === 'street' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-primary w-full" onClick={saveStreet}>Guardar calle ({draft.length} pts)</button>
                  <button className="btn-neutral w-full" onClick={closeShape}>Cerrar forma</button>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <Field label="Calle contenedora">
                    <select className="input !h-9 text-sm" value={selectedStreet || ''} onChange={(e) => setSelectedStreet(Number(e.target.value))}>
                      <option value="">Selecciona...</option>
                      {streets.map((street) => <option key={street.id} value={street.id}>{street.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Codigo del lote *">
                    <input
                      className="input !h-9 text-sm"
                      list="project-lot-catalog-codes"
                      value={lotInfo.code}
                      onChange={(e) => applyCatalogToLot(e.target.value)}
                      onBlur={(e) => applyCatalogToLot(e.target.value)}
                      placeholder="L-1"
                    />
                    <datalist id="project-lot-catalog-codes">
                      {lotCatalog.map((row) => <option key={row.id || row.code} value={row.code}>{row.address || row.type || row.status || ''}</option>)}
                    </datalist>
                  </Field>
                  <Field label="Direccion"><input className="input !h-9 text-sm" value={lotInfo.address} onChange={(e) => setLotInfo({ ...lotInfo, address: e.target.value })} placeholder="Se llena desde la lista base" /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Area m2"><input type="number" className="input !h-9 text-sm" value={lotInfo.area || ''} onChange={(e) => setLotInfo({ ...lotInfo, area: Number(e.target.value) })} /></Field>
                    <Field label="Tipo"><input className="input !h-9 text-sm" value={lotInfo.type} onChange={(e) => setLotInfo({ ...lotInfo, type: e.target.value })} placeholder="Ej: Esquina" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Dimensiones"><input className="input !h-9 text-sm" value={lotInfo.dimensions} onChange={(e) => setLotInfo({ ...lotInfo, dimensions: e.target.value })} placeholder="10m x 30m" /></Field>
                    <Field label="Precio US$/m2"><input type="number" className="input !h-9 text-sm" value={lotInfo.price || ''} onChange={(e) => setLotInfo({ ...lotInfo, price: Number(e.target.value) })} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Precio venta US$"><input type="number" className="input !h-9 text-sm" value={lotInfo.salePrice || ''} onChange={(e) => setLotInfo({ ...lotInfo, salePrice: Number(e.target.value) })} /></Field>
                    <Field label="Precio final US$"><input type="number" className="input !h-9 text-sm" value={lotInfo.finalPrice || ''} onChange={(e) => setLotInfo({ ...lotInfo, finalPrice: Number(e.target.value) })} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Estado base"><input className="input !h-9 text-sm" value={lotInfo.catalogStatus} onChange={(e) => setLotInfo({ ...lotInfo, catalogStatus: e.target.value })} /></Field>
                    <Field label="Cliente base"><input className="input !h-9 text-sm" value={lotInfo.client} onChange={(e) => setLotInfo({ ...lotInfo, client: e.target.value })} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button className="btn-primary w-full" onClick={() => saveLot(streets.find((x) => x.id === selectedStreet) || null)}>Guardar lote</button>
                    <button className="btn-neutral w-full" onClick={closeShape}>Cerrar forma</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { api, uploadFile } from '@/lib/api';
import { Block, Lot, Point } from '@/lib/types';
import { toast, Field } from '@/components/ui/ui';

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

function streetTone(index: number, highlighted: boolean) {
  if (highlighted) return { fill: 'rgba(24,119,242,0.25)', stroke: '#1877F2', label: '#1259C4' };
  return STREET_COLORS[index % STREET_COLORS.length];
}

function centroid(pts: Point[]) {
  if (!pts.length) return { x: 0, y: 0 };
  return pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
}

function streetLabelBox(pts: Point[], text: string) {
  if (!pts.length) return { x: 0, y: 0, angle: 0, width: 0, height: 0, fontSize: 10 };
  const xs = pts.map((p) => Number(p.x || 0));
  const ys = pts.map((p) => Number(p.y || 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(24, maxX - minX);
  const height = Math.max(14, maxY - minY);
  const center = centroid(pts);
  let best = { length: 0, angle: 0 };
  pts.forEach((point, index) => {
    const next = pts[(index + 1) % pts.length];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy);
    if (length > best.length) best = { length, angle: Math.atan2(dy, dx) * 180 / Math.PI };
  });
  let angle = best.angle;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  const available = Math.max(30, Math.min(best.length || width, width * 0.9));
  const fontSize = Math.max(11, Math.min(19, available / Math.max(5, String(text || '').length * 0.58), height * 0.5));
  return { x: center.x, y: center.y, angle, width: available, height: fontSize + 10, fontSize };
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
  const [imgUrl, setImgUrl] = useState('');
  const [streets, setStreets] = useState<Block[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [status, setStatus] = useState('draft');
  const [mode, setMode] = useState<'none' | 'street' | 'lot'>('none');
  const [draft, setDraft] = useState<Point[]>([]);
  const [selectedStreet, setSelectedStreet] = useState<number | null>(null);
  const [lotInfo, setLotInfo] = useState({ code: '', area: 0, price: 0, type: '', salePrice: 0, finalPrice: 0 });
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

  const load = useCallback(async () => {
    try {
      const pl = await api.get<any>(`/plan/project/${projectId}`).catch(() => ({ plan: { status: 'draft' }, streets: [], blocks: [], lots: [] }));
      setImgUrl(pl.plan?.imageUrl || '');
      setStatus(pl.plan?.status || 'draft');
      setStreets(pl.streets || pl.blocks || []);
      setLots(pl.lots || []);
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

  function toSvg(e: any): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * SVG_W, y: ((e.clientY - rect.top) / rect.height) * SVG_H };
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
        status: 'disponible',
        type: lotInfo.type || undefined,
        salePrice: lotInfo.salePrice || undefined,
        finalPrice: lotInfo.finalPrice || undefined,
      });
      toast('Lote guardado');
      setDraft([]);
      setLotInfo({ code: '', area: 0, price: 0, type: '', salePrice: 0, finalPrice: 0 });
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

  async function duplicateStreet(street: Block) {
    try { await api.post(`/plan/street/duplicate/${street.id}`); toast('Calle duplicada'); load(); } catch (e: any) { toast(e.message, 'err'); }
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
  const filteredLots = lots.filter((lot: any) => {
    const query = lotSearch.trim().toLowerCase();
    const street = streetForLot(lot);
    const matchesSearch = !query || [lot.code, street?.name, street?.address, lot.type].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStreet = !lotStreetFilter || Number(street?.id) === Number(lotStreetFilter);
    const matchesType = !lotTypeFilter || String(lot.type || '') === lotTypeFilter;
    return matchesSearch && matchesStreet && matchesType;
  });

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold mr-2">Editor de plano</h3>
            {status === 'published' ? <span className="badge" style={{ background: '#EAF7EE', color: '#125A3B' }}>Publicado</span> : <span className="badge" style={{ background: '#FFF6E4', color: '#B45309' }}>Borrador</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="btn-neutral cursor-pointer"><input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />Subir imagen</label>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card overflow-hidden !p-0 relative bg-slate-100" style={{ aspectRatio: '1000 / 800' }}>
          <svg ref={svgRef} viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full cursor-crosshair" onClick={addNode}>
            {imgUrl && <image href={imgUrl} x={imgX} y={imgY} width={imgW} height={imgH} preserveAspectRatio="xMidYMid meet" />}
            {streets.map((street, index) => {
              const tone = streetTone(index, selectedStreet === street.id && mode === 'none');
              const label = streetLabelBox(street.points, street.name);
              return (
                <g key={street.id} onClick={(e) => { if (mode === 'none') { e.stopPropagation(); setSelectedStreet(selectedStreet === street.id ? null : street.id); } }} style={{ pointerEvents: mode === 'lot' ? 'none' : 'auto' }}>
                  <polygon points={street.points.map((p) => `${p.x},${p.y}`).join(' ')} fill={tone.fill} stroke={tone.stroke} strokeWidth={selectedStreet === street.id ? 2.5 : 1.2} />
                  <g transform={`translate(${label.x} ${label.y}) rotate(${label.angle})`} style={{ pointerEvents: 'none' }}>
                    {/* Sin fondo: el nombre de la calle se apoya solo en su tipografia y su contorno de color */}
                    <text
                      y={1}
                      fontSize={label.fontSize}
                      fontWeight={700}
                      fontFamily="Georgia, 'Times New Roman', serif"
                      fontStyle="italic"
                      letterSpacing={1.5}
                      stroke="#FFC107"
                      strokeWidth={2}
                      strokeOpacity={0.95}
                      paintOrder="stroke"
                      strokeLinejoin="round"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#FFFFFF"
                      textLength={label.width}
                      lengthAdjust="spacingAndGlyphs"
                    >
                      {street.name}
                    </text>
                  </g>
                </g>
              );
            })}
            {lots.map((lot) => {
              const c = centroid(lot.points);
              return (
                <g key={lot.id} onClick={(e) => e.stopPropagation()} style={{ pointerEvents: 'all' }}>
                  <polygon points={lot.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="#cbd5e1" fillOpacity={0.55} stroke="#94a3b8" strokeWidth={1} />
                  <text x={c.x} y={c.y + 4} fontSize={11} textAnchor="middle" fontWeight={600}>{lot.code}</text>
                </g>
              );
            })}
            {draft.length > 0 && <polygon points={draft.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(24,119,242,0.25)" stroke="#1877F2" strokeWidth={2} />}
            {draft.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={5} fill="#1877F2" stroke="#fff" strokeWidth={1.5} />)}
          </svg>
          {!imgUrl && <div className="absolute inset-0 grid place-items-center text-sm" style={{ color: '#6B7280' }}>Sube la imagen del plano para dibujar sobre ella.</div>}
        </div>

        <div className="space-y-4">
          {mode === 'none' && (
            <div className="card">
              <p className="text-xs" style={{ color: '#6B7280' }}>Usa Calle / Lote para dibujar sobre el plano. Las listas de calles y lotes estan debajo.</p>
            </div>
          )}
          {mode !== 'none' && (
            <div className="card">
              <h4 className="font-semibold mb-3">Guardar {mode === 'street' ? 'calle' : 'lote'}</h4>
              {mode === 'street' ? (
                <button className="btn-primary w-full" onClick={saveStreet}>Guardar calle ({draft.length} pts)</button>
              ) : (
                <>
                  <Field label="Calle contenedora">
                    <select className="input" value={selectedStreet || ''} onChange={(e) => setSelectedStreet(Number(e.target.value))}>
                      <option value="">Selecciona...</option>
                      {streets.map((street) => <option key={street.id} value={street.id}>{street.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Codigo del lote *"><input className="input" value={lotInfo.code} onChange={(e) => setLotInfo({ ...lotInfo, code: e.target.value })} placeholder="L-01" /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Area m2"><input type="number" className="input" value={lotInfo.area || ''} onChange={(e) => setLotInfo({ ...lotInfo, area: Number(e.target.value) })} /></Field>
                    <Field label="Tipo"><input className="input" value={lotInfo.type} onChange={(e) => setLotInfo({ ...lotInfo, type: e.target.value })} placeholder="Ej: Esquina" /></Field>
                  </div>
                  <Field label="Precio US$/m2"><input type="number" className="input" value={lotInfo.price || ''} onChange={(e) => setLotInfo({ ...lotInfo, price: Number(e.target.value) })} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Precio venta US$"><input type="number" className="input" value={lotInfo.salePrice || ''} onChange={(e) => setLotInfo({ ...lotInfo, salePrice: Number(e.target.value) })} /></Field>
                    <Field label="Precio final US$"><input type="number" className="input" value={lotInfo.finalPrice || ''} onChange={(e) => setLotInfo({ ...lotInfo, finalPrice: Number(e.target.value) })} /></Field>
                  </div>
                  <button className="btn-primary w-full" onClick={() => saveLot(streets.find((x) => x.id === selectedStreet) || null)}>Guardar lote</button>
                </>
              )}
              <button className="btn-neutral w-full mt-2" onClick={closeShape}>Cerrar forma</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-stretch">
        <div className="card flex min-h-[560px] min-w-0 flex-col">
          <h4 className="font-semibold mb-2">Calles ({streets.length})</h4>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
            {streets.slice(streetPage * LIST_PAGE_SIZE, streetPage * LIST_PAGE_SIZE + LIST_PAGE_SIZE).map((street, index) => {
              const globalIndex = streetPage * LIST_PAGE_SIZE + index;
              const tone = streetTone(globalIndex, selectedStreet === street.id);
              const lotsCount = countLotsIn(street);
              return (
                <li key={street.id} className="rounded-lg border p-2" style={{ borderColor: tone.stroke, background: selectedStreet === street.id ? '#E7F0FE' : '#fff' }}>
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => setSelectedStreet(selectedStreet === street.id ? null : street.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left font-bold" style={{ color: '#171717' }}>
                      <span className="grid place-items-center w-7 h-7 rounded-md text-white font-bold shrink-0" style={{ background: tone.stroke }}>{globalIndex + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate">{street.name}</span>
                        <span className="block text-xs font-medium" style={{ color: lotsCount ? '#067a46' : '#94a3b8' }}>{lotsCount} {lotsCount === 1 ? 'lote' : 'lotes'}</span>
                      </span>
                    </button>
                    <span className="flex flex-wrap items-center gap-1 shrink-0">
                      <button className="btn-neutral !h-6 !px-2 text-xs" onClick={() => renameStreet(street)}>Nombrar</button>
                      <button className="btn-neutral !h-6 !px-2 text-xs" onClick={() => duplicateStreet(street)}>Duplicar</button>
                      <button className="btn-danger !h-6 !px-2 text-xs" onClick={() => deleteStreet(street)}>Eliminar</button>
                    </span>
                  </div>
                </li>
              );
            })}
            {streets.length === 0 && <li className="text-xs" style={{ color: '#94a3b8' }}>Aun no hay calles dibujadas.</li>}
          </ul>
          {streets.length > LIST_PAGE_SIZE && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2" style={{ borderColor: '#EEF0F2' }}>
              <button className="btn-neutral !h-7 !px-2 text-xs" disabled={streetPage <= 0} onClick={() => setStreetPage((v) => Math.max(0, v - 1))}>Anterior</button>
              <span className="text-xs" style={{ color: '#6B7280' }}>Pagina {Math.min(streetPage, Math.floor((streets.length - 1) / LIST_PAGE_SIZE)) + 1} de {Math.max(1, Math.ceil(streets.length / LIST_PAGE_SIZE))}</span>
              <button className="btn-neutral !h-7 !px-2 text-xs" disabled={streetPage >= Math.max(0, Math.ceil(streets.length / LIST_PAGE_SIZE) - 1)} onClick={() => setStreetPage((v) => v + 1)}>Siguiente</button>
            </div>
          )}
        </div>

        <div className="card flex min-h-[560px] min-w-0 flex-col">
          <div className="mb-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">Lotes ({filteredLots.length})</h4>
              <button className="btn-neutral !h-8 !px-3 text-xs" onClick={clearLotFilters}>Limpiar filtros</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input !h-8 text-xs min-w-40 flex-1" value={lotSearch} onChange={(e) => setLotSearch(e.target.value)} placeholder="Nro. lote o calle" />
              <select className="input !h-8 text-xs" value={lotStreetFilter} onChange={(e) => setLotStreetFilter(e.target.value)}>
                <option value="">Calle: todas</option>
                {streets.map((street) => <option key={street.id} value={street.id}>{street.name}</option>)}
              </select>
              <select className="input !h-8 text-xs" value={lotTypeFilter} onChange={(e) => setLotTypeFilter(e.target.value)}>
                <option value="">Tipo: todos</option>
                {lotTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>
          {editingLot && (
            <div className="mb-3 rounded-md border bg-slate-50 p-3" style={{ borderColor: '#DCE4EE' }}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h5 className="text-sm font-semibold">Editar lote {editingLot.code}</h5>
                <button className="btn-neutral !h-7 !px-2 text-xs" onClick={() => setEditingLot(null)}>Cerrar</button>
              </div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                <Field label="Nro. Lote"><input className="input !h-9" value={editingLot.code} onChange={(e) => setEditingLot({ ...editingLot, code: e.target.value })} /></Field>
                <Field label="Calle">
                  <select className="input !h-9" value={editingLot.streetId || ''} onChange={(e) => setEditingLot({ ...editingLot, streetId: Number(e.target.value) })}>
                    <option value="">Selecciona...</option>
                    {streets.map((street) => <option key={street.id} value={street.id}>{street.name}</option>)}
                  </select>
                </Field>
                <Field label="Tipo"><input className="input !h-9" value={editingLot.type} onChange={(e) => setEditingLot({ ...editingLot, type: e.target.value })} /></Field>
                <Field label="Dimension m2"><input className="input !h-9" type="number" value={editingLot.areaM2 || ''} onChange={(e) => setEditingLot({ ...editingLot, areaM2: Number(e.target.value) })} /></Field>
                <Field label="Precio US$/m2"><input className="input !h-9" type="number" value={editingLot.price || ''} onChange={(e) => setEditingLot({ ...editingLot, price: Number(e.target.value) })} /></Field>
                <Field label="Precio Venta US$"><input className="input !h-9" type="number" value={editingLot.salePrice || ''} onChange={(e) => setEditingLot({ ...editingLot, salePrice: Number(e.target.value) })} /></Field>
                <Field label="Precio Final US$"><input className="input !h-9" type="number" value={editingLot.finalPrice || ''} onChange={(e) => setEditingLot({ ...editingLot, finalPrice: Number(e.target.value) })} /></Field>
                <div className="flex items-end gap-2">
                  <button className="btn-primary !h-9 flex-1" onClick={saveEditedLot}>Guardar</button>
                </div>
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border" style={{ borderColor: '#E5E7EB' }}>
            <table className="min-w-[920px] w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="th-base">Nro. Lote</th>
                  <th className="th-base">Direccion</th>
                  <th className="th-base">Tipo</th>
                  <th className="th-base">Dimension</th>
                  <th className="th-base" style={{ textAlign: 'right' }}>Precio US$/m2</th>
                  <th className="th-base" style={{ textAlign: 'right' }}>Precio Venta US$</th>
                  <th className="th-base" style={{ textAlign: 'right' }}>Precio Final US$</th>
                  <th className="th-base" style={{ textAlign: 'right' }}>Accion</th>
                </tr>
              </thead>
              <tbody>
                {filteredLots.slice(lotPage * LIST_PAGE_SIZE, lotPage * LIST_PAGE_SIZE + LIST_PAGE_SIZE).map((lot: any) => {
                  const street = streetForLot(lot);
                  const pricePerM2 = Number(lot.price || 0);
                  return (
                    <tr key={lot.id}>
                      <td className="td-base font-semibold">{lot.code}</td>
                      <td className="td-base">{street?.address || lot.streetAddress || lot.blockAddress || street?.name || lot.streetName || lot.blockName || '-'}</td>
                      <td className="td-base">{lot.type || '-'}</td>
                      <td className="td-base">{Number(lot.areaM2 || 0).toLocaleString('es-PE')} m2</td>
                      <td className="td-base tabular-nums" style={{ textAlign: 'right' }}>{pricePerM2 ? formatUsd(pricePerM2) : '-'}</td>
                      <td className="td-base tabular-nums" style={{ textAlign: 'right' }}>{lot.salePrice ? formatUsd(lot.salePrice) : '-'}</td>
                      <td className="td-base tabular-nums" style={{ textAlign: 'right' }}>{lot.finalPrice ? formatUsd(lot.finalPrice) : '-'}</td>
                      <td className="td-base" style={{ textAlign: 'right' }}>
                        <div className="flex justify-end gap-1.5">
                          <button className="btn-neutral !h-7 !px-2 text-xs shrink-0" onClick={() => startEditLot(lot)}>Editar</button>
                          <button className="btn-danger !h-7 !px-2 text-xs shrink-0" onClick={() => deleteLot(lot)}>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredLots.length === 0 && <tr><td className="td-base text-center text-slate-400" colSpan={8}>Aun no hay lotes con esos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
          {filteredLots.length > LIST_PAGE_SIZE && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2" style={{ borderColor: '#EEF0F2' }}>
              <button className="btn-neutral !h-7 !px-2 text-xs" disabled={lotPage <= 0} onClick={() => setLotPage((v) => Math.max(0, v - 1))}>Anterior</button>
              <span className="text-xs" style={{ color: '#6B7280' }}>Pagina {Math.min(lotPage, Math.floor((filteredLots.length - 1) / LIST_PAGE_SIZE)) + 1} de {Math.max(1, Math.ceil(filteredLots.length / LIST_PAGE_SIZE))}</span>
              <button className="btn-neutral !h-7 !px-2 text-xs" disabled={lotPage >= Math.max(0, Math.ceil(filteredLots.length / LIST_PAGE_SIZE) - 1)} onClick={() => setLotPage((v) => v + 1)}>Siguiente</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

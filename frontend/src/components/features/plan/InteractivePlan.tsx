'use client';
// src/components/interactive-plan/InteractivePlan.tsx
import { useEffect, useRef, useState } from 'react';
import { FiLock, FiRotateCcw, FiUnlock } from 'react-icons/fi';
import { Block, Lot, LotStatus, Point, LOT_STATUS_COLOR, LOT_STATUS_LABEL, formatMoney, pointsToString } from '@/lib/types';

interface Props {
  imageUrl?: string | null;
  blocks: Block[];
  lots: Lot[];
  imageW: number;
  imageH: number;
  onBlockClick?: (block: Block) => void;
  onLotClick?: (lot: Lot) => void;
  highlightBlockId?: number | null;
  selectedLotId?: number | null;
  interactive?: boolean;
  lotStatusColors?: Partial<Record<LotStatus, string>>;
  lotStatusLabels?: Partial<Record<LotStatus, string>>;
  tooltipMode?: 'full' | 'status';
}

const SVG_W = 1000;
const SVG_H = 800;
const VIEW_ASPECT = SVG_W / SVG_H;

const BLOCK_COLORS = [
  { fill: 'rgba(20,184,166,0.18)', stroke: '#0F766E', label: '#115E59' },
  { fill: 'rgba(244,114,182,0.18)', stroke: '#BE185D', label: '#9D174D' },
  { fill: 'rgba(132,204,22,0.18)', stroke: '#4D7C0F', label: '#3F6212' },
  { fill: 'rgba(6,182,212,0.18)', stroke: '#0E7490', label: '#155E75' },
  { fill: 'rgba(249,115,22,0.16)', stroke: '#C2410C', label: '#9A3412' },
  { fill: 'rgba(100,116,139,0.14)', stroke: '#475569', label: '#334155' },
];

function blockTone(index: number, highlighted: boolean) {
  if (highlighted) return { fill: '#A9C9FB', stroke: '#1877F2', label: '#1259C4' };
  return BLOCK_COLORS[index % BLOCK_COLORS.length];
}

export default function InteractivePlan({
  imageUrl, blocks, lots, imageW, imageH,
  onBlockClick, onLotClick, highlightBlockId, selectedLotId, interactive = true,
  lotStatusColors, lotStatusLabels, tooltipMode = 'full',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [t, setT] = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<{ lot: Lot; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<null | { sx: number; sy: number; ox: number; oy: number }>(null);
  const [viewLocked, setViewLocked] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  const imgScale = Math.min(SVG_W / imageW, SVG_H / imageH);
  const imgW = imageW * imgScale;
  const imgH = imageH * imgScale;
  const imgOffsetX = (SVG_W - imgW) / 2;
  const imgOffsetY = (SVG_H - imgH) / 2;

  function applyViewBox(x: number, y: number, w: number) {
    const next = SVG_W / w;
    setScale(next);
    setT({ x: -x * next, y: -y * next });
  }

  function imageViewBox() {
    if (!imageUrl || !imageW || !imageH) return { x: 0, y: 0, w: SVG_W };
    const padding = 18;
    let x = imgOffsetX - padding;
    let y = imgOffsetY - padding;
    let w = imgW + padding * 2;
    let h = imgH + padding * 2;
    const aspect = w / h;

    if (aspect > VIEW_ASPECT) {
      h = w / VIEW_ASPECT;
      y = imgOffsetY + imgH / 2 - h / 2;
    } else {
      w = h * VIEW_ASPECT;
      x = imgOffsetX + imgW / 2 - w / 2;
    }

    return { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(SVG_W, w) };
  }

  function resetView() {
    const fit = imageViewBox();
    applyViewBox(fit.x, fit.y, fit.w);
  }

  // El plano queda fijo (sin panning): su vista solo cambia con los botones + / − .
  // Si no hay imagen asignada todavía, dejamos el SVG centrado completo.
  useEffect(() => {
    resetView();
    window.addEventListener('resize', resetView);
    return () => window.removeEventListener('resize', resetView);
  }, [imageUrl, imageW, imageH]);

  // Zoom centrado en el plano (usado solo por los botones + / -).
  function zoomAt(clientX: number, clientY: number, factor: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const next = Math.min(6, Math.max(0.4, scale * factor));
    const nx = px - ((px - t.x) / scale) * next;
    const ny = py - ((py - t.y) / scale) * next;
    setScale(next);
    setT({ x: nx, y: ny });
  }

  function onWheel(e: any) {
    e.preventDefault?.();
    if (viewLocked) return;
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1 / 1.15 : 1.15);
  }

  function onPointerDown(e: any) {
    if (viewLocked) return;
    if (e.target && e.target.closest?.('button')) return;
    setDrag({ sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: any) {
    if (drag) setT({ x: drag.ox + (e.clientX - drag.sx), y: drag.oy + (e.clientY - drag.sy) });
  }
  function onPointerUp() { setDrag(null); }
  function onPointerLeave() { setDrag(null); setTooltip(null); }

  function zoomCentered(factor: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cw = rect.width || 0;
    const ch = rect.height || 0;
    const px = cw / 2;
    const py = ch / 2;
    const next = Math.min(6, Math.max(0.4, scale * factor));
    const nx = px - ((px - t.x) / scale) * next;
    const ny = py - ((py - t.y) / scale) * next;
    setScale(next);
    setT({ x: nx, y: ny });
  }

  const centroid = (pts: Point[]) =>
    pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });

  const visualStatus = (lot: Lot): LotStatus => {
    if (lot.sellingStage === 'vendido' || lot.status === 'vendido') return 'vendido';
    if (lot.sellingStage === 'separado') return 'reservado';
    return lot.status;
  };
  const statusColor = (status: LotStatus) => lotStatusColors?.[status] || LOT_STATUS_COLOR[status];
  const statusLabel = (status: LotStatus) => lotStatusLabels?.[status] || LOT_STATUS_LABEL[status];

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden rounded-lg select-none touch-none"
      style={{ aspectRatio: `${SVG_W}/${SVG_H}`, background: '#EEEFF1' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onMouseLeave={() => setTooltip(null)}
    >
      <svg
        ref={svgRef}
        className={`absolute inset-0 h-full w-full ${viewLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        viewBox={`${-t.x / scale} ${-t.y / scale} ${SVG_W / scale} ${SVG_H / scale}`}
      >
          {imageUrl && (
            <image href={imageUrl} x={imgOffsetX} y={imgOffsetY} width={imgW} height={imgH} preserveAspectRatio="xMidYMid meet" />
          )}

          {blocks.map((b, index) => {
            const hi = highlightBlockId === b.id;
            const tone = blockTone(index, hi);
            return (
              <polygon
                key={`b-${b.id}`}
                points={pointsToString(b.points)}
                fill={tone.fill}
                stroke={tone.stroke}
                strokeWidth={hi ? 3 : 1.2}
                style={{ cursor: interactive ? 'pointer' : 'default' }}
                onClick={(e) => { e.stopPropagation(); if (interactive && onBlockClick) onBlockClick(b); }}
              />
            );
          })}
          {blocks.map((b, index) => {
            const c = centroid(b.points);
            const tone = blockTone(index, highlightBlockId === b.id);
            return (
              <text key={`bl-${b.id}`} x={c.x} y={c.y - 5} fontSize="26" fontWeight="800" textAnchor="middle" fill={tone.label} opacity={0.95} stroke="#fff" strokeWidth={4} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                {b.name}
              </text>
            );
          })}
          {lots.map((lot) => {
            const sold = lot.sellingStage === 'vendido' || lot.status === 'vendido';
            const locked = lot.sellingStage === 'separado' && !sold;
            const currentStatus = visualStatus(lot);
            const color = statusColor(currentStatus);
            const sel = selectedLotId === lot.id;
            const dim = highlightBlockId != null && lot.blockId !== highlightBlockId;
            return (
              <g key={`l-${lot.id}`} opacity={dim ? 0.15 : 1}>
                <polygon
                  points={pointsToString(lot.points)}
                  fill={color} fillOpacity={locked ? 0.88 : sold ? 0.72 : 0.6}
                  stroke={locked ? '#171717' : (sold ? '#000' : color)}
                  strokeWidth={locked || sold ? 2.4 : sel ? 3 : 1.4}
                  style={{ cursor: interactive ? 'pointer' : 'default' }}
                  onMouseEnter={(e) => { setTooltip({ lot, x: lot.points[0].x, y: lot.points[0].y }); ((e.currentTarget) as any).style.fillOpacity = '0.85'; }}
                  onMouseLeave={(e) => { setTooltip(null); ((e.currentTarget) as any).style.fillOpacity = locked ? '0.88' : sold ? '0.72' : '0.6'; }}
                  onClick={(e) => { e.stopPropagation(); if (interactive && onLotClick) onLotClick(lot); }}
                />
                {(() => { const c = centroid(lot.points); return (
                  <g style={{ pointerEvents: 'none' }}>
                    {locked && (
                      <g transform={`translate(${c.x - 7}, ${c.y - 13}) scale(0.583)`} stroke="#171717" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </g>
                    )}
                    {sold && (
                      <g transform={`translate(${c.x - 7}, ${c.y - 15}) scale(0.583)`} stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </g>
                    )}
                    <text x={c.x} y={c.y + 4} fontSize="12" fontWeight="600" textAnchor="middle" fill="#0f172a">{lot.code}</text>
                  </g>
                ); })()}
              </g>
            );
          })}
          {tooltip && tooltipMode === 'status' && (
            <g pointerEvents="none">
              <rect x={tooltip.lot.points[0].x} y={tooltip.lot.points[0].y - 54} width={126} height={48} rx={8} fill="#0f172a" fillOpacity={0.96} />
              <text x={tooltip.lot.points[0].x + 10} y={tooltip.lot.points[0].y - 34} fontSize="13" fontWeight="700" fill="#fff">{tooltip.lot.code}</text>
              <text x={tooltip.lot.points[0].x + 10} y={tooltip.lot.points[0].y - 16} fontSize="11" fontWeight="700" fill={statusColor(visualStatus(tooltip.lot))}>{statusLabel(visualStatus(tooltip.lot))}</text>
            </g>
          )}
          {tooltip && tooltipMode === 'full' && (
            <g pointerEvents="none">
              <rect x={tooltip.lot.points[0].x} y={tooltip.lot.points[0].y - 94} width={190} height={92} rx={8} fill="#0f172a" fillOpacity={0.96} />
              <text x={tooltip.lot.points[0].x + 10} y={tooltip.lot.points[0].y - 74} fontSize="13" fontWeight="700" fill="#fff">{tooltip.lot.code}</text>
              <text x={tooltip.lot.points[0].x + 10} y={tooltip.lot.points[0].y - 56} fontSize="11" fill="#cbd5e1">Área: {tooltip.lot.areaM2} m² · Manz {tooltip.lot.blockId ?? '-'}</text>
              <text x={tooltip.lot.points[0].x + 10} y={tooltip.lot.points[0].y - 40} fontSize="11" fill="#cbd5e1">{formatMoney(tooltip.lot.price)}</text>
              <text x={tooltip.lot.points[0].x + 10} y={tooltip.lot.points[0].y - 24} fontSize="11" fontWeight="700" fill={statusColor(visualStatus(tooltip.lot))}>{statusLabel(visualStatus(tooltip.lot))}</text>
            </g>
          )}
        </svg>

        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
          <button type="button" onClick={() => zoomCentered(1.25)} className="bg-white/90 hover:bg-white rounded-lg w-9 h-9 text-slate-700 shadow font-bold text-lg" title="Acercar (+)">+</button>
          <button type="button" onClick={() => zoomCentered(0.8)} className="bg-white/90 hover:bg-white rounded-lg w-9 h-9 text-slate-700 shadow font-bold text-lg" title="Alejar (-)">-</button>
          <button
            type="button"
            onClick={() => setViewLocked((value) => !value)}
            className={`grid h-9 w-9 place-items-center rounded-lg shadow transition-colors ${viewLocked ? 'bg-[#1877F2] text-white' : 'bg-white/90 text-slate-700 hover:bg-white'}`}
            title={viewLocked ? 'Vista fija activada' : 'Liberar movimiento del plano'}
          >
            {viewLocked ? <FiLock /> : <FiUnlock />}
          </button>
          <button type="button" onClick={resetView} className="grid h-9 w-9 place-items-center rounded-lg bg-white/90 text-slate-700 shadow hover:bg-white" title="Restablecer vista"><FiRotateCcw /></button>
        </div>
      </div>
    );
  }

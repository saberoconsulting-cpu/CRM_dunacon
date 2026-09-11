'use client';
// src/components/ui.tsx
// Componentes UI reutilizables: estados, tarjetas, modales, toast
import { ReactNode, useState as useReactState } from 'react';
import { LotStatus, LOT_STATUS_LABEL, LOT_STATUS_COLOR } from '@/lib/types';

// Badge de estado de lote con color
export function StatusBadge({ status }: { status: string }) {
  const label = (LOT_STATUS_LABEL as any)[status] || status;
  const color = (LOT_STATUS_COLOR as any)[status] || '#64748b';
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: color + '22', color }}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// Leyenda de colores de estados
export function LegendChips() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {(['disponible', 'reservado', 'adelanto', 'primera_cuota', 'vendido'] as LotStatus[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LOT_STATUS_COLOR[s] }} />
          {LOT_STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

// Tarjeta de estadística con acento superior de marca
export function StatCard({ label, value, color = '#171717', delta, deltaUp, date }: {
  label: string; value: ReactNode; color?: string; delta?: string; deltaUp?: boolean; date?: string;
}) {
  return (
    <div className="card card-kpi">
      <div className="flex items-center justify-between">
        <span className="font-medium" style={{ fontSize: 12, color: '#6B7280' }}>{label}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#E30620]" />
      </div>
      <div className="mt-1.5 font-bold" style={{ fontSize: 24, color }}>{value}</div>
      {(delta || date) && (
        <div className="flex items-center gap-2 mt-1">
          {delta && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: deltaUp ? '#257849' : '#6B7280' }}>
              {deltaUp ? '▲' : '●'} {delta}
            </span>
          )}
          {date && <span className="text-[11px]" style={{ color: '#9AA1AB' }}>{date}</span>}
        </div>
      )}
    </div>
  );
}

// Modal genérico
export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string;
}) {
  const [pos, setPos] = useReactState<{ x: number; y: number }>({ x: -1, y: -1 });
  const [min, setMin] = useReactState(false);
  if (!open) return null;

  const isCenter = pos.x < 0;
  // Respetar el ancho solicitado por cada pantalla (siempre con tope de viewport).
  const W: Record<string, number> = {
    'max-w-xs': 320, 'max-w-sm': 384, 'max-w-md': 448, 'max-w-lg': 512,
    'max-w-xl': 576, 'max-w-2xl': 672, 'max-w-3xl': 768, 'max-w-4xl': 896, 'max-w-5xl': 1024,
    'max-w-6xl': 1152, 'max-w-7xl': 1280,
  };
  const wants = (typeof width === 'string' && W[width]) ? W[width] : 512;
  const winW = wants;

  const barRow = (
    <div
      className={`flex items-center justify-between select-none cursor-move text-white ${min ? 'rounded-lg' : 'rounded-t-lg'}`}
      style={{ height: 40, padding: '0 6px 0 16px', background: 'linear-gradient(180deg,#1f2937,#0f172a)' }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        const sx = e.clientX, sy = e.clientY;
        const el = (e.currentTarget.parentElement || e.currentTarget) as HTMLElement;
        const base = el.getBoundingClientRect();
        const sX = pos.x >= 0 ? pos.x : base.left;
        const sY = pos.y >= 0 ? pos.y : base.top;
        const mv = (ev: PointerEvent) => setPos({ x: Math.max(0, sX + ev.clientX - sx), y: Math.max(0, sY + ev.clientY - sy) });
        const up = () => { window.removeEventListener('pointermove', mv as any); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv as any);
        window.addEventListener('pointerup', up);
      }}
    >
      <span className="truncate text-sm font-semibold">{title}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setMin(true)} aria-label="Minimizar"
          className="grid place-items-center rounded-md" style={{ width: 30, height: 26, background: 'rgba(255,255,255,.14)' }}>
          <svg width="12" height="2"><path d="M1 1h10" stroke="white" strokeWidth="1.6" /></svg>
        </button>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="grid place-items-center rounded-md hover:bg-red-500" style={{ width: 30, height: 26, background: 'rgba(255,255,255,.14)' }}>
          <svg width="11" height="11"><path d="M1 1l9 9M10 1l-9 9" stroke="white" strokeWidth="1.6" /></svg>
        </button>
      </div>
    </div>
  );

  if (min) {
    // Minimizado: pequeña pestaña anclada abajo-izquierda (como barra de tareas)
    return (
      <div className="fixed bottom-2 left-2 z-[80] w-max cursor-pointer overflow-hidden rounded-lg shadow-xl" onClick={() => setMin(false)}>
        {barRow}
      </div>
    );
  }

  const spread = isCenter
    ? { width: winW, maxWidth: '94vw' }
    : { width: winW, maxWidth: '96vw', left: pos.x, top: pos.y };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`absolute flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-lg bg-white shadow-2xl ${isCenter ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : ''}`}
        style={spread}
      >
        {barRow}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// Toast global simple
let toastFn: (msg: string, type?: 'ok' | 'err') => void = () => {};
export function toast(msg: string, type: 'ok' | 'err' = 'ok') { toastFn(msg, type); }

export function Toaster() {
  const [items, setItems] = useReactState<{ id: number; msg: string; type: 'ok' | 'err' }[]>([]);
  toastFn = (msg, type = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 3500);
  };
  return (
    <div className="fixed top-4 right-4 z-[60] space-y-2">
      {items.map((t) => (
        <div key={t.id} className={`toast-in px-4 py-2 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === 'ok' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// Campo de formulario reutilizable
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

// Tabla simple (envoltorio)
export function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-10 text-slate-400 text-sm">{text}</div>;
}

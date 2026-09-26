'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { FiChevronDown } from 'react-icons/fi';

export type SelectOption = { value: string | number; label: string; hint?: string };

export function Select({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => String(o.value) === String(value));

  const reposition = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 4;
    const below = window.innerHeight - rect.bottom - gap - 12;
    const above = rect.top - gap - 12;
    const openUp = below < 160 && above > below;
    const maxHeight = Math.max(140, Math.min(288, openUp ? above : below));
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight,
      ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
  };

  // Se mide ANTES del primer pintado: si el menu se renderizara sin `position`
  // (menuStyle null) apareceria en el flujo normal durante un frame, expandiendo
  // el contenedor con scroll del modal y empujando el contenido hacia abajo.
  // Eso era el salto que solo ocurria la primera vez que se abria un select.
  useLayoutEffect(() => {
    if (!open) return undefined;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  // Al cerrar se limpia la medida para que la proxima apertura vuelva a medir.
  useEffect(() => {
    if (!open) setMenuStyle(null);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative select-none ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="select-trigger flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-[#D1D5DB] bg-white px-3 text-left text-sm"
        style={{ boxShadow: 'inset 0 1px 2px rgba(15,23,42,.02), 0 1px 2px rgba(15,23,42,.02)' }}
      >
        <span className="truncate text-[#171717]">{current ? current.label : ''}</span>
        <FiChevronDown className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menuStyle && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="z-[70] overflow-auto rounded-xl border border-[#D1D5DB] bg-white py-1 shadow-xl"
            style={menuStyle}
          >
            {options.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => { onChange(String(o.value)); setOpen(false); }}
                className={`block w-full px-3 py-2 text-left ${String(o.value) === String(value) ? 'bg-[#EFF6FF] font-semibold text-[#1877F2]' : 'text-[#171717] hover:bg-slate-50'}`}
              >
                {o.hint ? (
                  <span className="block min-w-0">
                    <span className="block truncate text-[11px] font-bold leading-tight tabular-nums text-slate-500">{o.hint}</span>
                    <span className="block truncate text-[13px] leading-snug">{o.label}</span>
                  </span>
                ) : (
                  <span className="block truncate text-[13px] leading-snug">{o.label}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
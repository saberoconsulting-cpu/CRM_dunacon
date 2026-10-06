'use client';
// src/components/ui/StatusPillSelect.tsx
// Selector de ESTADO con apariencia de "pill" y dropdown propio (portal).
// Motivo: el <select> nativo muestra el desplegable con el estilo del sistema
// operativo y su flecha por defecto, lo que rompe la identidad visual de la app.
// Este componente replica el patron del componente Select (portal + medicion
// antes del primer pintado) pero con trigger tipo pill y dot de color por estado.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { FiChevronDown } from 'react-icons/fi';
import type { IconType } from 'react-icons';

export type StatusPillOption = {
  value: string;
  label: string;
  /** Color del texto y del dot. */
  color: string;
  /** Fondo del pill cuando el estado esta seleccionado. */
  background: string;
  /** Borde del pill cuando el estado esta seleccionado. */
  border: string;
  icon?: IconType;
};

export function StatusPillSelect({
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  title,
}: {
  value: string;
  onChange: (value: string) => void;
  options: StatusPillOption[];
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) || options[0];

  // El menu se pinta en un portal a document.body (mismo motivo que el componente
  // Select): dentro de tablas con overflow el desplegable quedaria recortado.
  useEffect(() => { setMounted(true); }, []);

  const reposition = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 4;
    const below = window.innerHeight - rect.bottom - gap - 12;
    const above = rect.top - gap - 12;
    const openUp = below < 160 && above > below;
    const maxHeight = Math.max(140, Math.min(288, openUp ? above : below));
    const width = Math.max(rect.width, 168);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setMenuStyle({
      position: 'fixed',
      left,
      width,
      maxHeight,
      ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
  };

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

  useEffect(() => {
    if (!open) setMenuStyle(null);
  }, [open]);

  const CurrentIcon = current?.icon;

  return (
    <div ref={rootRef} className={`relative inline-block select-none ${className}`}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(!open)}
        className={`mx-auto flex h-7 w-full max-w-[150px] cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2 text-[11px] font-bold transition-shadow outline-none sm:text-xs ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:brightness-[0.98]'}`}
        style={{
          background: current?.background,
          color: current?.color,
          borderColor: current?.border,
          boxShadow: open ? '0 0 0 3px rgba(24,119,242,.12)' : 'none',
        }}
      >
        {CurrentIcon ? (
          <CurrentIcon className="shrink-0" style={{ fontSize: 12 }} />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: current?.color }} />
        )}
        <span className="truncate">{current?.label}</span>
        <FiChevronDown className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ fontSize: 12 }} />
      </button>

      {open && mounted && menuStyle && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 30000 }} onClick={() => setOpen(false)} />
          <div
            className="overflow-auto rounded-xl border border-[#D1D5DB] bg-white py-1 shadow-xl"
            style={{ ...menuStyle, zIndex: 30010 }}
            role="listbox"
          >
            {options.map((option) => {
              const active = option.value === value;
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { onChange(option.value); setOpen(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] ${active ? 'font-semibold' : 'hover:bg-slate-50'}`}
                  style={active ? { background: option.background, color: option.color } : undefined}
                >
                  {OptionIcon ? (
                    <OptionIcon className="shrink-0" style={{ fontSize: 13, color: option.color }} />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: option.color }} />
                  )}
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

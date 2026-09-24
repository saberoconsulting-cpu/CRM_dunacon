'use client';
import { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';

export type SelectOption = { value: string | number; label: string };

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
  const current = options.find((o) => String(o.value) === String(value));
  return (
    <div className={`relative select-none ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-[#D1D5DB] bg-white px-3 text-left text-sm"
        style={{ boxShadow: 'inset 0 1px 2px rgba(15,23,42,.02), 0 1px 2px rgba(15,23,42,.02)' }}
      >
        <span className="truncate text-[#171717]">{current ? current.label : ''}</span>
        <FiChevronDown className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-50 top-full mt-1 max-h-64 overflow-auto rounded-xl border border-[#D1D5DB] bg-white py-1 shadow-xl">
            {options.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => { onChange(String(o.value)); setOpen(false); }}
                className={`block w-full px-3 py-2 text-left text-sm ${String(o.value) === String(value) ? 'bg-[#EFF6FF] font-semibold text-[#1877F2]' : 'text-[#171717] hover:bg-slate-50'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
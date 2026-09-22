'use client';
import { useCallback, useEffect, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiDownload, FiImage, FiPaperclip, FiX } from 'react-icons/fi';

export type EvidenceItem = { label: string; url: string };

export function paymentEvidence(pay: any): EvidenceItem[] {
  if (!pay) return [];
  return [
    { label: 'Operación bancaria', url: pay.approvalDocumentUrl },
    { label: 'Boleta', url: pay.receiptDocumentUrl },
    { label: 'Comprobante', url: pay.voucherUrl },
  ].filter((item): item is EvidenceItem => !!item.url);
}

export function EvidenceButton({
  pay,
  compact = false,
  className = 'row-action',
}: {
  pay?: any;
  compact?: boolean;
  className?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const items = paymentEvidence(pay);

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) => setOpenIndex((current) => {
      if (current == null || !items.length) return current;
      return (current + delta + items.length) % items.length;
    }),
    [items.length],
  );

  useEffect(() => {
    if (openIndex == null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIndex, close, step]);

  if (!items.length) return <span className="text-slate-300">—</span>;

  const current = openIndex == null ? null : items[openIndex];

  return (
    <>
      <button
        type="button"
        className={`${className} ${compact ? '!px-2' : ''}`}
        onClick={() => setOpenIndex(0)}
        title={items.map((item) => item.label).join(' · ')}
      >
        <FiPaperclip />
        {compact ? items.length : `Evidencia (${items.length})`}
      </button>
      {current && (
        <EvidenceLightbox
          items={items}
          index={Number(openIndex)}
          paidAt={pay?.paidAt || null}
          onClose={close}
          onStep={step}
          onSelect={setOpenIndex}
        />
      )}
    </>
  );
}


function EvidenceLightbox({
  items,
  index,
  paidAt,
  onClose,
  onStep,
  onSelect,
}: {
  items: EvidenceItem[];
  index: number;
  paidAt: string | null;
  onClose: () => void;
  onStep: (delta: number) => void;
  onSelect: (index: number) => void;
}) {
  const current = items[index] || items[0];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: '#E5E7EB' }}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ background: '#EEF5FF', color: '#1259C4' }}>
              <FiImage />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: '#0F172A' }}>{current.label}</p>
              <p className="text-[11px]" style={{ color: '#64748B' }}>
                Evidencia {index + 1} de {items.length}{paidAt ? ` · pagada el ${String(paidAt).slice(0, 10)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={current.url}
              download
              target="_blank"
              rel="noreferrer"
              className="grid h-9 w-9 place-items-center rounded-md border text-slate-500 transition-colors hover:bg-slate-50"
              style={{ borderColor: '#E5E7EB' }}
              title="Abrir / descargar"
            >
              <FiDownload />
            </a>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-md border text-slate-500 transition-colors hover:bg-slate-50"
              style={{ borderColor: '#E5E7EB' }}
              onClick={onClose}
              aria-label="Cerrar evidencia"
              title="Cerrar"
            >
              <FiX />
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-3">
          <img
            src={current.url}
            alt={current.label}
            className="max-h-[68vh] w-auto max-w-full rounded-lg border object-contain shadow-sm"
            style={{ borderColor: '#E5E7EB' }}
          />
          {items.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-slate-600 shadow-md transition-colors hover:text-[#1259C4]"
                onClick={() => onStep(-1)}
                aria-label="Evidencia anterior"
              >
                <FiChevronLeft />
              </button>
              <button
                type="button"
                className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-slate-600 shadow-md transition-colors hover:text-[#1259C4]"
                onClick={() => onStep(1)}
                aria-label="Evidencia siguiente"
              >
                <FiChevronRight />
              </button>
            </>
          )}
        </div>

        {items.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3" style={{ borderColor: '#E5E7EB' }}>
            {items.map((item, thumbIndex) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onSelect(thumbIndex)}
                className="h-14 w-14 overflow-hidden rounded-md border transition-all"
                style={{
                  borderColor: thumbIndex === index ? '#1259C4' : '#E5E7EB',
                  boxShadow: thumbIndex === index ? '0 0 0 2px rgba(18,89,196,.18)' : undefined,
                }}
                title={item.label}
              >
                <img src={item.url} alt={item.label} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

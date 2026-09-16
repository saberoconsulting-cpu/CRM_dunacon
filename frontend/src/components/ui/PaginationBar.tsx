'use client';
// Barra de paginación reutilizable para las pantallas de listado
import { FC } from 'react';
import { FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight } from 'react-icons/fi';

interface Props {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  setPage: (n: number) => void;
  setLimit?: (n: number) => void;
  label?: string;
  compact?: boolean;
}

export const PaginationBar: FC<Props> = ({ page, totalPages, total, limit, setPage, setLimit, label, compact = false }) => {
  if (!total) return null;
  const safeTotalPages = Math.max(1, totalPages);
  const pages: Array<number | 'start-gap' | 'end-gap'> = [];
  const add = (item: number | 'start-gap' | 'end-gap') => {
    if (!pages.includes(item)) pages.push(item);
  };
  // Mantiene visibles los extremos y agrega contexto alrededor de la página actual.
  add(1);
  if (page > 3) add('start-gap');
  for (let i = Math.max(2, page - 1); i <= Math.min(safeTotalPages - 1, page + 1); i++) add(i);
  if (page < safeTotalPages - 2) add('end-gap');
  if (safeTotalPages > 1) add(safeTotalPages);

  const currentPage = Math.min(Math.max(page, 1), safeTotalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const to = Math.min(currentPage * limit, total);

  return (
    <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#EDEEF0' }}>
      <p className="text-xs text-slate-500">{compact ? 'Mostrando ' : ''}<b>{from}–{to}</b> de {total} {compact ? (label || 'resultados').toLowerCase() : (label || 'Resultados')}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {!compact && setLimit && (
          <select aria-label="Resultados por página" className="input !h-8 !w-auto !text-xs" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
            <option value={10}>10 / página</option>
            <option value={20}>20 / página</option>
            <option value={50}>50 / página</option>
            <option value={100}>100 / página</option>
          </select>
        )}
        {!compact && <button type="button" aria-label="Primera página" title="Primera página" className="btn-neutral !h-8 !w-8 !p-0" disabled={currentPage <= 1} onClick={() => setPage(1)}><FiChevronsLeft /></button>}
        <button type="button" aria-label="Página anterior" title="Página anterior" className="btn-neutral !h-8 !text-xs" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{compact ? 'Anterior' : <FiChevronLeft />}</button>
        {pages.map((item) => (
          item === 'start-gap' || item === 'end-gap'
            ? <span key={item} className="px-1 text-xs text-slate-400" aria-hidden="true">…</span>
            : <button key={item} type="button" aria-label={`Página ${item}`} aria-current={item === currentPage ? 'page' : undefined} className={`!h-8 !min-w-8 !px-2 !text-xs rounded-lg ${item === currentPage ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}`} style={item === currentPage ? { background: '#1877F2' } : undefined} onClick={() => setPage(item)}>{item}</button>
        ))}
        <button type="button" aria-label="Página siguiente" title="Página siguiente" className="btn-neutral !h-8 !text-xs" disabled={currentPage >= safeTotalPages} onClick={() => setPage(currentPage + 1)}>{compact ? 'Siguiente' : <FiChevronRight />}</button>
        {!compact && <button type="button" aria-label="Última página" title="Última página" className="btn-neutral !h-8 !w-8 !p-0" disabled={currentPage >= safeTotalPages} onClick={() => setPage(safeTotalPages)}><FiChevronsRight /></button>}
      </div>
    </div>
  );
};

'use client';
// Barra de paginación reutilizable para las pantallas de listado
import { FC } from 'react';

interface Props {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  setPage: (n: number) => void;
  setLimit?: (n: number) => void;
  label?: string;
}

export const PaginationBar: FC<Props> = ({ page, totalPages, total, limit, setPage, setLimit, label }) => {
  if (!total) return null;
  // Ventana compacta de páginas: 1 2 3 … N
  const nums: number[] = [];
  const push = (n: number) => { if (!nums.includes(n) && n >= 1 && n <= Math.max(1, totalPages)) nums.push(n); };
  push(1);
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) push(i);
  if (totalPages > 1) push(totalPages);

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t" style={{ borderColor: '#EDEEF0' }}>
      <p className="text-xs text-slate-500">{label || 'Resultados'}: <b>{from}–{to}</b> de {total}</p>
      <div className="flex items-center gap-2">
        {setLimit && (
          <select className="input !w-auto !h-8 !text-xs" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
            <option value={10}>10 / página</option>
            <option value={20}>20 / página</option>
            <option value={50}>50 / página</option>
            <option value={100}>100 / página</option>
          </select>
        )}
        <button type="button" className="btn-neutral !h-8 !text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Anterior</button>
        {nums.map((n) => (
          <button key={n} type="button" className={`!h-8 !min-w-8 !px-2 !text-xs rounded-lg ${n === page ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}`} style={n === page ? { background: '#E30620' } : undefined} onClick={() => setPage(n)}>{n}</button>
        ))}
        <button type="button" className="btn-neutral !h-8 !text-xs" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Siguiente ›</button>
      </div>
    </div>
  );
};

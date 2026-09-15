// src/lib/pagination.ts
// Helpers de paginación del frontend (buenas prácticas):
// - Un solo tipo Paginated<T> para todas las listas.
// - Normaliza respuestas legacy (array plano) y nuevas (envolvente).
// - Construye query strings sin params vacíos.

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function normalizePaginated<T>(data: unknown, page: number, limit: number): Paginated<T> {
  if (Array.isArray(data)) {
    const total = data.length;
    return { items: data as T[], total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }
  const d = (data || {}) as Partial<Paginated<T>>;
  const items = Array.isArray(d.items) ? (d.items as T[]) : [];
  const total = Number(d.total ?? items.length) || 0;
  return {
    items,
    total,
    page: Number(d.page ?? page) || page,
    limit: Number(d.limit ?? limit) || limit,
    totalPages: Number(d.totalPages ?? Math.max(1, Math.ceil(total / (Number(d.limit ?? limit) || 1)))) || 1,
  };
}

export function buildQuery(params: Record<string, string | number | undefined | null | ''>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  return q.toString();
}

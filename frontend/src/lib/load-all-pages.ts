type Page<T> = { items: T[]; totalPages: number };

/** Load every page before publishing totals; failures must not produce partial totals. */
export async function loadAllPages<T>(path: string, get: (url: string) => Promise<Page<T> | T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const result = await get(`${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=100`);
    if (Array.isArray(result)) return result;
    rows.push(...result.items);
    if (page >= result.totalPages) return rows;
    if (!result.items.length) throw new Error('No se pudo cargar el listado completo. Vuelve a intentar.');
  }
}

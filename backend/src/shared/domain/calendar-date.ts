/** Serialize a PostgreSQL DATE without turning its calendar day into a timestamp.
 * Raw pg queries may return a Date at server-local midnight; entity queries
 * generally return YYYY-MM-DD strings. This helper is for DATE columns only.
 */
export function calendarDate(value?: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] || null;
}

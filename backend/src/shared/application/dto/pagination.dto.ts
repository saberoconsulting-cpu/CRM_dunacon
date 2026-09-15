// shared/application/dto/pagination.dto.ts
// DTO base de paginación + envolvente estándar para todas las listas paginadas.
// Buenas prácticas: page/limit validados, límite máximo (anti-abuso),
// respuesta uniforme { items, total, page, limit, totalPages }.
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number = DEFAULT_LIMIT;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Normaliza page/limit (protege contra NaN, negativos y límites abusivos). */
export function normalizePagination(
  page?: number,
  limit?: number,
  defaultLimit = DEFAULT_LIMIT,
): { page: number; limit: number; skip: number } {
  const safePage = Math.max(1, Math.floor(Number(page) || DEFAULT_PAGE));
  const safeLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(Number(limit) || defaultLimit)),
  );
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

/** Construye la envolvente uniforme de respuesta paginada. */
export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const safeTotal = Math.max(0, Number(total) || 0);
  return {
    items,
    total: safeTotal,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(safeTotal / limit)),
  };
}

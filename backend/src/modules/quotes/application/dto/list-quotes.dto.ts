// modules/quotes/application/dto/list-quotes.dto.ts
// Query params del listado paginado GET /quotes.
// Buenas prácticas: hereda page/limit validados, whitelists de sort/order
// (evita inyección de ORDER BY) y filtros acotados.
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../../shared/application/dto/pagination.dto';

export const QUOTE_SORT_FIELDS = ['createdAt', 'clientName', 'finalPriceUsd'] as const;
export type QuoteSortField = (typeof QUOTE_SORT_FIELDS)[number];

export class ListQuotesDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lotId?: number;

  /** Búsqueda por cliente o código de lote (LIKE escapado en el service). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['contado', 'credito'])
  paymentMethod?: 'contado' | 'credito';

  @IsOptional()
  @IsIn([...QUOTE_SORT_FIELDS])
  sort?: QuoteSortField = 'createdAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  order?: 'ASC' | 'DESC' | 'asc' | 'desc' = 'DESC';
}

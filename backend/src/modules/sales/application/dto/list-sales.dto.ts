// modules/sales/application/dto/list-sales.dto.ts
// Query params del listado paginado GET /sales.
// Buenas prácticas: hereda page/limit validados, whitelists de sort/order
// (evita inyección de ORDER BY) y filtros acotados.
import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../../shared/application/dto/pagination.dto';

export const SALE_SORT_FIELDS = ['saleDate', 'salePrice', 'createdAt'] as const;
export type SaleSortField = (typeof SALE_SORT_FIELDS)[number];

export class ListSalesDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  agentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /** Búsqueda por código de lote, cliente o agente (ILIKE escapado en el service). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn([...SALE_SORT_FIELDS])
  sort?: SaleSortField = 'saleDate';

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  order?: 'ASC' | 'DESC' | 'asc' | 'desc' = 'DESC';
}

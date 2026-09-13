import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export const CONSTRUCTION_BUDGET_CATEGORIES = [
  'costo_terreno',
  'costo_directo',
  'costo_indirecto',
  'gastos_ventas_admin',
  'gastos_financieros_impuestos',
] as const;

export type ConstructionBudgetCategory = typeof CONSTRUCTION_BUDGET_CATEGORIES[number];

export class CreateConstructionBudgetItemDto {
  @IsNumber()
  projectId!: number;

  @IsOptional()
  @IsNumber()
  parentId?: number | null;

  @IsIn(CONSTRUCTION_BUDGET_CATEGORIES)
  category!: ConstructionBudgetCategory;

  @IsString()
  @MaxLength(80)
  code!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateConstructionBudgetItemDto {
  @IsOptional()
  @IsNumber()
  parentId?: number | null;

  @IsOptional()
  @IsIn(CONSTRUCTION_BUDGET_CATEGORIES)
  category?: ConstructionBudgetCategory;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

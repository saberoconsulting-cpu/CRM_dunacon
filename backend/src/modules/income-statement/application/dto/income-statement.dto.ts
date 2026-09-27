import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export const INCOME_STATEMENT_LINES = [
  'ingreso',
  'costo',
  'ventas_admin',
  'financiero',
  'impuestos',
  'igv',
  'ajuste',
] as const;

export type IncomeStatementLine = typeof INCOME_STATEMENT_LINES[number];

export class CreateIncomeStatementItemDto {
  @IsNumber()
  projectId!: number;

  @IsOptional()
  @IsNumber()
  parentId?: number | null;

  @IsIn(INCOME_STATEMENT_LINES)
  line!: IncomeStatementLine;

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

export class UpdateIncomeStatementItemDto {
  @IsOptional()
  @IsNumber()
  parentId?: number | null;

  @IsOptional()
  @IsIn(INCOME_STATEMENT_LINES)
  line?: IncomeStatementLine;

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

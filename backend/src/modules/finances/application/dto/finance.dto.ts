// modules/finances/application/dto/finance.dto.ts
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateExpenseDto {
  @IsOptional()
  projectId?: number;

  @IsOptional()
  campaignId?: number;

  @IsOptional()
  @IsString()
  expenseClass?: 'inversion' | 'financiamiento' | 'compra_terreno' | 'operacion' | 'costo_indirecto' | 'ventas_admin' | 'impuestos';

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsNotEmpty()
  concept!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  expenseDate?: string;
}

export class CreateAdditionalIncomeDto {
  @IsOptional()
  projectId?: number;

  @IsString()
  @IsNotEmpty()
  concept!: string;

  @IsNumber()
  amount!: number;
}

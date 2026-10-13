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

  @IsOptional()
  @IsString()
  lotLabel?: string;

  @IsOptional()
  @IsString()
  clientLabel?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentCategory?: string;

  @IsOptional()
  @IsString()
  categoryCode?: string;

  @IsOptional()
  @IsString()
  classification?: string;

  @IsOptional()
  @IsString()
  agentName?: string;

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

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  lotLabel?: string;

  @IsOptional()
  @IsString()
  clientLabel?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentCategory?: string;

  @IsOptional()
  @IsString()
  categoryCode?: string;

  @IsOptional()
  @IsString()
  classification?: string;

  @IsOptional()
  @IsString()
  agentName?: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  txnDate?: string;
}

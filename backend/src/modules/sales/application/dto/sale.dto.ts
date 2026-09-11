// modules/sales/application/dto/sale.dto.ts
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateSaleDto {
  @IsNumber()
  projectId!: number;

  @IsNumber()
  lotId!: number;

  @IsOptional()
  clientId?: number;

  @IsNumber()
  @IsNotEmpty()
  agentId!: number;

  @IsOptional()
  @IsNumber()
  salePrice!: number;

  // Comisión inmobiliaria (opcional y configurable por lote)
  appliesCommission?: boolean;

  @IsOptional()
  @IsNumber()
  commissionRate?: number;

  @IsOptional()
  @IsNumber()
  commissionAmount?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  // Fraccionamiento opcional
  @IsOptional()
  @IsNumber()
  totalCuotas?: number;

  @IsOptional()
  @IsNumber()
  cuotaInicial?: number;

  @IsOptional()
  @IsNumber()
  saldoFinanciar?: number;

  @IsOptional()
  @IsNumber()
  valorCuota?: number;

  @IsOptional()
  @IsString()
  interestType?: 'sin_intereses' | 'tea';

  @IsOptional()
  @IsNumber()
  tea?: number;

  @IsOptional()
  @IsString()
  saleDate?: string;

  @IsOptional()
  @IsString()
  conditions?: string;
}
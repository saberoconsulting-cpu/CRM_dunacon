// modules/sales/application/dto/sale.dto.ts
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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
  // Sin decorador, el ValidationPipe (whitelist:true) lo descartaba en
  // silencio antes de llegar al service — la comisión siempre daba 0.
  @IsOptional()
  @IsBoolean()
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

  @IsOptional()
  @IsNumber()
  quoteId?: number;

  // Fraccionamiento opcional
  @IsOptional()
  @IsNumber()
  totalCuotas?: number;

  @IsOptional()
  @IsNumber()
  graceMonths?: number;

  @IsOptional()
  @IsNumber()
  cuotaInicial?: number;

  @IsOptional()
  @IsString()
  initialPaymentMode?: 'contado' | 'partes';

  @IsOptional()
  @IsNumber()
  initialParts?: number;

  @IsOptional()
  @IsNumber()
  reservaAmount?: number;

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

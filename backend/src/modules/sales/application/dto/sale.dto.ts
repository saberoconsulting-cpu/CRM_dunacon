// modules/sales/application/dto/sale.dto.ts
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateSaleDniDto {
  @IsString()
  @Matches(/^\d{8}$/, { message: 'El DNI debe tener 8 digitos.' })
  clientDni!: string;
}

export class CreateSaleDto {
  @IsNumber()
  projectId!: number;

  @IsNumber()
  lotId!: number;

  @IsOptional()
  clientId?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/, { message: 'El DNI debe tener 8 digitos.' })
  clientDni?: string;

  @IsOptional()
  @IsNumber()
  agentId?: number;

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
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de venta debe tener formato AAAA-MM-DD.' })
  @IsDateString({ strict: true }, { message: 'Ingresa una fecha de venta válida.' })
  saleDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de primera cuota debe tener formato AAAA-MM-DD.' })
  @IsDateString({ strict: true }, { message: 'Ingresa una fecha de primera cuota valida.' })
  firstInstallmentDate?: string;

  @IsOptional()
  @IsString()
  conditions?: string;
}

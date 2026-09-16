// modules/quotes/application/dto/quote.dto.ts
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class CreateQuoteDto {
  @IsNumber()
  projectId!: number;

  @IsNumber()
  lotId!: number;

  @IsString()
  @IsNotEmpty()
  clientName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'El correo del cliente no es valido' })
  clientEmail!: string;

  @IsString()
  @Matches(/^\d{9}$/, { message: 'El telefono del cliente debe tener exactamente 9 digitos' })
  clientPhone!: string;

  @IsNumber()
  pricePerM2Usd!: number;

  @IsNumber()
  lotPriceUsd!: number;

  @IsOptional()
  @IsNumber()
  bonoDescuentoUsd?: number;

  @IsOptional()
  @IsNumber()
  bonoEspecialUsd?: number;

  @IsString()
  @IsIn(['contado', 'credito'])
  paymentMethod!: 'contado' | 'credito';

  @IsOptional()
  @IsNumber()
  cuotaInicialUsd?: number;

  @IsOptional()
  @IsNumber()
  totalCuotas?: number;

  @IsOptional()
  @IsNumber()
  graceMonths?: number;

  @IsOptional()
  @IsString()
  @IsIn(['contado', 'partes'])
  initialPaymentMode?: 'contado' | 'partes';

  @IsOptional()
  @IsNumber()
  initialParts?: number;

  @IsOptional()
  @IsString()
  interestType?: 'sin_intereses' | 'tea';

  @IsOptional()
  @IsNumber()
  tea?: number;

  @IsOptional()
  @IsString()
  @IsIn(['enviada', 'desestimada', 'actualizada'])
  status?: 'enviada' | 'desestimada' | 'actualizada';

  @IsOptional()
  @IsNumber()
  areaM2?: number;

  @IsNumber()
  exchangeRate!: number;
}

export class UpdateQuoteStatusDto {
  @IsString()
  @IsIn(['enviada', 'desestimada', 'actualizada'])
  status!: 'enviada' | 'desestimada' | 'actualizada';
}

export class RecalculateQuoteDto {
  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  cuotaInicialUsd?: number;

  @IsOptional()
  @IsNumber()
  totalCuotas?: number;

  @IsOptional()
  @IsNumber()
  graceMonths?: number;

  @IsOptional()
  @IsString()
  @IsIn(['contado', 'partes'])
  initialPaymentMode?: 'contado' | 'partes';

  @IsOptional()
  @IsNumber()
  initialParts?: number;

  @IsOptional()
  @IsString()
  interestType?: 'sin_intereses' | 'tea';

  @IsOptional()
  @IsNumber()
  tea?: number;
}

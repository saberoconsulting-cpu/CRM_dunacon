// modules/quotes/application/dto/quote.dto.ts
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateQuoteDto {
  @IsNumber()
  projectId!: number;

  @IsNumber()
  lotId!: number;

  @IsString()
  @IsNotEmpty()
  clientName!: string;

  @IsOptional()
  @IsString()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  clientPhone?: string;

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
  @IsString()
  interestType?: 'sin_intereses' | 'tea';

  @IsOptional()
  @IsNumber()
  tea?: number;

  @IsNumber()
  exchangeRate!: number;
}

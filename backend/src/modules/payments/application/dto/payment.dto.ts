// modules/payments/application/dto/payment.dto.ts
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class ApprovePaymentDto {
  @IsString()
  @IsNotEmpty()
  bankOperationNumber!: string;

  @IsString()
  @IsNotEmpty()
  receiptNumber!: string;

  @IsNumber()
  receiptValue!: number;
}

export class CreatePaymentDto {
  @IsNumber()
  projectId!: number;

  @IsNumber()
  lotId!: number;

  @IsOptional()
  clientId?: number;

  @IsOptional()
  agentId?: number;

  @IsString()
  @IsNotEmpty()
  type!: 'reserva' | 'adelanto' | 'primera_cuota' | 'cuota' | 'otros';

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  note?: string;

  // Registro informativo en US$ (no reemplaza el monto en soles).
  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  amountUsd?: number;
}
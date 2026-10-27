// modules/payments/application/dto/payment.dto.ts
import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, IsInt, IsIn, MaxLength } from 'class-validator';

export class ApprovePaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  bankOperationNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  receiptNumber!: string;

  @IsNumber()
  @Min(0.01)
  receiptValue!: number;
}

export class CreatePaymentDto {
  @IsInt()
  @Min(1)
  projectId!: number;

  @IsInt()
  @Min(1)
  lotId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  clientId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  agentId?: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(['reserva', 'adelanto', 'cuota_inicial', 'primera_cuota', 'cuota', 'otros'])
  type!: 'reserva' | 'adelanto' | 'cuota_inicial' | 'primera_cuota' | 'cuota' | 'otros';

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsBoolean()
  isExtraordinary?: boolean;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de pago debe tener formato AAAA-MM-DD.' })
  @IsDateString({ strict: true }, { message: 'Ingresa una fecha de pago válida.' })
  paidAt?: string;

  // Registro informativo en US$ (no reemplaza el monto en soles).
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amountUsd?: number;

  // Datos bancarios que el agente/gerente deja al registrar el pago; el admin
  // los revisa y completa/confirma al aprobar.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankOperationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  receiptNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  receiptValue?: number;
}

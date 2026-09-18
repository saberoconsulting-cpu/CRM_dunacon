// modules/bank-accounts/application/dto/bank-account.dto.ts
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export const BANK_CURRENCIES = ['PEN', 'USD'] as const;
export type BankCurrency = typeof BANK_CURRENCIES[number];

export const BANK_MOVEMENT_TYPES = ['INGRESO', 'GASTO'] as const;
export type BankMovementType = typeof BANK_MOVEMENT_TYPES[number];

/** Fila normalizada del Estado de Cuenta Bancario (EC BCP). */
export type BankMovementImportRow = {
  rowNumber: number;
  itemNumber: number | null;
  movementDate: string | null;
  monthLabel: string | null;
  description: string | null;
  counterparty: string | null;
  depositAmount: number;
  chargeAmount: number;
  bookBalance: number | null;
  movementType: string | null;
  eerrClassification: string | null;
  invoiceNumber: string | null;
  observation: string | null;
  currency: string;
  errors: string[];
};

export class CreateBankMovementDto {
  @IsNumber()
  projectId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountKey?: string;

  @IsOptional()
  @IsString()
  movementDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  monthLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  counterparty?: string | null;

  @IsOptional()
  @IsNumber()
  depositAmount?: number;

  @IsOptional()
  @IsNumber()
  chargeAmount?: number;

  @IsOptional()
  @IsNumber()
  bookBalance?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  movementType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  eerrClassification?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  invoiceNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string | null;

  @IsOptional()
  @IsIn(BANK_CURRENCIES)
  currency?: BankCurrency;
}

export class CreateBankCategoryDto {
  @IsNumber()
  projectId!: number;

  @IsString()
  @MaxLength(150)
  movementType!: string;

  @IsString()
  @MaxLength(150)
  eerrClassification!: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateBankCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  movementType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  eerrClassification?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBankMovementDto {
  @IsOptional()
  @IsString()
  movementDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  monthLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  counterparty?: string | null;

  @IsOptional()
  @IsNumber()
  depositAmount?: number;

  @IsOptional()
  @IsNumber()
  chargeAmount?: number;

  @IsOptional()
  @IsNumber()
  bookBalance?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  movementType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  eerrClassification?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  invoiceNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string | null;

  @IsOptional()
  @IsIn(BANK_CURRENCIES)
  currency?: BankCurrency;
}

export class UpdateBankOpeningBalanceDto {
  @IsNumber()
  projectId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountKey?: string;

  @IsOptional()
  @IsIn(BANK_CURRENCIES)
  currency?: BankCurrency;

  @IsNumber()
  openingBalance!: number;
}

export class CreateBankAccountDto {
  @IsNumber()
  projectId!: number;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  bank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountNumber?: string;
}

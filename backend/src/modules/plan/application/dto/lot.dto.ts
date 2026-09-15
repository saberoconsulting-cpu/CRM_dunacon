// modules/plan/application/dto/lot.dto.ts
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export interface PointDto {
  x: number;
  y: number;
}

export class CreateLotDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsNumber()
  blockId!: number;

  @IsNotEmpty()
  points!: PointDto[];

  @IsOptional()
  @IsNumber()
  areaM2?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  statusDate?: string;

  @IsOptional()
  agentId?: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  finalPrice?: number;
}

export class UpdateLotDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  blockId?: number;

  @IsOptional()
  points?: PointDto[];

  @IsOptional()
  @IsNumber()
  areaM2?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  statusDate?: string;

  @IsOptional()
  clientId?: number;

  @IsOptional()
  agentId?: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  finalPrice?: number;
}

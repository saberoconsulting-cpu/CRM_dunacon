// modules/plan/application/dto/plan.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  status?: 'draft' | 'published';

  @IsOptional()
  @IsString()
  viewBox?: string;

  @IsOptional()
  imageWidth?: number;

  @IsOptional()
  imageHeight?: number;
}

export interface PointDto {
  x: number;
  y: number;
}

export class CreateBlockDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNotEmpty()
  points!: PointDto[];

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateBlockDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  points?: PointDto[];

  @IsOptional()
  @IsString()
  address?: string;
}
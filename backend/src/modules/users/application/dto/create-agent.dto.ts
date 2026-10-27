import { Type } from 'class-transformer';
// modules/users/application/dto/create-agent.dto.ts
import {
  IsArray,
  IsInt,
  Min,
  ValidateNested,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ProjectAccessDto {
  @IsInt()
  @Min(1)
  projectId!: number;

  @IsArray()
  @IsString({ each: true })
  modules!: string[];
}

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  projectIds!: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectAccessDto)
  projectAccess?: ProjectAccessDto[];

  @IsNumber()
  commissionRate!: number;

  @IsNumber()
  @IsOptional()
  monthlyGoalLots?: number;

  @IsNumber()
  @IsOptional()
  monthlyGoalAmount?: number;
}

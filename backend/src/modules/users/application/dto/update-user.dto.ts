import { Type } from 'class-transformer';
// modules/users/application/dto/update-user.dto.ts
import {
  IsArray,
  IsIn,
  IsInt,
  Min,
  ValidateNested,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class ProjectAccessDto {
  @IsInt()
  @Min(1)
  projectId!: number;

  @IsArray()
  @IsString({ each: true })
  modules!: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @IsNumber()
  commissionRate?: number;

  @IsOptional()
  @IsNumber()
  monthlyGoalLots?: number;

  @IsOptional()
  @IsNumber()
  monthlyGoalAmount?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  projectIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectAccessDto)
  projectAccess?: ProjectAccessDto[];
}

// modules/users/application/dto/update-user.dto.ts
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class ProjectAccessDto {
  @IsNumber()
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
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
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
  projectIds?: number[];

  @IsOptional()
  @IsArray()
  projectAccess?: ProjectAccessDto[];
}

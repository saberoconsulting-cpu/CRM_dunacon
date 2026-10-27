import { Type } from 'class-transformer';
// modules/users/application/dto/create-admin.dto.ts
import {
  IsArray,
  IsInt,
  Min,
  ValidateNested,
  IsEmail,
  IsNotEmpty,
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

export class CreateAdminDto {
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
}

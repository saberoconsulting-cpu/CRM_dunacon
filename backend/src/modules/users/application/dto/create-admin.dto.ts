// modules/users/application/dto/create-admin.dto.ts
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ProjectAccessDto {
  @IsNumber()
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
  @IsNumber({}, { each: true })
  projectIds!: number[];

  @IsOptional()
  @IsArray()
  projectAccess?: ProjectAccessDto[];
}

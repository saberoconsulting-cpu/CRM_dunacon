// modules/auth/application/dto/update-profile.dto.ts
// Actualización del propio perfil (datos opcionales de contacto y presentación).
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsNumber()
  monthlyGoalLots?: number;

  @IsOptional()
  @IsNumber()
  monthlyGoalAmount?: number;
}

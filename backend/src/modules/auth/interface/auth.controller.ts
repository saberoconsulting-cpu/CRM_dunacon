// modules/auth/interface/auth.controller.ts
import {
  Body,
  BadRequestException,
  Headers,
  Query,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../application/auth.service';
import { LoginDto } from '../application/dto/login.dto';
import { ChangePasswordDto } from '../application/dto/change-password.dto';
import { UpdateProfileDto } from '../application/dto/update-profile.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';
import { uploadToCloudinary } from '../../../shared/infrastructure/upload/cloudinary.util';
import { DataSource } from 'typeorm';
import { AppSettingEntity } from '../../../shared/infrastructure/entities/app-setting.entity';
import { sessionLockKey } from '../../../shared/application/guards/session-lock.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly db: DataSource) {}

  @UseGuards(JwtAuthGuard)
  @Get('session-lock')
  async getSessionLock(@Headers('authorization') authorization: string, @Query('projectId') projectId: string) {
    const id = Number(projectId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Proyecto inválido');
    const row = await this.db.getRepository(AppSettingEntity).findOneBy({ key: sessionLockKey(authorization, id) });
    return { locked: row?.value !== 'false' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('session-lock')
  async setSessionLock(@Headers('authorization') authorization: string, @Body() body: { locked: boolean; projectId: number }) {
    if (typeof body.locked !== 'boolean') throw new BadRequestException('locked debe ser booleano');
    const repo = this.db.getRepository(AppSettingEntity);
    const id = Number(body.projectId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Proyecto inválido');
    const key = sessionLockKey(authorization, id);
    if (body.locked) await repo.delete({ key });
    else await repo.upsert({ key, value: 'false' }, ['key']);
    return { locked: body.locked };
  }

  // Máx. 5 intentos por minuto por IP — evita fuerza bruta de contraseñas.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@CurrentUser('id') userId: number) {
    return this.authService.getProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile')
  updateProfile(@CurrentUser('id') userId: number, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updateAvatar(
    @CurrentUser('id') userId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const up = await uploadToCloudinary(file.buffer, 'uploads');
    return this.authService.updateAvatar(userId, up.secure_url);
  }

  // Requiere la contraseña actual, pero igual limitamos intentos por si el
  // token de un agente queda comprometido y alguien intenta adivinarla.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@CurrentUser('id') userId: number, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto);
  }
}

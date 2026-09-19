// modules/auth/application/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../../shared/infrastructure/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    // Actualizar último acceso
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        whatsapp: user.whatsapp,
        bio: user.bio,
        role: user.role,
        photoUrl: user.photoUrl,
        commissionRate: user.commissionRate,
        monthlyGoalLots: user.monthlyGoalLots,
        monthlyGoalAmount: user.monthlyGoalAmount,
      },
    };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Usuario no encontrado');
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Contraseña actual incorrecta');
    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.save(user);
    return { ok: true, message: 'Contraseña actualizada' };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (dto.name !== undefined) user.name = dto.name.trim() || user.name;
    if (dto.phone !== undefined) user.phone = (dto.phone || '').trim();
    if (dto.whatsapp !== undefined) user.whatsapp = (dto.whatsapp || '').trim();
    if (dto.bio !== undefined) user.bio = dto.bio || '';
    if (dto.monthlyGoalLots !== undefined) user.monthlyGoalLots = Number(dto.monthlyGoalLots) || 0;
    if (dto.monthlyGoalAmount !== undefined) user.monthlyGoalAmount = String(Number(dto.monthlyGoalAmount) || 0);
    await this.userRepo.save(user);
    return this.getProfile(userId);
  }

  async updateAvatar(userId: number, photoUrl: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    user.photoUrl = photoUrl || user.photoUrl;
    await this.userRepo.save(user);
    return this.getProfile(userId);
  }

  getProfile(userId: number) {
    return this.userRepo
      .createQueryBuilder('u')
      .select([
        'u.id', 'u.email', 'u.name', 'u.phone', 'u.whatsapp', 'u.bio',
        'u.role', 'u.status',
        'u.photoUrl', 'u.commissionRate', 'u.monthlyGoalLots', 'u.monthlyGoalAmount',
        'u.lastLoginAt', 'u.createdAt',
      ])
      .where('u.id = :id', { id: userId })
      .getOne();
  }
}
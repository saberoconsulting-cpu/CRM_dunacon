// modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { UserEntity } from '../../shared/infrastructure/entities/user.entity';
import { AuthController } from './interface/auth.controller';
import { AuthService } from './application/auth.service';
import { JwtStrategy } from './application/jwt.strategy';

function buildJwtConfig(cs: ConfigService) {
  const secret = cs.get<string>('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET no está definido. Configúralo en el .env antes de arrancar la API.');
  }
  return {
    secret,
    signOptions: { expiresIn: cs.get<string>('JWT_EXPIRES_IN') || '1d' },
  };
}

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => buildJwtConfig(cs),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
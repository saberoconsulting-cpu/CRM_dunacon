import { FinancialDataService } from './application/financial-data.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettingEntity } from '../../shared/infrastructure/entities/app-setting.entity';
import { SettingsService } from './application/settings.service';
import { SettingsController } from './interface/settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AppSettingEntity])],
  controllers: [SettingsController],
  providers: [SettingsService, FinancialDataService],
  exports: [SettingsService],
})
export class SettingsModule {}

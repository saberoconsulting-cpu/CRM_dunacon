import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { UserRole } from '../../../shared/domain/enums';
import { SettingsService } from '../application/settings.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getAll() { return this.settings.get(); }

  @Get('value/:key')
  getValue(@Param('key') key: string) {
    return this.settings.getValue(key);
  }

  @Put('value/:key')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  setValue(@Param('key') key: string, @Body() body: Record<string, any>) {
    return this.settings.setValue(key, String(body.value ?? ''));
  }

  @Put()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  update(@Body() body: Record<string, any>) {
    return this.settings.set({
      companyName: body.companyName,
      color: body.color,
      alertCuotas: body.alertCuotas != null ? String(body.alertCuotas) : undefined,
      approvalNotify: body.approvalNotify != null ? String(body.approvalNotify) : undefined,
    });
  }
}

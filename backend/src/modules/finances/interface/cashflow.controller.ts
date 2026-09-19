// modules/finances/interface/cashflow.controller.ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CashflowService } from '../application/cashflow.service';
import { SaveCashflowModelDto } from '../application/dto/cashflow.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { UserRole } from '../../../shared/domain/enums';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cashflow')
export class CashflowController {
  constructor(private readonly cashflowService: CashflowService) {}

  @Get('model')
  getModel(
    @Query('projectId') projectId: string,
    @Query('mode') mode?: string,
  ) {
    return this.cashflowService.getModel(Number(projectId), mode);
  }

  @Get('modes')
  listModes(@Query('projectId') projectId: string) {
    return this.cashflowService.listModes(Number(projectId));
  }

  @Post('model')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  saveModel(@Body() dto: SaveCashflowModelDto, @CurrentUser('id') actorId: number) {
    return this.cashflowService.saveModel(dto, actorId);
  }
}

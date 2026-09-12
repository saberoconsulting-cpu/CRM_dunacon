// modules/dashboards/interface/dashboards.controller.ts
import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { DashboardsService } from '../application/dashboards.service';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { UserRole } from '../../../shared/domain/enums';
import { CurrentUser, AuthUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get('general')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  general() {
    return this.dashboardsService.general();
  }

  @Get('agent')
  agent(@CurrentUser() user: AuthUser) {
    return this.dashboardsService.forAgent(user.id);
  }

  @Get('project/:projectId')
  project(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.dashboardsService.project(projectId);
  }

  @Get('movements')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  movements(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('projectId') projectId?: string,
    @Query('type') type?: string,
  ) {
    return this.dashboardsService.movements({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      projectId: projectId ? Number(projectId) : undefined,
      type,
    });
  }
}

// modules/campaigns/interface/campaigns.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CampaignsService } from '../application/campaigns.service';
import { CampaignEntity } from '../../../shared/infrastructure/entities/campaign.entity';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../../shared/application/decorators/current-user.decorator';
import { UserRole } from '../../../shared/domain/enums';

@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  list(
    @Query('projectId') projectId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.campaignsService.list(projectId ? Number(projectId) : undefined, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }, user?.role === UserRole.AGENT ? user.id : undefined);
  }

  @Post()
  create(@Body() dto: Partial<CampaignEntity>, @CurrentUser() user: AuthUser) {
    return this.campaignsService.create(dto, user.id);
  }

  @Post('update/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CampaignEntity>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaignsService.update(id, dto, user.id, user.role === UserRole.AGENT ? user.id : undefined);
  }
}

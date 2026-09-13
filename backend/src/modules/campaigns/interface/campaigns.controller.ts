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
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  list(
    @Query('projectId') projectId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.campaignsService.list(projectId ? Number(projectId) : undefined, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post()
  create(@Body() dto: Partial<CampaignEntity>, @CurrentUser('id') actorId: number) {
    return this.campaignsService.create(dto, actorId);
  }

  @Post('update/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CampaignEntity>,
    @CurrentUser('id') actorId: number,
  ) {
    return this.campaignsService.update(id, dto, actorId);
  }
}

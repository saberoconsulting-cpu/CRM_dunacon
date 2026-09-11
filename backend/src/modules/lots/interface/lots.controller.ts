// modules/lots/interface/lots.controller.ts
import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { LotsService } from '../application/lots.service';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('lots')
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @Get()
  list(
    @Query('projectId') projectId?: string,
    @Query('blockId') blockId?: string,
    @Query('status') status?: string,
    @Query('agentId') agentId?: string,
    @Query('search') search?: string,
    @Query('minArea') minArea?: string,
    @Query('maxArea') maxArea?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.lotsService.list({
      projectId: projectId ? Number(projectId) : undefined,
      blockId: blockId ? Number(blockId) : undefined,
      status,
      agentId: agentId ? Number(agentId) : undefined,
      search,
      minArea: minArea ? Number(minArea) : undefined,
      maxArea: maxArea ? Number(maxArea) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.lotsService.getOne(id);
  }
}
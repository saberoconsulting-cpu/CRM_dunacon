// modules/quotes/interface/quotes.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { QuotesService } from '../application/quotes.service';
import { CreateQuoteDto, UpdateQuoteStatusDto } from '../application/dto/quote.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  list(@Query('projectId') projectId?: string, @Query('lotId') lotId?: string, @Query('status') status?: string) {
    return this.quotesService.list({
      projectId: projectId ? Number(projectId) : undefined,
      lotId: lotId ? Number(lotId) : undefined,
      status: status || undefined,
    });
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.quotesService.getOne(id);
  }

  @Get(':id/schedule')
  schedule(@Param('id', ParseIntPipe) id: number) {
    return this.quotesService.schedule(id);
  }

  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser('id') actorId: number) {
    return this.quotesService.create(dto, actorId);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuoteStatusDto) {
    return this.quotesService.updateStatus(id, dto.status);
  }
}

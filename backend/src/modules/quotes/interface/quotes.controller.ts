// modules/quotes/interface/quotes.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { QuotesService } from '../application/quotes.service';
import { CreateQuoteDto, UpdateQuoteStatusDto, RecalculateQuoteDto } from '../application/dto/quote.dto';
import { ListQuotesDto } from '../application/dto/list-quotes.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../../shared/application/decorators/current-user.decorator';
import { UserRole } from '../../../shared/domain/enums';

@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  list(@Query() query: ListQuotesDto, @CurrentUser() user: AuthUser) {
    return this.quotesService.list(query, user.role === UserRole.AGENT ? user.id : undefined);
  }

  @Get('summary')
  summary(@Query() query: { projectId?: string | number }, @CurrentUser() user: AuthUser) {
    const pid = query.projectId ? Number(query.projectId) : undefined;
    return this.quotesService.summary(pid, user.role === UserRole.AGENT ? user.id : undefined);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.quotesService.getOne(id, user.role === UserRole.AGENT ? user.id : undefined);
  }

  @Get(':id/schedule')
  schedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.quotesService.schedule(id, user.role === UserRole.AGENT ? user.id : undefined);
  }

  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser('id') actorId: number) {
    return this.quotesService.create(dto, actorId);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuoteStatusDto, @CurrentUser() user: AuthUser) {
    return this.quotesService.updateStatus(id, dto.status, user.role === UserRole.AGENT ? user.id : undefined);
  }

  @Patch(':id/recalculate')
  recalculate(@Param('id', ParseIntPipe) id: number, @Body() dto: RecalculateQuoteDto, @CurrentUser() user: AuthUser) {
    return this.quotesService.recalculate(id, dto, user.role === UserRole.AGENT ? user.id : undefined);
  }
}

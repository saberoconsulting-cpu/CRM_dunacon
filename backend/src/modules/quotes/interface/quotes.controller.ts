// modules/quotes/interface/quotes.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { QuotesService } from '../application/quotes.service';
import { CreateQuoteDto } from '../application/dto/quote.dto';
import { ListQuotesDto } from '../application/dto/list-quotes.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  // GET /quotes?projectId=&lotId=&search=&paymentMethod=&sort=&order=&page=&limit=
  // El ValidationPipe global (transform:true) convierte page/limit a number y
  // valida rangos; ListQuotesDto aplica whitelist de sort/order.
  @Get()
  list(@Query() query: ListQuotesDto) {
    return this.quotesService.list(query);
  }

    @Get('summary')
  summary(@Query() query: { projectId?: string | number }) {
    const pid = query.projectId ? Number(query.projectId) : undefined;
    return this.quotesService.summary(pid);
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
}

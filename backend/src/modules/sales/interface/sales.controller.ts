// modules/sales/interface/sales.controller.ts
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
import { SalesService } from '../application/sales.service';
import { CreateSaleDto } from '../application/dto/sale.dto';
import { ListSalesDto } from '../application/dto/list-sales.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { UserRole } from '../../../shared/domain/enums';
import { CurrentUser, AuthUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  list(@Query() query: ListSalesDto) {
    return this.salesService.list(query);
  }

  @Get('by-lot/:lotId')
  byLot(@Param('lotId', ParseIntPipe) lotId: number) {
    return this.salesService.getByLot(lotId);
  }

  @Get('pending')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  pending(@Query('projectId') projectId?: string) {
    return this.salesService.pendingApprovals(projectId ? Number(projectId) : undefined);
  }

  @Get('payment-context')
  paymentContext(
    @Query('clientId') clientId?: string,
    @Query('lotId') lotId?: string,
    @Query('projectId') projectId?: string,
    @Query('search') search?: string,
  ) {
    return this.salesService.paymentContext({
      clientId: clientId ? Number(clientId) : undefined,
      lotId: lotId ? Number(lotId) : undefined,
      projectId: projectId ? Number(projectId) : undefined,
      search,
    });
  }

  @Get('payment-search')
  paymentSearch(
    @Query('q') q?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.salesService.paymentSearch(q, projectId ? Number(projectId) : undefined);
  }

  @Get('lot/:lotId/history')
  lotPaymentHistory(@Param('lotId', ParseIntPipe) lotId: number) {
    return this.salesService.lotPaymentHistory(lotId);
  }

  @Get(':id/schedule')
  schedule(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.schedule(id);
  }

  @Post('approve/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') actorId: number,
    @Query('projectId') projectId?: string,
  ) {
    return this.salesService.approve(id, actorId, projectId ? Number(projectId) : undefined);
  }

  @Post('reject/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('note') note: string | undefined,
    @CurrentUser('id') actorId: number,
    @Query('projectId') projectId?: string,
  ) {
    return this.salesService.reject(id, actorId, note, projectId ? Number(projectId) : undefined);
  }

  @Post('preview')
  preview(@Body() dto: CreateSaleDto) {
    return this.salesService.preview(dto);
  }

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser) {
    return this.salesService.create(dto, user.id, user.role);
  }
}

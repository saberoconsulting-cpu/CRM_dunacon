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
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';

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
  pending() {
    return this.salesService.pendingApprovals();
  }

  @Get(':id/schedule')
  schedule(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.schedule(id);
  }

  @Post('approve/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') actorId: number) {
    return this.salesService.approve(id, actorId);
  }

  @Post('reject/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('note') note: string | undefined,
    @CurrentUser('id') actorId: number,
  ) {
    return this.salesService.reject(id, actorId, note);
  }

  @Post('preview')
  preview(@Body() dto: CreateSaleDto) {
    return this.salesService.preview(dto);
  }

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser('id') actorId: number) {
    return this.salesService.create(dto, actorId);
  }
}

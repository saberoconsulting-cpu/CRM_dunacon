import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';
import { UserRole } from '../../../shared/domain/enums';
import { IncomeStatementService } from '../application/income-statement.service';
import { CreateIncomeStatementItemDto, UpdateIncomeStatementItemDto } from '../application/dto/income-statement.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('income-statement')
export class IncomeStatementController {
  constructor(private readonly statementService: IncomeStatementService) {}

  @Get()
  list(@Query('projectId') projectId: string) {
    return this.statementService.list(Number(projectId));
  }

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  create(@Body() dto: CreateIncomeStatementItemDto, @CurrentUser('id') actorId: number) {
    return this.statementService.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateIncomeStatementItemDto) {
    return this.statementService.update(Number(id), dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.statementService.remove(Number(id));
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';
import { UserRole } from '../../../shared/domain/enums';
import { ConstructionBudgetService } from '../application/construction-budget.service';
import { CreateConstructionBudgetItemDto, UpdateConstructionBudgetItemDto } from '../application/dto/construction-budget.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('construction-budget')
export class ConstructionBudgetController {
  constructor(private readonly budgetService: ConstructionBudgetService) {}

  @Get()
  list(@Query('projectId') projectId: string) {
    return this.budgetService.list(Number(projectId));
  }

  @Get('totals')
  totals(@Query('projectId') projectId?: string) {
    return this.budgetService.totalsByProject(projectId ? Number(projectId) : undefined);
  }

  @Post('seed')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  seed(@Body('projectId') projectId: number, @CurrentUser('id') actorId: number) {
    return this.budgetService.seed(Number(projectId), actorId);
  }

  @Post('import/preview')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  previewImport(@UploadedFile() file: Express.Multer.File) {
    return this.budgetService.previewExcel(file);
  }

  @Post('import')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  importRows(@Body('projectId') projectId: number, @Body('rows') rows: any[], @CurrentUser('id') actorId: number) {
    return this.budgetService.importRows(Number(projectId), rows, actorId);
  }

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  create(@Body() dto: CreateConstructionBudgetItemDto, @CurrentUser('id') actorId: number) {
    return this.budgetService.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateConstructionBudgetItemDto) {
    return this.budgetService.update(Number(id), dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.budgetService.remove(Number(id));
  }
}

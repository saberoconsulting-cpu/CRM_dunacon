// modules/finances/interface/finances.controller.ts
import {
  Body,
  Controller,
  Get,
  BadRequestException,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FinancesService } from '../application/finances.service';
import { CreateExpenseDto, CreateAdditionalIncomeDto } from '../application/dto/finance.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { UserRole } from '../../../shared/domain/enums';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finances')
export class FinancesController {
  constructor(private readonly financesService: FinancesService) {}

  @Get('summary')
  summary(
    @Query('period') period: 'daily' | 'weekly' | 'monthly' | 'annual' = 'monthly',
    @Query('projectId') projectId?: string,
  ) {
    return this.financesService.summary(period, projectId ? Number(projectId) : undefined);
  }

  @Get('transactions')
  transactions(
    @Query('projectId') projectId?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.financesService.transactions({
      projectId: projectId ? Number(projectId) : undefined,
      type, category, from, to, search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('by-category')
  byCategory(@Query('projectId') projectId?: string) {
    return this.financesService.byCategory(projectId ? Number(projectId) : undefined);
  }

  @Get('by-project')
  byProject() {
    return this.financesService.byProject();
  }

  @Get('expenses')
  expenses(@Query('projectId') projectId?: string) {
    return this.financesService.expensesList(projectId ? Number(projectId) : undefined);
  }

  @Get('income-statement')
  incomeStatement(@Query('projectId') projectId?: string) {
    return this.financesService.incomeStatement(projectId ? Number(projectId) : undefined);
  }

  @Post('expense')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  registerExpense(@Body() dto: CreateExpenseDto, @CurrentUser('id') actorId: number) {
    return this.financesService.registerExpense(dto, actorId);
  }

  @Post('income')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  registerIncome(@Body() dto: CreateAdditionalIncomeDto, @CurrentUser('id') actorId: number) {
    return this.financesService.registerAdditionalIncome(dto, actorId);
  }

  @Post('import')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  importSpreadsheet(
    @UploadedFile() file: Express.Multer.File,
    @Query('projectId') projectId: string | undefined,
    @CurrentUser('id') actorId: number,
  ) {
    if (!file) throw new BadRequestException('Adjunta un archivo Excel');
    const extension = file.originalname.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls', 'csv'].includes(extension || '')) {
      throw new BadRequestException('El archivo debe ser Excel (.xlsx, .xls) o CSV');
    }
    return this.financesService.importSpreadsheet(file.buffer, actorId, projectId ? Number(projectId) : undefined);
  }
}

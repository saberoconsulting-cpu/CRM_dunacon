import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';
import { UserRole } from '../../../shared/domain/enums';
import { BankAccountsService } from '../application/bank-accounts.service';
import { CreateBankAccountDto, CreateBankCategoryDto, CreateBankMovementDto, UpdateBankCategoryDto, UpdateBankMovementDto, UpdateBankOpeningBalanceDto } from '../application/dto/bank-account.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  list(
    @Query('projectId') projectId: string,
    @Query('accountKey') accountKey?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency?: string,
    @Query('movementType') movementType?: string,
    @Query('eerrClassification') eerrClassification?: string,
    @Query('search') search?: string,
  ) {
    return this.bankAccountsService.list(Number(projectId), { accountKey, from, to, currency, movementType, eerrClassification, search });
  }

  @Get('accounts')
  listAccounts(@Query('projectId') projectId: string) {
    return this.bankAccountsService.listAccounts(Number(projectId));
  }

  @Post('accounts')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  createAccount(@Body() dto: CreateBankAccountDto) {
    return this.bankAccountsService.createAccount(dto);
  }

  @Get('categories')
  listCategories(@Query('projectId') projectId: string) {
    return this.bankAccountsService.listCategories(Number(projectId));
  }

  @Get('categories/unmapped')
  unmappedCategories(@Query('projectId') projectId: string) {
    return this.bankAccountsService.unmappedCategories(Number(projectId));
  }

  @Post('categories')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  createCategory(@Body() dto: CreateBankCategoryDto, @CurrentUser('id') actorId: number) {
    return this.bankAccountsService.createCategory(dto, actorId);
  }

  @Patch('categories/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  updateCategory(@Param('id') id: string, @Body() dto: UpdateBankCategoryDto) {
    return this.bankAccountsService.updateCategory(Number(id), dto);
  }

  @Delete('categories/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  removeCategory(@Param('id') id: string) {
    return this.bankAccountsService.removeCategory(Number(id));
  }

  @Get('annual-report')
  annualReport(
    @Query('projectId') projectId: string,
    @Query('year') year?: string,
    @Query('currency') currency?: string,
    @Query('accountKey') accountKey?: string,
  ) {
    return this.bankAccountsService.annualReport(Number(projectId), year ? Number(year) : undefined, currency, accountKey);
  }

  @Post('import/preview')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  previewImport(@UploadedFile() file: Express.Multer.File) {
    return this.bankAccountsService.previewExcel(file);
  }

  @Post('import')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  importRows(
    @Body('projectId') projectId: number,
    @Body('rows') rows: any[],
    @Body('accountKey') accountKey: string,
    @Body('currency') currency: string,
    @Body('sourceFile') sourceFile: string,
    @Body('importBatch') importBatch: string,
    @Body('skipDuplicates') skipDuplicates: boolean,
    @Body('openingBalance') openingBalance: number | null,
    @CurrentUser('id') actorId: number,
  ) {
    return this.bankAccountsService.importRows(
      Number(projectId),
      rows,
      { accountKey, currency, sourceFile, importBatch, skipDuplicates, openingBalance },
      actorId,
    );
  }

  @Delete('import/:batch')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  removeBatch(@Param('batch') batch: string, @Query('projectId') projectId: string) {
    return this.bankAccountsService.removeBatch(Number(projectId), batch);
  }

  @Patch('opening-balance')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  updateOpeningBalance(@Body() dto: UpdateBankOpeningBalanceDto) {
    return this.bankAccountsService.updateOpeningBalance(dto);
  }

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  create(@Body() dto: CreateBankMovementDto, @CurrentUser('id') actorId: number) {
    return this.bankAccountsService.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateBankMovementDto) {
    return this.bankAccountsService.update(Number(id), dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.bankAccountsService.remove(Number(id));
  }
}

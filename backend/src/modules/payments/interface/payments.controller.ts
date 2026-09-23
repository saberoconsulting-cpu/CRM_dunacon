// modules/payments/interface/payments.controller.ts
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
import { PaymentsService } from '../application/payments.service';
import { ApprovePaymentDto, CreatePaymentDto } from '../application/dto/payment.dto';
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { uploadToCloudinary } from '../../../shared/infrastructure/upload/cloudinary.util';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../../shared/application/decorators/current-user.decorator';
import { UserRole } from '../../../shared/domain/enums';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  list(
    @Query('projectId') projectId?: string,
    @Query('lotId') lotId?: string,
    @Query('agentId') agentId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.paymentsService.list({
      projectId: projectId ? Number(projectId) : undefined,
      lotId: lotId ? Number(lotId) : undefined,
      agentId: user?.role === UserRole.AGENT ? user.id : (agentId ? Number(agentId) : undefined),
      status,
      type,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('caja')
  summary(@Query('projectId') projectId?: string, @CurrentUser() user?: AuthUser) {
    return this.paymentsService.summary(projectId ? Number(projectId) : undefined, user?.role === UserRole.AGENT ? user.id : undefined);
  }

  @Get('alerts')
  alerts() {
    return this.paymentsService.alerts();
  }

  @Post()
  register(@Body() dto: CreatePaymentDto, @CurrentUser('id') actorId: number) {
    return this.paymentsService.register(dto, actorId);
  }

  @Post('mark-paid/:id')
  markPaid(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.markPaid(id);
  }

  @Post('approve/:id')
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApprovePaymentDto, @CurrentUser('id') actorId: number) {
    return this.paymentsService.approve(id, dto, actorId);
  }

  @Post('voucher/:id')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async attachVoucher(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File) {
    const up = await uploadToCloudinary(file.buffer, 'uploads');
    return this.paymentsService.attachVoucher(id, up.secure_url);
  }

  @Post('approval-doc/:id')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async attachApprovalDoc(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File) {
    const up = await uploadToCloudinary(file.buffer, 'uploads');
    return this.paymentsService.attachApprovalDoc(id, up.secure_url);
  }

  @Post('receipt-doc/:id')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async attachReceiptDoc(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File) {
    const up = await uploadToCloudinary(file.buffer, 'uploads');
    return this.paymentsService.attachReceiptDoc(id, up.secure_url);
  }
}

// modules/plan/interface/plan.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { uploadToCloudinary } from '../../../shared/infrastructure/upload/cloudinary.util';

import { PlanService } from '../application/plan.service';
import { UpdatePlanDto } from '../application/dto/plan.dto';
import { CreateBlockDto, UpdateBlockDto } from '../application/dto/plan.dto';
import { CreateLotDto, UpdateLotDto } from '../application/dto/lot.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { UserRole } from '../../../shared/domain/enums';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('plan')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  // ---- plan ----
  @Get('project/:projectId')
  getByProject(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.planService.getByProject(projectId);
  }

  @Post('update/:projectId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: UpdatePlanDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.planService.update(projectId, dto, actorId);
  }

  @Post('image/:projectId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadImage(
    @Param('projectId', ParseIntPipe) projectId: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') actorId: number,
  ) {
    const up = await uploadToCloudinary(file.buffer, 'plans');
    return this.planService.uploadImage(projectId, up.secure_url, actorId);
  }


  // ---- calles ----
  @Post('street/:projectId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  createStreet(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateBlockDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.planService.createBlock(projectId, dto, actorId);
  }

  @Post('street/update/:streetId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  updateStreet(
    @Param('streetId', ParseIntPipe) streetId: number,
    @Body() dto: UpdateBlockDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.planService.updateBlock(streetId, dto, actorId);
  }

  @Post('street/delete/:streetId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  deleteStreet(@Param('streetId', ParseIntPipe) streetId: number, @CurrentUser('id') actorId: number) {
    return this.planService.deleteBlock(streetId, actorId);
  }

  @Post('street/duplicate/:streetId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  duplicateStreet(@Param('streetId', ParseIntPipe) streetId: number, @CurrentUser('id') actorId: number) {
    return this.planService.duplicateBlock(streetId, actorId);
  }

  // ---- compatibilidad: rutas antiguas de manzanas ----
  @Post('block/:projectId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  createBlock(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateBlockDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.planService.createBlock(projectId, dto, actorId);
  }

  @Post('block/update/:blockId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  updateBlock(
    @Param('blockId', ParseIntPipe) blockId: number,
    @Body() dto: UpdateBlockDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.planService.updateBlock(blockId, dto, actorId);
  }

  @Post('block/delete/:blockId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  deleteBlock(@Param('blockId', ParseIntPipe) blockId: number, @CurrentUser('id') actorId: number) {
    return this.planService.deleteBlock(blockId, actorId);
  }

  @Post('block/duplicate/:blockId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  duplicateBlock(@Param('blockId', ParseIntPipe) blockId: number, @CurrentUser('id') actorId: number) {
    return this.planService.duplicateBlock(blockId, actorId);
  }

  // ---- lotes ----
  @Post('lot/:projectId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  createLot(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateLotDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.planService.createLot(projectId, dto, actorId);
  }

  @Post('lot/update/:lotId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  updateLot(
    @Param('lotId', ParseIntPipe) lotId: number,
    @Body() dto: UpdateLotDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.planService.updateLot(lotId, dto, actorId);
  }

  @Post('lot/plan-voucher/:lotId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadLotPlanVoucher(
    @Param('lotId', ParseIntPipe) lotId: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') actorId: number,
  ) {
    const up = await uploadToCloudinary(file.buffer, 'documents');
    return this.planService.uploadLotPlanVoucher(lotId, up.secure_url, actorId);
  }

  @Post('lot/status/:lotId')
  changeStatus(
    @Param('lotId', ParseIntPipe) lotId: number,
    @Body('status') status: string,
    @Body('note') note: string | undefined,
    @CurrentUser('id') actorId: number,
  ) {
    return this.planService.changeStatus(lotId, status, actorId, note);
  }

  @Post('lot/delete/:lotId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  deleteLot(@Param('lotId', ParseIntPipe) lotId: number, @CurrentUser('id') actorId: number) {
    return this.planService.deleteLot(lotId, actorId);
  }

  @Get('lot/history/:lotId')
  lotHistory(@Param('lotId', ParseIntPipe) lotId: number) {
    return this.planService.lotHistory(lotId);
  }
}

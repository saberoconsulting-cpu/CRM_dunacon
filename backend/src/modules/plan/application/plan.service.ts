// modules/plan/application/plan.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanEntity } from '../../../shared/infrastructure/entities/plan.entity';
import { BlockEntity } from '../../../shared/infrastructure/entities/block.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { LotStatusHistoryEntity } from '../../../shared/infrastructure/entities/lot-status-history.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { NotificationsGateway } from '../../../shared/infrastructure/websocket/notifications.gateway';
import { UpdatePlanDto } from './dto/plan.dto';
import { CreateBlockDto, UpdateBlockDto } from './dto/plan.dto';
import { CreateLotDto, UpdateLotDto } from './dto/lot.dto';

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    @InjectRepository(BlockEntity)
    private readonly blockRepo: Repository<BlockEntity>,
    @InjectRepository(LotEntity)
    private readonly lotRepo: Repository<LotEntity>,
    @InjectRepository(LotStatusHistoryEntity)
    private readonly historyRepo: Repository<LotStatusHistoryEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    private readonly gateway: NotificationsGateway,
  ) {}

  async audit(userId: number, action: string, entity?: string, entityId?: number) {
    await this.auditRepo.save({ userId, action, entity, entityId });
  }

  private async getOrCreatePlan(projectId: number) {
    let plan = await this.planRepo.findOne({ where: { projectId } });
    if (!plan) {
      plan = this.planRepo.create({ projectId, imageWidth: 1000, imageHeight: 800, status: 'draft' });
      plan = await this.planRepo.save(plan);
    }
    return plan;
  }

  // ---------- PLAN ----------
  async getByProject(projectId: number) {
    const plan = await this.planRepo.findOne({ where: { projectId } });
    if (!plan) throw new NotFoundException('El proyecto aún no tiene plano');
    const streets = await this.blockRepo.find({ where: { projectId } });
    const lots = await this.lotRepo.find({ where: { projectId } });
    const lotsWithCompat = lots.map((lot) => ({ ...lot, blockId: lot.streetId }));
    return { plan, streets, blocks: streets, lots: lotsWithCompat };
  }

  async update(projectId: number, dto: UpdatePlanDto, actorId: number) {
    const plan = await this.getOrCreatePlan(projectId);
    if (dto.status) {
      plan.status = dto.status;
      if (dto.status === 'published') plan.publishedAt = new Date();
    }
    if (dto.viewBox !== undefined) plan.viewBox = dto.viewBox;
    if (dto.imageWidth) plan.imageWidth = dto.imageWidth;
    if (dto.imageHeight) plan.imageHeight = dto.imageHeight;
    const saved = await this.planRepo.save(plan);
    await this.audit(actorId, 'ACTUALIZAR_PLANO', 'plan', saved.id);
    return saved;
  }

  async uploadImage(projectId: number, imageUrl: string, actorId: number) {
    const plan = await this.getOrCreatePlan(projectId);
    plan.imageUrl = imageUrl;
    const saved = await this.planRepo.save(plan);
    await this.audit(actorId, 'SUBIR_IMAGEN_PLANO', 'plan', saved.id);
    return saved;
  }

  // ---------- CALLES ----------
  async createBlock(projectId: number, dto: CreateBlockDto, actorId: number) {
    const plan = await this.getOrCreatePlan(projectId);
    const street = this.blockRepo.create({
      projectId,
      planId: plan.id,
      name: dto.name,
      points: dto.points,
      address: dto.address,
    });
    const saved = await this.blockRepo.save(street);
    await this.audit(actorId, 'CREAR_CALLE', 'streets', saved.id);
    return saved;
  }

  async updateBlock(blockId: number, dto: UpdateBlockDto, actorId: number) {
    const street = await this.blockRepo.findOne({ where: { id: blockId } });
    if (!street) throw new NotFoundException('Calle no encontrada');
    if (dto.name !== undefined) street.name = dto.name;
    if (dto.points !== undefined) street.points = dto.points;
    if (dto.address !== undefined) street.address = dto.address;
    const saved = await this.blockRepo.save(street);
    await this.audit(actorId, 'EDITAR_CALLE', 'streets', blockId);
    return saved;
  }

  async deleteBlock(blockId: number, actorId: number) {
    await this.blockRepo.delete({ id: blockId });
    await this.lotRepo.update({ streetId: blockId }, { streetId: null });
    await this.audit(actorId, 'ELIMINAR_CALLE', 'streets', blockId);
    return { ok: true };
  }

  async duplicateBlock(blockId: number, actorId: number) {
    const street = await this.blockRepo.findOne({ where: { id: blockId } });
    if (!street) throw new NotFoundException('Calle no encontrada');
    const nextName = `${street.name} copia`;
    const copy = this.blockRepo.create({
      projectId: street.projectId,
      planId: street.planId,
      name: nextName,
      points: street.points,
      address: street.address,
    });
    const saved = await this.blockRepo.save(copy);
    await this.audit(actorId, 'DUPLICAR_CALLE', 'streets', saved.id);
    return saved;
  }

  // ---------- LOTES ----------
  async createLot(projectId: number, dto: CreateLotDto, actorId: number) {
    const plan = await this.getOrCreatePlan(projectId);
    const lot = this.lotRepo.create({
      projectId,
      planId: plan.id,
      streetId: dto.streetId ?? dto.blockId,
      code: dto.code,
      points: dto.points,
      areaM2: String(dto.areaM2 ?? 0),
      price: String(dto.price ?? 0),
      status: dto.status || 'disponible',
      agentId: dto.agentId,
      type: dto.type,
      salePrice: dto.salePrice != null ? String(dto.salePrice) : undefined,
      finalPrice: dto.finalPrice != null ? String(dto.finalPrice) : undefined,
    });
    const saved = await this.lotRepo.save(lot);
    await this.audit(actorId, 'CREAR_LOTE', 'lots', saved.id);
    this.gateway.emitToAll('lot.updated', saved);
    return saved;
  }

  async updateLot(lotId: number, dto: UpdateLotDto, actorId: number) {
    const lot = await this.lotRepo.findOne({ where: { id: lotId } });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    if (dto.code !== undefined) lot.code = dto.code;
    if (dto.streetId !== undefined || dto.blockId !== undefined) lot.streetId = dto.streetId ?? dto.blockId ?? null;
    if (dto.points !== undefined) lot.points = dto.points;
    if (dto.areaM2 !== undefined) lot.areaM2 = String(dto.areaM2);
    if (dto.price !== undefined) lot.price = String(dto.price);
    if (dto.clientId !== undefined) lot.clientId = dto.clientId;
    if (dto.agentId !== undefined) lot.agentId = dto.agentId;
    if (dto.type !== undefined) lot.type = dto.type;
    if (dto.salePrice !== undefined) lot.salePrice = String(dto.salePrice);
    if (dto.finalPrice !== undefined) lot.finalPrice = String(dto.finalPrice);
    if (dto.status !== undefined && dto.status !== lot.status) {
      await this.historyRepo.save({
        lotId,
        fromStatus: lot.status,
        toStatus: dto.status,
        userId: actorId,
        createdAt: dto.statusDate ? new Date(dto.statusDate) : undefined,
      });
      lot.status = dto.status;
    }
    const saved = await this.lotRepo.save(lot);
    await this.audit(actorId, 'EDITAR_LOTE', 'lots', lotId);
    this.gateway.emitToAll('lot.updated', saved);
    return saved;
  }

  async uploadLotPlanVoucher(lotId: number, url: string, actorId: number) {
    const lot = await this.lotRepo.findOne({ where: { id: lotId } });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    lot.planVoucherUrl = url;
    const saved = await this.lotRepo.save(lot);
    await this.audit(actorId, 'SUBIR_PLANO_LOTE', 'lots', lotId);
    this.gateway.emitToAll('lot.updated', saved);
    return { ok: true, planVoucherUrl: url };
  }

  async changeStatus(lotId: number, toStatus: string, actorId: number, note?: string) {
    const lot = await this.lotRepo.findOne({ where: { id: lotId } });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    if (toStatus === 'vendido' && lot.status === 'vendido') {
      throw new BadRequestException('El lote ya está vendido');
    }
    await this.historyRepo.save({
      lotId,
      fromStatus: lot.status,
      toStatus,
      userId: actorId,
      note,
    });
    lot.status = toStatus;
    const saved = await this.lotRepo.save(lot);
    this.gateway.emitToAll('lot.updated', saved);
    return saved;
  }

  async deleteLot(lotId: number, actorId: number) {
    await this.lotRepo.delete({ id: lotId });
    await this.audit(actorId, 'ELIMINAR_LOTE', 'lots', lotId);
    this.gateway.emitToAll('lot.updated', { id: lotId, deleted: true });
    return { ok: true };
  }

  async lotHistory(lotId: number) {
    return this.historyRepo.find({ where: { lotId }, order: { createdAt: 'DESC' } });
  }
}

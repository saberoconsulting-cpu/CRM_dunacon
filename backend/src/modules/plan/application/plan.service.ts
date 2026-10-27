// modules/plan/application/plan.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { PlanEntity } from '../../../shared/infrastructure/entities/plan.entity';
import { BlockEntity } from '../../../shared/infrastructure/entities/block.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { ProjectLotCatalogEntity } from '../../../shared/infrastructure/entities/project-lot-catalog.entity';
import { SaleEntity } from '../../../shared/infrastructure/entities/sale.entity';
import { ClientEntity } from '../../../shared/infrastructure/entities/client.entity';
import { LotStatusHistoryEntity } from '../../../shared/infrastructure/entities/lot-status-history.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { NotificationsGateway } from '../../../shared/infrastructure/websocket/notifications.gateway';
import { UpdatePlanDto } from './dto/plan.dto';
import { CreateBlockDto, UpdateBlockDto } from './dto/plan.dto';
import { CreateLotDto, UpdateLotDto } from './dto/lot.dto';
import { UpsertProjectLotCatalogDto } from './dto/project-lot-catalog.dto';

// Estados que solo pueden venir de operaciones comerciales reales. "Vendido"
// nace desde Ventas, no desde la edicion manual del lote.
const COMMERCIALLY_LOCKED_STATUSES = ['vendido', 'alquilado', 'primera_cuota'];
const MANUAL_LOT_STATUSES = ['disponible', 'reservado', 'promocion', 'segunda_etapa'];
const LOT_STATUS_LABEL_TEXT: Record<string, string> = {
  vendido: 'vendido',
  alquilado: 'vendido',
  reservado: 'reservado',
  adelanto: 'reservado',
  primera_cuota: 'vendido',
};
const normalizeLotStatus = (status?: string | null) => {
  if (status === 'adelanto') return 'reservado';
  if (status === 'primera_cuota' || status === 'alquilado') return 'vendido';
  return status || undefined;
};
@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    @InjectRepository(BlockEntity)
    private readonly blockRepo: Repository<BlockEntity>,
    @InjectRepository(LotEntity)
    private readonly lotRepo: Repository<LotEntity>,
    @InjectRepository(ProjectLotCatalogEntity)
    private readonly lotCatalogRepo: Repository<ProjectLotCatalogEntity>,
    @InjectRepository(LotStatusHistoryEntity)
    private readonly historyRepo: Repository<LotStatusHistoryEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    private readonly gateway: NotificationsGateway,
  ) {}

  async audit(userId: number, action: string, entity?: string, entityId?: number) {
    await this.auditRepo.save({ userId, action, entity, entityId });
  }

  // Un lote esta comercialmente bloqueado cuando ya se vendio o se marco con un
  // estado legacy equivalente a vendido. En esos casos la ficha no debe
  // permitir tocar estado ni precios.
  private isCommerciallyLocked(status?: string | null) {
    return !!status && COMMERCIALLY_LOCKED_STATUSES.includes(status);
  }

  private streetKey(value?: string | null) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
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
    const nameKey = this.streetKey(dto.name);
    const streets = await this.blockRepo.find({ where: { projectId } });
    if (streets.some((street) => this.streetKey(street.name) === nameKey)) {
      throw new BadRequestException('Ya existe una calle con ese nombre');
    }
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
    if (dto.name !== undefined) {
      const nameKey = this.streetKey(dto.name);
      const streets = await this.blockRepo.find({ where: { projectId: street.projectId } });
      if (streets.some((item) => item.id !== street.id && this.streetKey(item.name) === nameKey)) {
        throw new BadRequestException('Ya existe una calle con ese nombre');
      }
    }
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
  async listLotCatalog(projectId: number) {
    const rows = await this.lotCatalogRepo
      .createQueryBuilder('cat')
      .leftJoin(LotEntity, 'lot', 'lot.project_id = cat.project_id AND lot.code = cat.code')
      .leftJoin(
        SaleEntity,
        'sale',
        `sale.id = (
          SELECT s2.id
            FROM sales s2
           WHERE s2.lot_id = lot.id
             AND s2.status <> 'rechazada'
             AND s2.approval_status <> 'rechazada'
           ORDER BY s2.id DESC
           LIMIT 1
        )`,
      )
      .leftJoin(ClientEntity, 'client', 'client.id = sale.client_id')
      .select([
        'cat.id AS "id"',
        'cat.project_id AS "projectId"',
        'cat.code AS "code"',
        'cat.address AS "address"',
        'cat.type AS "type"',
        'cat.area_m2 AS "areaM2"',
        'cat.dimensions AS "dimensions"',
        'cat.price_m2 AS "priceM2"',
        'cat.sale_price AS "salePrice"',
        'cat.discount AS "discount"',
        'cat.created_at AS "createdAt"',
        'cat.updated_at AS "updatedAt"',
      ])
      .addSelect('COALESCE(sale.sale_price, cat.final_price, 0)', 'finalPrice')
      .addSelect('COALESCE(lot.selling_stage, lot.status, cat.status, \'disponible\')', 'status')
      .addSelect('COALESCE(client.full_name, cat.client, \'\')', 'client')
      .where('cat.project_id = :projectId', { projectId })
      .orderBy('cat.code', 'ASC')
      .getRawMany();
    return rows;
  }

  async importLotCatalog(projectId: number, file: Express.Multer.File, actorId: number) {
    if (!file?.buffer?.length) throw new BadRequestException('Adjunta un archivo Excel');
    if (!/\.(xlsx|xls|csv)$/i.test(file.originalname || '')) {
      throw new BadRequestException('El archivo debe ser Excel (.xlsx, .xls) o CSV');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('El Excel no contiene hojas');

    const grid = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
    const headerIndex = grid.findIndex((row) => row.some((cell) => this.lotCatalogHeaderKey(cell) === 'code'));
    if (headerIndex < 0) throw new BadRequestException('No se encontro la cabecera Num. de lote');

    const header = grid[headerIndex].map((cell) => this.lotCatalogHeaderKey(cell));
    const existing = await this.lotCatalogRepo.find({ where: { projectId } });
    const byCode = new Map(existing.map((row) => [this.lotCatalogCodeKey(row.code), row]));
    const existingRawCodes = new Set(existing.map((row) => String(row.code || '').trim().toUpperCase()));
    const importedKeys = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const raw of grid.slice(headerIndex + 1)) {
      const data: Record<string, any> = {};
      header.forEach((key, index) => {
        if (key) data[key] = raw[index];
      });
      const code = String(data.code || '').trim();
      if (!code || /^total/i.test(code)) continue;
      const key = this.lotCatalogCodeKey(code);
      if (importedKeys.has(key)) continue;
      importedKeys.add(key);
      const rawKey = code.toUpperCase();
      const row = {
        projectId,
        code,
        address: this.cleanText(data.address),
        type: this.cleanText(data.type),
        areaM2: String(this.parseMoney(data.areaM2)),
        dimensions: this.cleanText(data.dimensions),
        priceM2: String(this.parseMoney(data.priceM2)),
        salePrice: String(this.parseMoney(data.salePrice)),
        discount: String(this.parseMoney(data.discount)),
      };
      if (byCode.has(key) || existingRawCodes.has(rawKey)) {
        updated += 1;
      } else {
        created += 1;
      }
      await this.lotCatalogRepo.upsert(row, ['projectId', 'code']);
      existingRawCodes.add(rawKey);
      byCode.set(key, row as ProjectLotCatalogEntity);
    }

    await this.audit(actorId, 'IMPORTAR_LOTES_BASE', 'project_lot_catalog');
    return { ok: true, sheet: sheetName, created, updated, total: created + updated };
  }

  private lotCatalogCodeKey(value: string) {
    return String(value || '').trim().toUpperCase().replace(/^L-0+(\d+)$/, 'L-$1');
  }

  private lotCatalogHeaderKey(value: unknown) {
    const text = String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';
    if (text.includes('num') && text.includes('lote')) return 'code';
    if (text === 'lote' || text === 'codigo' || text === 'codigo lote') return 'code';
    if (text.includes('direccion')) return 'address';
    if (text === 'tipo') return 'type';
    if (text.includes('area')) return 'areaM2';
    if (text.includes('dimension')) return 'dimensions';
    if (text.includes('precio') && text.includes('m2')) return 'priceM2';
    if (text.includes('precio') && text.includes('venta')) return 'salePrice';
    if (text.includes('bono') || text.includes('dscto') || text.includes('descuento')) return 'discount';
    if (text.includes('precio') && text.includes('final')) return '';
    if (text.includes('estado')) return '';
    if (text.includes('cliente')) return '';
    return '';
  }

  private parseMoney(value: unknown) {
    return Number(String(value || '0').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
  }

  private cleanText(value: unknown) {
    const text = String(value || '').trim();
    return text || null;
  }

  async upsertLotCatalog(projectId: number, dto: UpsertProjectLotCatalogDto, actorId: number, rowId?: number) {
    const code = String(dto.code || '').trim();
    if (!code) throw new BadRequestException('Indica el codigo del lote');
    let row = rowId
      ? await this.lotCatalogRepo.findOne({ where: { id: rowId, projectId } })
      : await this.lotCatalogRepo.findOne({ where: { projectId, code } });
    if (!row) row = this.lotCatalogRepo.create({ projectId });
    if (row.id) {
      const lots = await this.lotRepo.find({ where: { projectId } });
      const linkedLot = lots.find((lot) => this.lotCatalogCodeKey(lot.code) === this.lotCatalogCodeKey(row.code));
      const linkedSold = linkedLot?.status === 'vendido' || linkedLot?.sellingStage === 'vendido';
      if (linkedSold) {
        throw new BadRequestException('El lote esta vendido: la base de lotes queda solo en lectura para este registro.');
      }
    }
    row.code = code;
    row.address = dto.address || null;
    row.type = dto.type || null;
    row.areaM2 = String(dto.areaM2 ?? 0);
    row.dimensions = dto.dimensions || null;
    row.priceM2 = String(dto.priceM2 ?? 0);
    row.salePrice = String(dto.salePrice ?? 0);
    row.discount = String(dto.discount ?? 0);
    const normalizedStatus = dto.status !== undefined ? normalizeLotStatus(dto.status) || 'disponible' : row.status || 'disponible';
    if (!MANUAL_LOT_STATUSES.includes(normalizedStatus)) {
      throw new BadRequestException('El estado vendido solo se genera desde una venta. Elige Disponible, Separado, En Promocion o 2da. Etapa.');
    }
    row.status = normalizedStatus;
    if (!row.finalPrice) row.finalPrice = '0';
    if (!row.client) row.client = null;
    const saved = await this.lotCatalogRepo.save(row);
    await this.audit(actorId, rowId ? 'EDITAR_LOTE_BASE' : 'CREAR_LOTE_BASE', 'project_lot_catalog', saved.id);
    return saved;
  }

  async deleteLotCatalog(projectId: number, rowId: number, actorId: number) {
    await this.lotCatalogRepo.delete({ id: rowId, projectId });
    await this.audit(actorId, 'ELIMINAR_LOTE_BASE', 'project_lot_catalog', rowId);
    return { ok: true };
  }

  async createLot(projectId: number, dto: CreateLotDto, actorId: number) {
    const plan = await this.getOrCreatePlan(projectId);
    const code = String(dto.code || '').trim();
    if (!code) throw new BadRequestException('Indica el codigo del lote');
    const codeKey = this.lotCatalogCodeKey(code);
    const lots = await this.lotRepo.find({ where: { projectId } });
    if (lots.some((lot) => this.lotCatalogCodeKey(lot.code) === codeKey)) {
      throw new BadRequestException('Ya existe un lote con ese codigo');
    }
    const normalizedStatus = normalizeLotStatus(dto.status) || 'disponible';
    if (!MANUAL_LOT_STATUSES.includes(normalizedStatus)) {
      throw new BadRequestException('El estado vendido solo se genera desde una venta. Elige Disponible, Separado, En Promocion o 2da. Etapa.');
    }
    const lot = this.lotRepo.create({
      projectId,
      planId: plan.id,
      streetId: dto.streetId ?? dto.blockId,
      code,
      address: dto.address,
      points: dto.points,
      areaM2: String(dto.areaM2 ?? 0),
      price: String(dto.price ?? 0),
      status: normalizedStatus,
      agentId: dto.agentId,
      type: dto.type,
      dimensions: dto.dimensions,
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
    const isSold = lot.status === 'vendido' || lot.sellingStage === 'vendido';
    const isSeparated = lot.sellingStage === 'separado';
    if (isSold) {
      throw new BadRequestException('El lote esta vendido: la ficha se puede ver, pero no se puede editar.');
    }
    if (isSeparated) {
      const lockedSeparatedFields: { key: string; label: string }[] = [
        { key: 'clientId', label: 'el cliente' },
        { key: 'finalPrice', label: 'el precio final' },
      ];
      const touchedSeparated = lockedSeparatedFields.filter((field) => dto[field.key as keyof UpdateLotDto] !== undefined);
      if (touchedSeparated.length > 0) {
        throw new BadRequestException(
          `El lote esta separado: no se puede modificar ${touchedSeparated.map((field) => field.label).join(', ')}.`,
        );
      }
    }

    // Un lote vendido, reservado o alquilado ya generó una operación real: sus
    // datos comerciales (estado, precios) quedan congelados para que nadie
    // altere lo que el cliente ya pago ni libere el lote para revenderlo.
    // El resto de la ficha (codigo, calle, area, dimensiones, tipo) sigue
    // siendo editable porque son datos descriptivos, no comerciales.
    const lockedMessages: { key: string; label: string }[] = [
      { key: 'status', label: 'el estado' },
      { key: 'salePrice', label: 'el precio de venta' },
      { key: 'finalPrice', label: 'el precio final' },
    ];
    const touched = lockedMessages.filter((field) => dto[field.key as keyof UpdateLotDto] !== undefined);
    if (this.isCommerciallyLocked(lot.status) && touched.length > 0) {
      const labels = touched.map((field) => field.label).join(', ');
      throw new BadRequestException(
        `El lote está ${LOT_STATUS_LABEL_TEXT[lot.status] || lot.status}: no se puede modificar ${labels}. ` +
        'Para cambiarlo primero hay que liberar el lote desde el estado de la ficha.',
      );
    }

    if (dto.code !== undefined) {
      const code = String(dto.code || '').trim();
      if (!code) throw new BadRequestException('Indica el codigo del lote');
      const codeKey = this.lotCatalogCodeKey(code);
      const lots = await this.lotRepo.find({ where: { projectId: lot.projectId } });
      if (lots.some((item) => item.id !== lot.id && this.lotCatalogCodeKey(item.code) === codeKey)) {
        throw new BadRequestException('Ya existe un lote con ese codigo');
      }
      lot.code = code;
    }
    if (dto.address !== undefined) lot.address = dto.address;
    if (dto.streetId !== undefined || dto.blockId !== undefined) lot.streetId = dto.streetId ?? dto.blockId ?? null;
    if (dto.points !== undefined) lot.points = dto.points;
    if (dto.areaM2 !== undefined) lot.areaM2 = String(dto.areaM2);
    if (dto.price !== undefined) lot.price = String(dto.price);
    if (dto.clientId !== undefined) lot.clientId = dto.clientId;
    if (dto.agentId !== undefined) lot.agentId = dto.agentId;
    if (dto.type !== undefined) lot.type = dto.type;
    if (dto.dimensions !== undefined) lot.dimensions = dto.dimensions;
    if (dto.salePrice !== undefined) lot.salePrice = String(dto.salePrice);
    if (dto.finalPrice !== undefined) lot.finalPrice = String(dto.finalPrice);
    const normalizedStatus = normalizeLotStatus(dto.status);
    if (normalizedStatus !== undefined && !MANUAL_LOT_STATUSES.includes(normalizedStatus)) {
      throw new BadRequestException('El estado vendido solo se genera desde una venta. Elige Disponible, Separado, En Promocion o 2da. Etapa.');
    }
    if (normalizedStatus !== undefined && normalizedStatus !== lot.status) {
      await this.historyRepo.save({
        lotId,
        fromStatus: lot.status,
        toStatus: normalizedStatus,
        userId: actorId,
        createdAt: dto.statusDate ? new Date(dto.statusDate) : undefined,
      });
      lot.status = normalizedStatus;
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
    const lot = await this.lotRepo.findOne({ where: { id: lotId } });
    await this.lotRepo.delete({ id: lotId });
    await this.audit(actorId, 'ELIMINAR_LOTE', 'lots', lotId);
    this.gateway.emitToAll('lot.updated', { id: lotId, projectId: lot?.projectId, deleted: true });
    return { ok: true };
  }

  async lotHistory(lotId: number) {
    return this.historyRepo.find({ where: { lotId }, order: { createdAt: 'DESC' } });
  }
}

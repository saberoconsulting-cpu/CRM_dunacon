// modules/sales/application/sales.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SaleEntity } from '../../../shared/infrastructure/entities/sale.entity';
import { SaleInstallmentEntity } from '../../../shared/infrastructure/entities/sale-installment.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { UserEntity } from '../../../shared/infrastructure/entities/user.entity';
import { FinancialTransactionEntity } from '../../../shared/infrastructure/entities/financial-transaction.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { NotificationsGateway } from '../../../shared/infrastructure/websocket/notifications.gateway';
import { CreateSaleDto } from './dto/sale.dto';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    @InjectRepository(LotEntity)
    private readonly lotRepo: Repository<LotEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(SaleInstallmentEntity)
    private readonly instRepo: Repository<SaleInstallmentEntity>,
    @InjectRepository(FinancialTransactionEntity)
    private readonly txnRepo: Repository<FinancialTransactionEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    private readonly gateway: NotificationsGateway,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async audit(userId: number, action: string, entity?: string, entityId?: number, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(AuditLogEntity) : this.auditRepo;
    await repo.save({ userId, action, entity, entityId });
  }

  async create(dto: CreateSaleDto, actorId: number) {
    const lot = await this.lotRepo.findOne({ where: { id: dto.lotId } });
    if (!lot) throw new BadRequestException('Lote no encontrado');
    if (lot.status === 'vendido' || lot.sellingStage === 'vendido') {
      throw new BadRequestException('El lote ya fue vendido y no puede venderse nuevamente');
    }
    if (lot.sellingStage === 'separado') {
      throw new BadRequestException('El lote ya tiene una separación pendiente de validación');
    }

    const agent = await this.userRepo.findOne({ where: { id: dto.agentId } });
    const appliesAgency = !!dto.appliesCommission;
    const commissionRate = dto.commissionRate ?? Number(agent?.commissionRate || 0);
    const commission = commissionRate ? (dto.salePrice * commissionRate) / 100 : 0;
    const totalCuotas = dto.totalCuotas || 0;
    // En inmobiliaria la financiación arranca del neto (se descuenta la comisión del lote)
    const financingBase = appliesAgency ? dto.salePrice - commission : dto.salePrice;
    const valorCuota = dto.valorCuota || (dto.totalCuotas && dto.totalCuotas > 0 ? financingBase / dto.totalCuotas : 0);

    // La venta, el "claim" atómico del lote y la auditoría deben quedar juntos:
    // antes eran saves() independientes y un fallo a mitad dejaba la separación
    // creada sin que el lote reflejara el compromiso (o viceversa).
    const saved = await this.dataSource.transaction(async (manager) => {
      const sale = manager.create(SaleEntity, {
        projectId: dto.projectId,
        lotId: dto.lotId,
        clientId: dto.clientId,
        agentId: dto.agentId,
        salePrice: String(dto.salePrice),
        saleDate: dto.saleDate || undefined,
        commission: String(commission),
        financingBase: String(financingBase),
        conditions: dto.conditions,
        status: 'cerrada',
        approvalStatus: 'pendiente',
        totalCuotas,
        valorCuota: String(valorCuota),
        planStatus: 'pendiente',
      });
      const savedSale = await manager.save(sale);

      // El lote queda "separado" hasta aprobación. Compromiso ATOMICO:
      // solo gana si sigue disponible; evita que dos agentes vendan/reserven a la vez.
      const claimed = await manager.update(
        LotEntity,
        { id: lot.id, sellingStage: 'disponible' },
        { sellingStage: 'separado', agentId: dto.agentId, clientId: dto.clientId ?? lot.clientId ?? null },
      );
      const won = claimed.affected == null || Number(claimed.affected) > 0;
      if (!won) {
        throw new BadRequestException('Mientras confirmabas, otro agente gestionó este lote. Puedes verlo, contactar al asesor responsable o pedir reasignación al administrador, pero no registrar una venta duplicada.');
      }
      lot.sellingStage = 'separado';
      lot.clientId = dto.clientId ?? lot.clientId;
      lot.agentId = dto.agentId;

      await this.audit(actorId, 'CREAR_SEPARACION', 'sales', savedSale.id, manager);
      return savedSale;
    });

    this.gateway.emitToAll('sale.created', saved);
    this.gateway.emitToAll('lot.updated', lot);
    return { ...saved, commissionRate, commission };
  }

  /** Aprueba la separación: activa plan, cronograma y pasa lote a vendido. */
  async approve(id: number, actorId: number) {
    const sale = await this.saleRepo.findOne({ where: { id } });
    if (!sale) throw new BadRequestException('Venta no encontrada');
    if (sale.approvalStatus === 'aprobada') return sale;

    let lot: LotEntity | null = null;
    const kept = await this.dataSource.transaction(async (manager) => {
      sale.approvalStatus = 'aprobada';
      sale.status = 'cerrada';
      sale.approvedBy = actorId;
      sale.approvedAt = new Date();
      sale.planStatus = 'al_dia';
      const savedSale = await manager.save(sale);

      // Lote: aprobada ⇒ vendido
      lot = await manager.findOne(LotEntity, { where: { id: sale.lotId } });
      if (lot) {
        lot.sellingStage = 'vendido';
        lot.status = 'vendido';
        await manager.save(LotEntity, lot);
      }

      // Ingreso inmutable por la venta al aprobarse
      await manager.save(FinancialTransactionEntity, {
        projectId: sale.projectId,
        lotId: sale.lotId,
        clientId: sale.clientId,
        createdBy: actorId,
        type: 'ingreso',
        category: 'venta',
        concept: `Venta aprobada lote #${sale.lotId}`,
        amount: sale.salePrice,
      });

      // Cronograma si hay plan
      if (sale.totalCuotas > 0) {
        await this.buildSchedule(sale.id, sale.totalCuotas, Number(sale.valorCuota) || 0, sale.approvedAt, manager);
      }

      await this.audit(actorId, 'APROBAR_SEPARACION', 'sales', id, manager);
      return savedSale;
    });

    this.gateway.emitToAll('lot.updated', lot);
    this.gateway.emitToAll('sale.created', kept);
    return kept;
  }

  /** Rechaza la separación (libera el lote). */
  async reject(id: number, actorId: number, note?: string) {
    const sale = await this.saleRepo.findOne({ where: { id } });
    if (!sale) throw new BadRequestException('Venta no encontrada');

    let lot: LotEntity | null = null;
    const kept = await this.dataSource.transaction(async (manager) => {
      sale.approvalStatus = 'rechazada';
      sale.planStatus = 'cancelada';
      sale.status = 'rechazada';
      const savedSale = await manager.save(sale);

      lot = await manager.findOne(LotEntity, { where: { id: sale.lotId } });
      if (lot && lot.sellingStage === 'separado') {
        lot.sellingStage = 'disponible';
        lot.clientId = null;
        await manager.save(LotEntity, lot);
      }
      await this.audit(actorId, 'RECHAZAR_SEPARACION', 'sales', id, manager);
      return savedSale;
    });

    this.gateway.emitToAll('lot.updated', lot);
    return { kept, note };
  }

  private async buildSchedule(saleId: number, n: number, amount: number, start?: Date | null, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(SaleInstallmentEntity) : this.instRepo;
    const begin = start ? new Date(start) : new Date();
    const rows: Partial<SaleInstallmentEntity>[] = [];
    for (let i = 1; i <= n; i++) {
      const d = new Date(begin.getFullYear(), begin.getMonth() + i, begin.getDate());
      rows.push({
        saleId,
        installmentNo: i,
        amount: String(amount || 0),
        dueDate: d.toISOString().slice(0, 10),
        status: 'pendiente',
      });
    }
    await repo.save(rows);
  }


  async list(filters: {
    projectId?: number;
    agentId?: number;
    from?: string;
    to?: string;
    status?: string;
    search?: string;
  }) {
    const qb = this.saleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect(UserEntity, 'u', 'u.id = s.agent_id')
      .leftJoinAndSelect(LotEntity, 'l', 'l.id = s.lot_id')
      .select([
        's.id', 's.projectId', 's.lotId', 's.clientId', 's.agentId',
        's.salePrice', 's.saleDate', 's.commission', 's.conditions', 's.status', 's.createdAt',
      ])
      .addSelect('u.name AS agentName')
      .addSelect('l.code AS lotCode')
      .addSelect('s.approval_status AS approvalStatus')
      .addSelect('s.plan_status AS planStatus')
      .addSelect('s.total_cuotas AS totalCuotas');
    if (filters.projectId) qb.andWhere('s.project_id = :projectId', { projectId: filters.projectId });
    if (filters.agentId) qb.andWhere('s.agent_id = :agentId', { agentId: filters.agentId });
    if (filters.status) qb.andWhere('s.approval_status = :status', { status: filters.status });
    if (filters.from) qb.andWhere('s.sale_date >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('s.sale_date <= :to', { to: filters.to });
    if (filters.search) qb.andWhere('l.code ILIKE :search', { search: `%${filters.search}%` });
    qb.orderBy('s.sale_date', 'DESC');
    const raw = await qb.getRawMany();
    return raw.map((r) => ({
      id: Number(r.s_id), projectId: Number(r.s_project_id), lotId: Number(r.s_lot_id),
      clientId: r.s_client_id ? Number(r.s_client_id) : null,
      agentId: r.s_agent_id ? Number(r.s_agent_id) : null,
      salePrice: Number(r.s_sale_price), saleDate: r.s_sale_date,
      commission: Number(r.s_commission), conditions: r.s_conditions,
      status: r.s_status, createdAt: r.s_created_at,
      agentName: r.agentName || null, lotCode: r.lotCode || null,
      approvalStatus: r.approvalStatus || 'pendiente',
      planStatus: r.planStatus || 'pendiente',
      totalCuotas: Number(r.totalCuotas || 0),
    }));
  }

  /** Financiación / venta vigente de un lote + cronograma de sus cuotas. */
  async getByLot(lotId: number) {
    const sale = await this.saleRepo.findOne({
      where: { lotId },
      order: { createdAt: 'DESC' } as any,
    });
    const installments = sale
      ? await this.instRepo.find({
          where: { saleId: sale.id },
          order: { installmentNo: 'ASC' } as any,
        })
      : [];
    return { sale, installments };
  }

  /** Separaciones pendientes de aprobación (Admin/Tesorería). */
  async pendingApprovals() {
    return this.saleRepo.find({ where: { approvalStatus: 'pendiente' }, order: { createdAt: 'DESC' } as any });
  }

  /** Cronograma de una venta aprobada. */
  async schedule(saleId: number) {
    return this.instRepo.find({ where: { saleId }, order: { installmentNo: 'ASC' } });
  }
}
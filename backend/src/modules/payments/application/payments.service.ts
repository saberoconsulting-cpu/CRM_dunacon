// modules/payments/application/payments.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaymentEntity } from '../../../shared/infrastructure/entities/payment.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { LotStatusHistoryEntity } from '../../../shared/infrastructure/entities/lot-status-history.entity';
import { FinancialTransactionEntity } from '../../../shared/infrastructure/entities/financial-transaction.entity';
import { ClientEntity } from '../../../shared/infrastructure/entities/client.entity';
import { UserEntity } from '../../../shared/infrastructure/entities/user.entity';
import { SaleEntity } from '../../../shared/infrastructure/entities/sale.entity';
import { NotificationsGateway } from '../../../shared/infrastructure/websocket/notifications.gateway';
import { CreatePaymentDto } from './dto/payment.dto';

// Estado comercial al que conduce cada tipo de pago
const TYPE_STATUS: Record<string, string> = {
  reserva: 'reservado',
  adelanto: 'adelanto',
  primera_cuota: 'primera_cuota',
};

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(LotEntity)
    private readonly lotRepo: Repository<LotEntity>,
    @InjectRepository(LotStatusHistoryEntity)
    private readonly historyRepo: Repository<LotStatusHistoryEntity>,
    @InjectRepository(FinancialTransactionEntity)
    private readonly txnRepo: Repository<FinancialTransactionEntity>,
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    private readonly gateway: NotificationsGateway,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async register(dto: CreatePaymentDto, actorId: number) {
    const lot = await this.lotRepo.findOne({ where: { id: dto.lotId } });
    const clientRaw = dto.clientId ?? lot?.clientId ?? undefined;
    const agentRaw = dto.agentId ?? lot?.agentId ?? undefined;
    const clientId = typeof clientRaw === 'number' ? clientRaw : undefined;
    const agentId = typeof agentRaw === 'number' ? agentRaw : undefined;

    // El pago, el movimiento financiero, el historial y el estado del lote deben
    // quedar todos o ninguno: antes cada save() era independiente y un fallo a
    // mitad de camino (o la validación de "lote ya tiene asesor" de abajo) podía
    // dejar el pago registrado sin su movimiento contable o sin actualizar el lote.
    let lotStatusChanged = false;
    const saved = await this.dataSource.transaction(async (manager) => {
      const payment = manager.create(PaymentEntity, {
        projectId: dto.projectId,
        lotId: dto.lotId,
        clientId,
        agentId,
        type: dto.type,
        amount: String(dto.amount),
        paymentMethod: dto.paymentMethod || 'otro',
        reference: dto.reference || undefined,
        dueDate: dto.dueDate || undefined,
        status: dto.dueDate ? 'pendiente' : 'pagado',
        paidAt: dto.dueDate ? undefined : new Date(),
        note: dto.note,
        createdBy: actorId,
      });
      // Si no hay fecha de vencimiento, se considera pago inmediato (pagado)
      if (!dto.dueDate) payment.status = 'pagado';
      const savedPayment = await manager.save(payment);
      if (!savedPayment || !savedPayment.id) {
        throw new Error('No se pudo registrar el pago');
      }

      // Registrar movimiento financiero inmutable (ingreso)
      await manager.save(FinancialTransactionEntity, {
        projectId: dto.projectId,
        lotId: dto.lotId,
        clientId,
        paymentId: savedPayment.id,
        createdBy: actorId,
        type: 'ingreso',
        category: dto.type,
        concept: `Pago ${dto.type} del lote ${lot?.code ?? ''}`,
        amount: String(dto.amount),
      });

      // Asesor/responsable automático y bloqueo de venta "robada".
      // Reservar/adelantar = compromete el lote a su vendedor (regla de negocio).
      if (lot && TYPE_STATUS[dto.type] && lot.status !== 'vendido') {
        const claim = dto.agentId != null && !Number.isNaN(Number(dto.agentId)) ? Number(dto.agentId) : (actorId || null);
        const owning = lot.agentId == null ? null : Number(lot.agentId);
        if (owning && claim && owning !== claim) {
          const msg = 'Este lote ya tiene un asesor responsable de su venta.';
          throw new BadRequestException(msg + ' Puedes verlo, pero para gestionarlo o reasignarlo pídelo al administrador (evita registrar ventas duplicadas o ajenas).');
        }
        if (!owning && claim) {
          lot.agentId = claim; // queda el responsable de esta venta
        }

        // Actualizar estado comercial del lote según el tipo de pago
        const target = TYPE_STATUS[dto.type];
        if (lot.status !== target) {
          await manager.save(LotStatusHistoryEntity, {
            lotId: lot.id,
            fromStatus: lot.status,
            toStatus: target,
            userId: actorId,
            note: `Pago por ${dto.type}`,
          });
          lot.status = target;
          await manager.save(LotEntity, lot);
          lotStatusChanged = true;
        }
      }

      return savedPayment;
    });

    // Eventos en tiempo real, solo una vez comprometida la transacción.
    if (lotStatusChanged && lot) this.gateway.emitToAll('lot.updated', lot);
    this.gateway.emitToAll('payment.created', saved);
    return saved;
  }

  async list(filters: {
    projectId?: number;
    lotId?: number;
    agentId?: number;
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 20));

    const applyFilters = (qb: any) => {
      if (filters.projectId) qb.andWhere('p.project_id = :projectId', { projectId: filters.projectId });
      if (filters.lotId) qb.andWhere('p.lot_id = :lotId', { lotId: filters.lotId });
      if (filters.agentId) qb.andWhere('p.agent_id = :agentId', { agentId: filters.agentId });
      if (filters.status) qb.andWhere('p.status = :status', { status: filters.status });
      if (filters.type) qb.andWhere('p.type = :type', { type: filters.type });
      return qb;
    };

    const qb = applyFilters(
      this.paymentRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect(LotEntity, 'l', 'l.id = p.lot_id')
        .leftJoinAndSelect(ClientEntity, 'c', 'c.id = p.client_id')
        .leftJoinAndSelect(UserEntity, 'u', 'u.id = p.created_by')
        .select([
          'p.id', 'p.projectId', 'p.lotId', 'p.clientId', 'p.agentId', 'p.type', 'p.amount',
          'p.dueDate', 'p.paymentMethod', 'p.reference', 'p.voucherUrl', 'p.paidAt', 'p.status', 'p.createdAt',
        ])
        // Postgres pliega a minúsculas cualquier alias sin comillas — mismo bug
        // ya corregido en lots.service.ts y sales.service.ts.
        .addSelect('l.code AS "lotCode"')
        .addSelect('COALESCE(l.sale_price, l.price) AS "salePrice"')
        .addSelect('c.full_name AS "clientName"')
        .addSelect('u.name AS "receivedByName"'),
    );
    qb.orderBy('p.created_at', 'DESC');
    const total = await qb.clone().getCount();

    // Conteos sobre TODO el filtro (no solo la página actual), para que las
    // StatCards "Total Venta" / "Pagos Pendiente" sean correctas con paginación.
    const distinctLots = await applyFilters(this.paymentRepo.createQueryBuilder('p'))
      .select('COUNT(DISTINCT p.lot_id)', 'count')
      .getRawOne();
    const pending = await applyFilters(this.paymentRepo.createQueryBuilder('p'))
      .andWhere("p.status = 'pendiente'")
      .select('COUNT(*)', 'count')
      .getRawOne();

    qb.skip((page - 1) * limit).take(limit);
    const raw = await qb.getRawMany();
    const items = raw.map((r) => ({
      id: Number(r.p_id), projectId: Number(r.p_project_id), lotId: Number(r.p_lot_id),
      clientId: r.p_client_id ? Number(r.p_client_id) : null,
      agentId: r.p_agent_id ? Number(r.p_agent_id) : null,
      type: r.p_type, amount: Number(r.p_amount),
      dueDate: r.p_due_date, paymentMethod: r.p_payment_method,
      reference: r.p_reference, voucherUrl: r.p_voucher_url,
      paidAt: r.p_paid_at, status: r.p_status, createdAt: r.p_created_at,
      lotCode: r.lotCode || null,
      salePrice: r.salePrice != null ? Number(r.salePrice) : null,
      clientName: r.clientName || null,
      receivedByName: r.receivedByName || null,
    }));

    return {
      items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)),
      distinctLots: Number(distinctLots?.count || 0),
      pendingCount: Number(pending?.count || 0),
    };
  }

  async markPaid(paymentId: number) {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) return null;
    payment.status = 'pagado';
    payment.paidAt = new Date();
    payment.dueDate = null;
    const saved = await this.paymentRepo.save(payment);
    this.gateway.emitToAll('payment.created', saved);
    return saved;
  }

  // Adjuntar/actualizar comprobante (voucher) mediante URL de subida previa
  async attachVoucher(paymentId: number, url: string) {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) return null;
    payment.voucherUrl = url;
    const saved = await this.paymentRepo.save(payment);
    this.gateway.emitToAll('payment.updated', saved);
    return saved;
  }

  // Métricas de caja: por medio de pago, por mes (pagado), ventas por mes y
  // morosidad por mes (para el gráfico de doble eje "Pagos vs Morosidad").
  async summary(projectId?: number) {
    const methods: any = await this.paymentRepo
      .createQueryBuilder('p')
      .select('COALESCE(p.payment_method, \'otro\')', 'method')
      .addSelect('COUNT(*)', 'total')
      .addSelect('COALESCE(SUM(p.amount),0)', 'monto')
      .where("p.status = 'pagado'")
      .andWhere(projectId ? 'p.project_id = :projectId' : '1=1', { projectId })
      .groupBy('p.payment_method')
      .orderBy('monto', 'DESC')
      .getRawMany();
    const byMonth: any = await this.paymentRepo
      .createQueryBuilder('p')
      .select("to_char(p.created_at, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(p.amount),0)', 'monto')
      .where("p.status = 'pagado'")
      .andWhere(projectId ? 'p.project_id = :projectId' : '1=1', { projectId })
      .groupBy('1')
      .orderBy('1', 'ASC')
      .getRawMany();

    // "Morosidad": monto de cuotas vencidas o pendientes ya pasadas de fecha,
    // agrupado por mes de vencimiento.
    const overdueByMonth: any = await this.paymentRepo
      .createQueryBuilder('p')
      .select("to_char(p.due_date, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(p.amount),0)', 'monto')
      .where("p.status IN ('pendiente','vencido') AND p.due_date < CURRENT_DATE")
      .andWhere(projectId ? 'p.project_id = :projectId' : '1=1', { projectId })
      .groupBy('1')
      .orderBy('1', 'ASC')
      .getRawMany();

    // "Ventas por mes": monto de ventas aprobadas, agrupado por mes de venta.
    const salesByMonth: any = await this.saleRepo
      .createQueryBuilder('s')
      .select("to_char(s.sale_date, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(s.sale_price),0)', 'monto')
      .where("s.approval_status = 'aprobada'")
      .andWhere(projectId ? 's.project_id = :projectId' : '1=1', { projectId })
      .groupBy('1')
      .orderBy('1', 'ASC')
      .getRawMany();

    return {
      methods: (methods || []).map((r: any) => ({ method: r.method, total: Number(r.total || 0), monto: Number(r.monto || 0) })),
      byMonth: (byMonth || []).map((r: any) => ({ month: r.month, monto: Number(r.monto || 0) })),
      overdueByMonth: (overdueByMonth || []).map((r: any) => ({ month: r.month, monto: Number(r.monto || 0) })),
      salesByMonth: (salesByMonth || []).map((r: any) => ({ month: r.month, monto: Number(r.monto || 0) })),
    };
  }

  // Alertas: cuotas vencidas y próximas a vencer (7 días)
  async alerts() {
    const today = new Date().toISOString().slice(0, 10);
    const plus7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const overdue = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.status = :s AND p.due_date < :today', { s: 'pendiente', today })
      .getMany();
    const upcoming = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.status = :s AND p.due_date >= :today AND p.due_date <= :plus7', { s: 'pendiente', today, plus7 })
      .getMany();
    return { overdue, upcoming };
  }
}
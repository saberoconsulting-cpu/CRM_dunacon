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
import { SaleInstallmentEntity } from '../../../shared/infrastructure/entities/sale-installment.entity';
import { NotificationsGateway } from '../../../shared/infrastructure/websocket/notifications.gateway';
import { ApprovePaymentDto, CreatePaymentDto } from './dto/payment.dto';
import { comparePaymentsForDisplay, paymentConcept, paymentConceptLabel, paymentConceptRank } from '../domain/payment-order';

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
    @InjectRepository(SaleInstallmentEntity)
    private readonly installmentRepo: Repository<SaleInstallmentEntity>,
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
      const concept = paymentConcept(dto.type);
      if (concept === 'reserva') {
        const existingReserva = await manager.getRepository(PaymentEntity).count({
          where: { lotId: dto.lotId, type: 'reserva' },
        });
        if (existingReserva > 0) {
          throw new BadRequestException('La reserva de este lote ya fue registrada. El siguiente pago debe ser cuota inicial o cuota, segun el cronograma.');
        }
      }
      if (concept === 'cuota_inicial') {
        const sale = await manager.getRepository(SaleEntity).findOne({ where: { lotId: dto.lotId }, order: { id: 'DESC' } });
        const cuotaInicialTotal = Math.max(0, Number((sale as any)?.cuotaInicial || 0));
        const partsMatch = String(sale?.conditions || '').match(/Pago inicial:\s*(\d+)\s*partes/i);
        const initialParts = cuotaInicialTotal > 0 ? Math.max(1, partsMatch ? Number(partsMatch[1] || 1) : 1) : 1;
        const existingInitials = await manager.getRepository(PaymentEntity).find({
          where: [
            { lotId: dto.lotId, type: 'adelanto' },
            { lotId: dto.lotId, type: 'cuota_inicial' },
          ],
        });
        const alreadyRegistered = existingInitials.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const pendingInitial = Math.max(0, cuotaInicialTotal - alreadyRegistered);
        if (existingInitials.length >= initialParts) {
          throw new BadRequestException(initialParts === 1
            ? 'La cuota inicial ya fue registrada. El siguiente pago debe ser una cuota del cronograma.'
            : `La cuota inicial ya tiene sus ${initialParts} partes registradas. El siguiente pago debe ser una cuota del cronograma.`);
        }
        if (cuotaInicialTotal > 0 && alreadyRegistered + Number(dto.amount || 0) > cuotaInicialTotal + 0.01) {
          throw new BadRequestException(`Este monto supera la cuota inicial pendiente. Falta registrar como maximo S/ ${pendingInitial.toFixed(2)} de cuota inicial.`);
        }
      }

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
        exchangeRate: dto.exchangeRate != null ? String(dto.exchangeRate) : null,
        amountUsd: dto.amountUsd != null ? String(dto.amountUsd) : null,
        bankOperationNumber: dto.bankOperationNumber || null,
        receiptNumber: dto.receiptNumber || null,
        receiptValue: dto.receiptValue != null ? String(dto.receiptValue) : null,
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
        .leftJoinAndSelect(UserEntity, 'au', 'au.id = p.approved_by')
        .select([
          'p.id', 'p.projectId', 'p.lotId', 'p.clientId', 'p.agentId', 'p.type', 'p.amount',
          'p.dueDate', 'p.paymentMethod', 'p.reference', 'p.voucherUrl', 'p.paidAt', 'p.status', 'p.createdAt',
          'p.exchangeRate', 'p.amountUsd', 'p.bankOperationNumber', 'p.receiptNumber', 'p.receiptValue',
          'p.approvalDocumentUrl', 'p.receiptDocumentUrl', 'p.approvedAt',
        ])
        // Postgres pliega a minúsculas cualquier alias sin comillas — mismo bug
        // ya corregido en lots.service.ts y sales.service.ts.
        .addSelect('l.code AS "lotCode"')
        .addSelect('COALESCE(l.sale_price, l.price) AS "salePrice"')
        .addSelect('c.full_name AS "clientName"')
        .addSelect('u.name AS "receivedByName"')
        .addSelect('au.name AS "approvedByName"'),
    );
    qb.orderBy(
      `CASE WHEN p.status = 'pagado' THEN 0 ELSE 1 END`,
      'ASC',
    )
      .addOrderBy(
        `CASE p.type WHEN 'reserva' THEN 0 WHEN 'adelanto' THEN 1 WHEN 'cuota_inicial' THEN 1 WHEN 'primera_cuota' THEN 2 WHEN 'cuota' THEN 2 ELSE 3 END`,
        'ASC',
      )
      .addOrderBy('COALESCE(p.paid_at, p.due_date, p.created_at)', 'ASC')
      .addOrderBy('p.id', 'ASC');
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
      concept: paymentConcept(r.p_type),
      conceptLabel: paymentConceptLabel(r.p_type),
      conceptRank: paymentConceptRank(r.p_type),
      stage: String(r.p_status) === 'pagado' ? 'pagado' : 'pendiente',
      dueDate: r.p_due_date, paymentMethod: r.p_payment_method,
      reference: r.p_reference, voucherUrl: r.p_voucher_url,
      paidAt: r.p_paid_at, status: r.p_status, createdAt: r.p_created_at,
      lotCode: r.lotCode || null,
      salePrice: r.salePrice != null ? Number(r.salePrice) : null,
      clientName: r.clientName || null,
      receivedByName: r.receivedByName || null,
      exchangeRate: r.p_exchange_rate != null ? Number(r.p_exchange_rate) : null,
      amountUsd: r.p_amount_usd != null ? Number(r.p_amount_usd) : null,
      bankOperationNumber: r.p_bank_operation_number || null,
      receiptNumber: r.p_receipt_number || null,
      receiptValue: r.p_receipt_value != null ? Number(r.p_receipt_value) : null,
      approvalDocumentUrl: r.p_approval_document_url || null,
      receiptDocumentUrl: r.p_receipt_document_url || null,
      approvedAt: r.p_approved_at || null,
      approvedByName: r.approvedByName || null,
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

  // Aprueba un pago pendiente: exige datos bancarios (operacion, boleta, valor)
  // y marca el pago como pagado.
  async approve(paymentId: number, dto: ApprovePaymentDto, actorId: number) {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new BadRequestException('Pago no encontrado');
    payment.status = 'pagado';
    payment.paidAt = new Date();
    payment.dueDate = null;
    payment.bankOperationNumber = dto.bankOperationNumber;
    payment.receiptNumber = dto.receiptNumber;
    payment.receiptValue = String(dto.receiptValue);
    payment.approvedBy = actorId;
    payment.approvedAt = new Date();
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

  // Adjuntar el documento de aprobacion (Adj doc) mediante URL de subida previa
  async attachApprovalDoc(paymentId: number, url: string) {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) return null;
    payment.approvalDocumentUrl = url;
    const saved = await this.paymentRepo.save(payment);
    this.gateway.emitToAll('payment.updated', saved);
    return saved;
  }

  // Adjuntar la imagen de la boleta al registrar el pago (URL de subida previa).
  async attachReceiptDoc(paymentId: number, url: string) {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) return null;
    payment.receiptDocumentUrl = url;
    const saved = await this.paymentRepo.save(payment);
    this.gateway.emitToAll('payment.updated', saved);
    return saved;
  }

  // Métricas de caja: por medio de pago, por mes (pagado), ventas por mes y
  // morosidad por mes (para el gráfico de doble eje "Pagos vs Morosidad").
  async summary(projectId?: number) {
    const today = new Date().toISOString().slice(0, 10);
    const plus30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

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

    const [
      pendingCuotas,
      overdueCuotas,
      upcomingCuotas,
      totalSale,
      financing,
      financedCuotas,
      paidCuotas,
      initialPaid,
    ] = await Promise.all([
      this.paymentRepo.createQueryBuilder('p')
        .where("p.status IN ('pendiente','vencido')")
        .andWhere(projectId ? 'p.project_id = :projectId' : '1=1', { projectId })
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(p.amount),0)', 'amount')
        .getRawOne(),
      this.paymentRepo.createQueryBuilder('p')
        .where("p.status IN ('pendiente','vencido') AND p.due_date < :today", { today })
        .andWhere(projectId ? 'p.project_id = :projectId' : '1=1', { projectId })
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(p.amount),0)', 'amount')
        .getRawOne(),
      this.paymentRepo.createQueryBuilder('p')
        .where("p.status = 'pendiente' AND p.due_date >= :today AND p.due_date <= :plus30", { today, plus30 })
        .andWhere(projectId ? 'p.project_id = :projectId' : '1=1', { projectId })
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(p.amount),0)', 'amount')
        .getRawOne(),
      this.saleRepo.createQueryBuilder('s')
        .where("s.approval_status IN ('pendiente','aprobada')")
        .andWhere(projectId ? 's.project_id = :projectId' : '1=1', { projectId })
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(s.sale_price),0)', 'amount')
        .getRawOne(),
      this.saleRepo.createQueryBuilder('s')
        .where("s.approval_status IN ('pendiente','aprobada')")
        .andWhere(projectId ? 's.project_id = :projectId' : '1=1', { projectId })
        .select('COALESCE(SUM(s.financing_base),0)', 'amount')
        .getRawOne(),
      this.installmentRepo
        .createQueryBuilder('i')
        .innerJoin(SaleEntity, 's', 's.id = i.sale_id')
        .where("s.approval_status IN ('pendiente','aprobada')")
        .andWhere(projectId ? 's.project_id = :projectId' : '1=1', { projectId })
        .select('COUNT(*)', 'count')
        .getRawOne(),
      this.paymentRepo.createQueryBuilder('p')
        .where("p.type = 'cuota' AND p.status = 'pagado'")
        .andWhere(projectId ? 'p.project_id = :projectId' : '1=1', { projectId })
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(p.amount),0)', 'amount')
        .getRawOne(),
      this.paymentRepo.createQueryBuilder('p')
        .where("p.type IN ('adelanto','primera_cuota') AND p.status = 'pagado'")
        .andWhere(projectId ? 'p.project_id = :projectId' : '1=1', { projectId })
        .select('COALESCE(SUM(p.amount),0)', 'amount')
        .getRawOne(),
    ]);

    const pendingAmount = Number(pendingCuotas?.amount || 0);
    const overdueAmount = Number(overdueCuotas?.amount || 0);
    const metrics = {
      pendingCuotas: Number(pendingCuotas?.count || 0),
      pendingAmount,
      overduePayments: Number(overdueCuotas?.count || 0),
      overdueAmount,
      delinquencyRate: pendingAmount > 0 ? (overdueAmount / pendingAmount) * 100 : 0,
      upcomingPayments: Number(upcomingCuotas?.count || 0),
      upcomingAmount: Number(upcomingCuotas?.amount || 0),
      totalSaleLots: Number(totalSale?.count || 0),
      totalSaleAmount: Number(totalSale?.amount || 0),
      initialPaymentAmount: Number(initialPaid?.amount || 0),
      financingAmount: Number(financing?.amount || 0),
      financedCuotas: Number(financedCuotas?.count || 0),
      paidCuotas: Number(paidCuotas?.count || 0),
      paidCuotasAmount: Number(paidCuotas?.amount || 0),
    };

    return {
      methods: (methods || []).map((r: any) => ({ method: r.method, total: Number(r.total || 0), monto: Number(r.monto || 0) })),
      byMonth: (byMonth || []).map((r: any) => ({ month: r.month, monto: Number(r.monto || 0) })),
      overdueByMonth: (overdueByMonth || []).map((r: any) => ({ month: r.month, monto: Number(r.monto || 0) })),
      salesByMonth: (salesByMonth || []).map((r: any) => ({ month: r.month, monto: Number(r.monto || 0) })),
      metrics,
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

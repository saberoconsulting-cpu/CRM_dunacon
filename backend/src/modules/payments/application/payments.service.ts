// modules/payments/application/payments.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaymentEntity } from '../../../shared/infrastructure/entities/payment.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { LotStatusHistoryEntity } from '../../../shared/infrastructure/entities/lot-status-history.entity';
import { FinancialTransactionEntity } from '../../../shared/infrastructure/entities/financial-transaction.entity';
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
    const qb = this.paymentRepo.createQueryBuilder('p');
    if (filters.projectId) qb.where('p.project_id = :projectId', { projectId: filters.projectId });
    if (filters.lotId) qb.andWhere('p.lot_id = :lotId', { lotId: filters.lotId });
    if (filters.agentId) qb.andWhere('p.agent_id = :agentId', { agentId: filters.agentId });
    if (filters.status) qb.andWhere('p.status = :status', { status: filters.status });
    if (filters.type) qb.andWhere('p.type = :type', { type: filters.type });
    qb.orderBy('p.created_at', 'DESC');
    const total = await qb.clone().getCount();
    qb.skip((page - 1) * limit).take(limit);
    const items = await qb.getMany();
    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
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

  // Métricas de caja: por medio de pago y por mes (monto conciliado= pagado)
  async summary() {
    const methods: any = await this.paymentRepo
      .createQueryBuilder('p')
      .select('COALESCE(p.payment_method, \'otro\')', 'method')
      .addSelect('COUNT(*)', 'total')
      .addSelect('COALESCE(SUM(p.amount),0)', 'monto')
      .where("p.status = 'pagado'")
      .groupBy('p.payment_method')
      .orderBy('monto', 'DESC')
      .getRawMany();
    const byMonth: any = await this.paymentRepo
      .createQueryBuilder('p')
      .select("to_char(p.created_at, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(p.amount),0)', 'monto')
      .where("p.status = 'pagado'")
      .groupBy('1')
      .orderBy('1', 'ASC')
      .getRawMany();
    return {
      methods: (methods || []).map((r: any) => ({ method: r.method, total: Number(r.total || 0), monto: Number(r.monto || 0) })),
      byMonth: (byMonth || []).map((r: any) => ({ month: r.month, monto: Number(r.monto || 0) })),
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
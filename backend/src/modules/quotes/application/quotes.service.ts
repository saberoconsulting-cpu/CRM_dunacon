// modules/quotes/application/quotes.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuoteEntity } from '../../../shared/infrastructure/entities/quote.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { BlockEntity } from '../../../shared/infrastructure/entities/block.entity';
import { ProjectEntity } from '../../../shared/infrastructure/entities/project.entity';
import { calcValorCuota, buildAmortizationSchedule, buildGraceSchedule, buildInitialPlan } from '../../../shared/domain/finance.util';
import { CreateQuoteDto, RecalculateQuoteDto } from './dto/quote.dto';
import { ListQuotesDto } from './dto/list-quotes.dto';
import { buildPaginatedResult, normalizePagination } from '../../../shared/application/dto/pagination.dto';

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(QuoteEntity) private readonly quoteRepo: Repository<QuoteEntity>,
    @InjectRepository(LotEntity) private readonly lotRepo: Repository<LotEntity>,
    @InjectRepository(BlockEntity) private readonly blockRepo: Repository<BlockEntity>,
    @InjectRepository(ProjectEntity) private readonly projectRepo: Repository<ProjectEntity>,
  ) {}

  async create(dto: CreateQuoteDto, actorId: number) {
    const bonoDescuento = Number(dto.bonoDescuentoUsd || 0);
    const bonoEspecial = Number(dto.bonoEspecialUsd || 0);
    const finalPrice = Math.max(0, Number(dto.lotPriceUsd) - bonoDescuento - bonoEspecial);
    const cuotaInicial = dto.paymentMethod === 'credito' ? Math.max(0, Number(dto.cuotaInicialUsd || 0)) : 0;
    const totalCuotas = dto.paymentMethod === 'credito' ? Math.max(0, Number(dto.totalCuotas || 0)) : 0;
    const saldoAFinanciar = Math.max(0, finalPrice - cuotaInicial);
    const graceMonths = dto.paymentMethod === 'credito' ? Math.min(totalCuotas, Math.max(0, Number(dto.graceMonths || 0))) : 0;
    const initialPaymentMode = dto.paymentMethod === 'credito' && dto.initialPaymentMode === 'partes' ? 'partes' : 'contado';
    const initialParts = initialPaymentMode === 'partes' ? Math.max(2, Math.floor(Number(dto.initialParts || 3))) : 1;
    const gracePlan = buildGraceSchedule({
      principal: saldoAFinanciar,
      totalCuotas,
      graceMonths,
      interestType: dto.interestType,
      teaPct: dto.tea,
    });
    const valorCuota = dto.paymentMethod === 'credito' ? gracePlan.interestCuota : 0;

    const quote = this.quoteRepo.create({
      projectId: dto.projectId,
      lotId: dto.lotId,
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      clientPhone: dto.clientPhone,
      pricePerM2Usd: String(dto.pricePerM2Usd),
      lotPriceUsd: String(dto.lotPriceUsd),
      bonoDescuentoUsd: String(bonoDescuento),
      bonoEspecialUsd: String(bonoEspecial),
      finalPriceUsd: String(finalPrice),
      paymentMethod: dto.paymentMethod,
      cuotaInicialUsd: String(cuotaInicial),
      totalCuotas,
      graceMonths,
      initialPaymentMode,
      initialParts,
      interestType: dto.interestType || 'sin_intereses',
      tea: String(dto.paymentMethod === 'credito' && dto.interestType === 'tea' ? Number(dto.tea || 0) : 0),
      valorCuotaUsd: String(valorCuota),
      exchangeRate: String(dto.exchangeRate),
      createdBy: actorId,
    });
    return this.quoteRepo.save(quote);
  }

  async list(filters: ListQuotesDto) {
    const { page, limit, skip } = normalizePagination(filters.page, filters.limit, 10);

    const qb = this.quoteRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect(LotEntity, 'l', 'l.id = q.lot_id')
      .select([
        'q.id', 'q.projectId', 'q.lotId', 'q.clientName', 'q.clientEmail', 'q.clientPhone',
        'q.finalPriceUsd', 'q.cuotaInicialUsd', 'q.totalCuotas', 'q.paymentMethod',
        'q.interestType', 'q.tea', 'q.valorCuotaUsd', 'q.exchangeRate', 'q.status', 'q.createdAt',
        'q.graceMonths', 'q.initialPaymentMode', 'q.initialParts',
      ])
      .addSelect([
        'l.code AS "lotCode"',
        'l.area_m2 AS "lotAreaM2"',
        'l.status AS "lotStatus"',
        'l.selling_stage AS "lotSellingStage"',
      ]);

    if (filters.projectId) qb.andWhere('q.project_id = :projectId', { projectId: filters.projectId });
    if (filters.lotId) qb.andWhere('q.lot_id = :lotId', { lotId: filters.lotId });
    if (filters.status) qb.andWhere('q.status = :status', { status: filters.status });
    if (filters.paymentMethod) qb.andWhere('q.payment_method = :paymentMethod', { paymentMethod: filters.paymentMethod });
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      qb.andWhere('(q.client_name ILIKE :search OR l.code ILIKE :search)', { search: term });
    }

    const total = await qb.clone().getCount();
    const sortMap: Record<string, string> = {
      createdAt: 'q.created_at',
      clientName: 'q.client_name',
      finalPriceUsd: 'q.final_price_usd',
    };
    const sortCol = sortMap[filters.sort || 'createdAt'] || 'q.created_at';
    const order = String(filters.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const raw = await qb.clone().orderBy(sortCol, order).offset(skip).limit(limit).getRawMany();
    const items = raw.map((r) => ({
      id: Number(r.q_id),
      projectId: Number(r.q_project_id),
      lotId: Number(r.q_lot_id),
      clientName: r.q_client_name,
      clientEmail: r.q_client_email,
      clientPhone: r.q_client_phone,
      finalPriceUsd: Number(r.q_final_price_usd),
      cuotaInicialUsd: Number(r.q_cuota_inicial_usd),
      totalCuotas: Number(r.q_total_cuotas),
      graceMonths: Number(r.q_grace_months || 0),
      initialPaymentMode: r.q_initial_payment_mode || 'contado',
      initialParts: Number(r.q_initial_parts || 1),
      paymentMethod: r.q_payment_method,
      interestType: r.q_interest_type || 'sin_intereses',
      tea: Number(r.q_tea || 0),
      valorCuotaUsd: Number(r.q_valor_cuota_usd || 0),
      exchangeRate: Number(r.q_exchange_rate),
      status: r.q_status || 'enviada',
      createdAt: r.q_created_at,
      lotCode: r.lotCode || null,
      lotStatus: r.lotStatus || null,
      lotSellingStage: r.lotSellingStage || null,
      areaM2: Number(r.lotAreaM2 || 0),
      lotAreaM2: Number(r.lotAreaM2 || 0),
    }));
    return buildPaginatedResult(items, total, page, limit);
  }

  async updateStatus(id: number, status: 'enviada' | 'desestimada' | 'actualizada') {
    const quote = await this.quoteRepo.findOne({ where: { id } });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');
    quote.status = status;
    return this.quoteRepo.save(quote);
  }

  async recalculate(id: number, dto: RecalculateQuoteDto) {
    const quote = await this.quoteRepo.findOne({ where: { id } });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');

    if (dto.exchangeRate != null && dto.exchangeRate > 0) quote.exchangeRate = String(dto.exchangeRate);

    if (quote.paymentMethod === 'credito') {
      const finalPrice = Math.max(0, Number(quote.finalPriceUsd));
      if (dto.cuotaInicialUsd != null) quote.cuotaInicialUsd = String(Math.min(finalPrice, Math.max(0, dto.cuotaInicialUsd)));
      if (dto.totalCuotas != null) quote.totalCuotas = Math.max(0, Math.floor(dto.totalCuotas));
      if (dto.interestType != null) quote.interestType = dto.interestType;
      if (dto.tea != null) quote.tea = String(quote.interestType === 'tea' ? Number(dto.tea) : 0);
      if (dto.initialPaymentMode != null) quote.initialPaymentMode = dto.initialPaymentMode;
      if (quote.initialPaymentMode === 'partes') {
        quote.initialParts = Math.max(2, Math.floor(Number(dto.initialParts ?? quote.initialParts ?? 3)));
      } else {
        quote.initialParts = 1;
      }

      const graceMonthsRaw = dto.graceMonths != null ? dto.graceMonths : quote.graceMonths;
      quote.graceMonths = Math.min(quote.totalCuotas, Math.max(0, Math.floor(graceMonthsRaw || 0)));

      const saldoAFinanciar = Math.max(0, finalPrice - Number(quote.cuotaInicialUsd));
      const plan = buildGraceSchedule({
        principal: saldoAFinanciar,
        totalCuotas: quote.totalCuotas,
        graceMonths: quote.graceMonths,
        interestType: quote.interestType,
        teaPct: Number(quote.tea),
      });
      quote.valorCuotaUsd = String(plan.interestCuota);
    }

    return this.quoteRepo.save(quote);
  }

  async getOne(id: number) {
    const quote = await this.quoteRepo.findOne({ where: { id } });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');

    const [lot, project] = await Promise.all([
      this.lotRepo.findOne({ where: { id: quote.lotId } }),
      this.projectRepo.findOne({ where: { id: quote.projectId } }),
    ]);
    const street = lot?.streetId ? await this.blockRepo.findOne({ where: { id: lot.streetId } }) : null;
    return { quote, lot: lot ? { ...lot, blockId: lot.streetId } : lot, street, block: street, project };
  }

  async schedule(id: number) {
    const quote = await this.quoteRepo.findOne({ where: { id } });
    if (!quote) return { rows: [], graceMonths: 0, interestMonths: 0, graceCuota: 0, interestCuota: 0, totalInteres: 0, totalPagar: 0, saldoAlFinGracia: 0, initialPlan: null, saldoAFinanciar: 0 };
    const finalPrice = Math.max(0, Number(quote.finalPriceUsd));
    const cuotaInicial = Math.max(0, Number(quote.cuotaInicialUsd));
    const saldoAFinanciar = Math.max(0, finalPrice - cuotaInicial);
    try {
      const plan = buildGraceSchedule({
        principal: saldoAFinanciar,
        totalCuotas: quote.totalCuotas,
        graceMonths: quote.graceMonths,
        interestType: quote.interestType,
        teaPct: Number(quote.tea),
      });
      const initialPlan = cuotaInicial > 0
        ? buildInitialPlan(finalPrice, cuotaInicial, quote.initialPaymentMode === 'partes' ? 'partes' : 'contado', quote.initialParts || 1)
        : null;
      return { ...plan, initialPlan, saldoAFinanciar };
    } catch (error) {
      console.error('Error en schedule:', error);
      return { rows: [], graceMonths: 0, interestMonths: 0, graceCuota: 0, interestCuota: 0, totalInteres: 0, totalPagar: 0, saldoAlFinGracia: saldoAFinanciar, initialPlan: null, saldoAFinanciar };
    }
  }

  async summary(projectId?: number) {
    const qb = this.quoteRepo
      .createQueryBuilder('q')
      .select([
        'COUNT(*) AS "total"',
        'SUM(CASE WHEN q.payment_method = :credito THEN 1 ELSE 0 END) AS "credito"',
        'SUM(CASE WHEN q.payment_method = :contado THEN 1 ELSE 0 END) AS "contado"',
        'COALESCE(SUM(q.final_price_usd), 0) AS "montoTotal"',
        'COALESCE(SUM(q.cuota_inicial_usd), 0) AS "cuotaInicialTotal"',
        'COALESCE(SUM(q.valor_cuota_usd), 0) AS "cuotaContadoTotal"',
      ])
      .setParameters({ credito: 'credito', contado: 'contado' });

    if (projectId) qb.andWhere('q.project_id = :projectId', { projectId });

    const row = await qb.getRawOne();
    return {
      total: Number(row?.total || 0),
      credito: Number(row?.credito || 0),
      contado: Number(row?.contado || 0),
      montoTotal: Number(row?.montoTotal || 0),
      cuotaInicialTotal: Number(row?.cuotaInicialTotal || 0),
      cuotaContadoTotal: Number(row?.cuotaContadoTotal || 0),
    };
  }
}

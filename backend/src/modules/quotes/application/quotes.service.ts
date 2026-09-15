// modules/quotes/application/quotes.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuoteEntity } from '../../../shared/infrastructure/entities/quote.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { BlockEntity } from '../../../shared/infrastructure/entities/block.entity';
import { ProjectEntity } from '../../../shared/infrastructure/entities/project.entity';
import { calcValorCuota, buildAmortizationSchedule } from '../../../shared/domain/finance.util';
import { CreateQuoteDto } from './dto/quote.dto';
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
    const valorCuota = dto.paymentMethod === 'credito'
      ? calcValorCuota(saldoAFinanciar, totalCuotas, dto.interestType, dto.tea)
      : 0;

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
      interestType: dto.interestType || 'sin_intereses',
      tea: String(dto.paymentMethod === 'credito' && dto.interestType === 'tea' ? Number(dto.tea || 0) : 0),
      valorCuotaUsd: String(valorCuota),
      exchangeRate: String(dto.exchangeRate),
      createdBy: actorId,
    });
    return this.quoteRepo.save(quote);
  }

  // Listado paginado con envolvente estándar { items, total, page, limit, totalPages }.
  // Buenas prácticas: COUNT separado (clonado ANTES de skip/take), filtros con
  // parámetros (anti SQL-injection), LIKE con escape y ORDER BY por whitelist.
    async list(filters: ListQuotesDto) {
    const { page, limit, skip } = normalizePagination(filters.page, filters.limit, 10);

    const qb = this.quoteRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect(LotEntity, 'l', 'l.id = q.lot_id')
      .addSelect('l.code', 'lotCode')
      .select([
        'q.id', 'q.projectId', 'q.lotId', 'q.clientName', 'q.clientEmail', 'q.clientPhone',
        'q.finalPriceUsd', 'q.cuotaInicialUsd', 'q.totalCuotas', 'q.paymentMethod',
        'q.exchangeRate', 'q.valorCuotaUsd', 'q.createdAt',
      ])
      // Postgres pliega a minúsculas cualquier alias sin comillas — mismo bug
      // ya corregido en lots/sales/payments.service.ts.
      .addSelect([
        'l.code AS "lotCode"',
        'l.area_m2 AS "lotAreaM2"',
      ]);
    if (filters.projectId) qb.andWhere('q.project_id = :projectId', { projectId: filters.projectId });
    if (filters.lotId) qb.andWhere('q.lot_id = :lotId', { lotId: filters.lotId });
    if (filters.paymentMethod) qb.andWhere('q.payment_method = :paymentMethod', { paymentMethod: filters.paymentMethod });
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      qb.andWhere(`(q.client_name ILIKE :search OR l.code ILIKE :search)`, { search: term });
    }

    // COUNT se calcula ANTES de aplicar ORDER BY (Postgres rechaza COUNT con
    // ORDER BY de columna no agregada) y la página usa offset/limit porque
    // getRawMany no soporta skip/take.
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
      id: Number(r.q_id), projectId: Number(r.q_project_id), lotId: Number(r.q_lot_id),
      clientName: r.q_client_name, clientEmail: r.q_client_email, clientPhone: r.q_client_phone,
      finalPriceUsd: Number(r.q_final_price_usd), cuotaInicialUsd: Number(r.q_cuota_inicial_usd),
      totalCuotas: Number(r.q_total_cuotas), paymentMethod: r.q_payment_method,
      exchangeRate: Number(r.q_exchange_rate), createdAt: r.q_created_at,
      status: 'enviada',
      areaM2: Number(r.lotAreaM2 || 0),
      lotCode: r.lotCode || null,
    }));
    return buildPaginatedResult(items, total, page, limit);
  }

    async getOne(id: number) {
      const quote = await this.quoteRepo.findOne({ where: { id } });
      if (!quote) return { quote: null, lot: null, block: null, project: null };

      const [lot, project] = await Promise.all([
        this.lotRepo.findOne({ where: { id: quote.lotId } }),
        this.projectRepo.findOne({ where: { id: quote.projectId } }),
      ]);
      const block = lot?.blockId
        ? await this.blockRepo.findOne({ where: { id: lot.blockId } })
        : null;

      return { quote, lot, block, project };
  }

  async schedule(id: number) {
    const quote = await this.quoteRepo.findOne({ where: { id } });
    if (!quote) return [];
    const finalPrice = Math.max(0, Number(quote.finalPriceUsd));
    const cuotaInicial = Math.max(0, Number(quote.cuotaInicialUsd));
    const saldoAFinanciar = Math.max(0, finalPrice - cuotaInicial);
    if (saldoAFinanciar <= 0) return [];
    try {
      return buildAmortizationSchedule(saldoAFinanciar, quote.totalCuotas, quote.interestType, Number(quote.tea));
    } catch (error) {
      console.error('Error en schedule:', error);
      return [];
    }
  }

  // Resumen agregado para panel de estadísticas del listado.
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

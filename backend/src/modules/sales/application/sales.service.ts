import { ProjectLotDataEntity } from '../../../shared/infrastructure/entities/project-lot-data.entity';
import { AppSettingEntity } from '../../../shared/infrastructure/entities/app-setting.entity';
import { lotDataCode } from '../../plan/application/lot-data-excel';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { renderPdfContract, inspectPdfContractTemplate } from '../../../shared/application/pdf-contract-template';
import { downloadContractTemplate, renderContract, inspectContractTemplate, CONTRACT_FIELDS } from '../../../shared/application/contract-template';
import { ProjectDocumentEntity } from '../../../shared/infrastructure/entities/project-document.entity';
// modules/sales/application/sales.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SaleEntity } from '../../../shared/infrastructure/entities/sale.entity';
import { SaleInstallmentEntity } from '../../../shared/infrastructure/entities/sale-installment.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { ClientEntity } from '../../../shared/infrastructure/entities/client.entity';
import { UserEntity } from '../../../shared/infrastructure/entities/user.entity';
import { PaymentEntity } from '../../../shared/infrastructure/entities/payment.entity';
import { ProjectEntity } from '../../../shared/infrastructure/entities/project.entity';
import { QuoteEntity } from '../../../shared/infrastructure/entities/quote.entity';
import { ProjectLotCatalogEntity } from '../../../shared/infrastructure/entities/project-lot-catalog.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { NotificationsGateway } from '../../../shared/infrastructure/websocket/notifications.gateway';
import { buildGraceSchedule, calcValorCuota } from '../../../shared/domain/finance.util';import { CreateSaleDto } from './dto/sale.dto';
import { ListSalesDto } from './dto/list-sales.dto';
import {
  buildPaginatedResult,
  normalizePagination,
} from '../../../shared/application/dto/pagination.dto';
import { paymentConcept, paymentConceptLabel, paymentConceptRank } from '../../payments/domain/payment-order';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    @InjectRepository(LotEntity)
    private readonly lotRepo: Repository<LotEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(SaleInstallmentEntity)
    private readonly instRepo: Repository<SaleInstallmentEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    private readonly gateway: NotificationsGateway,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private async prepareContract(saleId: number, agentId?: number, fields: Record<string, string> = {}, bankAccountId?: string) {
    const sale = await this.saleRepo.findOne({ where: { id: saleId, ...(agentId ? { agentId } : {}) } });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    const template = await this.dataSource.getRepository(ProjectDocumentEntity).findOne({
      where: { projectId: sale.projectId, kind: 'contrato_venta' }, order: { createdAt: 'DESC', id: 'DESC' },
    });
    if (!template) throw new BadRequestException('Sube primero la plantilla PDF o Word en Documentos del proyecto > Contrato Venta de Lote.');
    const [project, lot, client, agent] = await Promise.all([
      this.dataSource.getRepository(ProjectEntity).findOne({ where: { id: sale.projectId } }),
      this.lotRepo.findOne({ where: { id: sale.lotId } }),
      sale.clientId ? this.clientRepo.findOne({ where: { id: sale.clientId } }) : null,
      sale.agentId ? this.userRepo.findOne({ where: { id: sale.agentId } }) : null,
    ]);
    const [dimensions, quote, financialSetting] = await Promise.all([
      lot ? this.dataSource.getRepository(ProjectLotDataEntity).findOne({ where: { projectId: sale.projectId, code: lotDataCode(lot.code) } }) : null,
      sale.quoteId ? this.dataSource.getRepository(QuoteEntity).findOne({ where: { id: sale.quoteId } }) : null,
      this.dataSource.getRepository(AppSettingEntity).findOne({ where: { key: `finance_financial_data_${sale.projectId}` } }),
    ]);
    let accounts: Array<{ id: string; company: string; ruc: string; bank: string; currency: string; accountNumber: string; cci: string }> = [];
    if (financialSetting?.value) {
      try {
        const saved = JSON.parse(financialSetting.value);
        if (!Array.isArray(saved.accounts)) throw new Error();
        accounts = saved.accounts;
      } catch { throw new BadRequestException('Revisa los datos financieros del proyecto: no se pueden leer las cuentas guardadas.'); }
    }
    const account = bankAccountId ? accounts.find(item => item.id === bankAccountId) : accounts.length === 1 ? accounts[0] : undefined;
    if (bankAccountId && !account) throw new BadRequestException('La cuenta elegida no pertenece a este proyecto.');
    const cashSale = /Forma de pago:\s*Contado\b/i.test(sale.conditions || '') || (!/Forma de pago:/i.test(sale.conditions || '') && quote?.paymentMethod === 'contado');
    const principal = Math.max(0, Number(sale.salePrice) - Number(sale.cuotaInicial || 0));
    const graceMatch = String(sale.conditions || '').match(/Cuotas sin interes:\s*(\d+)/i);
    const graceMonths = Number(graceMatch?.[1] ?? (sale.interestType === 'tea' ? 0 : sale.totalCuotas));
    const schedule = buildGraceSchedule({ principal, totalCuotas: sale.totalCuotas, graceMonths, interestType: sale.interestType, teaPct: Number(sale.tea) });
    const meters = (value?: string) => value?.trim() ? /m(?:etros?)?\.?$/i.test(value.trim()) ? value.trim() : `${value.trim()} m` : '';
    const amount = (value: unknown) => `US$ ${Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const contractData: Record<string, string> = {
      forma_pago: cashSale ? 'contado' : 'credito',
      venta_id: String(sale.id), fecha_venta: String(sale.saleDate).split('-').reverse().join('/'),
      fecha_entrega_lote: project?.lotDeliveryDate?.split('-').reverse().join('/') || '',
      fecha_entrega_condominio: project?.condominiumDeliveryDate?.split('-').reverse().join('/') || '',
      proyecto_nombre: project?.name || '', proyecto_ubicacion: project?.location || '',
      cliente_nombre: client?.fullName || quote?.clientName || '', cliente_documento: sale.clientDni || client?.dni || '', cliente_domicilio: '', ciudad_firma: project?.location || '',
      lote_codigo: lot?.code || '', lote_direccion: dimensions?.address || lot?.address || '', lote_area_m2: dimensions ? Number(dimensions.areaM2).toFixed(2) : '', lote_dimensiones: dimensions?.dimensions || '',
      lote_perimetro: meters(dimensions?.perimeter), lote_frente: meters(dimensions?.front),
      lote_lado_izquierdo: meters(dimensions?.leftSide), lote_lado_derecho: meters(dimensions?.rightSide), lote_fondo: meters(dimensions?.back),
      bono_total: sale.bonoTotalUsd != null ? amount(sale.bonoTotalUsd) : quote ? amount(quote.bonoTotalUsd) : '',
      precio_venta_final: amount(sale.salePrice),
      plazo_financiamiento: String(sale.totalCuotas), tasa_efectiva_anual: String(Number(sale.tea || 0)),
      cuotas_sin_intereses: `${amount(schedule.graceMonths ? schedule.graceCuota : 0)} - ${schedule.graceMonths} Cuotas`,
      cuotas_con_intereses: `${amount(schedule.interestMonths && sale.interestType === 'tea' ? schedule.interestCuota : 0)} - ${sale.interestType === 'tea' ? schedule.interestMonths : 0} Cuotas con Intereses`,
      fecha_generacion: new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
      empresa_nombre: account?.company || '', empresa_ruc: account?.ruc || '',
      banco: account?.bank || '', moneda: account?.currency === 'PEN' ? 'Soles' : account?.currency === 'USD' ? 'D\u00f3lares' : account?.currency || '',
      cuenta_corriente: account?.accountNumber || '', cci: account?.cci || '',
      precio_venta: sale.lotPriceUsd != null ? amount(sale.lotPriceUsd) : quote ? amount(quote.lotPriceUsd) : amount(sale.salePrice), cuota_inicial: amount(sale.cuotaInicial),
      saldo_financiar: amount(cashSale ? 0 : Math.max(0, (Number(sale.financingBase) > 0 ? Number(sale.financingBase) : Number(sale.salePrice)) - Number(sale.cuotaInicial || 0))),
      numero_cuotas: String(sale.totalCuotas), valor_cuota: amount(sale.valorCuota), condiciones: sale.conditions || '', agente_nombre: agent?.name || '',
    };
    for (const [key, value] of Object.entries(fields)) {
      if (!(CONTRACT_FIELDS as readonly string[]).includes(key) || typeof value !== 'string' || value.length > 2000) throw new BadRequestException('Datos adicionales de contrato no válidos.');
      if (!contractData[key]?.trim()) contractData[key] = value.trim();
    }
    const source = await downloadContractTemplate(template.url);
    const isPdf = /\.pdf$/i.test(template.originalName || '');
    return { source, isPdf, contractData, projectLogoUrl: project?.logoImageUrl, accounts };
  }

  async contractRequirements(saleId: number, agentId?: number) {
    const { source, isPdf, contractData, accounts } = await this.prepareContract(saleId, agentId);
    const info = isPdf ? await inspectPdfContractTemplate(source) : inspectContractTemplate(source, contractData.forma_pago);
    const unknown = info.fields.filter(field => !(CONTRACT_FIELDS as readonly string[]).includes(field));
    if (unknown.length) throw new BadRequestException(`Campos de plantilla no disponibles: ${unknown.join(', ')}`);
    if (!info.fields.length) throw new BadRequestException('La plantilla no tiene campos para completar. Agrega campos como {cliente_nombre} y {lote_codigo}.');
    const bankFields = ['empresa_nombre', 'empresa_ruc', 'banco', 'moneda', 'cuenta_corriente', 'cci'];
    const needsBank = info.fields.some(field => bankFields.includes(field));
    if (needsBank && !accounts.length) throw new BadRequestException('Registra una cuenta en Finanzas > Datos financieros.');
    return { missingFields: info.fields.filter(field => !contractData[field]?.trim() && !(needsBank && accounts.length > 1 && bankFields.includes(field))), bankAccounts: needsBank ? accounts.map(item => ({ id: item.id, label: [item.bank, item.currency].filter(Boolean).join(' - ') })) : [] };
  }

  async contract(saleId: number, agentId?: number, fields: Record<string, string> = {}, bankAccountId?: string) {
    const { source, isPdf, contractData, projectLogoUrl } = await this.prepareContract(saleId, agentId, fields, bankAccountId);
    const companyLogo = await readFile(join(__dirname, '../../../assets/dunacon.png'));
    let projectLogo: Buffer | undefined;
    if (projectLogoUrl) {
      const imageUrl = new URL(projectLogoUrl);
      if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'res.cloudinary.com') throw new BadRequestException('Vuelve a cargar el logo del proyecto para incorporarlo al contrato.');
      imageUrl.pathname = imageUrl.pathname.replace('/image/upload/', '/image/upload/f_png,w_420,c_limit/');
      projectLogo = await downloadContractTemplate(imageUrl.toString());
    }
    const branding = { companyLogo, projectLogo };
    const buffer = isPdf ? await renderPdfContract(source, contractData, branding) : renderContract(source, contractData, branding);
    return { buffer, fileName: `Contrato-V${saleId}.${isPdf ? 'pdf' : 'docx'}`, contentType: isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }

  async audit(userId: number, action: string, entity?: string, entityId?: number, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(AuditLogEntity) : this.auditRepo;
    await repo.save({ userId, action, entity, entityId });
  }

  async preview(dto: CreateSaleDto) {
    const salePrice = Number(dto.salePrice || 0);
    const totalCuotas = Math.max(0, Number(dto.totalCuotas || 0));
    const cuotaInicial = Math.max(0, Number(dto.cuotaInicial || 0));
    const graceMonths = Math.min(totalCuotas, Math.max(0, Math.floor(Number(dto.graceMonths || 0))));
    const commissionRate = dto.appliesCommission ? Math.max(0, Number(dto.commissionRate || 0)) : 0;
    const commissionAmount = commissionRate > 0 ? (salePrice * commissionRate) / 100 : 0;
    const financingBase = salePrice;
    const saldoFinanciar = Math.max(0, financingBase - cuotaInicial);
    const gracePlan = buildGraceSchedule({ principal: saldoFinanciar, totalCuotas, graceMonths, interestType: dto.interestType, teaPct: dto.tea });
    const valorCuota = dto.paymentMethod === 'Contado' ? 0 : gracePlan.interestCuota;

    const firstTranche = Math.min(totalCuotas, 12);
    const secondTranche = Math.max(0, totalCuotas - firstTranche);

    return {
      salePrice,
      paymentMethod: dto.paymentMethod || 'Al crédito',
      commissionRate,
      commissionAmount,
      financingBase,
      cuotaInicial,
      saldoFinanciar,
      totalCuotas,
      graceMonths: gracePlan.graceMonths,
      interestMonths: gracePlan.interestMonths,
      graceCuota: gracePlan.graceCuota,
      valorCuota,
      // Cuota fija (sistema francés): ambos tramos comparten el mismo monto.
      installments: [
        { label: 'Primer tramo de cuotas', count: firstTranche, amount: firstTranche > 0 ? valorCuota : 0 },
        { label: 'Segundo tramo de cuotas', count: secondTranche, amount: secondTranche > 0 ? valorCuota : 0 },
      ],
      interest: {
        type: dto.interestType || 'sin_intereses',
        tea: Number(dto.tea || 0),
      },
    };
  }

  async create(dto: CreateSaleDto, actorId: number, actorRole?: string) {
    const lot = await this.lotRepo.findOne({ where: { id: dto.lotId } });
    if (!lot) throw new BadRequestException('Lote no encontrado');
    if (lot.status === 'vendido' || lot.sellingStage === 'vendido') {
      throw new BadRequestException('El lote ya fue vendido y no puede venderse nuevamente');
    }
    if (lot.sellingStage === 'separado') {
      throw new BadRequestException('El lote ya tiene una separación pendiente de validación');
    }

    const quote = dto.quoteId ? await this.dataSource.getRepository(QuoteEntity).findOne({ where: { id: dto.quoteId } }) : null;
    if (!quote) {
      throw new BadRequestException('Selecciona una cotizacion antes de registrar la venta.');
    }
    if (quote.deletedAt || (quote.reusableUntil && quote.reusableUntil.getTime() <= Date.now())) {
      throw new BadRequestException('La cotizacion ya vencio. Genera una nueva cotizacion.');
    }
    if (quote.status === 'convertida') throw new BadRequestException('Esta cotizacion ya se esta usando en otra venta.');
    if (Number(quote.lotId) !== Number(lot.id) || Number(quote.projectId) !== Number(dto.projectId)) {
      throw new BadRequestException('La cotizacion seleccionada no corresponde al lote o proyecto de la venta.');
    }
    const quoteFinalPrice = Number(quote.finalPriceUsd || 0);
    if (!(quoteFinalPrice > 0)) {
      throw new BadRequestException('La cotizacion seleccionada no tiene precio final.');
    }
    if (Math.abs(Number(dto.salePrice || 0) - quoteFinalPrice) > 0.01) {
      throw new BadRequestException('El precio de venta debe coincidir con el precio final de la cotizacion.');
    }
    const effectiveClientId = quote.clientId || dto.clientId;
    const saleClient = effectiveClientId ? await this.clientRepo.findOne({ where: { id: effectiveClientId } }) : null;
    const clientDni = dto.clientDni || saleClient?.dni || '';
    if (!/^\d{8}$/.test(clientDni)) throw new BadRequestException('Ingresa el DNI del cliente de 8 digitos antes de registrar la venta.');
    const catalog = await this.dataSource.getRepository(ProjectLotCatalogEntity).findOne({ where: { projectId: lot.projectId, code: lot.code } }).catch(() => null);
    

    // Both the lot base price and quote final price are already USD.
    const basePriceUsd = catalog ? Number(catalog.salePrice) : Number(lot.salePrice || 0)
      || (Number(lot.price || 0) * Number(lot.areaM2 || 0));
    if (basePriceUsd > 0 && quoteFinalPrice - basePriceUsd > 0.01) {
      throw new BadRequestException('El precio final en dolares no puede superar el precio de venta del lote. Corrige la cotizacion antes de registrar la venta.');
    }

    const assignedAgentId = Number(dto.agentId || actorId);
    const agent = await this.userRepo.findOne({ where: { id: assignedAgentId } });
    const appliesAgency = !!dto.appliesCommission;
    const commissionRate = dto.commissionRate ?? Number(agent?.commissionRate || 0);
    const commission = commissionRate ? (dto.salePrice * commissionRate) / 100 : 0;
    const totalCuotas = dto.totalCuotas || 0;
    const cuotaInicial = Math.max(0, Number(dto.cuotaInicial || 0));
    const graceMonths = Math.min(totalCuotas, Math.max(0, Math.floor(Number(dto.graceMonths || 0))));
    const initialPaymentMode = dto.initialPaymentMode === 'partes' ? 'partes' : 'contado';
    const requestedInitialParts = Number(dto.initialParts || 0);
    const initialParts = initialPaymentMode === 'partes' ? requestedInitialParts : 1;
    if (!dto.projectId) throw new BadRequestException('Proyecto requerido');
    if (!effectiveClientId) throw new BadRequestException('Cliente requerido');
    if (!assignedAgentId) throw new BadRequestException('Agente requerido');
    if (!(Number(dto.salePrice) > 0)) throw new BadRequestException('Precio de venta requerido');
    if (!dto.saleDate) throw new BadRequestException('Fecha de venta requerida');
    if (dto.paymentMethod !== 'Contado') {
      if (!(totalCuotas > 0)) throw new BadRequestException('Numero de cuotas requerido');
      if (!(cuotaInicial > 0)) throw new BadRequestException('Cuota inicial requerida');
      if (cuotaInicial >= Number(dto.salePrice)) throw new BadRequestException('La cuota inicial debe ser menor al precio de venta');
      if (initialPaymentMode === 'partes' && !(requestedInitialParts >= 2 && requestedInitialParts <= 24)) throw new BadRequestException('Numero de partes de la inicial invalido');
      if (dto.interestType === 'tea' && !(Number(dto.tea) > 0)) throw new BadRequestException('TEA requerida para cuotas con interes');
      if (Number(dto.graceMonths || 0) > totalCuotas) throw new BadRequestException('Las cuotas sin interes no pueden superar el total de cuotas');
    }
    const saldoFinanciar = Math.max(0, dto.salePrice - cuotaInicial);
    const financingBase = dto.salePrice;
    const gracePlan = buildGraceSchedule({ principal: saldoFinanciar, totalCuotas, graceMonths, interestType: dto.interestType, teaPct: dto.tea });
    const valorCuota = totalCuotas > 0 ? gracePlan.interestCuota : 0;

    const saved = await this.dataSource.transaction(async (manager) => {
      const currentLot = await manager.getRepository(LotEntity).findOne({ where: { id: lot.id }, lock: { mode: 'pessimistic_write' } });
      if (!currentLot) throw new BadRequestException('Lote no encontrado');
      const activeSales = await manager.getRepository(SaleEntity).createQueryBuilder('s')
        .where('s.lot_id = :lotId', { lotId: lot.id })
        .andWhere("s.approval_status <> 'rechazada' AND s.status <> 'rechazada'").getCount();
      if (activeSales || currentLot.status === 'vendido' || ['vendido', 'separado'].includes(currentLot.sellingStage)) {
        throw new BadRequestException('Este lote ya tiene una venta activa o pendiente de aprobacion.');
      }
      // Lock the quote so reuse and expiry cannot convert the same quote twice.
      const currentQuote = await manager.getRepository(QuoteEntity).findOne({ where: { id: quote.id }, lock: { mode: 'pessimistic_write' } });
      if (!currentQuote || currentQuote.deletedAt || (currentQuote.reusableUntil && currentQuote.reusableUntil.getTime() <= Date.now())) {
        throw new BadRequestException('La cotizacion ya vencio. Genera una nueva cotizacion.');
      }
      if (currentQuote.status === 'convertida') throw new BadRequestException('Esta cotizacion ya se esta usando en otra venta.');
      const paymentDetails = [
        dto.paymentMethod ? `Forma de pago: ${dto.paymentMethod}` : null,
        dto.interestType === 'tea' && dto.tea ? `TEA: ${dto.tea}%` : null,
        dto.interestType === 'tea' ? `Cuotas sin interes: ${graceMonths}` : null,
        dto.cuotaInicial != null ? `Cuota inicial: ${dto.cuotaInicial}` : null,
        cuotaInicial > 0 ? `Pago inicial: ${initialPaymentMode === 'partes' ? `${initialParts} partes sin interes` : 'contado'}` : null,
        dto.saldoFinanciar != null ? `Saldo a financiar: ${dto.saldoFinanciar}` : null,
      ].filter(Boolean).join(' | ');

      const sale = manager.create(SaleEntity, {
        projectId: dto.projectId,
        lotId: dto.lotId,
        clientId: effectiveClientId,
        clientDni,
        quoteId: quote.id,
        bonoTotalUsd: String(currentQuote.bonoTotalUsd || 0),
        lotPriceUsd: String(currentQuote.lotPriceUsd),
        agentId: assignedAgentId,
        salePrice: String(dto.salePrice),
        saleDate: dto.saleDate || undefined,
        commission: String(commission),
        financingBase: String(financingBase),
        conditions: [dto.conditions, paymentDetails].filter(Boolean).join(' | ') || undefined,
        status: 'cerrada',
        approvalStatus: 'pendiente',
        totalCuotas,
        valorCuota: String(valorCuota),
        cuotaInicial: String(cuotaInicial),
        reservaAmount: String(Math.max(0, Number(dto.reservaAmount || 0))),
        planStatus: 'pendiente',
        interestType: dto.interestType || 'sin_intereses',
        tea: String(dto.interestType === 'tea' ? Number(dto.tea || 0) : 0),
      });
      const savedSale = await manager.save(sale);
      await manager.update(LotEntity, { id: lot.id }, { finalPrice: String(quoteFinalPrice) });
      lot.finalPrice = String(quoteFinalPrice);
      if (catalog) {
        await manager.update(ProjectLotCatalogEntity, { id: catalog.id }, { finalPrice: String(quoteFinalPrice) });
      }

      // El lote queda "separado" hasta aprobación. Compromiso ATOMICO:
      // solo gana si sigue disponible; evita que dos agentes vendan/reserven a la vez.
      const claimed = await manager.update(
        LotEntity,
        { id: lot.id, sellingStage: 'disponible' },
        { sellingStage: 'separado', agentId: assignedAgentId, clientId: effectiveClientId ?? lot.clientId ?? null },
      );
      const won = claimed.affected == null || Number(claimed.affected) > 0;
      if (!won) {
        throw new BadRequestException('Mientras confirmabas, otro agente gestionó este lote. Puedes verlo, contactar al asesor responsable o pedir reasignación al administrador, pero no registrar una venta duplicada.');
      }
      lot.sellingStage = 'separado';
      lot.clientId = effectiveClientId ?? lot.clientId;
      lot.agentId = assignedAgentId;

      if (dto.quoteId) {
        await manager.update(QuoteEntity, { id: dto.quoteId }, { status: 'convertida', reusableUntil: null });
      }

      await this.audit(actorId, 'CREAR_SEPARACION', 'sales', savedSale.id, manager);
      return savedSale;
    });

    this.gateway.emitToAll('sale.created', saved);
    this.gateway.emitToAll('lot.updated', lot);
    return { ...saved, commissionRate, commission };
  }

  /** Aprueba la separación: activa plan, cronograma y pasa lote a vendido. */
  async approve(id: number, actorId: number, projectId?: number) {
    const sale = await this.saleRepo.findOne({ where: { id } });
    if (!sale) throw new BadRequestException('Venta no encontrada');
    if (projectId != null && Number(sale.projectId) !== Number(projectId)) {
      throw new BadRequestException('Esta separacion pertenece a otro proyecto y no puede aprobarse desde aqui.');
    }
    if (sale.approvalStatus === 'aprobada') return sale;

    let lot: LotEntity | null = null;
    const kept = await this.dataSource.transaction(async (manager) => {
      const lockedSale = await manager.getRepository(SaleEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!lockedSale) throw new BadRequestException('Venta no encontrada');
      if (lockedSale.approvalStatus === 'rechazada' || lockedSale.status === 'rechazada') throw new BadRequestException('Una venta rechazada no puede aprobarse. Registra una nueva venta desde la cotizacion.');
      if (lockedSale.approvalStatus === 'aprobada') return lockedSale;
      Object.assign(sale, lockedSale);
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

      // Cronograma si hay plan
      if (sale.totalCuotas > 0) {
        await this.buildSchedule(sale, sale.saleDate ? new Date(sale.saleDate) : null, manager);
      }

      await this.audit(actorId, 'APROBAR_SEPARACION', 'sales', id, manager);
      return savedSale;
    });

    this.gateway.emitToAll('lot.updated', lot);
    this.gateway.emitToAll('sale.created', kept);
    return kept;
  }

  /** Rechaza la separación (libera el lote). */
  async reject(id: number, actorId: number, note?: string, projectId?: number) {
    const sale = await this.saleRepo.findOne({ where: { id } });
    if (!sale) throw new BadRequestException('Venta no encontrada');
    if (projectId != null && Number(sale.projectId) !== Number(projectId)) {
      throw new BadRequestException('Esta separacion pertenece a otro proyecto y no puede rechazarse desde aqui.');
    }

    let lot: LotEntity | null = null;
    const kept = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.getRepository(SaleEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!locked) throw new BadRequestException('Venta no encontrada');
      if (locked.approvalStatus === 'rechazada') return locked;
      if (locked.approvalStatus === 'aprobada') throw new BadRequestException('Esta venta ya fue aprobada y no puede rechazarse como separacion.');
      Object.assign(sale, locked);
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
      if (sale.quoteId) {
        const activeSales = await manager.getRepository(SaleEntity).createQueryBuilder('s')
          .where('s.quote_id = :quoteId', { quoteId: sale.quoteId })
          .andWhere("s.approval_status <> 'rechazada'").getCount();
        if (!activeSales) await manager.update(QuoteEntity, { id: sale.quoteId }, {
          status: 'enviada', reusableUntil: new Date(Date.now() + 7 * 86400000),
        });
      }
      await this.audit(actorId, 'RECHAZAR_SEPARACION', 'sales', id, manager);
      return savedSale;
    });

    this.gateway.emitToAll('lot.updated', lot);
    this.gateway.emitToAll('sale.updated', kept);
    this.gateway.emitToAll('quote.updated', { id: sale.quoteId });
    return { kept, note };
  }

  private saleGraceMonths(sale: SaleEntity) {
    const match = String(sale.conditions || '').match(/Cuotas sin interes:\s*(\d+)/i);
    const total = Math.max(0, Number(sale.totalCuotas || 0));
    return Math.min(total, Math.max(0, Number(match?.[1] || 0)));
  }

  private async buildSchedule(sale: SaleEntity, start?: Date | null, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(SaleInstallmentEntity) : this.instRepo;
    const begin = start ? new Date(start) : new Date();
    const totalCuotas = Math.max(0, Number(sale.totalCuotas || 0));
    const cuotaInicial = Math.max(0, Number((sale as any).cuotaInicial || 0));
    const principal = Math.max(0, Number(sale.salePrice || 0) - cuotaInicial);
    const plan = buildGraceSchedule({
      principal,
      totalCuotas,
      graceMonths: this.saleGraceMonths(sale),
      interestType: sale.interestType,
      teaPct: Number(sale.tea || 0),
    });
    const rows: Partial<SaleInstallmentEntity>[] = [];
    for (const row of plan.rows) {
      const d = new Date(begin.getFullYear(), begin.getMonth() + row.month, begin.getDate());
      rows.push({
        saleId: sale.id,
        installmentNo: row.month,
        amount: String(row.cuota || 0),
        dueDate: d.toISOString().slice(0, 10),
        status: 'pendiente',
      });
    }
    await repo.save(rows);
  }


  async updateDni(id: number, clientDni: string, agentId?: number) {
    if (!/^\d{8}$/.test(clientDni)) throw new BadRequestException('El DNI debe tener 8 digitos.');
    await this.dataSource.transaction(async manager => {
      const sale = await manager.getRepository(SaleEntity).findOne({
        where: { id, ...(agentId ? { agentId } : {}) }, lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      const client = sale.clientId ? await manager.getRepository(ClientEntity).findOne({ where: { id: sale.clientId } }) : null;
      if (sale.clientDni || client?.dni) throw new BadRequestException('El DNI ya fue registrado y no se puede modificar.');
      await manager.getRepository(SaleEntity).update(id, { clientDni });
    });
    this.gateway.emitToAll('sale.updated', { id });
    return { id, clientDni };
  }

  async list(filters: ListSalesDto) {
    const { page, limit, skip } = normalizePagination(filters.page, filters.limit, 10);

    const qb = this.saleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect(UserEntity, 'u', 'u.id = s.agent_id')
      .leftJoinAndSelect(ClientEntity, 'c', 'c.id = s.client_id')
      .leftJoinAndSelect(LotEntity, 'l', 'l.id = s.lot_id')
      .select([
        's.id', 's.projectId', 's.lotId', 's.clientId', 's.agentId', 's.quoteId',
        's.salePrice', 's.saleDate', 's.commission', 's.financingBase', 's.valorCuota', 's.conditions', 's.status', 's.createdAt',
      ])
      // Postgres pliega a minúsculas cualquier alias sin comillas (AS agentName
      // vuelve "agentname"), por eso van entre comillas dobles — mismo bug que
      // ya se corrigió en lots.service.ts.
      .addSelect('u.name AS "agentName"')
      .addSelect('c.full_name AS "clientName"')
      .addSelect('COALESCE(s.client_dni, c.dni) AS "clientDni"')
      .addSelect('l.code AS "lotCode"')
      .addSelect('l.area_m2 AS "lotAreaM2"')
      .addSelect('s.approval_status AS "approvalStatus"')
      .addSelect('s.plan_status AS "planStatus"')
      .addSelect('s.total_cuotas AS "totalCuotas"')
      .addSelect('s.interest_type AS "interestType"')
      // La ficha de venta en PDF arma el bloque de Financiamiento (saldo,
      // cuota inicial, TEA, TC), por eso el listado tambien expone la cuota
      // inicial y el tipo de cambio de la cotizacion convertida.
      .addSelect('s.cuota_inicial AS "cuotaInicial"')
      .addSelect('(SELECT q.exchange_rate FROM quotes q WHERE q.id = (SELECT MAX(q2.id) FROM quotes q2 WHERE q2.lot_id = s.lot_id AND q2.status IN (\'convertida\',\'aprobada\'))) AS "exchangeRate"')
      .addSelect('s.tea AS "tea"');
    if (filters.projectId) qb.andWhere('s.project_id = :projectId', { projectId: filters.projectId });
    if (filters.agentId) qb.andWhere('s.agent_id = :agentId', { agentId: filters.agentId });
    qb.andWhere("s.approval_status <> 'rechazada' AND s.status <> 'rechazada'");
    if (filters.status) qb.andWhere('s.approval_status = :status', { status: filters.status });
    if (filters.from) qb.andWhere('s.sale_date >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('s.sale_date <= :to', { to: filters.to });
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      qb.andWhere('(l.code ILIKE :search OR c.full_name ILIKE :search OR u.name ILIKE :search)', { search: term });
    }

    // COUNT y agregados globales se calculan ANTES de aplicar ORDER BY:
    // Postgres rechaza COUNT(*) con ORDER BY de una columna no agregada.
    const total = await qb.clone().getCount();
    // Agregados globales (para las StatCards) con los mismos filtros, sin skip/take.
    const agg = await qb.clone()
      .select([])
      .addSelect('COALESCE(SUM(s.sale_price), 0)', 'sumPrice')
      .addSelect('COALESCE(SUM(s.commission), 0)', 'sumComm')
      .getRawOne();

    const sortMap: Record<string, string> = {
      saleDate: 's.sale_date',
      salePrice: 's.sale_price',
      createdAt: 's.created_at',
    };
    const sortCol = sortMap[filters.sort || 'saleDate'] || 's.sale_date';
    const order = String(filters.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const pagedQb = qb.clone().orderBy(sortCol, order).addOrderBy('s.id', order);
    // getRawMany no soporta skip/take (solo entidades); se usa offset/limit.
    const raw = await pagedQb.offset(skip).limit(limit).getRawMany();
    const items = raw.map((r) => {
      const salePrice = Number(r.s_sale_price || 0);
      const totalCuotas = Number(r.totalCuotas || 0);
      const cuotaInicial = Number(r.cuotaInicial || 0);
      const interestType = r.interestType || 'sin_intereses';
      const tea = Number(r.tea || 0);
      const conditions = r.s_conditions;
      const graceMatch = String(conditions || '').match(/Cuotas sin interes:\s*(\d+)/i);
      const graceMonths = Math.min(totalCuotas, Math.max(0, Number(graceMatch?.[1] || (interestType === 'tea' ? 0 : totalCuotas))));
      const gracePlan = buildGraceSchedule({
        principal: Math.max(0, salePrice - cuotaInicial),
        totalCuotas,
        graceMonths,
        interestType,
        teaPct: tea,
      });
      return {
        id: Number(r.s_id), projectId: Number(r.s_project_id), lotId: Number(r.s_lot_id),
        clientId: r.s_client_id ? Number(r.s_client_id) : null,
        clientName: r.clientName || null,
        clientDni: r.clientDni || null,
        quoteId: r.s_quote_id || null,
        agentId: r.s_agent_id ? Number(r.s_agent_id) : null,
        salePrice, saleDate: r.s_sale_date,
        commission: Number(r.s_commission), conditions,
        financingBase: Number(r.s_financing_base || 0),
        valorCuota: Number(r.s_valor_cuota || 0),
        graceCuota: gracePlan.graceCuota,
        status: r.s_status, createdAt: r.s_created_at,
        agentName: r.agentName || null, lotCode: r.lotCode || null,
        lotAreaM2: Number(r.lotAreaM2 || 0),
        approvalStatus: r.approvalStatus || 'pendiente',
        planStatus: r.planStatus || 'pendiente',
        totalCuotas,
        interestType,
        tea,
        cuotaInicial,
        exchangeRate: Number(r.exchangeRate || 0),
      };
    });
    const result = buildPaginatedResult(items, total, page, limit);
    return {
      ...result,
      summary: {
        totalSales: total,
        totalAmount: Number(agg?.sumPrice || 0),
        totalCommission: Number(agg?.sumComm || 0),
      },
    };
  }

  /** Financiación / venta vigente de un lote + cronograma de sus cuotas. */
  async getByLot(lotId: number, agentId?: number) {
    const sale = await this.saleRepo.findOne({
      where: { lotId },
      order: { createdAt: 'DESC' } as any,
    });
    if (agentId && sale && Number(sale.agentId) !== Number(agentId)) return { sale: null, installments: [] };
    const client = sale?.clientId
      ? await this.clientRepo.findOne({ where: { id: sale.clientId } })
      : null;
    const installments = sale
      ? await this.instRepo.find({
          where: { saleId: sale.id },
          order: { installmentNo: 'ASC' } as any,
        })
      : [];
    return {
      sale: sale ? { ...sale, clientName: client?.fullName || null } : null,
      installments,
    };
  }

  /** Separaciones pendientes de aprobación (Admin/Tesorería). */
  async pendingApprovals(projectId?: number) {
    // Reusa list() para traer lotCode/agentName/commission ya resueltos
    // (antes era un find() plano sin esos joins).
    const paged = await this.list({ status: 'pendiente', projectId, limit: 100 } as ListSalesDto);
    return paged.items;
  }

  /** Cronograma de una venta aprobada. */
  async schedule(saleId: number, agentId?: number) {
    if (agentId) {
      const sale = await this.saleRepo.findOne({ where: { id: saleId } });
      if (!sale || Number(sale.agentId) !== Number(agentId)) return [];
    }
    return this.instRepo.find({ where: { saleId }, order: { installmentNo: 'ASC' } });
  }

  /**
   * Contexto de pago para el modal "Registrar pago": busca la venta del cliente
   * o del lote, y devuelve los datos comerciales + el cronograma con el estado
   * de cada cuota y cual le toca pagar ahora.
   */
  async paymentContext(filters: { clientId?: number; lotId?: number; projectId?: number; search?: string; agentId?: number }) {
    // Resuelve el texto buscado a IDs reales antes de filtrar las ventas:
    // asi no dependemos del JOIN por nombre de columna (Postgres pliega los
    // alias sin comillas a minusculas) ni de que exista una venta previa.
    // Funciona con cualquier codigo de lote o nombre de cliente que exista.
    let searchLotIds: number[] = [];
    let searchClientIds: number[] = [];
    const term = filters.search?.trim();
    if (term && !filters.clientId && !filters.lotId) {
      const like = `%${term}%`;
      const lotQb = this.lotRepo.createQueryBuilder('l')
        .select('l.id', 'id')
        .where('l.code ILIKE :like', { like });
      if (filters.projectId) lotQb.andWhere('l.project_id = :projectId', { projectId: filters.projectId });
      const matchedLots = await lotQb.limit(50).getRawMany();
      searchLotIds = matchedLots.map((l) => Number(l.id)).filter(Boolean);

      const clientQb = this.dataSource.getRepository(ClientEntity).createQueryBuilder('c')
        .select('c.id', 'id')
        .where('c.full_name ILIKE :like', { like })
        .limit(50);
      const matchedClients = await clientQb.getRawMany();
      searchClientIds = matchedClients.map((c) => Number(c.id)).filter(Boolean);
    }

    const qb = this.saleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect(UserEntity, 'u', 'u.id = s.agent_id')
      .leftJoinAndSelect(ClientEntity, 'c', 'c.id = s.client_id')
      .leftJoinAndSelect(LotEntity, 'l', 'l.id = s.lot_id')
      .select([
        's.id', 's.projectId', 's.lotId', 's.clientId', 's.agentId',
        's.salePrice', 's.saleDate', 's.totalCuotas', 's.valorCuota',
        's.interestType', 's.tea', 's.conditions',
      ])
      .addSelect('s.cuota_inicial AS "s_cuota_inicial"')
      .addSelect('s.reserva_amount AS "s_reserva_amount"')
      .addSelect('s.approval_status AS "approvalStatus"')
      .addSelect('s.plan_status AS "planStatus"')
      .addSelect('c.full_name AS "clientName"')
      .addSelect('l.code AS "lotCode"')
      .addSelect('u.name AS "agentName"')
      .addSelect(`(
        SELECT q.final_price_usd
        FROM quotes q
        WHERE q.lot_id = s.lot_id
          AND q.deleted_at IS NULL
          AND q.status IN ('convertida','aprobada')
        ORDER BY CASE WHEN q.client_id = s.client_id THEN 0 ELSE 1 END, q.id DESC
        LIMIT 1
      ) AS "quoteFinalPriceUsd"`)
      .addSelect(`(
        SELECT q.cuota_inicial_usd
        FROM quotes q
        WHERE q.lot_id = s.lot_id
          AND q.deleted_at IS NULL
          AND q.status IN ('convertida','aprobada')
        ORDER BY CASE WHEN q.client_id = s.client_id THEN 0 ELSE 1 END, q.id DESC
        LIMIT 1
      ) AS "quoteCuotaInicialUsd"`)
      .addSelect(`(
        SELECT q.valor_cuota_usd
        FROM quotes q
        WHERE q.lot_id = s.lot_id
          AND q.deleted_at IS NULL
          AND q.status IN ('convertida','aprobada')
        ORDER BY CASE WHEN q.client_id = s.client_id THEN 0 ELSE 1 END, q.id DESC
        LIMIT 1
      ) AS "quoteValorCuotaUsd"`)
      .addSelect(`(
        SELECT q.total_cuotas
        FROM quotes q
        WHERE q.lot_id = s.lot_id
          AND q.deleted_at IS NULL
          AND q.status IN ('convertida','aprobada')
        ORDER BY CASE WHEN q.client_id = s.client_id THEN 0 ELSE 1 END, q.id DESC
        LIMIT 1
      ) AS "quoteTotalCuotas"`)
      .where("s.approval_status IN ('pendiente','aprobada')");

    if (filters.clientId) qb.andWhere('s.client_id = :clientId', { clientId: filters.clientId });
    if (filters.lotId) qb.andWhere('s.lot_id = :lotId', { lotId: filters.lotId });
    if (filters.projectId) qb.andWhere('s.project_id = :projectId', { projectId: filters.projectId });
    if (filters.agentId) qb.andWhere('s.agent_id = :agentId', { agentId: filters.agentId });
    if (term && !filters.clientId && !filters.lotId) {
      // Coincidencias por codigo de lote o nombre de cliente, resueltas arriba.
      if (!searchLotIds.length && !searchClientIds.length) {
        qb.andWhere('(c.full_name ILIKE :term OR l.code ILIKE :term)', { term: `%${term}%` });
      } else {
        const ors: string[] = [];
        const params: Record<string, any> = {};
        if (searchLotIds.length) { ors.push('s.lot_id IN (:...searchLotIds)'); params.searchLotIds = searchLotIds; }
        if (searchClientIds.length) { ors.push('s.client_id IN (:...searchClientIds)'); params.searchClientIds = searchClientIds; }
        qb.andWhere(`(${ors.join(' OR ')})`, params);
      }
    }

    const raw = await qb.orderBy('s.id', 'DESC').limit(20).getRawMany();
    if (!raw.length) return { sales: [] };

    const ids = raw.map((r) => Number(r.s_id));
    const lotIds = [...new Set(raw.map((r) => Number(r.s_lot_id)).filter(Boolean))];
    const [lots, clients, agents, installments, payments] = await Promise.all([
      this.lotRepo.findByIds(lotIds),
      this.dataSource.getRepository(ClientEntity).findByIds([...new Set(raw.map((r) => Number(r.s_client_id)).filter(Boolean))]),
      this.userRepo.findByIds([...new Set(raw.map((r) => Number(r.s_agent_id)).filter(Boolean))]),
      this.instRepo.find({ where: { saleId: In(ids) }, order: { installmentNo: 'ASC' } }),
      // Pagos de los lotes involucrados: se usan para enriquecer cada cuota con
      // los datos reales del pago (fecha, TC, US$, op. bancaria, boleta).
      lotIds.length
        ? this.dataSource.getRepository(PaymentEntity).find({ where: { lotId: In(lotIds) }, order: { paidAt: 'ASC', id: 'ASC' } })
        : Promise.resolve([] as PaymentEntity[]),
    ]);

    const lotMap = new Map(lots.map((l) => [Number(l.id), l]));
    const clientMap = new Map(clients.map((c) => [Number(c.id), c]));
    const agentMap = new Map(agents.map((a) => [Number(a.id), a]));
    const paymentsByLot = new Map<number, PaymentEntity[]>();
    for (const p of payments) {
      const key = Number(p.lotId);
      paymentsByLot.set(key, [...(paymentsByLot.get(key) || []), p]);
    }

    return {
      sales: raw.map((r) =>
        this.buildPaymentContextRow(r, {
          lot: lotMap.get(Number(r.s_lot_id)) || null,
          client: clientMap.get(Number(r.s_client_id)) || null,
          agent: agentMap.get(Number(r.s_agent_id)) || null,
          installments: installments.filter((i) => Number(i.saleId) === Number(r.s_id)),
          payments: paymentsByLot.get(Number(r.s_lot_id)) || [],
        }),
      ),
    };
  }

  // Datos del pago listos para la ficha: TC, fecha de pago, monto en US$ y
  // numero de operacion bancaria que se registro al pagar.
  private paymentDetails(payment?: PaymentEntity | null) {
    if (!payment) return null;
    return {
      paymentId: Number(payment.id),
      paidAt: payment.paidAt || null,
      exchangeRate: payment.exchangeRate != null ? Number(payment.exchangeRate) : null,
      amountUsd: payment.amountUsd != null ? Number(payment.amountUsd) : null,
      bankOperationNumber: payment.bankOperationNumber || null,
      receiptNumber: payment.receiptNumber || null,
      receiptValue: payment.receiptValue != null ? Number(payment.receiptValue) : null,
      paymentMethod: payment.paymentMethod || null,
      reference: payment.reference || null,
      voucherUrl: payment.voucherUrl || null,
      receiptDocumentUrl: payment.receiptDocumentUrl || null,
      // Voucher de la operacion bancaria subido al registrar el pago.
      approvalDocumentUrl: payment.approvalDocumentUrl || null,
      type: payment.type || null,
      status: payment.status || null,
    };
  }

  /**
   * Historial de pagos de un lote para la pantalla "Pagos de lotes": busca la
   * venta del lote (sin filtrar por estado de aprobacion, porque el cliente
   * puede estar pagando una separacion pendiente) y devuelve el cronograma
   * con los datos del pago de cada cuota (fecha, TC, US$, N° op. bancaria).
   */
  async lotPaymentHistory(lotId: number, agentId?: number) {
    const sale = await this.saleRepo.findOne({ where: { lotId }, order: { id: 'DESC' } });
    if (agentId && (!sale || Number(sale.agentId) !== Number(agentId))) return null;
    const [lot, payments] = await Promise.all([
      this.lotRepo.findOne({ where: { id: lotId } }),
      this.dataSource.getRepository(PaymentEntity).find({
        where: { lotId },
        order: { paidAt: 'ASC', id: 'ASC' },
      }),
    ]);
    const client = sale?.clientId
      ? await this.dataSource.getRepository(ClientEntity).findOne({ where: { id: sale.clientId } })
      : (lot?.clientId ? await this.dataSource.getRepository(ClientEntity).findOne({ where: { id: lot.clientId } }) : null);
    const agent = sale?.agentId ? await this.userRepo.findOne({ where: { id: sale.agentId } }) : null;

    // Sin venta registrada igual se pueden mostrar los pagos sueltos del lote.
    if (!sale) {
      return {
        sale: null,
        lot: lot ? { id: lot.id, code: lot.code, areaM2: Number(lot.areaM2 || 0), price: Number(lot.price || 0), streetName: (lot as any).streetName || null } : null,
        client: client ? { id: client.id, fullName: client.fullName || null } : null,
        agent: agent ? { id: agent.id, name: agent.name } : null,
        clientName: client?.fullName || null,
        lotCode: lot?.code || null,
        installments: [],
        otherPayments: payments.map((p) => ({
          ...this.paymentDetails(p),
          amount: Number(p.amount || 0),
          dueDate: p.dueDate || null,
        })),
        allPayments: payments.map((p) => ({
          ...this.paymentDetails(p),
          amount: Number(p.amount || 0),
          dueDate: p.dueDate || null,
        })),
        summary: { totalCuotas: 0, paidCount: 0, pendingCount: 0, nextInstallmentNo: null, nextAmount: 0, nextDueDate: null, nextIsOverdue: false },
      };
    }

    const installments = await this.instRepo.find({ where: { saleId: sale.id }, order: { installmentNo: 'ASC' } });

    const row: any = {
      s_id: sale.id,
      s_project_id: sale.projectId,
      s_lot_id: sale.lotId,
      s_client_id: sale.clientId,
      s_agent_id: sale.agentId,
      s_sale_price: sale.salePrice,
      s_cuota_inicial: (sale as any).cuotaInicial,
      s_reserva_amount: (sale as any).reservaAmount,
      totalCuotas: sale.totalCuotas,
      s_valor_cuota: sale.valorCuota,
      s_interest_type: sale.interestType,
      s_tea: (sale as any).tea,
      s_conditions: (sale as any).conditions,
      s_sale_date: sale.saleDate,
      approvalStatus: sale.approvalStatus,
      planStatus: sale.planStatus,
      clientName: client?.fullName || null,
      lotCode: lot?.code || null,
    };
    const quote = await this.resolveSaleQuote(sale.lotId, sale.clientId ? Number(sale.clientId) : undefined);
    if (quote) Object.assign(row, quote);

    return this.buildPaymentContextRow(row, { lot, client, agent, installments, payments });
  }

  async paymentHistory(paymentId: number, agentId?: number) {
    const payment = await this.dataSource.getRepository(PaymentEntity).findOne({ where: { id: paymentId } });
    if (!payment?.lotId) return null;
    return this.lotPaymentHistory(Number(payment.lotId), agentId);
  }

  /**
   * Buscador del modal "Registrar pago". Devuelve resultados por LOTE y por
   * CLIENTE existentes en la BD, tengan o no una venta registrada: un lote sin
   * venta igual debe poder recibir un pago (reserva, cuota inicial, etc.).
   * Si el lote/cliente tiene venta, se adjunta su cronograma y la cuota que le
   * toca pagar para autocompletar el formulario.
   */
  async paymentSearch(q?: string, projectId?: number, agentId?: number) {
    const term = (q || '').trim();
    if (term.length < 2) return { results: [] };
    const like = `%${term}%`;

    // 1) Lotes que coinciden por codigo.
    const lotQb = this.lotRepo.createQueryBuilder('l')
      .select('l.id', 'id')
      .addSelect('l.code AS "code"')
      .addSelect('l.project_id AS "projectId"')
      .addSelect('l.client_id AS "clientId"')
      .addSelect('l.price AS "price"')
      .addSelect('l.sale_price AS "salePrice"')
      .addSelect('l.status AS "status"')
      .addSelect('p.name AS "projectName"')
      .addSelect('c.full_name AS "clientName"')
      .leftJoin(ProjectEntity, 'p', 'p.id = l.project_id')
      .leftJoin(ClientEntity, 'c', 'c.id = l.client_id')
      .where('l.code ILIKE :like', { like });
    if (projectId) lotQb.andWhere('l.project_id = :projectId', { projectId });
    if (agentId) lotQb.andWhere('l.agent_id = :agentId', { agentId });
    const lots = await lotQb.limit(25).getRawMany();

    // 2) Clientes que coinciden por nombre (dentro del proyecto si aplica).
    const clientQb = this.dataSource.getRepository(ClientEntity).createQueryBuilder('c')
      .select('c.id', 'id')
      .addSelect('c.full_name AS "fullName"')
      .leftJoin(LotEntity, 'l', 'l.client_id = c.id')
      .where('c.full_name ILIKE :like', { like })
      .groupBy('c.id')
      .addGroupBy('c.full_name');
    if (projectId) clientQb.andWhere('l.project_id = :projectId', { projectId });
    if (agentId) clientQb.andWhere('c.agent_id = :agentId', { agentId });
    const clients = await clientQb.limit(25).getRawMany();

    const lotIds = lots.map((l) => Number(l.id));
    const clientIds = clients.map((c) => Number(c.id));
    if (!lotIds.length && !clientIds.length) return { results: [] };

    // 3) Ventas existentes para esos lotes o clientes (si las hubiera).
    const ors: string[] = [];
    const params: Record<string, any> = {};
    if (lotIds.length) { ors.push('s.lot_id IN (:...lotIds)'); params.lotIds = lotIds; }
    if (clientIds.length) { ors.push('s.client_id IN (:...clientIds)'); params.clientIds = clientIds; }
    const saleRows = await this.saleRepo.createQueryBuilder('s')
      .select('s.id', 'id')
      .addSelect('s.lot_id AS "lotId"')
      .addSelect('s.client_id AS "clientId"')
      .addSelect('s.project_id AS "projectId"')
      .addSelect('s.approval_status AS "approvalStatus"')
      .where(`(${ors.join(' OR ')})`, params)
      .orderBy('s.id', 'DESC')
      .limit(50)
      .getRawMany();
    const saleByLot = new Map<number, any>();
    const salesByClient = new Map<number, any[]>();
    for (const s of saleRows) {
      const lotKey = Number(s.lotId);
      const clientKey = Number(s.clientId);
      if (!saleByLot.has(lotKey)) saleByLot.set(lotKey, s);
      if (clientKey) salesByClient.set(clientKey, [...(salesByClient.get(clientKey) || []), s]);
    }

    // 4) Arma cada resultado. `hasSale` indica si se puede autocompletar la cuota.
    const results: any[] = [];
    const seen = new Set<string>();

    for (const l of lots) {
      const lotId = Number(l.id);
      const sale = saleByLot.get(lotId) || null;
      const context = sale ? await this.buildSaleContext(Number(sale.id)) : null;
      results.push({
        kind: 'lot',
        lotId,
        lotCode: l.code || null,
        projectId: l.projectId != null ? Number(l.projectId) : null,
        projectName: l.projectName || null,
        clientId: l.clientId != null ? Number(l.clientId) : (sale?.clientId != null ? Number(sale.clientId) : null),
        clientName: l.clientName || context?.clientName || null,
        price: l.salePrice != null ? Number(l.salePrice) : (l.price != null ? Number(l.price) : 0),
        lotStatus: l.status || null,
        hasSale: !!sale,
        approvalStatus: sale?.approvalStatus || null,
        summary: context?.summary || null,
      });
      seen.add(`lot:${lotId}`);
    }

    for (const c of clients) {
      const clientId = Number(c.id);
      // Un cliente puede tener varios lotes: se listan TODOS para que el usuario
      // elija de cual lote es el pago.
      const clientSales = salesByClient.get(clientId) || [];
      if (!clientSales.length) {
        // Cliente sin venta: se puede seleccionar para registrar reserva/inicial.
        const key = `client:${clientId}:0`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            kind: 'client',
            lotId: null,
            lotCode: null,
            projectId: null,
            projectName: null,
            clientId,
            clientName: c.fullName || null,
            price: 0,
            lotStatus: null,
            hasSale: false,
            approvalStatus: null,
            summary: null,
          });
        }
        continue;
      }
      // Tambien se consideran los lotes asignados al cliente sin venta previa.
      const seenLotIds = new Set<number>();
      for (const sale of clientSales) {
        const lotId = Number(sale.lotId);
        seenLotIds.add(lotId);
        const key = `client:${clientId}:${lotId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const context = await this.buildSaleContext(Number(sale.id));
        results.push({
          kind: 'client',
          lotId,
          lotCode: context?.lotCode || context?.lot?.code || null,
          projectId: context?.sale?.projectId ?? (sale.projectId != null ? Number(sale.projectId) : null),
          projectName: null,
          clientId,
          clientName: c.fullName || null,
          price: context?.sale?.salePrice || 0,
          lotStatus: null,
          hasSale: true,
          approvalStatus: sale.approvalStatus || null,
          summary: context?.summary || null,
        });
      }
      // Lotes del cliente sin venta registrada (asignados pero sin cerrar venta).
      const extraLots = await this.lotRepo.find({ where: { clientId } });
      for (const lot of extraLots) {
        const lotId = Number(lot.id);
        if (seenLotIds.has(lotId)) continue;
        const key = `client:${clientId}:${lotId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          kind: 'client',
          lotId,
          lotCode: lot.code || null,
          projectId: lot.projectId != null ? Number(lot.projectId) : null,
          projectName: null,
          clientId,
          clientName: c.fullName || null,
          price: Number((lot as any).salePrice ?? lot.price ?? 0),
          lotStatus: lot.status || null,
          hasSale: false,
          approvalStatus: null,
          summary: null,
        });
      }
    }

    return { results };
  }

  /** Contexto de una venta puntual, para autocompletar el pago. */
  private async buildSaleContext(saleId: number) {
    const sale = await this.saleRepo.findOne({ where: { id: saleId } });
    if (!sale) return null;
    const [lot, client, agent, installments, payments] = await Promise.all([
      this.lotRepo.findOne({ where: { id: sale.lotId } }),
      sale.clientId ? this.dataSource.getRepository(ClientEntity).findOne({ where: { id: sale.clientId } }) : Promise.resolve(null),
      sale.agentId ? this.userRepo.findOne({ where: { id: sale.agentId } }) : Promise.resolve(null),
      this.instRepo.find({ where: { saleId }, order: { installmentNo: 'ASC' } }),
      this.dataSource.getRepository(PaymentEntity).find({ where: { lotId: sale.lotId }, order: { paidAt: 'ASC', id: 'ASC' } }),
    ]);
    const row: any = {
      s_id: sale.id,
      s_project_id: sale.projectId,
      s_lot_id: sale.lotId,
      s_client_id: sale.clientId,
      s_agent_id: sale.agentId,
      s_sale_price: sale.salePrice,
      s_cuota_inicial: (sale as any).cuotaInicial,
      s_reserva_amount: (sale as any).reservaAmount,
      totalCuotas: sale.totalCuotas,
      s_valor_cuota: sale.valorCuota,
      s_interest_type: sale.interestType,
      s_tea: (sale as any).tea,
      s_conditions: (sale as any).conditions,
      s_sale_date: sale.saleDate,
      approvalStatus: sale.approvalStatus,
      planStatus: sale.planStatus,
      clientName: client?.fullName || null,
      lotCode: lot?.code || null,
      // TC pactado de la cotizacion que origino la venta: se usa para mostrar el
      // equivalente en US$ del pago sin depender del TC global de la pantalla.
      exchangeRate: await this.resolveSaleExchangeRate(sale.lotId),
    };
    const quote = await this.resolveSaleQuote(sale.lotId, sale.clientId ? Number(sale.clientId) : undefined);
    if (quote) Object.assign(row, quote);
    return this.buildPaymentContextRow(row, { lot, client, agent, installments, payments });
  }

  private async resolveSaleQuote(lotId: number, clientId?: number): Promise<any | null> {
    const rows = await this.dataSource.query(
      `SELECT q.final_price_usd AS "quoteFinalPriceUsd",
              q.cuota_inicial_usd AS "quoteCuotaInicialUsd",
              q.valor_cuota_usd AS "quoteValorCuotaUsd",
              q.total_cuotas AS "quoteTotalCuotas"
         FROM quotes q
        WHERE q.lot_id = $1
          AND q.deleted_at IS NULL
          AND q.status IN ('convertida','aprobada')
        ORDER BY CASE WHEN q.client_id = $2 THEN 0 ELSE 1 END, q.id DESC
        LIMIT 1`,
      [lotId, clientId || null],
    ).catch(() => [] as any[]);
    return rows?.[0] || null;
  }

  /**
   * Tipo de cambio de la ultima cotizacion aprobada/convertida del lote.
   * Devuelve 0 cuando la venta no nacio de una cotizacion, para que el
   * llamador decida el TC por defecto.
   */
  private async resolveSaleExchangeRate(lotId: number): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT q.exchange_rate AS "exchangeRate"
         FROM quotes q
        WHERE q.lot_id = $1 AND q.status IN ('convertida','aprobada')
        ORDER BY q.id DESC
        LIMIT 1`,
      [lotId],
    ).catch(() => [] as any[]);
    return Number(rows?.[0]?.exchangeRate || 0);
  }

  private buildPaymentContextRow(
    r: any,
    related: { lot: any; client: any; agent: any; installments: SaleInstallmentEntity[]; payments?: PaymentEntity[] },
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const allPayments = related.payments || [];
    const paidPayments = allPayments.filter((p) => String(p.status) === 'pagado');
    const paymentAmount = (p?: PaymentEntity | null) => Number((p as any)?.amountUsd ?? p?.amount ?? 0);
    const salePrice = Number(r.s_sale_price ?? r.quoteFinalPriceUsd ?? 0);
    const expectedCuotaInicial = Number(r.s_cuota_inicial ?? r.quoteCuotaInicialUsd ?? 0);
    const totalCuotas = Number(r.totalCuotas ?? r.quoteTotalCuotas ?? 0);
    const valorCuota = Number(r.s_valor_cuota ?? r.quoteValorCuotaUsd ?? 0);

    const usedPaymentIds = new Set<number>();
    const expectedReserva = Number(r.s_reserva_amount || 0);
    const initialPartsMatch = String(r.s_conditions || '').match(/Pago inicial:\s*(\d+)\s*partes/i);
    const initialParts = expectedCuotaInicial > 0
      ? Math.max(1, initialPartsMatch ? Number(initialPartsMatch[1] || 1) : 1)
      : 0;
    const initialRows: any[] = [];
    const reservaPayments = [...paidPayments, ...allPayments.filter((p) => String(p.status) !== 'pagado')]
      .filter((p) => paymentConcept(p.type) === 'reserva');
    const cuotaInicialPayments = [...paidPayments, ...allPayments.filter((p) => String(p.status) !== 'pagado')]
      .filter((p) => paymentConcept(p.type) === 'cuota_inicial');

    for (const p of reservaPayments) {
      usedPaymentIds.add(Number(p.id));
      initialRows.push({
        id: `payment-${p.id}`,
        paymentId: Number(p.id),
        installmentNo: null,
        kind: 'reserva',
        conceptLabel: 'Reserva',
        amount: paymentAmount(p),
        dueDate: p.dueDate || null,
        status: p.status,
        paid: String(p.status) === 'pagado',
        overdue: String(p.status) !== 'pagado' && !!p.dueDate && String(p.dueDate).slice(0, 10) < today,
        isCurrent: false,
        payment: this.paymentDetails(p),
      });
    }

    if (expectedReserva > 0 && !reservaPayments.length) {
      initialRows.push({
        id: `expected-reserva-${r.s_id}`,
        paymentId: 0,
        installmentNo: null,
        kind: 'reserva',
        conceptLabel: 'Reserva',
        amount: expectedReserva,
        dueDate: r.s_sale_date || null,
        status: 'pendiente',
        paid: false,
        overdue: !!r.s_sale_date && String(r.s_sale_date).slice(0, 10) < today,
        isCurrent: false,
        payment: null,
      });
    }

    if (expectedCuotaInicial > 0) {
      const partAmount = expectedCuotaInicial / Math.max(1, initialParts);
      for (let i = 0; i < Math.max(1, initialParts); i++) {
        const p = cuotaInicialPayments[i] || null;
        if (p) usedPaymentIds.add(Number(p.id));
        initialRows.push({
          id: p ? `payment-${p.id}` : `expected-cuota-inicial-${r.s_id}-${i + 1}`,
          paymentId: p ? Number(p.id) : 0,
          installmentNo: null,
          kind: 'cuota_inicial',
          conceptLabel: initialParts > 1 ? `Cuota inicial ${i + 1}/${initialParts}` : 'Cuota inicial',
          amount: p ? paymentAmount(p) : partAmount,
          dueDate: p?.dueDate || r.s_sale_date || null,
          status: p?.status || 'pendiente',
          paid: p ? String(p.status) === 'pagado' : false,
          overdue: p ? (String(p.status) !== 'pagado' && !!p.dueDate && String(p.dueDate).slice(0, 10) < today) : (!!r.s_sale_date && String(r.s_sale_date).slice(0, 10) < today),
          isCurrent: false,
          payment: this.paymentDetails(p),
        });
      }
      for (const p of cuotaInicialPayments.slice(initialParts)) {
        usedPaymentIds.add(Number(p.id));
        initialRows.push({
          id: `payment-${p.id}`,
          paymentId: Number(p.id),
          installmentNo: null,
          kind: 'cuota_inicial',
          conceptLabel: 'Abono cuota inicial',
          amount: paymentAmount(p),
          dueDate: p.dueDate || null,
          status: p.status,
          paid: String(p.status) === 'pagado',
          overdue: String(p.status) !== 'pagado' && !!p.dueDate && String(p.dueDate).slice(0, 10) < today,
          isCurrent: false,
          payment: this.paymentDetails(p),
        });
      }
    } else {
      for (const p of cuotaInicialPayments) {
        usedPaymentIds.add(Number(p.id));
        initialRows.push({
          id: `payment-${p.id}`,
          paymentId: Number(p.id),
          installmentNo: null,
          kind: 'cuota_inicial',
          conceptLabel: 'Cuota inicial',
          amount: paymentAmount(p),
          dueDate: p.dueDate || null,
          status: p.status,
          paid: String(p.status) === 'pagado',
          overdue: String(p.status) !== 'pagado' && !!p.dueDate && String(p.dueDate).slice(0, 10) < today,
          isCurrent: false,
          payment: this.paymentDetails(p),
        });
      }
    }

    const initialPaidAmount = initialRows.filter((row) => row.paid).reduce((sum, row) => sum + row.amount, 0);
    const initialPendingAmount = initialRows.filter((row) => !row.paid).reduce((sum, row) => sum + row.amount, 0);
    const reservaPaid = expectedReserva > 0
      ? initialRows.filter((row) => row.kind === 'reserva' && row.paid).reduce((sum, row) => sum + row.amount, 0) + 0.01 >= expectedReserva
      : initialRows.some((row) => row.kind === 'reserva' && row.paid);
    const cuotaInicialPaid = expectedCuotaInicial > 0
      ? initialRows.filter((row) => row.kind === 'cuota_inicial' && row.paid).reduce((sum, row) => sum + row.amount, 0) + 0.01 >= expectedCuotaInicial
      : initialRows.some((row) => row.kind === 'cuota_inicial' && row.paid);

    const pool = allPayments.filter((p) => !usedPaymentIds.has(Number(p.id)));
    const takeByPaymentId = (paymentId?: number | null) => {
      if (!paymentId) return null;
      const idx = pool.findIndex((p) => Number(p.id) === Number(paymentId));
      if (idx < 0) return null;
      return pool.splice(idx, 1)[0];
    };


    const expectedInstallmentAmount = totalCuotas > 0
      ? (valorCuota > 0 ? valorCuota : Math.max(0, (salePrice - expectedCuotaInicial) / totalCuotas))
      : 0;
    const rows = related.installments.map((inst) => {
      let payment = takeByPaymentId(inst.paymentId);
      if (!payment) {
        const index = pool.findIndex(p => paymentConcept(p.type) === 'cuota' &&
          ((p.dueDate && String(p.dueDate).slice(0, 10) === String(inst.dueDate).slice(0, 10)) ||
          Number(String(p.reference || '').match(/cuota\s*(?:n[.\s]*)?(\d+)/i)?.[1] || 0) === inst.installmentNo));
        if (index >= 0) payment = pool.splice(index, 1)[0];
      }
      if (!payment && inst.status === 'pagado') {
        const index = pool.findIndex(p => paymentConcept(p.type) === 'cuota' && String(p.status) === 'pagado');
        if (index >= 0) payment = pool.splice(index, 1)[0];
      }
      const paid = payment ? String(payment.status) === 'pagado' : inst.status === 'pagado';
      const overdue = !paid && !!inst.dueDate && String(inst.dueDate).slice(0, 10) < today;
      return {
        id: inst.id,
        installmentNo: inst.installmentNo,
        kind: 'cuota' as const,
        conceptLabel: `Cuota ${inst.installmentNo}`,
        amount: Number(inst.amount || 0) || expectedInstallmentAmount,
        dueDate: inst.dueDate,
        status: payment?.status || inst.status,
        paid,
        registered: !!payment || !!inst.paymentId,
        overdue,
        isCurrent: !paid && !overdue && !!inst.dueDate,
        coveredByInitial: false,
        payment: this.paymentDetails(payment),
      };
    });

    const pendingInitial = initialRows.filter((row) => !row.paid && !row.payment);
    const nextDueRow =
      rows.find((x) => !x.paid && !x.registered) || null;
    const nextConcept = pendingInitial.length
      ? {
          installmentNo: null,
          conceptLabel: pendingInitial[0].conceptLabel || (pendingInitial[0].kind === 'reserva' ? 'Reserva' : 'Cuota inicial'),
          amount: pendingInitial[0].amount || initialPendingAmount,
          dueDate: pendingInitial[0].dueDate,
          overdue: pendingInitial.some((row) => row.overdue),
          isInitial: true,
        }
      : nextDueRow
        ? {
            installmentNo: nextDueRow.installmentNo,
            conceptLabel: `Cuota ${nextDueRow.installmentNo}`,
            amount: nextDueRow.amount,
            dueDate: nextDueRow.dueDate,
            overdue: nextDueRow.overdue,
            isInitial: false,
          }
        : null;

    const paidCount = rows.filter((x) => x.paid).length;
    const { lot, client, agent } = related;

    const installmentsPaidAmount = rows
      .filter((x) => x.paid && !(x as any).coveredByInitial)
      .reduce((sum, x) => sum + x.amount, 0);
    const collectedAmount = initialPaidAmount + installmentsPaidAmount;
    const cuotaInicial = expectedCuotaInicial
      || Math.max(0, salePrice - valorCuota * totalCuotas);


    return {
      sale: {
        id: Number(r.s_id),
        projectId: Number(r.s_project_id),
        lotId: Number(r.s_lot_id),
        clientId: r.s_client_id ? Number(r.s_client_id) : null,
        agentId: r.s_agent_id ? Number(r.s_agent_id) : null,
        salePrice,
        cuotaInicial,
        reservaAmount: Number(r.s_reserva_amount || 0),
        totalCuotas: Number(totalCuotas || rows.length),
        valorCuota,
        interestType: r.s_interest_type || 'sin_intereses',
        tea: Number(r.s_tea || 0),
        paymentMethod: r.s_conditions || 'Al crédito',
        approvalStatus: r.approvalStatus || 'pendiente',
        planStatus: r.planStatus || 'pendiente',
        saleDate: r.s_sale_date,
        // TC pactado de la venta (0 si no proviene de cotizacion). El frontend
        // lo usa para convertir a US$ el monto de la cuota que se autocompleta.
        exchangeRate: Number(r.exchangeRate || 0),
      },
      lot: lot ? { id: lot.id, code: lot.code, areaM2: Number(lot.areaM2 || 0), price: Number(lot.price || 0), streetName: (lot as any).streetName || null } : null,
      client: client ? { id: client.id, fullName: client.fullName || null, phone: (client as any).phone || null, email: (client as any).email || null } : null,
      agent: agent ? { id: agent.id, name: agent.name } : null,
      clientName: r.clientName || (client as any)?.fullName || null,
      lotCode: r.lotCode || lot?.code || null,
      plan: [...initialRows, ...rows],
      installments: rows,
      otherPayments: pool.map((p) => ({
        ...this.paymentDetails(p),
        conceptLabel: paymentConceptLabel(p.type),
        amount: paymentAmount(p),
        dueDate: p.dueDate || null,
      })),
      allPayments: allPayments.map((p) => ({
        ...this.paymentDetails(p),
        conceptLabel: paymentConceptLabel(p.type),
        amount: paymentAmount(p),
        dueDate: p.dueDate || null,
      })),
      summary: {
        totalCuotas: rows.length,
        paidCount,
        pendingCount: rows.length - paidCount,
        pendingApprovalCount: allPayments.filter(p => String(p.status) !== 'pagado').length,
        nextInstallmentNo: nextConcept?.isInitial ? null : (nextConcept?.installmentNo || null),
        nextConceptLabel: nextConcept?.conceptLabel || null,
        nextIsInitial: !!nextConcept?.isInitial,
        nextAmount: nextConcept?.amount || 0,
        nextDueDate: nextConcept?.dueDate || null,
        nextIsOverdue: !!nextConcept?.overdue,
        reservaAmount: Number(r.s_reserva_amount || 0),
        reservaPaid,
        cuotaInicial,
        cuotaInicialPaid,
        collectedAmount,
        balanceAmount: Math.max(0, salePrice - collectedAmount),
      },
    };
  }
}

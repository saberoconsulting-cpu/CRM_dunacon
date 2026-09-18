// modules/bank-accounts/application/bank-accounts.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { BankAccountMovementEntity } from '../../../shared/infrastructure/entities/bank-account-movement.entity';
import { BankAccountBalanceEntity } from '../../../shared/infrastructure/entities/bank-account-balance.entity';
import { BankAccountEntity } from '../../../shared/infrastructure/entities/bank-account.entity';
import { BankCategoryMappingEntity } from '../../../shared/infrastructure/entities/bank-category-mapping.entity';
import {
  BankMovementImportRow,
  CreateBankCategoryDto,
  CreateBankMovementDto,
  UpdateBankCategoryDto,
  UpdateBankMovementDto,
  UpdateBankOpeningBalanceDto,
  CreateBankAccountDto,
} from './dto/bank-account.dto';

export const BANK_EXPECTED_COLUMNS = [
  'item',
  'fecha_abono',
  'mes',
  'descripcion',
  'proveedor_cliente',
  'abono',
  'cargo',
  'saldo_contable',
  'tipo_ingreso_gasto',
  'clasificacion_eerr',
  'nro_factura_boleta',
  'observacion',
] as const;

const SUMMARY_LABELS = ['totales', 'saldo inicial', 'saldo final'];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

type ListFilters = {
  accountKey?: string;
  from?: string;
  to?: string;
  currency?: string;
  movementType?: string;
  eerrClassification?: string;
  search?: string;
};

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccountMovementEntity)
    private readonly movementRepo: Repository<BankAccountMovementEntity>,
    @InjectRepository(BankAccountBalanceEntity)
    private readonly balanceRepo: Repository<BankAccountBalanceEntity>,
    @InjectRepository(BankAccountEntity)
    private readonly accountRepo: Repository<BankAccountEntity>,
    @InjectRepository(BankCategoryMappingEntity)
    private readonly categoryRepo: Repository<BankCategoryMappingEntity>,
  ) {}

  async list(projectId: number, filters: ListFilters = {}) {
    if (!projectId) throw new BadRequestException('Proyecto requerido');
    const accountKey = filters.accountKey || 'GENERAL';

    const qb = this.movementRepo.createQueryBuilder('m')
      .where('m.project_id = :projectId', { projectId })
      .andWhere('m.account_key = :accountKey', { accountKey });

    if (filters.from) qb.andWhere('m.movement_date >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('m.movement_date <= :to', { to: filters.to });
    if (filters.currency) qb.andWhere('m.currency = :currency', { currency: filters.currency });
    if (filters.movementType) qb.andWhere('m.movement_type = :movementType', { movementType: filters.movementType });
    if (filters.eerrClassification) qb.andWhere('m.eerr_classification = :eerrClassification', { eerrClassification: filters.eerrClassification });
    if (filters.search) {
      qb.andWhere(
        '(m.description ILIKE :search OR m.counterparty ILIKE :search OR m.invoice_number ILIKE :search OR m.observation ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    const items = await qb
      .orderBy('m.movement_date', 'ASC', 'NULLS LAST')
      .addOrderBy('m.item_number', 'ASC', 'NULLS LAST')
      .addOrderBy('m.id', 'ASC')
      .getMany();

    const summary = await this.buildSummary(items, projectId, accountKey);
    const facets = await this.buildFacets(projectId, accountKey);

    return { items, summary, facets };
  }

  private async buildSummary(items: BankAccountMovementEntity[], projectId: number, accountKey: string) {
    let depositPEN = 0;
    let chargePEN = 0;
    let depositUSD = 0;
    let chargeUSD = 0;

    for (const item of items) {
      const deposit = Number(item.depositAmount || 0);
      const charge = Number(item.chargeAmount || 0);
      if (item.currency === 'USD') {
        depositUSD += deposit;
        chargeUSD += charge;
      } else {
        depositPEN += deposit;
        chargePEN += charge;
      }
    }

    const saldoInicial = await this.getOpeningBalance(projectId, 'PEN', accountKey, items);

    // Saldo Final = Saldo Inicial + Total Abonos - Total Cargos (periodo visible).
    const saldoFinal = saldoInicial + depositPEN - chargePEN;

    const months = new Set(items.map((item) => item.monthLabel || (item.movementDate ? item.movementDate.slice(0, 7) : '')).filter(Boolean));

    return {
      saldoInicial: round2(saldoInicial),
      totalAbonos: round2(depositPEN),
      totalCargos: round2(chargePEN),
      saldoFinal: round2(saldoFinal),
      movimientos: items.length,
      meses: months.size,
      totalAbonosUSD: round2(depositUSD),
      totalCargosUSD: round2(chargeUSD),
      saldoUSD: round2(depositUSD - chargeUSD),
      netoPEN: round2(depositPEN - chargePEN),
    };
  }

  private async buildFacets(projectId: number, accountKey: string) {
    const classifications = await this.movementRepo.createQueryBuilder('m')
      .select('m.eerr_classification', 'value')
      .addSelect('COUNT(*)', 'count')
      .where('m.project_id = :projectId', { projectId })
      .andWhere('m.account_key = :accountKey', { accountKey })
      .andWhere('m.eerr_classification IS NOT NULL')
      .andWhere("m.eerr_classification <> ''")
      .groupBy('m.eerr_classification')
      .orderBy('m.eerr_classification', 'ASC')
      .getRawMany();

    const months = await this.movementRepo.createQueryBuilder('m')
      .select("to_char(m.movement_date, 'YYYY-MM')", 'value')
      .where('m.project_id = :projectId', { projectId })
      .andWhere('m.account_key = :accountKey', { accountKey })
      .andWhere('m.movement_date IS NOT NULL')
      .groupBy("to_char(m.movement_date, 'YYYY-MM')")
      .orderBy("to_char(m.movement_date, 'YYYY-MM')", 'DESC')
      .getRawMany();

    const batches = await this.movementRepo.createQueryBuilder('m')
      .select('m.source_file', 'file')
      .addSelect('m.import_batch', 'batch')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MIN(m.created_at)', 'createdAt')
      .where('m.project_id = :projectId', { projectId })
      .andWhere('m.account_key = :accountKey', { accountKey })
      .andWhere('m.import_batch IS NOT NULL')
      .groupBy('m.source_file')
      .addGroupBy('m.import_batch')
      .orderBy('MIN(m.created_at)', 'DESC')
      .getRawMany();

    return {
      eerrClassifications: classifications.map((row) => ({ value: row.value, count: Number(row.count || 0) })),
      months: months.map((row) => row.value).filter(Boolean),
      batches: batches.map((row) => ({
        file: row.file,
        batch: row.batch,
        count: Number(row.count || 0),
        createdAt: row.createdAt,
      })),
    };
  }

  async create(dto: CreateBankMovementDto, actorId?: number) {
    if (!dto.projectId) throw new BadRequestException('Proyecto requerido');
    const deposit = Number(dto.depositAmount || 0);
    const charge = Number(dto.chargeAmount || 0);
    if (deposit <= 0 && charge <= 0) {
      throw new BadRequestException('Ingresa un abono (ingreso) o un cargo (egreso) mayor a cero');
    }
    if (deposit > 0 && charge > 0) {
      throw new BadRequestException('Un movimiento no puede tener abono y cargo a la vez');
    }

    const accountKey = dto.accountKey || 'GENERAL';
    const currency = dto.currency || 'PEN';
    const map = await this.categoryMap(dto.projectId);
    const resolvedType = dto.movementType || (deposit > 0 ? 'INGRESO' : 'GASTO');
    // Se usa una transaccion: mantiene una sola conexion del pool durante toda
    // la operacion (el pooler de Supabase castiga las consultas encadenadas).
    await this.movementRepo.manager.transaction(async (manager) => {
      await manager.save(manager.create(BankAccountMovementEntity, {
        projectId: dto.projectId,
        accountKey,
        itemNumber: null,
        movementDate: normalizeDate(dto.movementDate),
        monthLabel: dto.monthLabel || monthLabelFromDate(dto.movementDate),
        description: dto.description || null,
        counterparty: dto.counterparty || null,
        depositAmount: String(deposit),
        chargeAmount: String(charge),
        bookBalance: null,
        openingBalance: null,
        movementType: resolvedType,
        // Si no se envia clasificacion, se autocompleta con el mapeo EERR.
        eerrClassification: dto.eerrClassification || map.get(normalizeHeader(resolvedType)) || null,
        invoiceNumber: dto.invoiceNumber || null,
        observation: dto.observation || null,
        currency,
        source: 'manual',
        importBatch: null,
        sourceFile: null,
        sourceKey: null,
        sourceRow: null,
        createdBy: actorId || null,
      }));
      await this.recalculateBalances(dto.projectId, currency, accountKey, manager);
    });

    return this.list(dto.projectId, { accountKey });
  }

  async update(id: number, dto: UpdateBankMovementDto) {
    const item = await this.movementRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Movimiento bancario no encontrado');

    const deposit = dto.depositAmount !== undefined ? Number(dto.depositAmount || 0) : Number(item.depositAmount || 0);
    const charge = dto.chargeAmount !== undefined ? Number(dto.chargeAmount || 0) : Number(item.chargeAmount || 0);
    if (deposit > 0 && charge > 0) {
      throw new BadRequestException('Un movimiento no puede tener abono y cargo a la vez');
    }

    Object.assign(item, {
      ...(dto.movementDate !== undefined ? { movementDate: normalizeDate(dto.movementDate) } : {}),
      ...(dto.monthLabel !== undefined ? { monthLabel: dto.monthLabel } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.counterparty !== undefined ? { counterparty: dto.counterparty } : {}),
      ...(dto.depositAmount !== undefined ? { depositAmount: String(deposit) } : {}),
      ...(dto.chargeAmount !== undefined ? { chargeAmount: String(charge) } : {}),
      ...(dto.bookBalance !== undefined ? { bookBalance: dto.bookBalance === null ? null : String(dto.bookBalance) } : {}),
      ...(dto.movementType !== undefined ? { movementType: dto.movementType } : {}),
      ...(dto.eerrClassification !== undefined ? { eerrClassification: dto.eerrClassification } : {}),
      ...(dto.invoiceNumber !== undefined ? { invoiceNumber: dto.invoiceNumber } : {}),
      ...(dto.observation !== undefined ? { observation: dto.observation } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
    });

    await this.movementRepo.save(item);
    await this.recalculateBalances(item.projectId, item.currency, item.accountKey);
    return this.list(item.projectId, { accountKey: item.accountKey });
  }

  async remove(id: number) {
    const item = await this.movementRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Movimiento bancario no encontrado');
    const { projectId, currency, accountKey } = item;
    await this.movementRepo.delete(id);
    await this.recalculateBalances(projectId, currency, accountKey);
    return this.list(projectId, { accountKey });
  }

  async updateOpeningBalance(dto: UpdateBankOpeningBalanceDto) {
    if (!dto.projectId) throw new BadRequestException('Proyecto requerido');
    const accountKey = dto.accountKey || 'GENERAL';
    const currency = dto.currency || 'PEN';
    const openingBalance = Number(dto.openingBalance);
    if (!Number.isFinite(openingBalance)) throw new BadRequestException('Saldo inicial no valido');

    await this.saveOpeningBalance(dto.projectId, currency, accountKey, openingBalance);
    await this.recalculateBalances(dto.projectId, currency, accountKey);
    return this.list(dto.projectId, { accountKey });
  }

  async listAccounts(projectId: number) {
    if (!projectId) throw new BadRequestException('Proyecto requerido');
    let items = await this.accountRepo.find({ where: { projectId, isActive: true }, order: { id: 'ASC' } });
    if (!items.length) {
      const account = await this.accountRepo.save(this.accountRepo.create({ projectId, accountKey: 'GENERAL', name: 'Cuenta principal', bank: 'BCP', accountNumber: null, isActive: true }));
      items = [account];
    }
    return { items };
  }

  async createAccount(dto: CreateBankAccountDto) {
    if (!dto.projectId) throw new BadRequestException('Proyecto requerido');
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Ingresa el nombre de la cuenta');
    const accountKey = `${name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}-${Date.now()}`;
    await this.accountRepo.save(this.accountRepo.create({ projectId: dto.projectId, accountKey, name, bank: dto.bank?.trim() || null, accountNumber: dto.accountNumber?.trim() || null, isActive: true }));
    return this.listAccounts(dto.projectId);
  }

  /**
   * Resumen mensual por anio. Se genera agregando los movimientos detallados:
   *   Saldo Inicial(m=1)  = saldo inicial general de la cuenta.
   *   Saldo Inicial(m>1)  = Saldo Final(m-1).
   *   Saldo Final(m)      = Saldo Inicial(m) + Abonos(m) - Pagos(m).
   */
  async annualReport(projectId: number, year?: number, currency?: string, accountKey = 'GENERAL') {
    if (!projectId) throw new BadRequestException('Proyecto requerido');

    const years = await this.movementRepo.createQueryBuilder('m')
      .select("EXTRACT(YEAR FROM m.movement_date)", 'value')
      .where('m.project_id = :projectId', { projectId })
      .andWhere('m.movement_date IS NOT NULL')
      .groupBy("EXTRACT(YEAR FROM m.movement_date)")
      .orderBy("EXTRACT(YEAR FROM m.movement_date)", 'DESC')
      .getRawMany();
    const availableYears = years.map((row) => Number(row.value)).filter(Boolean);

    const selectedYear = Number(year) || availableYears[0] || new Date().getFullYear();
    const selectedCurrency = (currency || 'PEN').toUpperCase().slice(0, 3);

    // Para encadenar los saldos se traen TODOS los movimientos previos al anio
    // (de cualquier fecha anterior), no solo los del anio seleccionado.
    const items = await this.movementRepo.find({
      where: { projectId, currency: selectedCurrency, accountKey },
      order: { movementDate: 'ASC', itemNumber: 'ASC', id: 'ASC' },
    });

    const openingBalance = await this.getOpeningBalance(projectId, selectedCurrency, accountKey, items);

    // Saldo Inicial del anio = saldo acumulado al cierre del anio anterior.
    let running = openingBalance;
    for (const item of items) {
      const itemYear = yearOf(item.movementDate);
      if (itemYear !== null && itemYear >= selectedYear) break;
      running += Number(item.depositAmount || 0) - Number(item.chargeAmount || 0);
    }
    const openingOfYear = round2(running);

    const monthly = MONTH_NAMES.map((name, index) => ({
      month: index + 1,
      name,
      saldoInicial: 0,
      abonos: 0,
      pagos: 0,
      saldoFinal: 0,
      movimientos: 0,
    }));

    for (const item of items) {
      if (yearOf(item.movementDate) !== selectedYear) continue;
      const month = monthOf(item.movementDate);
      if (month === null) continue;
      const bucket = monthly[month - 1];
      bucket.abonos += Number(item.depositAmount || 0);
      bucket.pagos += Number(item.chargeAmount || 0);
      bucket.movimientos += 1;
    }

    let carried = openingOfYear;
    for (const bucket of monthly) {
      bucket.saldoInicial = round2(carried);
      bucket.abonos = round2(bucket.abonos);
      bucket.pagos = round2(bucket.pagos);
      bucket.saldoFinal = round2(bucket.saldoInicial + bucket.abonos - bucket.pagos);
      carried = bucket.saldoFinal;
    }

    const totalAbonos = round2(monthly.reduce((sum, bucket) => sum + bucket.abonos, 0));
    const totalPagos = round2(monthly.reduce((sum, bucket) => sum + bucket.pagos, 0));
    const activeMonths = monthly.filter((bucket) => bucket.movimientos > 0);
    const saldoFinalAnual = activeMonths.length
      ? activeMonths[activeMonths.length - 1].saldoFinal
      : openingOfYear;

    return {
      year: selectedYear,
      currency: selectedCurrency,
      availableYears,
      openingBalance: openingOfYear,
      months: monthly,
      totals: {
        abonos: totalAbonos,
        pagos: totalPagos,
        saldoInicial: openingOfYear,
        saldoFinal: saldoFinalAnual,
        movimientos: monthly.reduce((sum, bucket) => sum + bucket.movimientos, 0),
      },
    };
  }

  private async recalculateBalances(projectId: number, currency: string, accountKey: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(BankAccountMovementEntity) : this.movementRepo;
    const items = await repo.find({
      where: { projectId, currency, accountKey },
      order: { movementDate: 'ASC', itemNumber: 'ASC', id: 'ASC' },
    });
    if (!items.length) return;

    const openingBalance = await this.getOpeningBalance(projectId, currency, accountKey, items, manager);
    let running = openingBalance;

    const changed: BankAccountMovementEntity[] = [];
    for (const item of items) {
      running += Number(item.depositAmount || 0) - Number(item.chargeAmount || 0);
      const next = String(round2(running));
      if (item.bookBalance === next) continue;
      item.bookBalance = next;
      changed.push(item);
    }

    if (!changed.length) return;
    // Se guarda por lotes en una sola sentencia para no saturar el pool.
    for (let index = 0; index < changed.length; index += 200) {
      await repo.save(changed.slice(index, index + 200), { chunk: 200 });
    }
  }

  private async getOpeningBalance(
    projectId: number,
    currency: string,
    accountKey: string,
    items: BankAccountMovementEntity[] = [],
    manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(BankAccountBalanceEntity) : this.balanceRepo;
    const configured = await repo.findOne({ where: { projectId, currency, accountKey } });
    if (configured) return Number(configured.openingBalance || 0);

    // Compatibilidad con importaciones anteriores que guardaron el dato en la primera fila.
    const declared = items.find((item) => item.openingBalance !== null);
    return declared ? Number(declared.openingBalance || 0) : 0;
  }

  private async saveOpeningBalance(projectId: number, currency: string, accountKey: string, openingBalance: number, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(BankAccountBalanceEntity) : this.balanceRepo;
    const existing = await repo.findOne({ where: { projectId, currency, accountKey } });
    if (existing) {
      existing.openingBalance = String(round2(openingBalance));
      await repo.save(existing);
      return;
    }
    await repo.save(repo.create({ projectId, currency, accountKey, openingBalance: String(round2(openingBalance)) }));
  }

  async listCategories(projectId: number) {
    if (!projectId) throw new BadRequestException('Proyecto requerido');
    const items = await this.categoryRepo.find({
      where: { projectId, isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return { items, unmapped: [], eerrOptions: Array.from(new Set(items.map((item) => item.eerrClassification))).sort() };
  }

  /**
   * Detecta los conceptos usados en movimientos que aun no estan homologados.
   * Se separa de `listCategories` para que la pantalla no pague esta consulta
   * en cada accion del CRUD.
   */
  async unmappedCategories(projectId: number) {
    if (!projectId) throw new BadRequestException('Proyecto requerido');
    const used: Array<{ movementType: string; eerrClassification: string | null }> =
      await this.movementRepo.createQueryBuilder('m')
        .select('m.movement_type', 'movementType')
        .addSelect('m.eerr_classification', 'eerrClassification')
        .where('m.project_id = :projectId', { projectId })
        .andWhere('m.movement_type IS NOT NULL')
        .groupBy('m.movement_type')
        .addGroupBy('m.eerr_classification')
        .getRawMany();

    const items = await this.categoryRepo.find({ where: { projectId, isActive: true } });
    const known = new Set(items.map((item) => normalizeHeader(item.movementType)));
    const unmapped = used
      .filter((row) => row.movementType && !known.has(normalizeHeader(row.movementType)))
      .map((row) => ({ movementType: row.movementType, eerrClassification: row.eerrClassification || '' }));

    return {
      unmapped,
      eerrOptions: Array.from(new Set([
        ...items.map((item) => item.eerrClassification),
        ...used.map((row) => row.eerrClassification),
      ].filter(Boolean) as string[])).sort(),
    };
  }

  async createCategory(dto: CreateBankCategoryDto, actorId?: number) {
    if (!dto.projectId) throw new BadRequestException('Proyecto requerido');
    const movementType = cleanCell(dto.movementType);
    const eerrClassification = cleanCell(dto.eerrClassification);
    if (!movementType) throw new BadRequestException('Ingresa el TIPO INGRESO/GASTO');
    if (!eerrClassification) throw new BadRequestException('Ingresa la CLASIFICACION EERR');

    await this.categoryRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(BankCategoryMappingEntity);
      const duplicate = await repo.findOne({ where: { projectId: dto.projectId, movementType } });
      if (duplicate) {
        duplicate.eerrClassification = eerrClassification;
        duplicate.isActive = true;
        await repo.save(duplicate);
        return;
      }
      await repo.save(repo.create({
        projectId: dto.projectId,
        movementType,
        eerrClassification,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
        createdBy: actorId || null,
      }));
    });

    return this.listCategories(dto.projectId);
  }

  async updateCategory(id: number, dto: UpdateBankCategoryDto) {
    const existing = await this.categoryRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Categoria no encontrada');

    const movementType = dto.movementType !== undefined ? cleanCell(dto.movementType) : existing.movementType;
    const eerrClassification = dto.eerrClassification !== undefined ? cleanCell(dto.eerrClassification) : existing.eerrClassification;
    if (!movementType) throw new BadRequestException('Ingresa el TIPO INGRESO/GASTO');
    if (!eerrClassification) throw new BadRequestException('Ingresa la CLASIFICACION EERR');

    const previousType = existing.movementType;
    await this.categoryRepo.manager.transaction(async (manager) => {
      Object.assign(existing, {
        movementType,
        eerrClassification,
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      });
      await manager.save(existing);

      // Al renombrar el concepto se homologan los movimientos ya registrados.
      if (previousType !== movementType) {
        await manager.getRepository(BankAccountMovementEntity)
          .createQueryBuilder()
          .update(BankAccountMovementEntity)
          .set({ movementType })
          .where('project_id = :projectId AND movement_type = :previousType', { projectId: existing.projectId, previousType })
          .execute();
      }
    });

    return this.listCategories(existing.projectId);
  }

  async removeCategory(id: number) {
    const item = await this.categoryRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Categoria no encontrada');
    item.isActive = false;
    await this.categoryRepo.save(item);
    return this.listCategories(item.projectId);
  }

  /** Mapa TIPO INGRESO/GASTO -> CLASIFICACION EERR para autocompletar. */
  private async categoryMap(projectId: number) {
    const items = await this.categoryRepo.find({ where: { projectId, isActive: true } });
    const map = new Map<string, string>();
    for (const item of items) map.set(normalizeHeader(item.movementType), item.eerrClassification);
    return map;
  }

  previewExcel(file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Adjunta un archivo Excel');
    if (!/\.(xlsx|xls|csv)$/i.test(file.originalname || '')) {
      throw new BadRequestException('Solo se aceptan archivos Excel .xlsx, .xls o .csv');
    }

    const parsed = this.parseWorkbook(file);
    const usable = parsed.rows;
    const errors = usable.flatMap((row) => row.errors.map((message) => ({ rowNumber: row.rowNumber, message })));

    return {
      sheet: parsed.sheet,
      totalRows: usable.length,
      validRows: usable.filter((row) => row.errors.length === 0).length,
      errors,
      rows: usable,
      saldoInicial: parsed.saldoInicial,
      saldoFinal: parsed.saldoFinal,
      totals: {
        abonos: round2(usable.reduce((sum, row) => sum + row.depositAmount, 0)),
        cargos: round2(usable.reduce((sum, row) => sum + row.chargeAmount, 0)),
      },
      expectedColumns: [...BANK_EXPECTED_COLUMNS],
      sourceFile: file.originalname,
    };
  }

  async importRows(
    projectId: number,
    rows: BankMovementImportRow[],
    options: { accountKey?: string; currency?: string; sourceFile?: string; importBatch?: string; skipDuplicates?: boolean; openingBalance?: number | null } = {},
    actorId?: number,
  ) {
    if (!projectId) throw new BadRequestException('Proyecto requerido');
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('No hay filas para importar');

    const accountKey = options.accountKey || 'GENERAL';
    const defaultCurrency = (options.currency || 'PEN').toUpperCase().slice(0, 3);
    const skipDuplicates = options.skipDuplicates !== false;
    const importBatch = options.importBatch || `batch-${Date.now()}`;

    const existing = skipDuplicates
      ? await this.movementRepo.find({ where: { projectId, accountKey }, select: ['id', 'sourceKey'] })
      : [];
    const existingKeys = new Set(existing.map((item) => item.sourceKey).filter(Boolean) as string[]);
    const mapping = await this.categoryMap(projectId);

    const pending: BankAccountMovementEntity[] = [];
    let duplicates = 0;
    let invalid = 0;

    for (const row of rows) {
      const depositAmount = Number(row.depositAmount || 0);
      const chargeAmount = Number(row.chargeAmount || 0);
      if (!row.description && !row.counterparty && !depositAmount && !chargeAmount) {
        invalid += 1;
        continue;
      }
      // Las filas que el parser marco con errores (fecha invalida, montos
      // malformados, etc.) se omiten en vez de reventar el import.
      const rowErrors = Array.isArray(row.errors) ? row.errors : [];
      if (rowErrors.length > 0) {
        invalid += 1;
        continue;
      }

      const currency = (row.currency || defaultCurrency).toUpperCase().slice(0, 3);
      const sourceKey = buildSourceKey(row, currency, accountKey);
      if (skipDuplicates && existingKeys.has(sourceKey)) {
        duplicates += 1;
        continue;
      }
      existingKeys.add(sourceKey);

      pending.push(this.movementRepo.create({
        projectId,
        accountKey,
        itemNumber: row.itemNumber,
        movementDate: normalizeDate(row.movementDate),
        monthLabel: row.monthLabel || monthLabelFromDate(row.movementDate),
        description: row.description,
        counterparty: row.counterparty,
        depositAmount: String(depositAmount),
        chargeAmount: String(chargeAmount),
        bookBalance: null,
        movementType: row.movementType || (depositAmount > 0 ? 'INGRESO' : 'GASTO'),
        eerrClassification: row.eerrClassification || mapping.get(normalizeHeader(row.movementType || '')) || null,
        invoiceNumber: row.invoiceNumber,
        observation: row.observation,
        currency,
        source: 'excel',
        importBatch,
        sourceFile: options.sourceFile || null,
        sourceKey,
        sourceRow: row.rowNumber || null,
        createdBy: actorId || null,
      }));
    }

    const opening = options.openingBalance === undefined || options.openingBalance === null
      ? null
      : round2(options.openingBalance);
    if (pending.length) {
      // Se recalcula la cadena de saldos de toda la cuenta tras importar.
      if (opening !== null) {
        for (const item of pending) item.openingBalance = String(opening);
      }
      // Se inserta por lotes dentro de una transaccion: evita saturar el pool
      // y garantiza que la carga se guarde completa o no se guarde.
      await this.movementRepo.manager.transaction(async (manager) => {
        for (let index = 0; index < pending.length; index += 200) {
          await manager.save(pending.slice(index, index + 200), { chunk: 200 });
        }
      });
      const currencies = Array.from(new Set(pending.map((item) => item.currency)));
      for (const currency of currencies) {
        await this.recalculateBalances(projectId, currency, accountKey);
      }
    }

    if (opening !== null) {
      await this.saveOpeningBalance(projectId, defaultCurrency, accountKey, opening);
      await this.recalculateBalances(projectId, defaultCurrency, accountKey);
    }

    const result = await this.list(projectId);
    return {
      ...result,
      imported: pending.length,
      duplicates,
      invalid,
      importBatch,
    };
  }

  async removeBatch(projectId: number, batch: string) {
    if (!projectId || !batch) throw new BadRequestException('Proyecto y lote requeridos');
    const affected = await this.movementRepo.find({ where: { projectId, importBatch: batch }, select: ['accountKey'] });
    const result = await this.movementRepo.delete({ projectId, importBatch: batch });

    const rows = await this.movementRepo.find({ where: { projectId }, select: ['currency', 'accountKey'] });
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.currency}|${row.accountKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await this.recalculateBalances(projectId, row.currency, row.accountKey);
    }

    return { ...(await this.list(projectId, { accountKey: affected[0]?.accountKey || 'GENERAL' })), removed: result.affected || 0 };
  }

  private parseWorkbook(file: Express.Multer.File) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('El Excel no contiene hojas');

    const sheet = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, blankrows: true });
    if (!grid.length) throw new BadRequestException('El Excel esta vacio');

    const headerRowIndex = findHeaderRow(grid);
    const columns = headerRowIndex >= 0 ? mapColumns(grid[headerRowIndex] || []) : {};
    const usingNamedHeader = Object.keys(columns).length >= 4;

    const rows: BankMovementImportRow[] = [];
    let saldoInicial: number | null = null;
    let saldoFinal: number | null = null;

    for (let index = headerRowIndex >= 0 ? headerRowIndex + 1 : 0; index < grid.length; index += 1) {
      const raw = grid[index] || [];
      const rowNumber = index + 1;

      // Filas de resumen del Excel: "Totales S/.", "Saldo Inicial", "Saldo Final".
      // Se buscan en cualquier columna para no depender del formato del archivo.
      const rowTexts = (raw as unknown[]).map((cell) => normalizeHeader(cleanCell(cell)));
      const isSummary = SUMMARY_LABELS.some((keyword) => rowTexts.some((text) => text.includes(keyword)));
      if (isSummary) {
        let summaryValue: number | null = null;
        for (const cell of raw) {
          const parsed = parseAmount(cell);
          if (Number.isFinite(parsed) && parsed !== 0) {
            summaryValue = round2(parsed);
            break;
          }
        }
        if (rowTexts.some((text) => text.includes('saldo inicial')) && summaryValue !== null) {
          saldoInicial = summaryValue;
        } else if (rowTexts.some((text) => text.includes('saldo final')) && summaryValue !== null) {
          saldoFinal = summaryValue;
        }
        continue;
      }

      const row = usingNamedHeader
        ? this.normalizeNamedRow(raw, columns, rowNumber)
        : this.normalizePositionalRow(raw, rowNumber);

      if (!row.itemNumber && !row.description && !row.counterparty && !row.depositAmount && !row.chargeAmount) continue;
      rows.push(row);
    }

    // Si el Excel no trae las filas de resumen, se deducen de los movimientos.
    if (saldoInicial === null && rows.length) {
      const first = rows[0];
      saldoInicial = round2((first.bookBalance || 0) - first.depositAmount + first.chargeAmount);
    }
    if (saldoFinal === null && rows.length) {
      const lastWithBalance = [...rows].reverse().find((row) => row.bookBalance !== null);
      saldoFinal = lastWithBalance?.bookBalance
        ?? round2((saldoInicial || 0) + rows.reduce((sum, row) => sum + row.depositAmount - row.chargeAmount, 0));
    }

    return { sheet: sheetName, rows, saldoInicial, saldoFinal };
  }

  private normalizeNamedRow(raw: unknown[], columns: Record<string, number>, rowNumber: number): BankMovementImportRow {
    const get = (key: string) => (columns[key] === undefined ? '' : raw[columns[key]]);
    return this.buildImportRow({
      rowNumber,
      itemRaw: get('item'),
      dateRaw: get('fecha_abono'),
      monthRaw: get('mes'),
      descriptionRaw: get('descripcion'),
      counterpartyRaw: get('proveedor_cliente'),
      depositRaw: get('abono'),
      chargeRaw: get('cargo'),
      balanceRaw: get('saldo_contable'),
      typeRaw: get('tipo_ingreso_gasto'),
      eerrRaw: get('clasificacion_eerr'),
      invoiceRaw: get('nro_factura_boleta'),
      observationRaw: get('observacion'),
    });
  }

  private normalizePositionalRow(raw: unknown[], rowNumber: number): BankMovementImportRow {
    return this.buildImportRow({
      rowNumber,
      itemRaw: raw[0],
      dateRaw: raw[1],
      monthRaw: raw[2],
      descriptionRaw: raw[3],
      counterpartyRaw: raw[4],
      depositRaw: raw[5],
      chargeRaw: raw[6],
      balanceRaw: raw[7],
      typeRaw: raw[8],
      eerrRaw: raw[9],
      invoiceRaw: raw[10],
      observationRaw: raw[11],
    });
  }

  private buildImportRow(input: {
    rowNumber: number;
    itemRaw: unknown;
    dateRaw: unknown;
    monthRaw: unknown;
    descriptionRaw: unknown;
    counterpartyRaw: unknown;
    depositRaw: unknown;
    chargeRaw: unknown;
    balanceRaw: unknown;
    typeRaw: unknown;
    eerrRaw: unknown;
    invoiceRaw: unknown;
    observationRaw: unknown;
  }): BankMovementImportRow {
    const errors: string[] = [];
    const description = cleanCell(input.descriptionRaw) || null;
    const counterparty = cleanCell(input.counterpartyRaw) || null;
    const depositAmount = safeAmount(input.depositRaw, errors, 'Abono');
    const chargeAmount = safeAmount(input.chargeRaw, errors, 'Cargo');
    const balanceCell = cleanCell(input.balanceRaw);
    const bookBalance = balanceCell === '' ? null : safeAmount(input.balanceRaw, errors, 'Saldo contable');
    const dateRaw = cleanCell(input.dateRaw);
    const movementDate = normalizeDate(dateRaw);
    if (dateRaw && !movementDate) errors.push(`Fecha no valida: "${dateRaw}"`);

    if (depositAmount > 0 && chargeAmount > 0) errors.push('La fila tiene abono y cargo a la vez');
    if (!description && !counterparty) errors.push('Falta descripcion o proveedor/cliente');

    const typeRaw = cleanCell(input.typeRaw).toUpperCase();
    const movementType = typeRaw
      ? (typeRaw.startsWith('ING') ? 'INGRESO' : typeRaw.startsWith('GAS') || typeRaw.startsWith('EGR') ? 'GASTO' : typeRaw.slice(0, 40))
      : (depositAmount > 0 ? 'INGRESO' : chargeAmount > 0 ? 'GASTO' : null);

    return {
      rowNumber: input.rowNumber,
      itemNumber: parseItemNumber(input.itemRaw),
      movementDate,
      monthLabel: cleanCell(input.monthRaw) || monthLabelFromDate(movementDate),
      description,
      counterparty,
      depositAmount,
      chargeAmount,
      bookBalance,
      movementType,
      eerrClassification: cleanCell(input.eerrRaw) || null,
      invoiceNumber: cleanCell(input.invoiceRaw) || null,
      observation: cleanCell(input.observationRaw) || null,
      currency: 'PEN',
      errors,
    };
  }
}

const COLUMN_ALIASES: Record<string, string[]> = {
  item: ['item', 'n', 'nro', 'numero', 'no'],
  fecha_abono: ['fecha de abono', 'fecha abono', 'fecha', 'fecha operacion'],
  mes: ['mes', 'periodo'],
  descripcion: ['descripcion', 'descripcion ec bcp', 'detalle', 'concepto', 'glosa'],
  proveedor_cliente: ['proveedor egreso cliente ingreso', 'proveedor cliente', 'proveedor', 'cliente', 'beneficiario', 'contraparte'],
  abono: ['abono ingreso', 'abono', 'ingreso', 'haber', 'deposito', 'credito'],
  cargo: ['cargo egreso', 'cargo', 'egreso', 'retiro', 'debito'],
  saldo_contable: ['saldo contable', 'saldo'],
  tipo_ingreso_gasto: ['tipo ingreso gasto', 'tipo', 'tipo movimiento'],
  clasificacion_eerr: ['clasificacion eerr', 'clasificacion', 'cuenta eerr', 'rubro eerr'],
  nro_factura_boleta: ['nro factura boleta', 'factura', 'boleta', 'nro factura', 'comprobante'],
  observacion: ['observacion', 'obs', 'comentario', 'nota'],
};

function mapColumns(headerRow: unknown[]): Record<string, number> {
  const columns: Record<string, number> = {};
  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeader(cleanCell(cell));
    if (!normalized) return;
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (columns[key] !== undefined) continue;
      if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
        columns[key] = index;
        break;
      }
    }
  });
  return columns;
}

function findHeaderRow(grid: unknown[][]) {
  const limit = Math.min(grid.length, 20);
  for (let index = 0; index < limit; index += 1) {
    if (Object.keys(mapColumns(grid[index] || [])).length >= 4) return index;
  }
  return -1;
}

function normalizeHeader(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanCell(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseItemNumber(value: unknown): number | null {
  if (value instanceof Date) return null;
  const cleaned = cleanCell(value);
  if (!cleaned) return null;
  const numeric = Number(cleaned.replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value instanceof Date) return NaN;
  let cleaned = cleanCell(value).replace(/S\/|US\$|\$|USD|PEN/gi, '').replace(/\s/g, '');
  if (!cleaned) return 0;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  const numeric = Number(cleaned.replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : NaN;
}

function safeAmount(value: unknown, errors: string[], label: string) {
  const parsed = parseAmount(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${label} invalido`);
    return 0;
  }
  return Math.abs(parsed);
}

function isValidYMD(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day;
}
function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toISODate(value);

  const cleaned = cleanCell(value);
  if (!cleaned) return null;

  const iso = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const a = Number(iso[2]);
    const b = Number(iso[3]);
    if (isValidYMD(year, a, b)) return `${iso[1]}-${pad2(a)}-${pad2(b)}`;
    if (isValidYMD(year, b, a)) return `${iso[1]}-${pad2(b)}-${pad2(a)}`;
    return null;
  }

  const dmy = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const rawYear = dmy[3];
    const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
    if (isValidYMD(year, b, a)) return `${year}-${pad2(b)}-${pad2(a)}`;
    if (isValidYMD(year, a, b)) return `${year}-${pad2(a)}-${pad2(b)}`;
    return null;
  }

  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : toISODate(parsed);
}

function monthLabelFromDate(value: unknown): string | null {
  const iso = normalizeDate(value);
  if (!iso) return null;
  const [year, month] = iso.split('-');
  return `${month}/${year}`;
}

function yearOf(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function monthOf(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^\d{4}-(\d{2})/);
  return match ? Number(match[1]) : null;
}

function toISODate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number | string) {
  return String(value).padStart(2, '0');
}

function buildSourceKey(row: BankMovementImportRow, currency: string, accountKey: string) {
  const base = [
    accountKey,
    currency,
    row.movementDate || '',
    normalizeHeader(row.description || ''),
    normalizeHeader(row.counterparty || ''),
    row.depositAmount.toFixed(2),
    row.chargeAmount.toFixed(2),
    normalizeHeader(row.invoiceNumber || ''),
  ].join('|');

  let hash = 5381;
  for (let index = 0; index < base.length; index += 1) {
    hash = ((hash << 5) + hash + base.charCodeAt(index)) >>> 0;
  }
  return `bk_${hash.toString(36)}_${base.length.toString(36)}`;
}

function round2(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

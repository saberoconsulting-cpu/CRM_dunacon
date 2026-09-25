// modules/finances/application/finances.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinancialTransactionEntity } from '../../../shared/infrastructure/entities/financial-transaction.entity';
import { ExpenseEntity } from '../../../shared/infrastructure/entities/expense.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { NotificationsGateway } from '../../../shared/infrastructure/websocket/notifications.gateway';
import { CreateExpenseDto, CreateAdditionalIncomeDto } from './dto/finance.dto';
import { ConstructionBudgetService } from '../../construction-budget/application/construction-budget.service';
import * as XLSX from 'xlsx';

@Injectable()
export class FinancesService {
  constructor(
    @InjectRepository(FinancialTransactionEntity)
    private readonly txnRepo: Repository<FinancialTransactionEntity>,
    @InjectRepository(ExpenseEntity)
    private readonly expenseRepo: Repository<ExpenseEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    private readonly gateway: NotificationsGateway,
    private readonly constructionBudgetService: ConstructionBudgetService,
  ) {}

  async audit(userId: number, action: string, entity?: string, entityId?: number) {
    await this.auditRepo.save({ userId, action, entity, entityId });
  }

  async registerExpense(dto: CreateExpenseDto, actorId: number) {
    const expense = this.expenseRepo.create({
      projectId: dto.projectId,
      campaignId: dto.campaignId,
      category: dto.category,
      expenseClass: dto.expenseClass || 'operacion',
      concept: dto.concept,
      amount: String(dto.amount),
      expenseDate: dto.expenseDate || undefined,
      createdBy: actorId,
    });
    const saved = await this.expenseRepo.save(expense);
    // Registrar egreso financiero inmutable
    await this.txnRepo.save({
      projectId: dto.projectId,
      campaignId: dto.campaignId,
      createdBy: actorId,
      type: 'egreso',
      category: dto.category,
      concept: dto.concept,
      amount: String(dto.amount),
    });
    await this.audit(actorId, 'REGISTRAR_EGRESO', 'expenses', saved.id);
    this.gateway.emitToAll('expense.created', saved);
    return saved;
  }

  async registerAdditionalIncome(dto: CreateAdditionalIncomeDto, actorId: number) {
    const txn = await this.txnRepo.save({
      projectId: dto.projectId,
      createdBy: actorId,
      type: 'ingreso',
      category: 'otros_ingresos',
      concept: dto.concept,
      amount: String(dto.amount),
    });
    await this.audit(actorId, 'REGISTRAR_INGRESO_EXTRA', 'financial_transactions', txn.id);
    this.gateway.emitToAll('payment.created', txn);
    return txn;
  }

  async importSpreadsheet(buffer: Buffer, actorId: number, projectId?: number) {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch {
      throw new BadRequestException('No se pudo leer el archivo. Verifica que sea un Excel o CSV valido.');
    }

    const sheetName = workbook.SheetNames?.[0];
    const firstSheet = sheetName ? workbook.Sheets[sheetName] : null;
    if (!firstSheet) throw new BadRequestException('El archivo no contiene hojas con datos');

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null, raw: true });
    if (!rows.length) throw new BadRequestException('La primera hoja no contiene filas de datos');

    const normalized = (value: unknown) => String(value ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const field = (row: Record<string, unknown>, names: string[]) => {
      const key = Object.keys(row).find((candidate) => names.includes(normalized(candidate)));
      return key ? row[key] : undefined;
    };
    const numberValue = (value: unknown) => {
      if (typeof value === 'number') return value;
      const text = String(value ?? '').replace(/[^0-9,.-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.');
      return Number(text);
    };
    const dateValue = (value: unknown) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
      if (typeof value === 'number') return XLSX.SSF.parse_date_code(value) ? new Date(Math.round((value - 25569) * 86400 * 1000)) : undefined;
      const date = new Date(String(value ?? ''));
      return Number.isNaN(date.getTime()) ? undefined : date;
    };

    const headers = Object.keys(rows[0] || {});
    const hasConcept = headers.some((h) => ['concepto', 'descripcion', 'detalle', 'description', 'concept'].includes(normalized(h)));
    const hasAmount = headers.some((h) => ['monto', 'importe', 'amount', 'valor', 'total', 'ingreso', 'ingresos', 'entrada', 'egreso', 'egresos', 'salida', 'income', 'expense'].includes(normalized(h)));
    if (!hasConcept || !hasAmount) {
      const faltantes = [!hasConcept ? 'CONCEPTO' : null, !hasAmount ? 'MONTO (o Ingreso/Egreso)' : null].filter(Boolean).join(' y ');
      throw new BadRequestException(
        `El archivo no coincide con el formato esperado: falta la columna ${faltantes}. ` +
        `Columnas encontradas: ${headers.slice(0, 8).map((h) => `"${h}"`).join(', ') || 'ninguna'}. ` +
        'Se aceptan encabezados como Concepto, Monto, Fecha, Tipo, Categoria.',
      );
    }

    const imported: FinancialTransactionEntity[] = [];
    const rejected: { row: number; reason: string }[] = [];

    for (const [index, row] of rows.entries()) {
      const rawAmount = field(row, ['monto', 'importe', 'amount', 'valor', 'total']);
      const rawIncome = field(row, ['ingreso', 'ingresos', 'entrada', 'entradas', 'income', 'inflow']);
      const rawExpense = field(row, ['egreso', 'egresos', 'salida', 'salidas', 'expense', 'outflow']);
      const concept = String(field(row, ['concepto', 'descripcion', 'detalle', 'description', 'concept']) ?? '').trim();
      const rawType = normalized(field(row, ['tipo', 'movimiento', 'nature', 'type']));
      const defaultType = ['ingreso', 'entrada', 'income', 'inflow', 'deposito', 'deposit'].includes(rawType) ? 'ingreso' :
        ['egreso', 'salida', 'expense', 'outflow', 'retiro', 'withdrawal'].includes(rawType) ? 'egreso' :
          (Number(rawAmount) < 0 ? 'egreso' : 'ingreso');
      const amounts = rawIncome !== undefined || rawExpense !== undefined
        ? [{ type: 'ingreso', amount: Math.abs(numberValue(rawIncome)) }, { type: 'egreso', amount: Math.abs(numberValue(rawExpense)) }]
        : [{ type: defaultType, amount: Math.abs(numberValue(rawAmount)) }];
      const validAmounts = amounts.filter((item) => item.amount > 0 && Number.isFinite(item.amount));
      if (!concept || !validAmounts.length) {
        rejected.push({ row: index + 2, reason: !concept ? 'Sin concepto' : 'Monto vacio o no numerico' });
        continue;
      }
      const txnDate = dateValue(field(row, ['fecha', 'date', 'fechamovimiento', 'periodo'])) || new Date();
      const category = String(field(row, ['categoria', 'category', 'rubro', 'cuenta']) ?? 'importado').trim().slice(0, 80) || 'importado';
      for (const item of validAmounts) {
        imported.push(this.txnRepo.create({ projectId, createdBy: actorId, type: item.type, category, concept: concept.slice(0, 255), amount: item.amount.toFixed(2), txnDate }));
      }
    }

    if (!imported.length) {
      const detalle = rejected.slice(0, 5).map((r) => `Fila ${r.row}: ${r.reason}`).join(' · ');
      throw new BadRequestException(
        `Ninguna fila pudo importarse (${rejected.length} con problemas). ${detalle}`,
      );
    }

    const saved = await this.txnRepo.save(imported);
    for (const transaction of saved.filter((item) => item.type === 'egreso')) {
      await this.expenseRepo.save({
        projectId,
        category: transaction.category,
        expenseClass: 'operacion',
        concept: transaction.concept,
        amount: transaction.amount,
        expenseDate: transaction.txnDate.toISOString().slice(0, 10),
        createdBy: actorId,
      });
    }
    await this.audit(actorId, 'IMPORTAR_FLUJO_CAJA', 'financial_transactions', saved[0]?.id);
    this.gateway.emitToAll('financial.imported', { count: saved.length, projectId });
    return { imported: saved.length, rejected, sheet: sheetName };
  }

  async transactions(filters: {
    projectId?: number;
    type?: string;
    category?: string;
    from?: string;
    to?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const applyFilters = (qb: any) => {
      if (filters.projectId) qb.andWhere('t.project_id = :projectId', { projectId: filters.projectId });
      if (filters.type) qb.andWhere('t.type = :type', { type: filters.type });
      if (filters.category) qb.andWhere('t.category = :category', { category: filters.category });
      if (filters.from) qb.andWhere('t.txn_date >= :from', { from: filters.from });
      if (filters.to) qb.andWhere('t.txn_date <= :to', { to: filters.to });
      if (filters.search) {
        qb.andWhere(
          `(LOWER(t.concept) LIKE :term
            OR LOWER(t.category) LIKE :term
            OR LOWER(COALESCE(l.code, '')) LIKE :term
            OR LOWER(COALESCE(c.full_name, '')) LIKE :term
            OR LOWER(COALESCE(p.payment_method, '')) LIKE :term)`,
          { term: `%${filters.search.toLowerCase()}%` },
        );
      }
      return qb;
    };

    const buildPageQuery = () =>
      applyFilters(
        this.txnRepo.createQueryBuilder('t')
          .leftJoin('lots', 'l', 'l.id = t.lot_id')
          .leftJoin('clients', 'c', 'c.id = t.client_id')
          .leftJoin('payments', 'p', 'p.id = t.payment_id')
          .select('t.id', 'id')
          .addSelect('t.project_id', 'projectId')
          .addSelect('t.lot_id', 'lotId')
          .addSelect('t.client_id', 'clientId')
          .addSelect('t.type', 'type')
          .addSelect('t.category', 'category')
          .addSelect('t.concept', 'concept')
          .addSelect('t.amount', 'amount')
          .addSelect('t.txn_date', 'txnDate')
          .addSelect('l.code', 'lotCode')
          .addSelect('c.full_name', 'clientName')
          .addSelect('p.payment_method', 'paymentMethod'),
      );

    const buildTotalsQuery = () =>
      applyFilters(
        this.txnRepo.createQueryBuilder('t')
          .leftJoin('lots', 'l', 'l.id = t.lot_id')
          .leftJoin('clients', 'c', 'c.id = t.client_id')
          .leftJoin('payments', 'p', 'p.id = t.payment_id'),
      );

    const totals = await buildTotalsQuery()
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'sum')
      .getRawOne();

    if (filters.page || filters.limit) {
      const page = Math.max(1, filters.page ?? 1);
      const limit = Math.min(200, Math.max(1, filters.limit ?? 20));
      const rows = await buildPageQuery()
        .orderBy('t.txn_date', 'DESC')
        .addOrderBy('t.id', 'DESC')
        .limit(limit)
        .offset((page - 1) * limit)
        .getRawMany();
      const total = Number(totals?.count || 0);
      return {
        items: rows.map((r) => this.mapTransactionRow(r)),
        total,
        totalAmount: Number(totals?.sum || 0),
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    }

    const rows = await buildPageQuery().orderBy('t.txn_date', 'DESC').addOrderBy('t.id', 'DESC').getRawMany();
    return rows.map((r) => this.mapTransactionRow(r));
  }

  private mapTransactionRow(r: any) {
    return {
      id: Number(r.id),
      projectId: r.projectId != null ? Number(r.projectId) : null,
      lotId: r.lotId != null ? Number(r.lotId) : null,
      clientId: r.clientId != null ? Number(r.clientId) : null,
      lotCode: r.lotCode || null,
      clientName: r.clientName || null,
      paymentMethod: r.paymentMethod || null,
      type: r.type,
      category: r.category,
      concept: r.concept,
      amount: r.amount,
      txnDate: r.txnDate,
    };
  }

  async summary(period: 'daily' | 'weekly' | 'monthly' | 'annual' = 'monthly', projectId?: number) {
    const qb = this.txnRepo
      .createQueryBuilder('t')
      .select("TO_CHAR(t.txn_date, 'YYYY-MM-DD')", 'day')
      .addSelect('t.type', 'type')
      .addSelect('COALESCE(SUM(t.amount),0)', 'total')
      .addSelect("TO_CHAR(t.txn_date, 'YYYY-MM')", 'month')
      .addSelect("TO_CHAR(t.txn_date, 'IYYY')", 'year')
      .groupBy('day')
      .addGroupBy('t.type')
      .addGroupBy('month')
      .addGroupBy('year');
    if (projectId) qb.where('t.project_id = :projectId', { projectId });
    const rows = await qb.getRawMany();

    let income = 0;
    let expense = 0;
    const ingresos: Record<string, number> = {};
    const egresos: Record<string, number> = {};
    for (const r of rows) {
      const v = Number(r.total);
      if (r.type === 'ingreso') {
        income += v;
        const key = period === 'daily' ? r.day : period === 'monthly' ? r.month : period === 'annual' ? r.year : r.day;
        ingresos[key] = (ingresos[key] || 0) + v;
      } else {
        expense += v;
        const key = period === 'daily' ? r.day : period === 'monthly' ? r.month : period === 'annual' ? r.year : r.day;
        egresos[key] = (egresos[key] || 0) + v;
      }
    }
    return { income, expense, profit: income - expense, series: { ingresos, egresos } };
  }

  async byCategory(projectId?: number) {
    const qb = this.expenseRepo
      .createQueryBuilder('e')
      .select('e.category', 'category')
      .addSelect('COALESCE(SUM(e.amount),0)', 'total')
      .groupBy('e.category');
    if (projectId) qb.where('e.project_id = :projectId', { projectId });
    const rows = await qb.getRawMany();
    return rows.map((r) => ({ category: r.category, total: Number(r.total) }));
  }

  async byProject() {
    const rows = await this.txnRepo
      .createQueryBuilder('t')
      .select('t.project_id', 'projectId')
      .addSelect('COALESCE(SUM(CASE WHEN t.type=\'ingreso\' THEN t.amount ELSE 0 END),0)', 'income')
      .addSelect('COALESCE(SUM(CASE WHEN t.type=\'egreso\' THEN t.amount ELSE 0 END),0)', 'expense')
      .groupBy('t.project_id')
      .getRawMany();
    return rows.map((r) => ({ projectId: r.projectId, income: Number(r.income), expense: Number(r.expense) }));
  }

  async expensesList(projectId?: number) {
    const where = projectId ? { projectId } : {};
    return this.expenseRepo.find({ where, order: { expenseDate: 'DESC' } });
  }

  /** Estado de resultados: ingresos vs egresos por familia de gasto */
  async incomeStatement(projectId?: number) {
    const tq = this.txnRepo
      .createQueryBuilder('t');
    if (projectId) tq.where('t.project_id = :projectId', { projectId });
    const totals = await tq
      .select("COALESCE(SUM(CASE WHEN t.type='ingreso' THEN t.amount ELSE 0 END),0)", 'income')
      .getRawOne();
    const income = Number(totals?.income || 0);

    // Egresos por expense_class sobre expenses (fuente unica de verdad).
    // `expenses` es la tabla que guarda la clasificacion (expense_class) que se
    // muestra en el desglose, asi el total y las familias siempre cuadran.
    const eq = this.expenseRepo.createQueryBuilder('e');
    if (projectId) eq.where('e.project_id = :projectId', { projectId });
    const byClass = await eq
      .select('e.expense_class', 'cls')
      .addSelect('COALESCE(SUM(e.amount),0)', 'total')
      .groupBy('e.expense_class')
      .getRawMany();

    const clsTotals: Record<string, number> = {
      inversion: 0,
      financiamiento: 0,
      compra_terreno: 0,
      operacion: 0,
      costo_indirecto: 0,
      ventas_admin: 0,
      impuestos: 0,
    };
    for (const r of byClass) clsTotals[r.cls || 'operacion'] = Number(r.total);

    const egresosClasificados = {
      inversion: clsTotals.inversion,
      financiamiento: clsTotals.financiamiento,
      compra_terreno: clsTotals.compra_terreno,
      costo_indirecto: clsTotals.costo_indirecto,
      ventas_admin: clsTotals.ventas_admin,
      impuestos: clsTotals.impuestos,
      operacion: clsTotals.operacion,
    };
    const egresosTotal = Object.values(egresosClasificados).reduce((a, b) => a + b, 0);
    const budgetTotals = projectId ? await this.constructionBudgetService.totalsByProject(projectId) : await this.constructionBudgetService.totalsByProject();
    const projected = {
      compra_terreno: budgetTotals.costo_terreno,
      inversion: budgetTotals.costo_directo,
      costo_indirecto: budgetTotals.costo_indirecto,
      ventas_admin: budgetTotals.gastos_ventas_admin,
      financiamiento: budgetTotals.gastos_financieros_impuestos,
      impuestos: budgetTotals.gastos_financieros_impuestos,
      total_costos: Object.values(budgetTotals).reduce((sum, value) => sum + Number(value || 0), 0),
    };
    return {
      ingresos: income,
      egresos_total: egresosTotal,
      egresos_clasificados: egresosClasificados,
      egresos_por_clases: egresosTotal,
      proyectado: projected,
      presupuesto_obra: budgetTotals,
      utilidad: income - egresosTotal,
    };
  }
}

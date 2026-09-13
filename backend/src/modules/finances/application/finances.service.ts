// modules/finances/application/finances.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinancialTransactionEntity } from '../../../shared/infrastructure/entities/financial-transaction.entity';
import { ExpenseEntity } from '../../../shared/infrastructure/entities/expense.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { NotificationsGateway } from '../../../shared/infrastructure/websocket/notifications.gateway';
import { CreateExpenseDto, CreateAdditionalIncomeDto } from './dto/finance.dto';
import { ConstructionBudgetService } from '../../construction-budget/application/construction-budget.service';

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

  async transactions(filters: {
    projectId?: number;
    type?: string;
    category?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const qb = this.txnRepo.createQueryBuilder('t')
      .orderBy('t.txn_date', 'DESC');
    if (filters.projectId) qb.where('t.project_id = :projectId', { projectId: filters.projectId });
    if (filters.type) qb.andWhere('t.type = :type', { type: filters.type });
    if (filters.category) qb.andWhere('t.category = :category', { category: filters.category });
    if (filters.from) qb.andWhere('t.txn_date >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('t.txn_date <= :to', { to: filters.to });
    if (filters.page || filters.limit) {
      const page = Math.max(1, filters.page ?? 1);
      const limit = Math.min(200, Math.max(1, filters.limit ?? 20));
      const [items, total] = await qb
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();
      return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
    }
    return qb.getMany();
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
      .addSelect("COALESCE(SUM(CASE WHEN t.type='egreso' THEN t.amount ELSE 0 END),0)", 'egreso')
      .getRawOne();
    const income = Number(totals?.income || 0);
    const egresosT = Number(totals?.egreso || 0);

    // Egresos por expense_class sobre expenses (clasificación pedida)
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
      egresos_total: egresosT,
      egresos_clasificados: egresosClasificados,
      egresos_por_clases: egresosTotal,
      proyectado: projected,
      presupuesto_obra: budgetTotals,
      utilidad: income - egresosT,
    };
  }
}

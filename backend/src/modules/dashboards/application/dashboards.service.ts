// modules/dashboards/application/dashboards.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientEntity } from '../../../shared/infrastructure/entities/client.entity';
import { SaleEntity } from '../../../shared/infrastructure/entities/sale.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { FinancialTransactionEntity } from '../../../shared/infrastructure/entities/financial-transaction.entity';
import { PaymentEntity } from '../../../shared/infrastructure/entities/payment.entity';
import { ExpenseEntity } from '../../../shared/infrastructure/entities/expense.entity';
import { UserEntity } from '../../../shared/infrastructure/entities/user.entity';
import { ProjectEntity } from '../../../shared/infrastructure/entities/project.entity';

@Injectable()
export class DashboardsService {
  constructor(
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    @InjectRepository(LotEntity)
    private readonly lotRepo: Repository<LotEntity>,
    @InjectRepository(FinancialTransactionEntity)
    private readonly txnRepo: Repository<FinancialTransactionEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(ExpenseEntity)
    private readonly expenseRepo: Repository<ExpenseEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  private mapAgentRanking(rows: any[]) {
    return (rows || []).map((r) => ({
      agentId: r.agentId,
      agentName: r.agentName || (r.agentId ? `Agente #${r.agentId}` : 'Sin agente'),
      salesCount: Number(r.salesCount || 0),
      salesAmount: Number(r.salesAmount || 0),
      commission: Number(r.commission || 0),
    }));
  }

  private agentRankingQuery(projectId?: number) {
    const qb = this.saleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect(UserEntity, 'u', 'u.id = s.agent_id')
      .select('s.agent_id', 'agentId')
      .addSelect('u.name', 'agentName')
      .addSelect('COUNT(*)', 'salesCount')
      .addSelect('COALESCE(SUM(s.sale_price),0)', 'salesAmount')
      .addSelect('COALESCE(SUM(s.commission),0)', 'commission')
      .groupBy('s.agent_id')
      .addGroupBy('u.name')
      .orderBy('"salesAmount"', 'DESC');

    if (projectId != null) qb.where('s.project_id = :projectId', { projectId });
    return qb.getRawMany();
  }

  async movements(options: { page?: number; limit?: number; projectId?: number; type?: string }) {
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(100000, Math.max(1, Number(options.limit || 10)));
    const projectId = options.projectId ? Number(options.projectId) : null;
    const type = options.type === 'venta' || options.type === 'pago' ? options.type : '';

    const saleRows = type === 'pago'
      ? []
      : await this.saleRepo
        .createQueryBuilder('s')
        .leftJoin(ProjectEntity, 'pr', 'pr.id = s.project_id')
        .leftJoin(LotEntity, 'l', 'l.id = s.lot_id')
        .leftJoin(UserEntity, 'u', 'u.id = s.agent_id')
        .select("'venta'", 'type')
        .addSelect('s.id', 'id')
        .addSelect("'Venta'", 'label')
        .addSelect('s.sale_price', 'amount')
        .addSelect('s.created_at', 'date')
        .addSelect('s.project_id', 'projectId')
        .addSelect('pr.name', 'projectName')
        .addSelect('l.code', 'lotCode')
        .addSelect('u.name', 'agentName')
        .addSelect('s.status', 'status')
        .where(projectId ? 's.project_id = :projectId' : '1=1', { projectId })
        .getRawMany();

    const paymentRows = type === 'venta'
      ? []
      : await this.paymentRepo
        .createQueryBuilder('p')
        .leftJoin(ProjectEntity, 'pr', 'pr.id = p.project_id')
        .leftJoin(LotEntity, 'l', 'l.id = p.lot_id')
        .leftJoin(UserEntity, 'u', 'u.id = p.agent_id')
        .select("'pago'", 'type')
        .addSelect('p.id', 'id')
        .addSelect("COALESCE(p.type, 'Pago')", 'label')
        .addSelect('p.amount', 'amount')
        .addSelect('COALESCE(p.paid_at, p.created_at)', 'date')
        .addSelect('p.project_id', 'projectId')
        .addSelect('pr.name', 'projectName')
        .addSelect('l.code', 'lotCode')
        .addSelect('u.name', 'agentName')
        .addSelect('p.status', 'status')
        .where(projectId ? 'p.project_id = :projectId' : '1=1', { projectId })
        .getRawMany();

    const rows = [...saleRows, ...paymentRows]
      .map((row) => ({
        id: Number(row.id),
        type: row.type,
        label: row.label,
        amount: Number(row.amount || 0),
        date: row.date,
        projectId: row.projectId != null ? Number(row.projectId) : null,
        projectName: row.projectName || null,
        lotCode: row.lotCode || null,
        agentName: row.agentName || null,
        status: row.status || null,
      }))
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    const total = rows.length;
    const start = (page - 1) * limit;
    return {
      items: rows.slice(start, start + limit),
      total,
      page,
      limit,
    };
  }

  async general() {
    const monthKey = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [
      leadsMonth,
      salesMonth,
      txnSummary,
      lotStats,
      salesByProject,
      investmentsByProject,
      availableLotsByProject,
      paymentsSummary,
      agentRanking,
      recentSales,
      recentPayments,
      leadsByChannel,
    ] =
      await Promise.all([
        this.clientRepo.createQueryBuilder('c').where('c.created_at >= :monthKey', { monthKey }).getCount(),
        this.saleRepo.createQueryBuilder('s').where('s.created_at >= :monthKey', { monthKey }).getCount(),
        this.txnRepo
          .createQueryBuilder('t')
          .select("COALESCE(SUM(CASE WHEN t.type='ingreso' THEN t.amount ELSE 0 END),0)", 'income')
          .addSelect("COALESCE(SUM(CASE WHEN t.type='egreso' THEN t.amount ELSE 0 END),0)", 'expense')
          .getRawOne(),
        this.lotRepo
          .createQueryBuilder('l')
          .select('l.status', 'status')
          .addSelect('COUNT(*)', 'total')
          .groupBy('l.status')
          .getRawMany(),
        this.saleRepo
          .createQueryBuilder('s')
          .select('s.project_id', 'projectId')
          .addSelect('COUNT(*)', 'total')
          .addSelect('COALESCE(SUM(s.sale_price),0)', 'amount')
          .groupBy('s.project_id')
          .getRawMany(),
        this.expenseRepo
          .createQueryBuilder('e')
          .select('e.project_id', 'projectId')
          .addSelect('COALESCE(SUM(e.amount),0)', 'amount')
          .where('e.project_id IS NOT NULL')
          .andWhere("e.expense_class IN ('inversion','compra_terreno','financiamiento')")
          .groupBy('e.project_id')
          .getRawMany(),
        this.lotRepo
          .createQueryBuilder('l')
          .select('l.project_id', 'projectId')
          .addSelect('COUNT(*)', 'total')
          .where("l.status = 'disponible'")
          .groupBy('l.project_id')
          .getRawMany(),
        this.paymentRepo
          .createQueryBuilder('p')
          .select("COALESCE(SUM(CASE WHEN p.type IN ('reserva','adelanto','primera_cuota') AND p.status = 'pagado' THEN p.amount ELSE 0 END),0)", 'initialPaid')
          .addSelect("COALESCE(SUM(CASE WHEN p.type = 'cuota' AND p.status = 'pagado' THEN p.amount ELSE 0 END),0)", 'installmentsPaid')
          .addSelect("COALESCE(SUM(CASE WHEN p.status = 'pendiente' AND (p.due_date IS NULL OR p.due_date >= CURRENT_DATE) THEN p.amount ELSE 0 END),0)", 'pending')
          .addSelect("COALESCE(SUM(CASE WHEN p.status = 'vencido' OR (p.status = 'pendiente' AND p.due_date < CURRENT_DATE) THEN p.amount ELSE 0 END),0)", 'overdue')
          .getRawOne(),
        this.agentRankingQuery(),
        this.saleRepo.find({ order: { createdAt: 'DESC' }, take: 10 }),
        this.paymentRepo.find({ order: { createdAt: 'DESC' }, take: 10 }),
        this.clientRepo
          .createQueryBuilder('c')
          .select('c.source', 'channel')
          .addSelect('COUNT(*)', 'total')
          .groupBy('c.source')
          .getRawMany(),
      ]);

    const lotMap = Object.fromEntries(lotStats.map((r) => [r.status, Number(r.total)]));
    const expense = Number(txnSummary.expense || 0);
    const income = Number(txnSummary.income || 0);

    const weekStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const campaignSpend = await this.expenseRepo
      .createQueryBuilder('e')
      .where('e.expense_date >= :weekStart', { weekStart })
      .getCount();

    // "Últimas ventas": si aún no hay registros formales en la tabla sales,
    // mostramos los movimientos de pago ya confirmados (separaciones/adelantos/cuotas),
    // igual que hacemos con el ranking de agentes más abajo. Así el Home nunca queda vacío.
    let latestSales: any[] = (recentSales || []) as any[];
    if (!latestSales?.length) {
      const paid = await this.paymentRepo.find({
        where: { status: 'pagado' },
        order: { createdAt: 'DESC' },
        take: 10,
      });
      latestSales = (paid || []).map((p: any) => ({
        id: p.id,
        salePrice: Number(p.amount || 0),
        type: p.type || 'pago',
        createdAt: p.createdAt,
        fromPayment: true,
      }));
    }

    let rankings = agentRanking;
    // Si el equipo no ha registrado todavía ventas formales, igual vemos avance
    // comercial por agente basado en los importes pagados (Yape/banco/efectivo).
    if (!rankings?.length) {
      const fallback = await this.paymentRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect(UserEntity, 'u', 'u.id = p.agent_id')
        .where("p.status = 'pagado'")
        .select('p.agent_id', 'agentId')
        .addSelect('u.name', 'agentName')
        .addSelect('COUNT(*)', 'salesCount')
        .addSelect('SUM(p.amount)', 'salesAmount')
        .addSelect('0', 'commission')
        .groupBy('p.agent_id')
        .addGroupBy('u.name')
        .getRawMany();
      rankings = fallback;
    }

    return {
      cards: {
        leadsMonth: Number(leadsMonth), salesMonth: Number(salesMonth),
        income, expense, profit: income - expense, campaignSpend,
      },
      lots: lotMap,
      salesByProject: salesByProject.map((r) => ({ projectId: r.projectId, total: Number(r.total), amount: Number(r.amount) })),
      investmentsByProject: investmentsByProject.map((r) => ({ projectId: r.projectId, amount: Number(r.amount) })),
      availableLotsByProject: availableLotsByProject.map((r) => ({ projectId: r.projectId, total: Number(r.total) })),
      paymentsSummary: [
        { key: 'initialPaid', label: 'Pago inicial', value: Number(paymentsSummary?.initialPaid || 0) },
        { key: 'installmentsPaid', label: 'Pago de cuotas', value: Number(paymentsSummary?.installmentsPaid || 0) },
        { key: 'pending', label: 'Cuotas pendientes', value: Number(paymentsSummary?.pending || 0) },
        { key: 'overdue', label: 'Cuotas en atraso', value: Number(paymentsSummary?.overdue || 0) },
      ],
      agentRanking: this.mapAgentRanking(rankings),
      recentSales: latestSales,
      recentPayments,
      leadsByChannel: leadsByChannel.map((r) => ({ channel: r.channel, total: Number(r.total) })),
    };
  }

  async forAgent(agentId: number) {
    const monthKey = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [salesMonth, salesAmountRes, commissionRes, lotsSold, leads, salesByPeriod, salesByProject] =
      await Promise.all([
        this.saleRepo.createQueryBuilder('s').where('s.agent_id = :agentId AND s.created_at >= :monthKey', { agentId, monthKey }).select('COUNT(*)', 'total').getRawOne(),
        this.saleRepo.createQueryBuilder('s').where('s.agent_id = :agentId', { agentId }).select('COALESCE(SUM(s.sale_price),0)', 'total').getRawOne(),
        this.saleRepo.createQueryBuilder('s').where('s.agent_id = :agentId AND s.created_at >= :monthKey', { agentId, monthKey }).select('COALESCE(SUM(s.commission),0)', 'total').getRawOne(),
        this.lotRepo.count({ where: { agentId, status: 'vendido' } }),
        this.clientRepo.find({ where: { agentId } }),
        this.saleRepo
          .createQueryBuilder('s')
          .where('s.agent_id = :agentId', { agentId })
          .select('s.sale_date', 'date')
          .addSelect('COUNT(*)', 'total')
          .addSelect('COALESCE(SUM(s.sale_price),0)', 'amount')
          .addSelect('COALESCE(SUM(s.commission),0)', 'commission')
          .andWhere("s.approval_status <> 'rechazada'")
          .groupBy('s.sale_date')
          .getRawMany(),
        this.saleRepo
          .createQueryBuilder('s')
          .leftJoin(ProjectEntity, 'p', 'p.id = s.project_id')
          .where('s.agent_id = :agentId', { agentId })
          .andWhere("s.approval_status <> 'rechazada'")
          .select('s.project_id', 'projectId')
          .addSelect('p.name', 'name')
          .addSelect('COUNT(*)', 'total')
          .addSelect('COALESCE(SUM(s.sale_price),0)', 'amount')
          .addSelect('COALESCE(SUM(s.commission),0)', 'commission')
          .groupBy('s.project_id')
          .addGroupBy('p.name')
          .orderBy('amount', 'DESC')
          .getRawMany(),
      ]);

    const agent = await this.userRepo.findOne({ where: { id: agentId } });
    const monthSales = Number(salesMonth?.total || 0);
    const goalLots = agent?.monthlyGoalLots || 0;
    const goalAmount = Number(agent?.monthlyGoalAmount || 0);
    const period = salesByPeriod.map((r) => ({ date: r.date, total: Number(r.total), amount: Number(r.amount), commission: Number(r.commission || 0) }));

    return {
      cards: {
        salesMonth: monthSales,
        salesAmount: Number(salesAmountRes?.total || 0),
        commissionMonth: Number(commissionRes?.total || 0),
        lotsSold,
        goalLots,
        goalAmount,
        progressLots: goalLots > 0 ? Math.round((monthSales / goalLots) * 100) : 0,
      },
      leads,
      salesByPeriod: period,
      salesByProject: (salesByProject || []).map((r) => ({
        projectId: Number(r.projectId),
        name: r.name || `Proyecto ${r.projectId}`,
        total: Number(r.total || 0),
        amount: Number(r.amount || 0),
        commission: Number(r.commission || 0),
      })),
    };
  }

  async project(projectId: number) {
    const [total, lotStats, salesByPeriod, income, expense, inventory, soldValue, agentRanking] = await Promise.all([
      this.lotRepo.count({ where: { projectId } }),
      this.lotRepo.createQueryBuilder('l').where('l.project_id = :projectId', { projectId })
        .select('l.status', 'status').addSelect('COUNT(*)', 'total').groupBy('l.status').getRawMany(),
      this.saleRepo.createQueryBuilder('s').where('s.project_id = :projectId', { projectId })
        .select('s.sale_date', 'date').addSelect('COUNT(*)', 'total').addSelect('COALESCE(SUM(s.sale_price),0)', 'amount')
        .groupBy('s.sale_date').getRawMany(),
      this.txnRepo.createQueryBuilder('t').where('t.project_id = :projectId AND t.type=\'ingreso\'', { projectId })
        .select('COALESCE(SUM(t.amount),0)', 'total').getRawOne(),
      this.txnRepo.createQueryBuilder('t').where('t.project_id = :projectId AND t.type=\'egreso\'', { projectId })
        .select('COALESCE(SUM(t.amount),0)', 'total').getRawOne(),
      this.lotRepo.createQueryBuilder('l').where('l.project_id = :projectId', { projectId })
        .select('COALESCE(SUM(COALESCE(l.sale_price, l.price)),0)', 'total').getRawOne(),
      this.lotRepo.createQueryBuilder('l').where('l.project_id = :projectId AND l.status = :status', { projectId, status: 'vendido' })
        .select('COALESCE(SUM(COALESCE(l.sale_price, l.price)),0)', 'total').getRawOne(),
      this.agentRankingQuery(projectId),
    ]);
    const lotMap = Object.fromEntries(lotStats.map((r) => [r.status, Number(r.total)]));
    const totalIncome = Number(income?.total || 0);
    const totalExpense = Number(expense?.total || 0);
    const inventoryValue = Number(inventory?.total || 0);
    const soldListValue = Number(soldValue?.total || 0);
    return {
      cards: { total, lots: lotMap, income: totalIncome, expense: totalExpense, profit: totalIncome - totalExpense, inventoryValue, soldListValue },
      salesByPeriod: salesByPeriod.map((r) => ({ date: r.date, total: Number(r.total), amount: Number(r.amount) })),
      agentRanking: this.mapAgentRanking(agentRanking),
    };
  }

  async projectKpis(projectId: number) {
    const [
      totalLots,
      soldLotsRow,
      inventoryRow,
      soldRow,
      incomeRow,
      expenseRow,
      collectedRow,
      initialRow,
      receivableRow,
      overdueRow,
      expenseByClass,
    ] = await Promise.all([
      this.lotRepo.count({ where: { projectId } }),
      this.lotRepo.createQueryBuilder('l')
        .where('l.project_id = :projectId AND l.status = :status', { projectId, status: 'vendido' })
        .select('COUNT(*)', 'total').getRawOne(),
      this.lotRepo.createQueryBuilder('l').where('l.project_id = :projectId', { projectId })
        .select('COALESCE(SUM(COALESCE(l.sale_price, l.price)),0)', 'total').getRawOne(),
      this.lotRepo.createQueryBuilder('l')
        .where('l.project_id = :projectId AND l.status = :status', { projectId, status: 'vendido' })
        .select('COALESCE(SUM(COALESCE(l.sale_price, l.price)),0)', 'total').getRawOne(),
      this.txnRepo.createQueryBuilder('t')
        .where("t.project_id = :projectId AND t.type = 'ingreso'", { projectId })
        .select('COALESCE(SUM(t.amount),0)', 'total').getRawOne(),
      this.txnRepo.createQueryBuilder('t')
        .where("t.project_id = :projectId AND t.type = 'egreso'", { projectId })
        .select('COALESCE(SUM(t.amount),0)', 'total').getRawOne(),
      this.paymentRepo.createQueryBuilder('p')
        .where("p.project_id = :projectId AND p.status = 'pagado' AND p.type IN ('cuota','adelanto','primera_cuota')", { projectId })
        .select('COALESCE(SUM(p.amount),0)', 'total').getRawOne(),
      this.paymentRepo.createQueryBuilder('p')
        .where("p.project_id = :projectId AND p.status = 'pagado' AND p.type IN ('adelanto','primera_cuota')", { projectId })
        .select('COALESCE(SUM(p.amount),0)', 'total').getRawOne(),
      this.saleRepo.createQueryBuilder('s')
        .innerJoin('sale_installments', 'i', 'i.sale_id = s.id')
        .where("s.project_id = :projectId AND s.approval_status IN ('pendiente','aprobada') AND i.status = 'pendiente'", { projectId })
        .select('COALESCE(SUM(i.amount),0)', 'total').getRawOne(),
      this.saleRepo.createQueryBuilder('s')
        .innerJoin('sale_installments', 'i', 'i.sale_id = s.id')
        .where("s.project_id = :projectId AND s.approval_status IN ('pendiente','aprobada') AND i.status = 'pendiente' AND i.due_date < CURRENT_DATE", { projectId })
        .select('COALESCE(SUM(i.amount),0)', 'total').getRawOne(),
      this.expenseRepo.createQueryBuilder('e')
        .where('e.project_id = :projectId', { projectId })
        .select('e.expense_class', 'cls')
        .addSelect('COALESCE(SUM(e.amount),0)', 'total')
        .groupBy('e.expense_class')
        .getRawMany(),
    ]);

    const cls: Record<string, number> = {
      inversion: 0,
      financiamiento: 0,
      compra_terreno: 0,
      operacion: 0,
      costo_indirecto: 0,
      ventas_admin: 0,
      impuestos: 0,
    };
    for (const row of expenseByClass) cls[row.cls || 'operacion'] = Number(row.total || 0);

    const lotCount = Number(totalLots || 0);
    const soldLotsCount = Number(soldLotsRow?.total || 0);
    const inventoryValue = Number(inventoryRow?.total || 0);
    const soldListValue = Number(soldRow?.total || 0);
    const income = Number(incomeRow?.total || 0);
    const expense = Number(expenseRow?.total || 0);
    const collectedAmount = Number(collectedRow?.total || 0);
    const initialPaymentAmount = Number(initialRow?.total || 0);
    const pendingAmount = Number(receivableRow?.total || 0);
    const overdueAmount = Number(overdueRow?.total || 0);
    const delinquencyRate = pendingAmount > 0 ? (overdueAmount / pendingAmount) * 100 : 0;

    // Estado de resultados con la misma logica del modulo de finanzas.
    const landCost = cls.compra_terreno;
    const directCost = cls.inversion;
    const indirectCost = cls.costo_indirecto;
    const costOfSales = landCost + directCost + indirectCost;
    const salesAdminCost = cls.ventas_admin + cls.operacion;
    const financeCost = cls.financiamiento;
    const registeredTax = cls.impuestos;
    const grossProfit = income - costOfSales;
    const operatingProfit = grossProfit - salesAdminCost;
    const profitBeforeTax = operatingProfit - financeCost;
    const incomeTax = Math.max(0, profitBeforeTax * 0.295);
    const netProfit = profitBeforeTax - Math.max(registeredTax, incomeTax);
    const unrealizedRevenue = Math.max(0, soldListValue - income);
    const marginOnSales = soldListValue > 0 ? (netProfit / soldListValue) * 100 : 0;
    const collectionRate = soldListValue > 0 ? (collectedAmount / soldListValue) * 100 : 0;

    return {
      cards: {
        totalLots: lotCount,
        soldLotsCount,
        inventoryValue,
        soldListValue,
        income,
        expense,
        collectedAmount,
        initialPaymentAmount,
        pendingAmount,
        overdueAmount,
      },
      statement: {
        revenue: income,
        unrealizedRevenue,
        landCost,
        directCost,
        indirectCost,
        costOfSales,
        grossProfit,
        salesAdminCost,
        operatingProfit,
        financeCost,
        registeredTax,
        profitBeforeTax,
        incomeTax,
        netProfit,
        marginOnSales,
      },
      cash: {
        pendingAmount,
        overdueAmount,
        delinquencyRate,
        collectionRate,
      },
    };
  }
}

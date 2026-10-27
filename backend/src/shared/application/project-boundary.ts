import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** One operation may reference only one project, even for global administrators. */
export async function assertProjectBoundary(db: DataSource, req: any): Promise<number | undefined> {
  const root = String(req.path || '').replace(/^\/api\/?/, '').split('/')[0];
  if (['auth', 'users'].includes(root)) return; // Session/user management is global.
  const values = [req.headers?.['x-project-id'], req.params?.projectId, req.query?.projectId, req.body?.projectId];
  const projects = new Set<number>();
  const add = (value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Proyecto invalido.');
    projects.add(id);
    if (projects.size > 1) throw new ForbiddenException('La operacion contiene datos de otro proyecto. Cambia al proyecto correcto.');
  };
  values.forEach(add);
  const resources: [string, unknown][] = [];
  const path = String(req.path || '').replace(/^\/api/, '');
  const entityByRoot: Record<string, string> = {
    sales: 'SaleEntity', payments: 'PaymentEntity', lots: 'LotEntity', quotes: 'QuoteEntity',
    campaigns: 'CampaignEntity', 'construction-budget': 'ConstructionBudgetItemEntity', 'income-statement': 'IncomeStatementItemEntity',
  };
  if (root === 'clients') {
    add(req.body?.projectInterestId);
    if (req.params?.id !== undefined) {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Identificador invalido.');
      const client = await db.getRepository('ClientEntity').findOneBy({ id });
      if (!client) throw new NotFoundException('Registro no encontrado.');
      add(client.projectInterestId);
    }
  }
  if (root === 'projects') add(req.params?.id);
  if (req.params?.id !== undefined && entityByRoot[root]) resources.push([entityByRoot[root], req.params.id]);
  if (root === 'bank-accounts' && req.params?.id !== undefined) {
    resources.push([path.includes('/categories/') ? 'BankCategoryMappingEntity' : 'BankAccountMovementEntity', req.params.id]);
  }
  if (root === 'plan' && req.params?.id !== undefined && path.startsWith('/plan/lot-data/')) resources.push(['ProjectLotDataEntity', req.params.id]);
  if (root === 'plan' && req.params?.rowId !== undefined) resources.push(['ProjectLotCatalogEntity', req.params.rowId]);
  // These relations have an unambiguous project owner. Users and clients are
  // intentionally not treated as project IDs: they can participate in sales.
  const relations: Record<string, string> = {
    lotId: 'LotEntity', saleId: 'SaleEntity', paymentId: 'PaymentEntity', quoteId: 'QuoteEntity',
    streetId: 'BlockEntity', blockId: 'BlockEntity', planId: 'PlanEntity', campaignId: 'CampaignEntity',
  };
  for (const [key, entity] of Object.entries(relations)) {
    for (const source of [req.params, req.query, req.body]) {
      if (source?.[key] !== undefined && source[key] !== null && source[key] !== '') resources.push([entity, source[key]]);
    }
  }
  if (root === 'construction-budget' && req.body?.parentId != null) resources.push(['ConstructionBudgetItemEntity', req.body.parentId]);
  const seen = new Set<string>();
  for (const [entity, value] of resources) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Identificador invalido.');
    const key = `${entity}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = await db.getRepository(entity).findOneBy({ id });
    if (!row) throw new NotFoundException('Registro no encontrado.');
    add(row.projectId);
  }
  // Project-specific configuration keys must match the current project too.
  if (root === 'settings' && req.params?.key) {
    const match = String(req.params.key).match(/^(?:loan_manual|finance_dashboard|finance_classification|accounting_parameters|financial_data)_(\d+)$/);
    if (match) add(match[1]);
  }
  // A project screen must not accidentally load global totals when a filter
  // was omitted. Controllers read this query after the interceptor runs.
  const projectId = projects.values().next().value;
  if (projectId && req.method === 'GET' && req.query && req.query.projectId === undefined
    && ['lots', 'payments', 'sales', 'quotes', 'campaigns', 'clients', 'finances', 'accounting', 'bank-accounts', 'construction-budget', 'income-statement', 'cashflow', 'dashboards'].includes(root)) {
    req.query.projectId = String(projectId);
  }
  return projectId;
}

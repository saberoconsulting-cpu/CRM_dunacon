import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { assertProjectBoundary } from '../project-boundary';
import { assertScopedProject, projectScope } from '../project-scope';

/** Runs after authentication/role guards and before application writes. */
@Injectable()
export class ProjectBoundaryInterceptor implements NestInterceptor {
  constructor(private readonly db: DataSource) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    if (req.user) {
      const projectId = await assertProjectBoundary(this.db, req);
      const path = String(req.path || '').replace(/^\/api/, '');
      const root = path.split('/')[1];
      const modules: Record<string, string[]> = {
        sales: /\/(?:payment|lot)\//.test(path) || /payment-(?:search|context)/.test(path) ? ['sales', 'payments', 'lots', 'plan'] : ['sales'],
        quotes: req.method === 'GET' ? ['quotes', 'sales'] : ['quotes'], lots: ['lots', 'plan', 'sales', 'quotes', 'payments'],
        payments: path === '/payments/caja' ? ['payments', 'finances', 'dashboard'] : ['payments'],
        plan: req.method === 'GET' ? ['plan', 'lots', 'quotes', 'sales'] : ['plan', 'lots'], finances: ['finances'], 'bank-accounts': ['banking'],
        accounting: ['accounting'], cashflow: ['cashflow'], 'construction-budget': ['construction-budget'],
        'income-statement': ['income-statement'], campaigns: ['campaigns'],
        clients: ['clients', 'sales', 'quotes', 'payments'], dashboards: ['dashboard'], projects: [],
        settings: ['finances', 'cashflow', 'accounting'],
      };
      if (root === 'settings' && !path.startsWith('/settings/financial-data/')
        && !/^(?:loan_manual|finance_dashboard|finance_classification|accounting_parameters|financial_data)_\d+$/.test(String(req.params?.key || ''))) {
        delete modules.settings; // Company branding/global settings are shared intentionally.
      }
      if (projectId && modules[root]) {
        assertScopedProject(await projectScope(this.db, req.user, modules[root]), projectId);
      } else if (!projectId && req.user.role === 'agent'
        && ['finances', 'bank-accounts', 'cashflow', 'construction-budget', 'income-statement'].includes(root)) {
        throw new ForbiddenException('Selecciona un proyecto autorizado para consultar estos datos.');
      }
    }
    return next.handle();
  }
}

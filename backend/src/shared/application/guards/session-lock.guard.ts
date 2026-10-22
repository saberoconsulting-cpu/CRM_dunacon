import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { AppSettingEntity } from '../../infrastructure/entities/app-setting.entity';

export function sessionLockKey(authorization: string = '', projectId: number) {
  return 'pl:' + createHash('sha256').update(authorization).digest('hex').slice(0, 48) + ':' + projectId;
}

@Injectable()
export class SessionLockGuard implements CanActivate {
  constructor(private readonly db: DataSource) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const path = req.path.replace(/^\/api/, '').replace(/\/$/, '');
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || path === '/auth/session-lock' || path === '/auth/login') return true;
    if (!req.headers.authorization) return true;
    if (path.startsWith('/auth/') || path.startsWith('/users')) return true;
    // Editing project metadata or deleting from the list/history is outside its internal lock.
    // Authentication and the controller's admin roles still protect this route.
    if (req.method === 'POST' && (
      /^\/projects\/(update|cover|logo|delete|restore|purge)\/\d+$/.test(path)
      || /^\/projects\/status\/\d+\/(active|inactive)$/.test(path)
    )) return true;
    const projects = new Set<number>();
    for (const value of [req.params?.projectId, req.body?.projectId, req.query?.projectId, req.headers['x-project-id']]) {
      if (Number.isSafeInteger(Number(value)) && Number(value) > 0) projects.add(Number(value));
    }
    if (path.startsWith('/projects/') && req.params?.id) projects.add(Number(req.params.id));
    const entities: Record<string, string> = {
      lots: 'LotEntity', sales: 'SaleEntity', payments: 'PaymentEntity', quotes: 'QuoteEntity',
      clients: 'ClientEntity', campaigns: 'CampaignEntity', 'construction-budget': 'ConstructionBudgetItemEntity',
      'income-statement': 'IncomeStatementItemEntity',
    };
    const entity = path.startsWith('/bank-accounts/categories/') ? 'BankCategoryMappingEntity'
      : path.startsWith('/bank-accounts/') && req.params?.id ? 'BankAccountMovementEntity'
      : entities[path.split('/')[1]];
    if (entity && req.params?.id) {
      const row = await this.db.getRepository(entity).findOneBy({ id: Number(req.params.id) });
      if (row?.projectId) projects.add(row.projectId);
    }
    for (const [param, target] of [['lotId', 'LotEntity'], ['streetId', 'BlockEntity'], ['blockId', 'BlockEntity']] as const) {
      const id = req.params?.[param] || req.body?.[param];
      if (id) {
        const row = await this.db.getRepository(target).findOneBy({ id: Number(id) });
        if (row?.projectId) projects.add(row.projectId);
      }
    }
    for (const projectId of projects) {
      const lock = await this.db.getRepository(AppSettingEntity).findOneBy({ key: sessionLockKey(req.headers.authorization, projectId) });
      if (lock?.value !== 'false') {
      throw new ForbiddenException('Candado activado. Desactívalo para crear, editar, eliminar o subir archivos.');
      }
    }
    return true;
  }
}

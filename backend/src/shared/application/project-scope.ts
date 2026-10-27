import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserProjectEntity } from '../infrastructure/entities/user-project.entity';

export type ProjectScope = { allowedProjectIds?: number[]; excludedProjectIds?: number[] };
export type ScopeUser = { id: number; role: string };

/** Membership and module permissions come from the database, never browser headers. */
export async function projectScope(db: DataSource, user: ScopeUser, modules: string[] = []): Promise<ProjectScope> {
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || !['agent', 'admin', 'superadmin'].includes(user.role)) {
    throw new ForbiddenException('Usuario sin acceso.');
  }
  if (user.role === 'superadmin') return {};
  const memberships = await db.getRepository(UserProjectEntity).find({ where: { userId: user.id } });
  const permits = (row: UserProjectEntity) => !modules.length || !Array.isArray(row.allowedModules)
    || modules.some(module => row.allowedModules!.includes(module));
  if (user.role === 'admin') return { excludedProjectIds: memberships.filter(row => !permits(row)).map(row => Number(row.projectId)) };
  return { allowedProjectIds: memberships.filter(permits).map(row => Number(row.projectId)) };
}

export function assertScopedProject(scope: ProjectScope, value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Proyecto invalido.');
  if ((scope.allowedProjectIds && !scope.allowedProjectIds.includes(id)) || scope.excludedProjectIds?.includes(id)) {
    throw new ForbiddenException('No tienes permiso para esta operacion en el proyecto.');
  }
  return id;
}

/** Apply before pagination, counts, totals or aggregation. Alias is code-owned. */
export function scopeProjectQuery<T extends { andWhere: (...args: any[]) => any }>(qb: T, alias: 'l' | 'p' | 's', scope?: ProjectScope): T {
  if (scope?.allowedProjectIds) {
    if (!scope.allowedProjectIds.length) qb.andWhere('1 = 0');
    else qb.andWhere(`${alias}.project_id IN (:...scopeProjectIds)`, { scopeProjectIds: scope.allowedProjectIds });
  }
  if (scope?.excludedProjectIds?.length) qb.andWhere(`${alias}.project_id NOT IN (:...scopeExcludedProjectIds)`, { scopeExcludedProjectIds: scope.excludedProjectIds });
  return qb;
}

export function projectScopeSql(alias: 'l' | 'p' | 's', scope?: ProjectScope): string {
  const terms: string[] = [];
  if (scope?.allowedProjectIds) terms.push(scope.allowedProjectIds.length ? `${alias}.project_id IN (:...scopeProjectIds)` : '1 = 0');
  if (scope?.excludedProjectIds?.length) terms.push(`${alias}.project_id NOT IN (:...scopeExcludedProjectIds)`);
  return terms.length ? terms.join(' AND ') : '1 = 1';
}
export function projectScopeParameters(scope?: ProjectScope) {
  return { scopeProjectIds: scope?.allowedProjectIds || [], scopeExcludedProjectIds: scope?.excludedProjectIds || [] };
}
